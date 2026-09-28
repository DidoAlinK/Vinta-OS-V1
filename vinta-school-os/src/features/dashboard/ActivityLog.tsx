import { forwardRef, useMemo, useState, type HTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CreditCard,
  UserCheck,
  UserPlus,
  AlertCircle,
  Search,
  X,
  Maximize2,
  Minimize2,
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

/**
 * Where a timestamp sits relative to now, as a key plus the count it needs —
 * not as a formatted sentence.
 *
 * A helper that called `t()` for itself would have to be handed the live `t`
 * on every render, and a module-scope lookup would freeze in whatever language
 * happened to be active at import time. Returning the key keeps the decision
 * here and the wording in the dictionary, where the plural rules live: "1 min
 * ago" and "قبل دقيقة" are not the same shape.
 *
 * Past a week the exact date says more than "8d ago" ever could, so that case
 * falls through to the shared date formatter.
 */
type RelativeTime =
  | { kind: 'now' }
  | { kind: 'plural'; key: string; count: number }
  | { kind: 'date'; text: string }

function relativeTime(iso: string): RelativeTime {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return { kind: 'now' }

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return { kind: 'now' }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return { kind: 'plural', key: 'log.minutesAgo', count: minutes }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { kind: 'plural', key: 'log.hoursAgo', count: hours }

  const days = Math.floor(hours / 24)
  if (days < 7) return { kind: 'plural', key: 'log.daysAgo', count: days }

  return { kind: 'date', text: formatDateShort(iso) }
}

/* ─── Activity Row ─── */

interface ActivityRowProps {
  entry: ActivityLogEntry
  isLast: boolean
}

function ActivityRow({ entry, isLast }: ActivityRowProps) {
  const { t } = useTranslation('dashboard')
  const Icon = ICON_MAP[entry.type]
  const iconClasses = ICON_STYLE[entry.type]
  const rel = relativeTime(entry.timestamp)
  // Three shapes, one label: a fixed word, a counted one, or the exact date.
  const timeLabel =
    rel.kind === 'now'
      ? t('log.justNow')
      : rel.kind === 'plural'
        ? t(rel.key, { count: rel.count })
        : rel.text

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
          {timeLabel}
          <span className="mx-1 opacity-40">·</span>
          {entry.staff_name}
        </p>
      </div>
    </div>
  )
}

/* ─── Empty State ─── */

/**
 * `filtered` splits the two reasons this panel can be empty, which look
 * identical otherwise. "No recent activity" over an active log that merely
 * failed to match is the kind of message that sends the desk looking for a
 * bug in the wrong place.
 */
function EmptyState({ filtered = false }: { filtered?: boolean }) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] flex items-center justify-center mb-3">
        {filtered ? (
          <Search className="w-4 h-4 text-[var(--muted)]" />
        ) : (
          <CreditCard className="w-4 h-4 text-[var(--muted)]" />
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">
        {filtered ? t('log.emptyFiltered') : t('log.empty')}
      </p>
    </div>
  )
}

/* ─── ActivityLog ─── */

/**
 * The type filter, in the order the icons appear.
 *
 * "All" is not a type but the absence of one, so it is spelled out separately
 * rather than folded into the map — a wrong entry there would filter to nothing
 * and look like an empty log.
 *
 * The entries hold key *names* rather than labels: this array is module scope,
 * and a `t()` called here would resolve once, at import, in whatever language
 * was active then (see CONVENTIONS).
 */
const TYPE_FILTERS = [
  { key: 'all', labelKey: 'log.filter.all' },
  { key: 'payment', labelKey: 'log.filter.payment' },
  { key: 'checkin', labelKey: 'log.filter.checkin' },
  { key: 'student', labelKey: 'log.filter.student' },
  { key: 'alert', labelKey: 'log.filter.alert' },
] as const

type TypeFilter = (typeof TYPE_FILTERS)[number]['key']

/** Collapsed height, in px. Matches roughly seven rows — enough to see the
 *  shape of the day without the panel taking the whole column. */
const COLLAPSED_HEIGHT = 300

export const ActivityLog = forwardRef<HTMLDivElement, ActivityLogProps>(
  ({ activities = [], className, ...rest }, ref) => {
    const { t } = useTranslation('dashboard')
    const [query, setQuery] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
    const [expanded, setExpanded] = useState(false)

    /*
     * Filtered here rather than on the server on purpose: the log the dashboard
     * fetches is already bounded (one page of the retention window), so this is
     * a scan of a few hundred rows in memory — instant, and it needs no request
     * per keystroke. A server-side search would be the right call for the whole
     * retained history, and is what to reach for if this list ever stops being
     * "recent".
     */
    const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase()
      return activities.filter(entry => {
        if (typeFilter !== 'all' && entry.type !== typeFilter) return false
        if (!needle) return true
        return (
          entry.title.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle) ||
          entry.staff_name.toLowerCase().includes(needle)
        )
      })
    }, [activities, query, typeFilter])

    const isFiltering = query.trim() !== '' || typeFilter !== 'all'

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-[var(--radius-lg)]',
          'border border-[var(--glass-border)]',
          'bg-[var(--glass)] backdrop-blur-[22px]',
          'overflow-hidden',
          'flex flex-col',
          className,
        )}
        {...rest}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--glass-border)] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold font-[family-name:var(--font-heading)] text-[var(--text)]">
              {t('log.title')}
            </h3>

            {/* Expand. The list is scrollable either way — this only changes how
                much of it is on screen at once, so nothing is reachable in one
                state that is not reachable in the other. */}
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? t('log.collapse') : t('log.expand')}
              title={expanded ? t('log.collapseShort') : t('log.expandShort')}
              className={cn(
                'p-1.5 rounded-lg shrink-0 transition-colors duration-150',
                'text-[var(--muted)] hover:text-[var(--text)]',
                'hover:bg-[var(--glass-strong)]',
              )}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* Search + type filters. Both act on the loaded window, and the
              count states how much of it survived — so a filtered list can
              never be mistaken for a quiet day. */}
          <div className="flex items-center gap-2 mt-3">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg flex-1 min-w-0"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
            >
              <Search size={13} style={{ color: 'var(--muted)' }} className="shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('log.searchPlaceholder')}
                aria-label={t('log.searchLabel')}
                className="bg-transparent border-none outline-none text-[12px] w-full min-w-0"
                style={{ color: 'var(--text)' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('log.clearSearch')}
                  className="shrink-0 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {TYPE_FILTERS.map(({ key, labelKey }) => {
              const active = typeFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150',
                    'border',
                    active
                      ? 'bg-[var(--glass-strong)] text-[var(--text)] border-[var(--muted)]/40'
                      : 'bg-transparent text-[var(--muted)] border-[var(--glass-border)] hover:text-[var(--text)]',
                  )}
                >
                  {t(labelKey)}
                </button>
              )
            })}
            {isFiltering && (
              <span className="text-[10px] text-[var(--muted)] ms-auto tabular-nums">
                {t('log.count', { shown: filtered.length, total: activities.length })}
              </span>
            )}
          </div>
        </div>

        {/* List. `overflow-y-auto` with a capped height is what keeps a busy
            week from pushing the rest of the dashboard off the screen; the
            height is the only thing Expand changes. */}
        <div
          className="px-5 py-4 overflow-y-auto"
          style={{ maxHeight: expanded ? '70vh' : `${COLLAPSED_HEIGHT}px` }}
        >
          {filtered.length === 0 ? (
            <EmptyState filtered={isFiltering && activities.length > 0} />
          ) : (
            <div className="space-y-0">
              {filtered.map((entry, i) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === filtered.length - 1}
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
