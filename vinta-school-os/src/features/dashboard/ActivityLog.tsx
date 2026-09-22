import { forwardRef, type HTMLAttributes } from 'react'
import {
  CreditCard,
  UserCheck,
  UserPlus,
  AlertCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatDateShort } from '../../lib/formatters'

/* ─── Types ─── */

export interface ActivityLogEntry {
  id: string
  type: 'payment' | 'checkin' | 'student' | 'alert'
  title: string
  description: string
  /** ISO-8601 timestamp */
  timestamp: string
  staff_name: string
}

export interface ActivityLogProps extends HTMLAttributes<HTMLDivElement> {
  activities?: ActivityLogEntry[]
}

/* ─── Icon Map ─── */

const ICON_MAP: Record<ActivityLogEntry['type'], React.ElementType> = {
  payment: CreditCard,
  checkin: UserCheck,
  student: UserPlus,
  alert: AlertCircle,
}

const ICON_STYLE: Record<ActivityLogEntry['type'], string> = {
  payment: 'bg-[var(--emerald-soft)] text-[var(--emerald)]',
  checkin: 'bg-[var(--gold-soft)] text-[var(--gold)]',
  student: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  alert: 'bg-[var(--red-soft)] text-[var(--red)]',
}

/* ─── Relative Time ─── */

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return formatDateShort(iso)
}

/* ─── Activity Row ─── */

interface ActivityRowProps {
  entry: ActivityLogEntry
  isLast: boolean
}

function ActivityRow({ entry, isLast }: ActivityRowProps) {
  const Icon = ICON_MAP[entry.type]
  const iconClasses = ICON_STYLE[entry.type]

  return (
    <div className={cn('flex gap-3', !isLast && 'pb-4')}>
      {/* Icon */}
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          iconClasses,
        )}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text)] leading-snug">
          {entry.title}
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
          {entry.description}
        </p>
        <p className="text-[10px] text-[var(--muted)]/70 mt-1">
          {relativeTime(entry.timestamp)}
          <span className="mx-1 opacity-40">·</span>
          {entry.staff_name}
        </p>
      </div>
    </div>
  )
}

/* ─── Empty State ─── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] flex items-center justify-center mb-3">
        <CreditCard className="w-4 h-4 text-[var(--muted)]" />
      </div>
      <p className="text-xs text-[var(--muted)]">No recent activity</p>
    </div>
  )
}

/* ─── ActivityLog ─── */

export const ActivityLog = forwardRef<HTMLDivElement, ActivityLogProps>(
  ({ activities = [], className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-[var(--radius-lg)]',
          'border border-[var(--glass-border)]',
          'bg-[var(--glass)] backdrop-blur-[22px]',
          'overflow-hidden',
          className,
        )}
        {...rest}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--glass-border)]">
          <h3 className="text-base font-semibold font-[family-name:var(--font-heading)] text-[var(--text)]">
            Recent Activity
          </h3>
        </div>

        {/* List */}
        <div className="px-5 py-4">
          {activities.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-0">
              {activities.map((entry, i) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === activities.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  },
)

ActivityLog.displayName = 'ActivityLog'

export default ActivityLog
