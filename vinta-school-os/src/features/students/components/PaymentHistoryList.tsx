/**
 * Vinta School OS — Payment history list
 *
 * One row per purchased subscription — one row, one purchase. This is the money
 * trail, and it is the only place in the drawer that may truthfully render the
 * word "Paid", because `SubscriptionStatus` is a record of payment that already
 * happened.
 *
 * Two things this list refuses to do:
 *
 *   - It never invents an amount. An unrecorded `amount_paid_da` is an em dash,
 *     not "0 Da" — "no figure recorded" and "paid nothing" are different claims.
 *   - It never prints a bare `+213`. `formatPhone('')` returns exactly that, so
 *     a blank number is omitted rather than filled in.
 *
 * `group_name` here is the CLASS name (`group.name`), not the short group label
 * (`Student.group_name`, e.g. "A"). Same words, different values.
 */

import { Receipt, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatDa } from '../../../lib/formatters'
import { PAYMENT_METHOD_LABELS } from '../../../types/billing'
import type { Subscription } from '../../../types/billing'
import {
  DASH,
  formatDateRange,
  formatDisplayDate,
  parseISODate,
} from './BillingSummaryCard'
import { EmptyLine, InlineSpinner, ProfileCard } from './ProfileCard'

export interface PaymentHistoryListProps {
  subscriptions: Subscription[]
  loading?: boolean
  error: string | null
  onRetry: () => void
}

/** Payment methods arrive as enum codes; widen the canonical map for lookup. */
const METHOD_LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS }

/**
 * A humanised fallback for a method the canonical map does not know: showing the
 * raw code is honest, silently dropping the field is not.
 */
function methodLabel(method: string | null | undefined): string | null {
  const raw = (method ?? '').trim()
  if (!raw) return null
  return METHOD_LABELS[raw] ?? raw
}

/** `created_at` is a full ISO timestamp, so `new Date()` is correct here. */
function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Subscription status → pill colours. Anything unlisted is neutral. */
function statusPillClasses(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-soft text-emerald'
    case 'SUSPENDED':
      return 'bg-red-soft text-red'
    case 'EXPIRED':
    case 'DEPLETED':
    // Money owed soon is the same claim as `due`, which is gold everywhere else
    // in the app. Leaving these in the neutral default would make a subscription
    // about to expire look identical to one with no recorded state at all.
    case 'EXPIRING_SOON':
    case 'RENEW_REQUIRED':
      return 'bg-gold-soft text-gold'
    // ATTENDANCE_WARNING and anything unknown: no colour that implies either
    // money received or money lost.
    default:
      return 'bg-muted-soft text-muted'
  }
}

/** `ATTENDANCE_WARNING` → "Attendance warning". The raw code stays in `title`. */
function humaniseStatus(status: string): string {
  const words = status.toLowerCase().split('_').filter(Boolean)
  if (words.length === 0) return status
  const [first, ...rest] = words
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}

/** What the purchase bought: credits, or a window of access. */
function purchaseShape(sub: Subscription): React.ReactNode {
  if (sub.billing_model === 'CREDIT_BASED') {
    const remaining = sub.remaining_credits
    const total = sub.total_credits
    return (
      <span>
        Credits{' '}
        <span style={{ color: remaining == null ? 'var(--muted)' : 'var(--text)' }}>
          {remaining ?? DASH}
        </span>
        <span style={{ color: 'var(--muted)' }}> / </span>
        <span style={{ color: total == null ? 'var(--muted)' : 'var(--text)' }}>
          {total ?? DASH}
        </span>
      </span>
    )
  }

  if (sub.billing_model === 'TIME_BASED') {
    return (
      <span>
        Access{' '}
        {formatDateRange(parseISODate(sub.access_start_date), parseISODate(sub.access_end_date))}
      </span>
    )
  }

  // Neither model: nothing truthful to say about what was bought.
  return null
}

export function PaymentHistoryList({
  subscriptions,
  loading = false,
  error,
  onRetry,
}: PaymentHistoryListProps) {
  const purchases = Array.isArray(subscriptions) ? subscriptions : []
  const isEmpty = purchases.length === 0

  const retryButton = (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1 text-[11px] font-semibold transition-colors duration-150 hover:underline"
      style={{ color: 'var(--gold)' }}
    >
      <RefreshCw size={11} aria-hidden="true" />
      Retry
    </button>
  )

  return (
    <ProfileCard
      title="Payment history"
      icon={<Receipt size={13} />}
      action={loading ? <InlineSpinner label="Loading payment history" /> : error ? retryButton : undefined}
    >
      {error ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      ) : isEmpty ? (
        loading ? (
          <EmptyLine>{'Loading…'}</EmptyLine>
        ) : (
          <EmptyLine>No payments recorded yet.</EmptyLine>
        )
      ) : (
        <ul className="m-0 p-0 list-none space-y-2">
          {purchases.map((sub) => {
            const groupName = (sub.group_name ?? '').trim()
            const method = methodLabel(sub.payment_method)
            const purchased = parseTimestamp(sub.created_at)
            const amount = sub.amount_paid_da
            const dateText = purchased ? formatDisplayDate(purchased) : DASH

            return (
              <li
                key={sub.id}
                className="px-3 py-2.5"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: groupName ? 'var(--text)' : 'var(--muted)' }}
                      title={groupName || undefined}
                    >
                      {groupName || DASH}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                      {method ? `${dateText} · ${method}` : dateText}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: amount == null ? 'var(--muted)' : 'var(--text)' }}
                    >
                      {amount == null ? DASH : formatDa(amount)}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full',
                        'text-[10px] font-semibold',
                        statusPillClasses(sub.status),
                      )}
                      title={sub.status}
                    >
                      {humaniseStatus(sub.status)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  {purchaseShape(sub)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ProfileCard>
  )
}

export default PaymentHistoryList
