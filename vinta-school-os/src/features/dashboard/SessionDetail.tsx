import { forwardRef, useEffect, useState, type HTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock,
  Clock3,
  Gift,
  Repeat,
  User,
  MapPin,
  Save,
  X,
  ChevronRight,
  Lock,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import PINInput from '../../components/ui/PINInput'
import { PinError, PIN_GATE_FALLBACK, verifyStaffPin } from '../../lib/pinGate'
import { formatTime12, formatDateFull } from '../../lib/formatters'
import { PIN_LENGTH } from '../../lib/constants'
import { isSessionFree } from '../../lib/freeSessions'
import { getSessionOrigin } from '../../lib/scheduleDefs'
import type { RosterBadge, Session } from '../../types/class'
import SessionActions from './SessionActions'
import SessionMenu from './SessionMenu'
import { canOpenAttendance, getEffectiveStatus } from '../../lib/sessionLifecycle'

/* ─── Types ─── */

export interface RosterStudent {
  student_id: string
  student_name: string
  is_present: boolean
  phone?: string
  /**
   * Subscription signal, derived by the server from the student's
   * subscription. Read-only: the UI renders it and never mutates it.
   * Whether a student has paid is owned by their subscription.
   */
  remaining_credits?: number | null
  access_end?: string | null
  badges?: RosterBadge[]
  /**
   * Whether this row is a make-up student sitting in from another group.
   *
   * Carried because the save has to send it back: the server bills a swap
   * against the student's own subscription, so re-sending a swap row as a
   * plain one would move the credit to the wrong place. The register has
   * always sent this; the panel used to drop it on the floor.
   */
  is_group_swap?: boolean
}

export interface SessionDetailProps extends HTMLAttributes<HTMLDivElement> {
  session: Session | null
  students?: RosterStudent[]
  onClose: () => void
  /** T1 lifecycle: refresh parent sessions after Start so status flips live */
  onSessionStarted?: (session: Session) => void
  /** T1 lifecycle: parent opens the PIN finalize modal (Class Done) */
  onFinishRequest?: (session: Session) => void
  /** T3 hamburger: parent refetches sessions after instance edits */
  onChanged?: () => void
  /** T8: all sessions for edit-scope siblings + conflict checks */
  sessions?: Session[]
  /**
   * Open a live class's attendance register. The ☰ menu only offers
   * "Log Students Present" when a parent supplies this, and the panel's own
   * ☰ is the only trigger on this card.
   */
  onOpenRegister?: (session: Session) => void
}

/* ─── Helpers ─── */

/**
 * Keyed by every member of `Session['status']`, which is why `conducted` is
 * here even though `completed` reads the same: the server writes `conducted`
 * for a finished class, and an unlisted status indexes to undefined — the
 * badge then renders with no background and an empty label rather than
 * failing where anyone would notice.
 */
const STATUS_BADGE_CLASSES: Record<Session['status'], string> = {
  scheduled: 'bg-[var(--gold-soft)] text-[var(--gold)]',
  in_progress: 'bg-[var(--emerald-soft)] text-[var(--emerald)]',
  conducted: 'bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]',
  completed: 'bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]',
  cancelled: 'bg-[var(--red-soft)] text-[var(--red)]',
}

/**
 * The badge's label, keyed exactly like the classes above and for the same
 * reason: every member of `Session['status']` has an entry, including both
 * spellings of the terminal state.
 *
 * `SESSION_STATUS_LABELS` in `lib/constants.ts` is the English map this used to
 * render. It is a module-scope constant, so a `t()` of it could only ever be
 * read in one language — the map here holds key *names* instead and the lookup
 * happens inside the component, where a language switch re-renders it.
 */
const STATUS_LABEL_KEYS: Record<Session['status'], string> = {
  scheduled: 'detail.status.scheduled',
  in_progress: 'detail.status.inProgress',
  conducted: 'detail.status.conducted',
  completed: 'detail.status.completed',
  cancelled: 'detail.status.cancelled',
}

/**
 * A temporary session's reason is stored as an enum value ("Makeup", "Trial",
 * "Extra", "Reschedule") and rendered, so it is mapped to a label like every
 * other enum: the value itself is never printed and never translated.
 *
 * Exported because the agenda board's own 🔁/🕐 chip shows the same four
 * reasons from the same enum — one vocabulary, so one map.
 */
export const TEMP_REASON_KEYS: Record<string, string> = {
  Makeup: 'reason.makeup',
  Trial: 'reason.trial',
  Extra: 'reason.extra',
  Reschedule: 'reason.reschedule',
}

/* ─── Helpers ─── */

/**
 * The server's Start stamp, as the clock time on the card.
 *
 * `actual_start_time` is a full datetime, so it is parsed and handed to the
 * shared 12-hour formatter. `toLocaleTimeString` used to do this, which meant
 * the line printed in whatever locale the browser happened to be in — neither
 * the interface language nor the shape any other time on this screen takes.
 */
function startTimeLabel(stamp: string): string {
  const at = new Date(stamp)
  return formatTime12(at.getHours() + at.getMinutes() / 60)
}

/* ─── Empty State ─── */

function EmptyState() {
  const { t } = useTranslation('dashboard')

  return (
    <div className="flex flex-col items-center justify-center h-full rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass)]/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] flex items-center justify-center mb-4">
        {/* Points at the board the empty slot is asking you to click. */}
        <ChevronRight className="w-5 h-5 text-[var(--muted)] rtl:-scale-x-100" />
      </div>
      <p className="text-sm font-medium text-[var(--muted)]">{t('detail.empty.title')}</p>
      <p className="text-xs text-[var(--muted)]/70 mt-1">
        {t('detail.empty.body')}
      </p>
    </div>
  )
}

/* ─── Info Chip ─── */

interface InfoChipProps {
  icon: React.ReactNode
  label: string
}

function InfoChip({ icon, label }: InfoChipProps) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--glass-border)] text-xs">
      <span className="text-[var(--muted)] shrink-0">{icon}</span>
      <span className="text-[var(--text)] font-medium truncate">{label}</span>
    </div>
  )
}

/* ─── Student Row ─── */

interface StudentRowProps {
  student: RosterStudent
  /** What the desk has marked — the server's value plus any staged change. */
  present: boolean
  /** True while `present` differs from what the server last told us. */
  dirty: boolean
  onTogglePresence: (studentId: string) => void
}

/**
 * The student's money signal for this session, as the server computed it
 * from their subscription. Display-only — there is no client-side payment
 * state to cycle, because payment truth lives on the subscription and a
 * local copy could only drift from it.
 */
function SubscriptionChip({ student }: { student: RosterStudent }) {
  const { t } = useTranslation('dashboard')
  const badges = student.badges ?? []
  const needsRenewal = badges.includes('RENEW_REQUIRED')
  const lowAttendance = badges.includes('ATTENDANCE_WARNING')
  const credits = student.remaining_credits

  if (!needsRenewal && !lowAttendance && credits == null) return null

  // Only the last branch reads it, and it is the branch where the guard above
  // has already ruled out a null — but the count still has to be a number.
  const creditCount = credits ?? 0

  const [tone, label, title] = needsRenewal
    ? [
        'bg-red-soft text-red',
        t('detail.roster.renew'),
        t('detail.roster.renewTitle'),
      ]
    : lowAttendance
      ? [
          'bg-gold-soft text-gold',
          t('detail.roster.lowAttendance'),
          t('detail.roster.lowAttendanceTitle'),
        ]
      : [
          'bg-emerald-soft text-emerald',
          t('detail.roster.creditsLeft', { count: creditCount }),
          t('detail.roster.creditsTitle', { count: creditCount }),
        ]

  return (
    <span
      className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold', tone)}
      style={{ borderRadius: 100 }}
      title={title}
    >
      {label}
    </span>
  )
}

function StudentRow({ student, present, dirty, onTogglePresence }: StudentRowProps) {
  const { t } = useTranslation('dashboard')


  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors group',
        // Gold tint marks a mark the desk has made but not yet saved. It is
        // the only thing on this panel that says "this is not real yet" —
        // without it, staged and saved look identical.
        dirty ? 'bg-[var(--gold-soft)]/25' : 'hover:bg-[var(--input-bg)]/60',
      )}
    >
      {/* Presence checkbox */}
      <button
        type="button"
        onClick={() => onTogglePresence(student.student_id)}
        className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
          present
            ? 'bg-[var(--emerald)] border-[var(--emerald)] text-white'
            : 'border-[var(--glass-border)] bg-transparent hover:border-[var(--muted)]',
        )}
        aria-label={present ? t('detail.roster.markAbsent') : t('detail.roster.markPresent')}
        title={
          dirty
            ? t('detail.roster.unsavedHint')
            : present
              ? t('detail.roster.present')
              : t('detail.roster.absent')
        }
      >
        {present && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Name */}
      <span className="text-sm text-[var(--text)] truncate flex-1 min-w-0">
        {student.student_name}
      </span>

      {dirty && (
        <span className="shrink-0 text-[10px] font-semibold text-[var(--gold)]">unsaved</span>
      )}

      <SubscriptionChip student={student} />
    </div>
  )
}

/* ─── SessionDetail ─── */

export const SessionDetail = forwardRef<HTMLDivElement, SessionDetailProps>(
  (
    {
      session,
      students = [],
      onClose,
      onSessionStarted,
      onFinishRequest,
      onChanged,
      sessions,
      onOpenRegister,
      className,
      ...rest
    },
    ref,
  ) => {
    // Before the early return: hooks cannot be skipped by a branch.
    const { t } = useTranslation('dashboard')


    /**
     * Presence the desk has marked but not yet saved.
     *
     * Marks are staged instead of written on the click for two reasons. The
     * write has to be PIN-verified, and a prompt per student would be one
     * prompt per arrival at the door; and a mis-tap on a roster of twenty has
     * to be undoable, which a row that has already posted is not. The whole
     * register therefore goes out in one verified batch.
     *
     * Keyed by `student_id`, holding the *intended* value. A row the desk
     * flips back to what the server already has drops out of the map, so
     * "staged" and "changed" stay the same thing and a save never re-sends a
     * row nobody touched.
     */
    const [draft, setDraft] = useState<Record<string, boolean>>({})
    /** The PIN to verify the save with — the same one the register takes. */
    const [pin, setPin] = useState('')
    const [pinError, setPinError] = useState<string | null>(null)
    /**
     * Remount key for the PIN boxes. `PINInput` owns its digits and clears
     * them only when it mounts, so a wrong PIN (or a save) is emptied by
     * bumping this rather than by reaching into it.
     */
    const [pinAttempt, setPinAttempt] = useState(0)
    const [saving, setSaving] = useState(false)

    const sessionId = session?.id

    // Another class is another register, and a finished one is closed. Either
    // way what is staged, and the PIN typed against it, no longer applies.
    useEffect(() => {
      setDraft({})
      setPin('')
      setPinError(null)
      setSaving(false)
      setPinAttempt((n) => n + 1)
    }, [sessionId])

    if (!session) {
      return (
        <div ref={ref} className={cn('h-full', className)} {...rest}>
          <EmptyState />
        </div>
      )
    }

    /* ── Staged presence, and the verified save that commits it ── */

    /**
     * What the desk sees marked: the staged value where there is one, the
     * server's otherwise. Feeds the rows *and* the summary above them, so the
     * count and the checkboxes can never disagree.
     */
    const markedPresent = (s: RosterStudent) => draft[s.student_id] ?? s.is_present

    /**
     * Only the rows that would actually change something.
     *
     * This is what protects the billing side effects. The register grid sends
     * every student in the class on each submit — including the ones marked
     * absent by the start-up seed — and each of those writes runs the credit
     * side effects again. Here a class where two of twelve arrived sends two
     * rows.
     */
    const pending = students.filter(
      (s) => draft[s.student_id] !== undefined && draft[s.student_id] !== s.is_present,
    )
    const pendingCount = pending.length

    const togglePresence = (studentId: string) => {
      const row = students.find((s) => s.student_id === studentId)
      if (!row) return
      setPinError(null)
      setDraft((prev) => {
        const next = { ...prev }
        const value = !(prev[studentId] ?? row.is_present)
        // Flipped back to what the server already has: nothing left to save.
        if (value === row.is_present) delete next[studentId]
        else next[studentId] = value
        return next
      })
    }

    /**
     * Verify the PIN, then write the staged rows.
     *
     * `verifyStaffPin` runs to completion *before* the first write, never
     * alongside it: a wrong PIN has to leave the roster exactly as the desk
     * staged it, not half-posted with the rejection buried in a batch result.
     *
     * The write is the register's own — `POST /attendance/check-in`, the same
     * endpoint with the same PRESENT/ABSENT that the Door Check-In grid
     * submits, carrying the same PIN. One attendance record with two doors,
     * so this panel and the register cannot drift apart.
     */
    const handleSave = async () => {
      if (pendingCount === 0 || pin.length !== PIN_LENGTH || saving) return
      setSaving(true)
      setPinError(null)

      try {
        await verifyStaffPin(pin)
      } catch (err) {
        setPinError(err instanceof PinError ? err.message : PIN_GATE_FALLBACK)
        setPin('')
        setPinAttempt((n) => n + 1)
        setSaving(false)
        return
      }

      // The status comes from what was staged, and the swap flag from what the
      // server sent: a make-up student re-saved as a regular one would bill
      // the wrong subscription.
      const results = await Promise.allSettled(
        pending.map((row) =>
          api.post('/attendance/check-in', {
            session_id: session.id,
            student_id: row.student_id,
            status: draft[row.student_id] ? 'PRESENT' : 'ABSENT',
            is_group_swap: row.is_group_swap ?? false,
            pin: pin.trim(),
          }),
        ),
      )

      const failed = results.filter((r) => r.status === 'rejected').length
      setSaving(false)
      setPin('')
      setPinAttempt((n) => n + 1)

      if (failed > 0) {
        // Keep the staging so Save can be pressed again, and re-read the
        // roster: whatever did land is now the server's truth, which drops
        // those rows out of `pending` by itself and leaves only the ones that
        // truly failed.
        const msg = `${failed} of ${pendingCount} rows were not saved. Press Save again.`
        setPinError(msg)
        toast.error('Attendance not saved', msg)
        onChanged?.()
        return
      }

      setDraft({})
      toast.success(
        'Attendance saved',
        `${pendingCount} student${pendingCount === 1 ? '' : 's'} recorded for ${session.class_name}.`,
      )
      onChanged?.()
    }

    const presentCount = students.filter(markedPresent).length
    const totalCount = students.length
    const attendancePct = totalCount > 0 ? presentCount / totalCount : 0

    // ── T1 lifecycle lock: attendance grid opens ONLY while IN_PROGRESS ──
    const lifecycleStatus = getEffectiveStatus(session)
    const attendanceLocked = !canOpenAttendance(lifecycleStatus)
    // The server's own start stamp. This used to read a localStorage record,
    // which meant a reloaded browser forgot that the class had begun — while
    // the register the server had opened stayed open.
    const actualStart = session.actual_start_time ?? null

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col h-full rounded-[var(--radius-lg)]',
          'border border-[var(--glass-border)]',
          'bg-[var(--glass)] backdrop-blur-[22px]',
          'overflow-hidden',
          className,
        )}
        {...rest}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[var(--glass-border)]">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold font-[family-name:var(--font-heading)] text-[var(--text)] truncate">
              {session.class_name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center justify-center',
                  'px-2 py-0.5 text-[10px] font-semibold',
                  'font-[family-name:var(--font-heading)]',
                  'rounded-full',
                  STATUS_BADGE_CLASSES[session.status],
                )}
                style={{ borderRadius: 100 }}
              >
                {t(STATUS_LABEL_KEYS[session.status])}
              </span>
              {/* T6: FREE badge — teacher pays, revenue 0 / cut 0 */}
              {isSessionFree(session) && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--emerald)] text-white"
                  style={{ borderRadius: 100 }}
                  title={t('detail.freeTitle')}
                >
                  <Gift size={10} />
                  {t('detail.free')}
                </span>
              )}
            </div>
          </div>

          {/* T3: single entry point — ☰ top-right of every session card */}
          <div className="flex items-center gap-1 shrink-0">
            <SessionMenu
              session={session}
              sessions={sessions}
              status={lifecycleStatus}
              onStart={onSessionStarted}
              onFinish={onFinishRequest}
              onChanged={onChanged}
              onOpenRegister={onOpenRegister}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              aria-label={t('detail.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Info chips */}
          <div className="flex flex-wrap gap-2">
            <InfoChip
              icon={<Clock className="w-3.5 h-3.5" />}
              label={`${formatTime12(session.start_hour)} – ${formatTime12(session.end_hour)}`}
            />
            <InfoChip
              icon={<User className="w-3.5 h-3.5" />}
              label={session.teacher_name}
            />
            <InfoChip
              icon={<MapPin className="w-3.5 h-3.5" />}
              label={session.classroom_name ?? t('detail.noRoom')}
            />
            <InfoChip
              icon={
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" />
                  <path d="M5 1v3M11 1v3M2 7h12" strokeLinecap="round" />
                </svg>
              }
              label={formatDateFull(session.date)}
            />
          </div>

          {/* T1 lifecycle actions: Start Class / Class Done */}
          <SessionActions
            session={session}
            status={lifecycleStatus}
            onStarted={onSessionStarted}
            onFinishRequest={onFinishRequest}
          />

          {/* T8 origin badge row */}
          {(() => {
            const origin = getSessionOrigin(session)
            return (
              <div className="flex items-center gap-2">
                {origin.kind === 'WEEKLY' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--emerald-soft)] text-[var(--emerald)]">
                    <Repeat size={11} />
                    {t('detail.origin.weekly')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--gold-soft)] text-[var(--gold)]">
                    <Clock3 size={11} />
                    {origin.reason
                      ? t('detail.origin.temporaryWithReason', { reason: t(TEMP_REASON_KEYS[origin.reason] ?? 'reason.extra') })
                      : t('detail.origin.temporary')}
                  </span>
                )}
              </div>
            )
          })()}

          {/* Attendance summary */}
          {totalCount > 0 && !attendanceLocked && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--muted)]">{t('detail.attendance.title')}</span>
                <span className="text-xs font-semibold text-[var(--text)]">
                  {t('detail.attendance.count', { present: presentCount, total: totalCount })}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-[var(--input-bg)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--emerald)] to-[var(--gold)] transition-all duration-300"
                  style={{ width: `${attendancePct * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* T1: locked attendance — no grid before Start */}
          {attendanceLocked && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] bg-[var(--input-bg)]/40 px-4 py-6 text-center">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--gold-soft)] text-[var(--gold)]">
                <Lock className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-[var(--text)]">
                {lifecycleStatus === 'scheduled'
                  ? t('detail.attendance.lockedScheduledTitle')
                  : t('detail.attendance.lockedFinalTitle')}
              </p>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {lifecycleStatus === 'scheduled'
                  ? t('detail.attendance.lockedScheduledBody')
                  : t('detail.attendance.lockedFinalBody')}
              </p>
              {actualStart && lifecycleStatus !== 'scheduled' && (
                <p className="text-[10px] text-[var(--muted)]">
                  {t('detail.attendance.startedAt', { time: startTimeLabel(actualStart) })}
                </p>
              )}
            </div>
          )}

          {/* Student roster */}
          {totalCount > 0 && !attendanceLocked && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--muted)] mb-2">{t('detail.roster.title')}</p>
              <div className="rounded-xl border border-[var(--glass-border)] overflow-hidden divide-y divide-[var(--glass-border)]">
                {students.map((s) => (
                  <StudentRow
                    key={s.student_id}
                    student={s}
                    present={markedPresent(s)}
                    dirty={pending.some((p) => p.student_id === s.student_id)}
                    onTogglePresence={togglePresence}
                  />
                ))}
              </div>
            </div>
          )}

          {totalCount === 0 && !attendanceLocked && (
            <p className="text-xs text-[var(--muted)] text-center py-4">{t('detail.roster.empty')}</p>
          )}
        </div>

        {/* ── Save the register ──
             This replaces the Call and Message buttons that used to sit here,
             which had no dialler and no messenger behind them and could only
             ever do nothing.

             Hidden while the class is locked, because there is nothing to
             write then — the same rule the roster above follows. */}
        {!attendanceLocked && totalCount > 0 && (
          <div className="shrink-0 space-y-3 px-5 py-4 border-t border-[var(--glass-border)]">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-[11px] font-medium',
                  pendingCount > 0 ? 'text-[var(--gold)]' : 'text-[var(--muted)]',
                )}
              >
                {pendingCount > 0
                  ? t('detail.save.unsaved', { count: pendingCount })
                  : t('detail.save.allSaved')}
              </span>
              {pendingCount > 0 && !saving && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft({})
                    setPinError(null)
                  }}
                  className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded"
                >
                  {t('detail.save.discard')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <PINInput
                key={pinAttempt}
                autoFocus={false}
                error={!!pinError}
                onChange={setPin}
                onComplete={setPin}
              />
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={pendingCount === 0 || pin.length !== PIN_LENGTH || saving}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 h-9 rounded-lg',
                  'text-xs font-semibold text-white',
                  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                  'hover:opacity-90 active:scale-[0.98] transition-all',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
                )}
                title={
                  pendingCount === 0
                    ? t('detail.save.nothingToSave')
                    : pin.length !== PIN_LENGTH
                      ? t('detail.save.enterPin')
                      : t('detail.save.saveCount', { count: pendingCount })
                }
              >
                {saving ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? t('detail.save.saving') : t('common:action.save')}
              </button>
            </div>

            {pinError ? (
              <p className="text-[11px] font-medium text-[var(--red)]" role="alert">
                {pinError}
              </p>
            ) : (
              <p className="text-[10px] text-[var(--muted)]">
                {t('detail.save.pinHint')}
              </p>
            )}
          </div>
        )}
      </div>
    )
  },
)

SessionDetail.displayName = 'SessionDetail'

export default SessionDetail
