import { forwardRef, type HTMLAttributes } from 'react'
import {
  Clock,
  Clock3,
  Gift,
  Repeat,
  User,
  MapPin,
  Phone,
  MessageSquare,
  X,
  ChevronRight,
  Lock,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatTime12, formatDateFull } from '../../lib/formatters'
import { SESSION_STATUS_LABELS } from '../../lib/constants'
import { isSessionFree } from '../../lib/freeSessions'
import { getSessionOrigin } from '../../lib/scheduleDefs'
import type { RosterBadge, Session } from '../../types/class'
import SessionActions from './SessionActions'
import SessionMenu from './SessionMenu'
import {
  canOpenAttendance,
  getActualStartTime,
  getEffectiveStatus,
} from '../../lib/sessionLifecycle'

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
}

export interface SessionDetailProps extends HTMLAttributes<HTMLDivElement> {
  session: Session | null
  students?: RosterStudent[]
  onClose: () => void
  onTogglePresence: (studentId: string) => void
  /** T1 lifecycle: refresh parent sessions after Start so status flips live */
  onSessionStarted?: (session: Session) => void
  /** T1 lifecycle: parent opens the PIN finalize modal (Class Done) */
  onFinishRequest?: (session: Session) => void
  /** T3 hamburger: parent refetches sessions after instance edits */
  onChanged?: () => void
  /** T8: all sessions for edit-scope siblings + conflict checks */
  sessions?: Session[]
}

/* ─── Helpers ─── */

const STATUS_BADGE_CLASSES: Record<Session['status'], string> = {
  scheduled: 'bg-[var(--gold-soft)] text-[var(--gold)]',
  in_progress: 'bg-[var(--emerald-soft)] text-[var(--emerald)]',
  completed: 'bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]',
  cancelled: 'bg-[var(--red-soft)] text-[var(--red)]',
}

/* ─── Empty State ─── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass)]/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] flex items-center justify-center mb-4">
        <ChevronRight className="w-5 h-5 text-[var(--muted)]" />
      </div>
      <p className="text-sm font-medium text-[var(--muted)]">Select a session</p>
      <p className="text-xs text-[var(--muted)]/70 mt-1">
        Click any block on the agenda to view details
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
  onTogglePresence: (studentId: string) => void
}

/**
 * The student's money signal for this session, as the server computed it
 * from their subscription. Display-only — there is no client-side payment
 * state to cycle, because payment truth lives on the subscription and a
 * local copy could only drift from it.
 */
function SubscriptionChip({ student }: { student: RosterStudent }) {
  const badges = student.badges ?? []
  const needsRenewal = badges.includes('RENEW_REQUIRED')
  const lowAttendance = badges.includes('ATTENDANCE_WARNING')
  const credits = student.remaining_credits

  if (!needsRenewal && !lowAttendance && credits == null) return null

  const [tone, label, title] = needsRenewal
    ? [
        'bg-red-soft text-red',
        'Renew',
        'No active subscription, or its credits are used up',
      ]
    : lowAttendance
      ? [
          'bg-gold-soft text-gold',
          'Low attendance',
          'Attendance is below this group’s threshold',
        ]
      : [
          'bg-emerald-soft text-emerald',
          `${credits} left`,
          `${credits} session credit${credits === 1 ? '' : 's'} remaining`,
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

function StudentRow({ student, onTogglePresence }: StudentRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--input-bg)]/60 transition-colors group">
      {/* Presence checkbox */}
      <button
        type="button"
        onClick={() => onTogglePresence(student.student_id)}
        className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
          student.is_present
            ? 'bg-[var(--emerald)] border-[var(--emerald)] text-white'
            : 'border-[var(--glass-border)] bg-transparent hover:border-[var(--muted)]',
        )}
        aria-label={student.is_present ? 'Mark absent' : 'Mark present'}
      >
        {student.is_present && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Name */}
      <span className="text-sm text-[var(--text)] truncate flex-1 min-w-0">
        {student.student_name}
      </span>

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
      onTogglePresence,
      onSessionStarted,
      onFinishRequest,
      onChanged,
      sessions,
      className,
      ...rest
    },
    ref,
  ) => {
    if (!session) {
      return (
        <div ref={ref} className={cn('h-full', className)} {...rest}>
          <EmptyState />
        </div>
      )
    }

    const presentCount = students.filter((s) => s.is_present).length
    const totalCount = students.length
    const attendancePct = totalCount > 0 ? presentCount / totalCount : 0

    // ── T1 lifecycle lock: attendance grid opens ONLY while IN_PROGRESS ──
    const lifecycleStatus = getEffectiveStatus(session)
    const attendanceLocked = !canOpenAttendance(lifecycleStatus)
    const actualStart = getActualStartTime(session.id)

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
                {SESSION_STATUS_LABELS[session.status]}
              </span>
              {/* T6: FREE badge — teacher pays, revenue 0 / cut 0 */}
              {isSessionFree(session.id) && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--emerald)] text-white"
                  style={{ borderRadius: 100 }}
                  title="FREE session — teacher pays. Revenue 0, teacher cut 0, no credits moved."
                >
                  <Gift size={10} />
                  FREE
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
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              aria-label="Close detail"
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
              label={session.classroom_name ?? 'No room'}
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
                    🔁 Weekly series
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--gold-soft)] text-[var(--gold)]">
                    <Clock3 size={11} />
                    🕐 Temporary{origin.reason ? ` · ${origin.reason}` : ''}
                  </span>
                )}
              </div>
            )
          })()}

          {/* Attendance summary */}
          {totalCount > 0 && !attendanceLocked && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--muted)]">Attendance</span>
                <span className="text-xs font-semibold text-[var(--text)]">
                  {presentCount}/{totalCount} present
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
                  ? 'Attendance unlocks when the class starts'
                  : 'Attendance frozen — session finalized'}
              </p>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {lifecycleStatus === 'scheduled'
                  ? 'Press Start Class above (or at the scheduled time) to open the grid.'
                  : 'This session is read-only.'}
              </p>
              {actualStart && lifecycleStatus !== 'scheduled' && (
                <p className="text-[10px] text-[var(--muted)]">
                  Started {new Date(actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {/* Student roster */}
          {totalCount > 0 && !attendanceLocked && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--muted)] mb-2">Students</p>
              <div className="rounded-xl border border-[var(--glass-border)] overflow-hidden divide-y divide-[var(--glass-border)]">
                {students.map((s) => (
                  <StudentRow
                    key={s.student_id}
                    student={s}
                    onTogglePresence={onTogglePresence}
                  />
                ))}
              </div>
            </div>
          )}

          {totalCount === 0 && !attendanceLocked && (
            <p className="text-xs text-[var(--muted)] text-center py-4">No students enrolled</p>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-[var(--glass-border)]">
          <button
            type="button"
            className={cn(
              'flex-1 flex items-center justify-center gap-2',
              'h-9 rounded-lg text-xs font-medium',
              'bg-[var(--emerald-soft)] text-[var(--emerald)]',
              'hover:brightness-95 transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
            )}
          >
            <Phone className="w-3.5 h-3.5" />
            Call
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 flex items-center justify-center gap-2',
              'h-9 rounded-lg text-xs font-medium',
              'bg-[var(--gold-soft)] text-[var(--gold)]',
              'hover:brightness-95 transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Message
          </button>
        </div>
      </div>
    )
  },
)

SessionDetail.displayName = 'SessionDetail'

export default SessionDetail
