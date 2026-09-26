import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../../lib/api'
import type { Session } from '../../types/class'
import type { RosterStudent } from './SessionDetail'
import type { ActivityLogEntry } from './ActivityLog'
import AgendaBoard from './AgendaBoard'
import SessionDetail from './SessionDetail'
import ActivityLog from './ActivityLog'
import FinalizeSessionModal from '../calendar/FinalizeSessionModal'
import { VoidModal } from './SessionMenu'
import SessionCheckInModal from '../calendar/SessionCheckInModal'
import SchedulingModal from '../calendar/SchedulingModal'
import { Card, CardBody } from '../../components/ui/Card'
import { Users, Calendar, StickyNote } from 'lucide-react'
import {
  canOpenAttendance,
  getEffectiveStatus,
} from '../../lib/sessionLifecycle'
import { extendSession } from '../../lib/extendSession'
import {
  enrichSessions,
  startOfWeek,
  toLocalISO,
  weekRequestDate,
} from '../../lib/sessionTime'
import {
  notifySessionsChanged,
  subscribeSessionsChanged,
} from '../../lib/sessionSync'
import { toast } from '../../stores/uiStore'
import { checkSessionNotifications } from '../../lib/sessionNotifier'

/* ─── Helpers ─── */
function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const d = new Date(date)
  const day = d.getDay()
  const start = new Date(d)
  start.setDate(d.getDate() - day) // Sunday (matches AgendaBoard getWeekDates)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  )
}

/* ─── Calendar reads ─── */

/**
 * The endpoint and the date to ask it for — in one place, because two callers
 * fetch this board's sessions (the mount effect and the post-lifecycle
 * refetch) and a week asked for two different ways is a board that shows
 * different classes depending on what you did last.
 *
 * The week goes through `weekRequestDate(startOfWeek(...))` rather than the
 * raw date: the backend derives its week as `target - (weekday + 1)`, which
 * jumps a whole week backwards when the target *is* a Sunday, so asking with
 * "today" hid every session on the board one day in seven. The Calendar tab
 * passes the same pair for the same reason.
 *
 * Day strings are local, never UTC — `toISOString()` rolls the day over at
 * midnight UTC, which in Algeria (UTC+1) asked for yesterday between 00:00
 * and 01:00.
 */
function calendarRequest(
  viewMode: 'week' | 'day',
  date: Date,
): { endpoint: string; date: string } {
  return viewMode === 'week'
    ? { endpoint: '/calendar/week', date: weekRequestDate(startOfWeek(date)) }
    : { endpoint: '/calendar/day', date: toLocalISO(date) }
}

/* ─── Stat card config ─── */

interface StatCard {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bgColor: string
}

/* ─── Component ─── */

export function DashboardPage() {
  /* ── State ── */
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [isLoading, setIsLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())

  /* ── Stats (mock when no backend) ── */
  const [studentCount, setStudentCount] = useState(0)
  const [todaySessions, setTodaySessions] = useState(0)
  const [activeNotes, setActiveNotes] = useState(0)
  const [activities, setActivities] = useState<ActivityLogEntry[]>([])

  /* ── T1 lifecycle modals + refresh tick ── */
  const [finalizeSession, setFinalizeSession] = useState<Session | null>(null)
  /**
   * The session whose void modal is open — raised by the end-of-class toast's
   * "Void Class". The modal itself is SessionMenu's, exported so the toast and
   * the ☰ run the same owner-PIN flow rather than two that drift.
   */
  const [voidSession, setVoidSession] = useState<Session | null>(null)
  const [checkInSession, setCheckInSession] = useState<Session | null>(null)
  const [lifecycleTick, setLifecycleTick] = useState(0)
  /* ── T8 scheduling window ── */
  const [schedOpen, setSchedOpen] = useState(false)
  const [schedPrefill, setSchedPrefill] = useState<string | null>(null)
  const sessionsRef = useRef<Session[]>([])
  sessionsRef.current = sessions

  const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate])

  /* ── Fetch sessions ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const { endpoint, date } = calendarRequest(viewMode, currentDate)
        const { data } = await api.get(endpoint, { params: { date } })
        if (!cancelled) {
          // enrichSessions derives start_hour / end_hour / duration, which no
          // endpoint sends but every block on this board is positioned by.
          // Without it `top` is NaN, the whole day piles up at midnight, and
          // the board's auto-scroll parks them above the fold — which is what
          // "the sessions in the Calendar never appear here" looked like.
          // See lib/sessionTime.ts.
          setSessions(enrichSessions(data.sessions ?? data))
        }
      } catch {
        // Backend unavailable — show empty state
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [viewMode, currentDate])

  /* ── Fetch stats ── */
  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      try {
        const [studentsRes, sessionsRes] = await Promise.all([
          api.get('/students', { params: { limit: 1 } }),
          api.get('/calendar/day', { params: { date: toLocalISO(new Date()) } }),
        ])
        if (!cancelled) {
          setStudentCount(studentsRes.data.total ?? studentsRes.data.length ?? 0)
          const daySessions = sessionsRes.data.sessions ?? sessionsRes.data ?? []
          setTodaySessions(Array.isArray(daySessions) ? daySessions.length : 0)
        }
      } catch {
        // Backend unavailable
      }
    }
    loadStats()
    return () => { cancelled = true }
  }, [])

  /* ── Fetch activity log ──
     `limit` asks for the endpoint's own cap rather than its default of 20.

     The panel below has a search box and type filters, and they filter what is
     on this machine — so the size of this window is the size of the history
     they can reach. At 20 the box would answer "nothing matches" for anything
     older than the last few minutes, which reads as a broken search rather than
     a shallow one. 200 is the server's ceiling; the retention window is what
     actually bounds the list. */
  const ACTIVITY_LIMIT = 200
  useEffect(() => {
    let cancelled = false
    async function loadActivities() {
      try {
        const { data } = await api.get('/settings/activity-log', {
          params: { limit: ACTIVITY_LIMIT },
        })
        if (!cancelled) setActivities(data.activities ?? data ?? [])
      } catch {
        // Backend unavailable
      }
    }
    loadActivities()
    return () => { cancelled = true }
  }, [])

  /* ── Fetch roster when session is selected (T1: live sessions only) ── */
  useEffect(() => {
    if (!selectedSession) { setStudents([]); return }
    // T1 lifecycle lock: never fetch attendance for SCHEDULED sessions.
    // Grid stays locked until Start; CONDUCTED/CANCELLED are read-only.
    if (!canOpenAttendance(getEffectiveStatus(selectedSession))) {
      setStudents([])
      return
    }
    let cancelled = false
    async function loadStudents() {
      try {
        const { data } = await api.get(`/sessions/${selectedSession!.id}/roster`)
        if (!cancelled) setStudents(data.roster ?? data)
      } catch {
        if (!cancelled) setStudents([])
      }
    }
    loadStudents()
    return () => { cancelled = true }
    // lifecycleTick re-runs this after Start so the grid opens immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession?.id, selectedSession?.status, lifecycleTick])

  /* ── Navigation ── */
  const navigateWeek = (dir: -1 | 1) => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  const goToToday = () => setCurrentDate(new Date())

  /* ── Handlers ── */
  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(prev => prev?.id === session.id ? null : session)
  }, [])

  const handleCloseDetail = useCallback(() => setSelectedSession(null), [])

  /* ── T1 lifecycle: Start / Finish / Running-late flows ── */

  // Bump tick -> roster effect + notifier re-evaluate with fresh lifecycle records.
  const bumpLifecycle = useCallback(() => setLifecycleTick(t => t + 1), [])

  // T1: the server owns Start — it stamps actual_start_time and materialises
  // the attendance register. Idempotent, so the old "only if not already
  // started" guard is no longer needed for correctness. Never rejects.
  const postSessionStart = useCallback(async (session: Session) => {
    try {
      await api.post(`/sessions/${session.id}/start`)
    } catch (err: any) {
      // 404 = session not in this academy; 409 = already conducted/cancelled.
      const backend = err?.response?.data?.error
      toast.error(
        'Could not start class',
        typeof backend === 'string' && backend
          ? backend
          : 'The class was not started. Please try again.',
      )
    }
  }, [])

  const refetchSessions = useCallback(async () => {
    try {
      const { endpoint, date } = calendarRequest(viewMode, currentDate)
      const { data } = await api.get(endpoint, { params: { date } })
      // Enriched for the same reason as the mount load above.
      const list = enrichSessions(data.sessions ?? data)
      setSessions(list)
      // Keep the selected card in sync (backend status may have changed).
      setSelectedSession(prev => {
        if (!prev) return prev
        return list.find((s) => s.id === prev.id) ?? prev
      })
    } catch {
      // Backend unavailable — lifecycle records still gate the UI
    }
  }, [viewMode, currentDate])

  /**
   * Every path that changes a session ends here: bump the tick the roster and
   * the notifier follow, re-read our own copy, and tell the other pages
   * (`lib/sessionSync`) the rows moved. One helper, so no caller can start or
   * cancel a class and leave the Calendar showing the old row — its
   * subscription is otherwise never made to fire by anything.
   */
  const afterSessionChange = useCallback(() => {
    bumpLifecycle()
    notifySessionsChanged('dashboard')
    void refetchSessions()
  }, [bumpLifecycle, refetchSessions])

  /* ── Stay in step with the Calendar ──
     The Calendar owns scheduling, this page owns the lifecycle, and both draw
     the same sessions. A class added or moved there refetches this board; our
     own changes come back tagged 'dashboard' and are skipped, so the two pages
     cannot ping-pong. */
  useEffect(
    () =>
      subscribeSessionsChanged((source) => {
        if (source === 'dashboard') return
        void refetchSessions()
      }),
    [refetchSessions],
  )

  // T1: Start-Class scheduler — start toast at scheduledStartTime,
  // end toast at scheduledEndTime. Runs every 30s + on session load.
  const handleStartFromToast = useCallback((session: Session) => {
    // Same server Start as the ☰ menu and the card button — no local start
    // time any more. POST first, then refetch: status is server-derived, so
    // the card/grid only flip once the fresh row arrives.
    setSelectedSession(session)
    setCheckInSession(session)
    bumpLifecycle()
    void postSessionStart(session).then(afterSessionChange)
  }, [postSessionStart, bumpLifecycle, afterSessionChange])

  const handleFinishRequest = useCallback((session: Session) => {
    // T1: Yes (PIN) -> CONDUCTED + payout calc + freeze. Modal owns the PIN call.
    if (getEffectiveStatus(session) !== 'in_progress') return
    setFinalizeSession(session)
  }, [])

  // T1: "No, Extend +15" from the end-of-class toast. Same server call the
  // ☰ menu's Extend makes, because it is the same act — the session's end
  // time moves, the class log reads the new length, and the toast re-arms
  // for the new end by itself (sessionNotifier compares `endNotifiedFor`
  // against `end_time`).
  const handleExtend = useCallback(async (session: Session) => {
    try {
      const result = await extendSession(session)
      toast.success(
        'Class extended',
        `${session.class_name} now ends at ${result.end_time}` +
          (result.duration_label ? ` · ${result.duration_label}` : ''),
      )
      afterSessionChange()
    } catch (err: any) {
      // 404 = already finished, cancelled, or the change was refused (an
      // extension that would shorten the class). Say so — the desk needs to
      // know the class still ends when it said.
      const backend = err?.response?.data?.error
      toast.error(
        'Could not extend class',
        typeof backend === 'string' && backend
          ? backend
          : 'The end time was not changed. Please try again.',
      )
    }
  }, [afterSessionChange])

  useEffect(() => {
    if (sessions.length === 0) return
    const fire = () => checkSessionNotifications(sessionsRef.current, {
      onStartClass: handleStartFromToast,
      onFinishClass: handleFinishRequest,
      onExtend: handleExtend,
      onVoid: setVoidSession,
      getStatus: getEffectiveStatus,
    }, new Date())
    fire()
    const id = setInterval(fire, 30_000)
    return () => clearInterval(id)
  }, [sessions, handleStartFromToast, handleFinishRequest, handleExtend])

  const handleSessionStarted = useCallback((_session: Session) => {
    // Start greys + disables on first click; flip grid open immediately.
    afterSessionChange()
  }, [afterSessionChange])

  // T3 hamburger: Start Class from the ☰ menu = same early-start path.
  const handleStartFromMenu = useCallback((session: Session) => {
    setSelectedSession(session)
    setCheckInSession(session)
    bumpLifecycle()
    void postSessionStart(session).then(afterSessionChange)
  }, [postSessionStart, bumpLifecycle, afterSessionChange])

  const handleFinalizeSuccess = useCallback(() => {
    setFinalizeSession(null)
    afterSessionChange()
  }, [afterSessionChange])

  const handleTogglePresence = useCallback(async (studentId: string) => {
    if (!selectedSession) return
    // T1 lock: presence toggles are dead while SCHEDULED (grid is locked anyway).
    if (!canOpenAttendance(getEffectiveStatus(selectedSession))) return
    // Optimistic toggle
    setStudents(prev => prev.map(s =>
      s.student_id === studentId ? { ...s, is_present: !s.is_present } : s
    ))
    try {
      const current = students.find(s => s.student_id === studentId)
      if (current?.is_present) {
        // Student is present → check-out (no PIN needed)
        await api.post('/attendance/check-out', {
          session_id: selectedSession.id,
          student_id: studentId,
        })
      } else {
        // Student not present → check-in via PIN modal (handled by SessionDetail)
        // For now, just update local state; actual check-in needs PIN
      }
    } catch {
      // Revert on failure
      setStudents(prev => prev.map(s =>
        s.student_id === studentId ? { ...s, is_present: !s.is_present } : s
      ))
    }
  }, [selectedSession, students])

  // Payment status is deliberately NOT cycled here. It was previously a
  // local-only invention with no backend behind it — clicking the pill
  // changed a number that persisted nowhere and disagreed with the
  // subscription that actually owns payment truth. The roster now renders
  // the server-derived badge (remaining_credits / RENEW_REQUIRED) instead.

  const handleToggleView = useCallback(() => {
    setViewMode(v => v === 'week' ? 'day' : 'week')
  }, [])

  /* ── Stat cards ── */
  const statCards: StatCard[] = [
    {
      label: 'Students',
      value: studentCount,
      icon: <Users size={20} />,
      color: 'var(--emerald)',
      bgColor: 'var(--emerald-soft)',
    },
    {
      label: "Today's Sessions",
      value: todaySessions,
      icon: <Calendar size={20} />,
      color: 'var(--gold)',
      bgColor: 'var(--gold-soft)',
    },
    {
      label: 'Active Notes',
      value: activeNotes,
      icon: <StickyNote size={20} />,
      color: 'var(--violet)',
      bgColor: 'rgba(139,92,246,.12)',
    },
  ]

  /* ── Render ── */
  return (
    <div className="flex flex-col h-full gap-4 p-2 sm:p-4 overflow-x-hidden overflow-y-auto">
      {/* ── Stat Cards Row ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 shrink-0">
        {statCards.map(card => (
          <Card key={card.label}>
            <CardBody className="!p-3">
              <div className="flex items-center gap-2 sm:gap-4">
                <div
                  className="flex items-center justify-center w-8 h-8 sm:w-12 sm:h-12 rounded-[var(--radius-sm)] shrink-0"
                  style={{ backgroundColor: card.bgColor, color: card.color }}
                >
                  {card.icon}
                </div>
                <div className="min-w-0">
                  <span className="text-lg sm:text-2xl font-bold text-[var(--text)] font-[family-name:var(--font-heading)] block">
                    {card.value}
                  </span>
                  <p className="text-[10px] sm:text-xs text-[var(--muted)] font-medium truncate">{card.label}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* ── Date Navigation ── */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-xs)] transition-colors"
          style={{
            background: isToday(currentDate) ? 'var(--gold)' : 'var(--input-bg)',
            color: isToday(currentDate) ? 'white' : 'var(--text)',
            border: '1px solid var(--glass-border)',
          }}
        >
          Today
        </button>
        <button
          onClick={() => navigateWeek(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
        >
          ‹
        </button>
        <button
          onClick={() => navigateWeek(1)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
        >
          ›
        </button>
        <span className="text-sm font-semibold text-[var(--text)] font-[family-name:var(--font-heading)]">
          {weekRange.label}
        </span>
      </div>

      {/* ── T1 lifecycle modals ── */}
      <FinalizeSessionModal
        isOpen={!!finalizeSession}
        session={finalizeSession}
        onClose={() => setFinalizeSession(null)}
        onSuccess={handleFinalizeSuccess}
      />
      <SessionCheckInModal
        isOpen={!!checkInSession}
        session={checkInSession}
        onClose={() => setCheckInSession(null)}
        onSuccess={() => { setCheckInSession(null); afterSessionChange() }}
      />
      {/* The end-of-class toast's "Void Class". Owner PIN, roster snapshot and
          the credit restore all live inside the modal. */}
      {voidSession && (
        <VoidModal
          session={voidSession}
          onClose={() => setVoidSession(null)}
          onChanged={() => {
            setVoidSession(null)
            afterSessionChange()
          }}
        />
      )}
      {/* ── T8 scheduling window (Weekly vs Temporary) ── */}
      <SchedulingModal
        isOpen={schedOpen}
        sessions={sessions}
        prefillDate={schedPrefill}
        onClose={() => { setSchedOpen(false); setSchedPrefill(null) }}
        onCreated={afterSessionChange}
      />

      {/* ── Main Content: Agenda + Detail/Activity ── */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0">
        {/* Agenda Board — ~65% */}
        <div className="flex-1 min-w-0 overflow-hidden min-h-[300px]">
          <AgendaBoard
            sessions={sessions}
            selectedSessionId={selectedSession?.id}
            onSelectSession={handleSelectSession}
            viewMode={viewMode}
            onToggleView={handleToggleView}
            isLoading={isLoading}
            currentDate={currentDate}
            onStartSession={handleStartFromMenu}
            onFinishSession={handleFinishRequest}
            onSessionsChanged={afterSessionChange}
            onNewClass={(prefillDate) => { setSchedPrefill(prefillDate ?? null); setSchedOpen(true) }}
            onOpenRegister={(session) => setCheckInSession(session)}
          />
        </div>

        {/* Right Panel — Session Detail or Activity Log (~35%) */}
        <div className="w-full lg:w-[380px] shrink-0 h-[300px] lg:h-full overflow-hidden">
          {selectedSession ? (
            <SessionDetail
              session={selectedSession}
              students={students}
              onClose={handleCloseDetail}
              onTogglePresence={handleTogglePresence}
              onSessionStarted={handleSessionStarted}
              onFinishRequest={handleFinishRequest}
              onChanged={afterSessionChange}
              onOpenRegister={(session) => setCheckInSession(session)}
              sessions={sessions}
              className="h-full"
            />
          ) : (
            <ActivityLog activities={activities} />
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
