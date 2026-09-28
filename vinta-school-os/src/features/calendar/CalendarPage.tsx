/**
 * Vinta School OS — Calendar
 *
 * A week grid of sessions, and the only place the schedule is arranged:
 * sessions are added, removed, and moved here, and nothing else. There is no
 * drag-to-move, no resize handle and no drop target by design — every change
 * goes through the session window (SessionWindowModal), which is the single
 * controlled entry point. Running a class (start / end / report / add time)
 * belongs to the Dashboard, which never schedules.
 *
 * Layout follows the reference week calendar: one CSS grid holds both the
 * header row and the body row, so the day columns share a single set of
 * column tracks and can never drift out of alignment.
 *
 * Sessions come from groups: the picker is fed by `/classes`, so a group
 * created in Classrooms is immediately placable — and, when it was created
 * with a meeting day and time, its sessions are already on the grid.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { formatDateShort, formatHour12, getDayName } from '../../lib/formatters'
import {
  CALENDAR_HOURS,
  HOUR_HEIGHT,
} from '../../lib/constants'
import {
  addDays,
  startOfWeek,
  timeToHours,
  timeRangeLabel,
  toLocalISO,
  weekRequestDate,
} from '../../lib/sessionTime'
import { getSessionOrigin } from '../../lib/scheduleDefs'
import { isSessionFree } from '../../lib/freeSessions'
import { hexToRgba, teacherColor } from '../../lib/teacherColors'
import { layoutDay, type SlotLayout } from '../../lib/sessionLayout'
import { notifySessionsChanged, subscribeSessionsChanged } from '../../lib/sessionSync'
import SessionWindowModal, {
  type GroupOption,
  type RoomOption,
  type TeacherOption,
} from './SessionWindowModal'
import type { Session } from '../../types/class'

// ============================================
// Grid geometry
// ============================================

const GRID_DAYS = 7
const GUTTER_WIDTH = 56
const GRID_COLUMNS = `${GUTTER_WIDTH}px repeat(${GRID_DAYS}, minmax(0, 1fr))`
const TOTAL_HEIGHT = (CALENDAR_HOURS[CALENDAR_HOURS.length - 1] + 1 - CALENDAR_HOURS[0]) * HOUR_HEIGHT
const MIN_BLOCK_HEIGHT = 22

/**
 * Status labels the grid needs, held as *keys* rather than sentences: a
 * module-level `t()` call would freeze at import time and never notice a
 * language switch.
 *
 * Weekday names need no entry here — `getDayName()` already formats through the
 * active locale, so the hand-kept seven-name array this file used to carry is
 * gone rather than translated.
 */
const STATUS_KEYS: Record<string, string> = {
  scheduled: 'status.scheduled',
  in_progress: 'status.inProgress',
  conducted: 'status.conducted',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
}

const REASON_KEYS: Record<string, string> = {
  Makeup: 'badge.reason.makeup',
  Trial: 'badge.reason.trial',
  Extra: 'badge.reason.extra',
  Reschedule: 'badge.reason.reschedule',
}

// ============================================
// Component
// ============================================

export function CalendarPage() {
  const { t } = useTranslation('calendar')

  /* ── Data ── */
  const [sessions, setSessions] = useState<Session[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /* ── View state ── */
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [teacherSearch, setTeacherSearch] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)

  /* ── Session window ── */
  const [windowOpen, setWindowOpen] = useState(false)
  const [editing, setEditing] = useState<Session | null>(null)
  const [prefill, setPrefill] = useState<{
    date?: string
    start?: string
    end?: string
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const didAutoScroll = useRef(false)

  const weekDates = useMemo(
    () => Array.from({ length: GRID_DAYS }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const todayISO = toLocalISO(new Date())

  /* ── Fetch the week + the pickers ── */

  const loadWeek = useCallback(async () => {
    try {
      const { data } = await api.get('/calendar/week', {
        // The backend week starts on Sunday; see weekRequestDate's note.
        params: { date: weekRequestDate(weekStart) },
      })
      setSessions(data.sessions ?? data ?? [])
    } catch {
      // Backend unavailable — keep whatever is on screen.
    }
  }, [weekStart])

  const loadPickers = useCallback(async () => {
    try {
      const [gRes, tRes, rRes] = await Promise.all([
        api.get('/classes'),
        api.get('/teachers'),
        api.get('/classrooms').catch(() => ({ data: { classrooms: [] } })),
      ])
      setGroups(
        (gRes.data.classes ?? gRes.data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          subject: c.subject,
          color: c.color,
          teacher_id: c.teacher_id,
          teacher_name: c.teacher_name,
        })),
      )
      setTeachers(
        (tRes.data.teachers ?? tRes.data ?? []).map((t: any) => ({
          id: t.id,
          name:
            t.full_name ||
            t.name ||
            `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
        })),
      )
      setRooms(
        (rRes.data.classrooms ?? rRes.data ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
        })),
      )
    } catch {
      // Pickers stay empty and the session window says so.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void loadWeek().finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [loadWeek])

  useEffect(() => { void loadPickers() }, [loadPickers])

  /* ── A class made from the session window joins the pickers ── */
  // Folded straight into `groups` rather than refetched: the window needs it
  // selected on this same commit, and a round trip would leave the picker
  // briefly holding an id it cannot name.
  const handleClassCreated = useCallback((group: GroupOption) => {
    setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [...prev, group]))
  }, [])

  /* ── Stay in step with the Dashboard ── */
  // A class started on the Dashboard, or a session added here, is the same
  // row: refetch on the other page's changes, and skip our own echo.
  useEffect(
    () =>
      subscribeSessionsChanged((source) => {
        if (source === 'calendar') return
        void loadWeek()
      }),
    [loadWeek],
  )

  /* ── Auto-scroll to the working day on first paint ── */
  useEffect(() => {
    if (didAutoScroll.current || !scrollRef.current) return
    const now = new Date()
    const top = Math.max(0, (now.getHours() - CALENDAR_HOURS[0] - 1) * HOUR_HEIGHT)
    scrollRef.current.scrollTop = top
    didAutoScroll.current = true
  }, [])

  /* ── Teacher filter ── */

  const visibleTeachers = useMemo(() => {
    const term = teacherSearch.trim().toLowerCase()
    if (!term) return teachers
    return teachers.filter((t) => t.name.toLowerCase().includes(term))
  }, [teachers, teacherSearch])

  /** Chips the search has hidden still count as "filtered out" for the grid. */
  const matchesFilter = useCallback(
    (teacherId: string | undefined) => {
      if (teacherFilter === 'all') return true
      return teacherId === teacherFilter
    },
    [teacherFilter],
  )

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      if (!showCancelled && s.status === 'cancelled') continue
      if (!matchesFilter(s.teacher_id)) continue
      const list = map.get(s.date)
      if (list) list.push(s)
      else map.set(s.date, [s])
    }
    return map
  }, [sessions, matchesFilter, showCancelled])

  const weekCount = useMemo(
    () => [...sessionsByDate.values()].reduce((n, list) => n + list.length, 0),
    [sessionsByDate],
  )

  /**
   * Two sessions in one slot are common (a compensatory beside the weekly
   * sitting, or a duplicate rollout). Drawn full width they hide each other,
   * so each day gets split into columns — same rule as the Dashboard grid.
   */
  const layoutByDate = useMemo(() => {
    const map = new Map<string, Map<string, SlotLayout>>()
    for (const [date, list] of sessionsByDate) map.set(date, layoutDay(list))
    return map
  }, [sessionsByDate])

  /* ── Session window handlers ── */

  const openAdd = useCallback((date?: string, start?: string, end?: string) => {
    setEditing(null)
    setPrefill({ date, start, end })
    setWindowOpen(true)
  }, [])

  const openEdit = useCallback((session: Session) => {
    setEditing(session)
    setPrefill(null)
    setWindowOpen(true)
  }, [])

  const handleSaved = useCallback(() => {
    void loadWeek()
    void loadPickers()
    notifySessionsChanged('calendar')
  }, [loadWeek, loadPickers])

  /* ── Render ── */

  const weekLabel = `${formatDateShort(weekStart)} – ${formatDateShort(addDays(weekStart, 6))}`

  /* API lifecycle status → label. An unmapped value falls back to the raw
     string rather than printing a key path, so a new backend state shows up
     as a slightly untranslated tooltip rather than as `calendar:status.x`. */
  const statusLabel = (status: string | undefined): string => {
    const key = status ? STATUS_KEYS[status] : undefined
    return key ? t(key) : (status ?? '')
  }

  return (
    <div className="flex flex-col h-full gap-3 animate-fade-in">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1
            className="text-xl font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t('page.title')}
          </h1>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {t('page.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
            aria-label={t('page.previousWeek')}
          >
            {/* Back in time points the other way in Arabic. */}
            <ChevronLeft size={15} className="rtl:rotate-180" />
          </button>
          <span
            className="text-sm font-semibold text-[var(--text)] text-center min-w-[130px]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {weekLabel}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
            aria-label={t('page.nextWeek')}
          >
            <ChevronRight size={15} className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 h-8 text-xs font-semibold rounded-lg transition-colors"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text)' }}
          >
            {t('page.today')}
          </button>
          <button
            type="button"
            onClick={() => openAdd()}
            className={cn(
              'flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98] transition-all',
            )}
          >
            <CalendarPlus size={14} />
            {t('page.addSession')}
          </button>
        </div>
      </div>

      {/* ── Teacher filter ── */}
      <div
        className="flex flex-wrap items-center gap-2 shrink-0 px-3 py-2 rounded-[var(--radius-md)]"
        style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)' }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] me-1">
          {t('filter.teachers')}
        </span>

        <div className="relative">
          <Search
            size={12}
            className="absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
          />
          <input
            type="text"
            value={teacherSearch}
            onChange={(e) => setTeacherSearch(e.target.value)}
            placeholder={t('filter.searchPlaceholder')}
            className={cn(
              'w-[180px] ps-7 pe-7 py-1.5 rounded-full text-xs',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'text-[var(--text)] outline-none',
              'focus:ring-2 focus:ring-[var(--gold)]/30',
              'placeholder:text-[var(--muted)]/50',
            )}
          />
          {teacherSearch && (
            <button
              type="button"
              onClick={() => setTeacherSearch('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
              aria-label={t('filter.clearSearch')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* All */}
        <button
          type="button"
          onClick={() => setTeacherFilter('all')}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
            teacherFilter === 'all'
              ? 'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/40'
              : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)]',
          )}
        >
          {t('filter.allTeachers')}
        </button>

        {/* One chip per teacher; the search narrows the list, clicking filters */}
        {visibleTeachers.map((teacher) => {
          const active = teacherFilter === teacher.id
          return (
            <button
              key={teacher.id}
              type="button"
              onClick={() => setTeacherFilter(active ? 'all' : teacher.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                active
                  ? 'bg-[var(--gold-soft)] text-[var(--text)] border border-[var(--gold)]/40'
                  : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)]',
              )}
              title={active ? t('filter.clearThisFilter') : t('filter.showOnly', { name: teacher.name })}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: teacherColor(teacher.id) }}
              />
              <span className="truncate max-w-[120px]">{teacher.name}</span>
            </button>
          )
        })}

        {teachers.length === 0 && (
          <span className="text-[11px] text-[var(--muted)]">{t('filter.noTeachers')}</span>
        )}

        <div className="flex-1" />

        <span className="text-[11px] text-[var(--muted)]">
          {t('filter.sessionCount', { count: weekCount })}
        </span>

        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
            showCancelled
              ? 'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30'
              : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)]',
          )}
        >
          {showCancelled ? t('filter.hideRemoved') : t('filter.showRemoved')}
        </button>
      </div>

      {/* ── Calendar grid ── */}
      <div
        className="flex-1 min-h-[380px] rounded-[var(--radius-lg)] overflow-hidden relative"
        style={{
          background: 'var(--glass)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          <div
            className="grid"
            style={{ gridTemplateColumns: GRID_COLUMNS, minWidth: 640 }}
          >
            {/* ── Day headers (row 1) ── */}
            <div
              className="sticky top-0 z-10"
              style={{
                gridColumn: 1,
                gridRow: 1,
                background: 'var(--card-bg)',
                borderBottom: '1px solid var(--divider)',
              }}
            />
            {weekDates.map((date, i) => {
              const isTodayCol = toLocalISO(date) === todayISO
              return (
                <div
                  key={i}
                  className="sticky top-0 z-10 flex flex-col items-center justify-center py-2"
                  style={{
                    gridColumn: i + 2,
                    gridRow: 1,
                    background: isTodayCol
                      ? 'color-mix(in srgb, var(--gold) 8%, var(--card-bg))'
                      : 'var(--card-bg)',
                    borderBottom: '1px solid var(--divider)',
                    borderInlineStart: '1px solid var(--divider)',
                  }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {getDayName(date)}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
                      isTodayCol ? 'text-white' : 'text-[var(--text)]',
                    )}
                    style={{
                      background: isTodayCol ? 'var(--gold)' : 'transparent',
                      fontFamily: 'var(--font-heading)',
                    }}
                  >
                    {date.getDate()}
                  </span>
                </div>
              )
            })}

            {/* ── Hour gutter (row 2, col 1) ── */}
            <div style={{ gridColumn: 1, gridRow: 2, position: 'relative', height: TOTAL_HEIGHT }}>
              {CALENDAR_HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute start-0 end-0"
                  style={{ top: (hour - CALENDAR_HOURS[0]) * HOUR_HEIGHT }}
                >
                  <span className="absolute -top-2 end-2 text-[10px] text-[var(--muted)] select-none">
                    {formatHour12(hour)}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Day columns (row 2, col 2..8) ── */}
            {weekDates.map((date, i) => {
              const dateStr = toLocalISO(date)
              const isTodayCol = dateStr === todayISO
              const daySessions = sessionsByDate.get(dateStr) ?? []
              const dayLayout = layoutByDate.get(dateStr)

              return (
                <div
                  key={dateStr}
                  className="relative"
                  style={{
                    gridColumn: i + 2,
                    gridRow: 2,
                    height: TOTAL_HEIGHT,
                    borderInlineStart: '1px solid var(--divider)',
                    background: isTodayCol
                      ? 'color-mix(in srgb, var(--gold) 3%, transparent)'
                      : undefined,
                  }}
                >
                  {/* Hour cells — clicking an empty one opens the window pre-filled */}
                  {CALENDAR_HOURS.map((hour) => (
                    <div
                      key={hour}
                      onClick={() =>
                        openAdd(
                          dateStr,
                          `${String(hour).padStart(2, '0')}:00`,
                          `${String(Math.min(hour + 1, 24)).padStart(2, '0')}:00`,
                        )
                      }
                      className="cursor-pointer transition-colors hover:bg-[var(--gold-soft)]/40"
                      style={{
                        height: HOUR_HEIGHT,
                        borderBottom: '1px solid var(--divider)',
                      }}
                    />
                  ))}

                  {/* Session blocks — read-only placement, click opens the window */}
                  {daySessions.map((s) => {
                    const startH = timeToHours(s.start_time)
                    const endH = timeToHours(s.end_time)
                    const top = Math.max(0, (startH - CALENDAR_HOURS[0]) * HOUR_HEIGHT)
                    const height = Math.max((endH - startH) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT)
                    const color = s.color || teacherColor(s.teacher_id)
                    const isDone = s.status !== 'scheduled'
                    const origin = getSessionOrigin(s)
                    const slot = dayLayout?.get(s.id)
                    const totalCols = slot?.totalCols ?? 1
                    const leftPct = ((slot?.col ?? 0) / totalCols) * 100
                    const widthPct = 100 / totalCols

                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEdit(s) }}
                        title={`${s.class_name}\n${timeRangeLabel(s.start_time, s.end_time)}\n${s.teacher_name ?? ''}${isDone ? `\n${statusLabel(s.status)}` : ''}`}
                        className={cn(
                          'absolute rounded-md px-1.5 py-1 text-start overflow-hidden',
                          'border-s-[3px] transition-all',
                          'hover:shadow-lg hover:z-20 hover:brightness-105',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
                          isDone && 'opacity-55',
                        )}
                        style={{
                          top,
                          height,
                          insetInlineStart: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: isDone ? 'var(--muted-soft)' : hexToRgba(color, 0.16),
                          borderInlineStartColor: isDone ? 'var(--muted)' : color,
                        }}
                      >
                        <span className="flex items-center gap-1 min-w-0">
                          {!isDone && isSessionFree(s) && (
                            <span className="px-1 rounded text-[8px] font-bold bg-[var(--emerald)] text-white shrink-0">
                              {t('grid.freeBadge')}
                            </span>
                          )}
                          {!isDone && origin.kind === 'TEMPORARY' && (
                            <span className="px-1 rounded text-[8px] font-bold bg-[var(--gold-soft)] text-[var(--gold)] shrink-0">
                              {origin.reason ? t(REASON_KEYS[origin.reason] ?? 'badge.reason.extra') : '1×'}
                            </span>
                          )}
                          <span
                            className="text-[10.5px] font-semibold leading-tight truncate"
                            style={{ color: isDone ? 'var(--muted)' : color }}
                          >
                            {s.class_name}
                          </span>
                        </span>
                        {height > 46 && (
                          <span className="block text-[9px] leading-tight truncate text-[var(--muted)]">
                            {timeRangeLabel(s.start_time, s.end_time)}
                          </span>
                        )}
                        {height > 62 && (
                          <span className="block text-[9px] leading-tight truncate text-[var(--muted)]">
                            {s.teacher_name}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {/* Now line — today only */}
                  {isTodayCol && <NowLine />}
                </div>
              )
            })}
          </div>
        </div>

        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--glass)]/70 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="absolute inset-x-0 bottom-0 px-4 py-2 text-center text-[11px] text-[var(--muted)]"
            style={{ background: 'var(--card-bg)', borderTop: '1px solid var(--divider)' }}>
            {t('grid.noGroups')}
          </div>
        )}
      </div>

      {/* ── Session window ── */}
      <SessionWindowModal
        open={windowOpen}
        onClose={() => { setWindowOpen(false); setEditing(null); setPrefill(null) }}
        sessions={sessions}
        groups={groups}
        teachers={teachers}
        rooms={rooms}
        prefillDate={prefill?.date ?? null}
        prefillStart={prefill?.start ?? null}
        prefillEnd={prefill?.end ?? null}
        editing={editing}
        onSaved={handleSaved}
        onClassCreated={handleClassCreated}
      />
    </div>
  )
}

/* ─── Now indicator ─── */

function NowLine() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const hours = now.getHours() + now.getMinutes() / 60
  const first = CALENDAR_HOURS[0]
  const last = CALENDAR_HOURS[CALENDAR_HOURS.length - 1] + 1
  if (hours < first || hours > last) return null

  return (
    <div
      className="absolute start-0 end-0 z-20 pointer-events-none"
      style={{ top: (hours - first) * HOUR_HEIGHT }}
    >
      <div className="h-[2px] bg-[var(--red)] shadow-[0_0_8px_var(--red)]" />
      <div className="absolute -start-[3px] -top-[3px] w-[8px] h-[8px] rounded-full bg-[var(--red)]" />
    </div>
  )
}

export default CalendarPage
