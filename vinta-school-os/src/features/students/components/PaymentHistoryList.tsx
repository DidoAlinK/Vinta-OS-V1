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

import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

/** The method codes this app knows, mapped to keys rather than to sentences. */
const METHOD_LABEL_KEYS: Record<string, string> = {
  CASH: 'history.method.cash',
  CCP: 'history.method.ccp',
  BARIDI_MOB: 'history.method.baridiMob',
}

/**
 * The codes the app knows are translated. Anything else falls back to the
 * canonical `PAYMENT_METHOD_LABELS` map and then to the raw code: showing the
 * code is honest, silently dropping the field is not.
 */
function methodLabel(t: TFunction, method: string | null | undefined): string | null {
  const raw = (method ?? '').trim()
  if (!raw) return null
  const key = METHOD_LABEL_KEYS[raw]
  return key ? t(key) : (METHOD_LABELS[raw] ?? raw)
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

/** The subscription codes this app knows, mapped to keys. */
const SUB_STATUS_KEYS: Record<string, string> = {
  ACTIVE: 'history.status.active',
  SUSPENDED: 'history.status.suspended',
  EXPIRED: 'history.status.expired',
  DEPLETED: 'history.status.depleted',
  EXPIRING_SOON: 'history.status.expiringSoon',
  RENEW_REQUIRED: 'history.status.renewRequired',
  ATTENDANCE_WARNING: 'history.status.attendanceWarning',
}

/**
 * `ATTENDANCE_WARNING` → "Attendance warning". This is the fallback for a code
 * the map above does not know — a status a later server adds shows up here
 * rather than disappearing from the row.
 */
function humaniseStatus(status: string): string {
  const words = status.toLowerCase().split('_').filter(Boolean)
  if (words.length === 0) return status
  const [first, ...rest] = words
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}

/** Known codes are translated; unknown ones keep the humanised code. */
function subscriptionStatusLabel(t: TFunction, status: string): string {
  const key = SUB_STATUS_KEYS[status]
  return key ? t(key) : humaniseStatus(status)
}

/** What the purchase bought: credits, or a window of access. */
function purchaseShape(t: TFunction, sub: Subscription): React.ReactNode {
  if (sub.billing_model === 'CREDIT_BASED') {
    const remaining = sub.remaining_credits
    const total = sub.total_credits
    return (
      <span>
        {t('history.credits')}{' '}
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
        {t('history.access')}{' '}
        {formatDateRange(
          t,
          parseISODate(sub.access_start_date),
          parseISODate(sub.access_end_date),
        )}
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
  const { t } = useTranslation('students')
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
      {t('common:action.retry')}
    </button>
  )

  return (
    <ProfileCard
      title={t('history.title')}
      icon={<Receipt size={13} />}
      action={
        loading ? (
          <InlineSpinner label={t('history.loadingAria')} />
        ) : error ? (
          retryButton
        ) : undefined
      }
    >
      {error ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      ) : isEmpty ? (
        loading ? (
          <EmptyLine>{t('common:state.loading')}</EmptyLine>
        ) : (
          <EmptyLine>{t('history.empty')}</EmptyLine>
        )
      ) : (
        <ul className="m-0 p-0 list-none space-y-2">
          {purchases.map((sub) => {
            const groupName = (sub.group_name ?? '').trim()
            const method = methodLabel(t, sub.payment_method)
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

                  <div className="text-end shrink-0">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: amount == null ? 'var(--muted)' : 'var(--text)' }}
                    >
                      {amount == null ? DASH : formatDa(amount)}
                    </p>
                    {/* The tooltip carries the same words as the pill: a status
                        code printed raw would be untranslated text in an
                        otherwise translated row. */}
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full',
                        'text-[10px] font-semibold',
                        statusPillClasses(sub.status),
                      )}
                      title={subscriptionStatusLabel(t, sub.status)}
                    >
                      {subscriptionStatusLabel(t, sub.status)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  {purchaseShape(t, sub)}
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
