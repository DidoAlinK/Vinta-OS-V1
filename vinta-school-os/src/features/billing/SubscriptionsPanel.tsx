import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { formatCurrency, formatDateShort } from '../../lib/formatters'
import { Badge } from '../../components/ui/Badge'
import type { Subscription } from '../../types/billing'
import {
  clearDebtFifo,
  getUnpaidDebtCount,
  previewDebtSettlement,
} from '../../lib/billingRules'
import { listDebtRows } from '../../lib/billingRules'
import { getVoidRestoredCredits, listVoidRestores } from '../../lib/voidedSessions'
import { CreditCard, CalendarClock, Inbox, AlertCircle, RefreshCw } from 'lucide-react'

/* ─── Props ─── */

interface SubscriptionsPanelProps {
  className?: string
}

/* ─── Billing-model badge helpers ─── */

/* The API's `billing_model` and `status` values are enum keys, never display
   text — the label is looked up from here at render time, so the badge follows
   a language switch and an unmapped value can never reach the screen raw. */
const BILLING_MODEL_STYLE: Record<string, { variant: 'warning' | 'info'; labelKey: string }> = {
  CREDIT_BASED: { variant: 'warning', labelKey: 'subscriptions.model.credits' },
  TIME_BASED: { variant: 'info', labelKey: 'subscriptions.model.time' },
}

/* ─── Status badge helpers ─── */

const STATUS_STYLE: Record<string, { variant: 'success' | 'danger' | 'warning' | 'default'; labelKey: string }> = {
  ACTIVE: { variant: 'success', labelKey: 'subscriptions.status.active' },
  EXPIRED: { variant: 'danger', labelKey: 'subscriptions.status.expired' },
  DEPLETED: { variant: 'danger', labelKey: 'subscriptions.status.depleted' },
  // OVERDUE, CANCELLED and SUSPENDED are written by the server (`billing.py`
  // names them as the column's value set, and `billing_service` sets SUSPENDED
  // when a group's attendance falls under its threshold) but had no entry here,
  // so they inherited the ACTIVE badge below. A suspended subscription showing
  // a green "Active" is the worst possible direction to be wrong in — it is the
  // state an admin most needs to notice.
  OVERDUE: { variant: 'danger', labelKey: 'subscriptions.status.overdue' },
  CANCELLED: { variant: 'danger', labelKey: 'subscriptions.status.cancelled' },
  SUSPENDED: { variant: 'danger', labelKey: 'subscriptions.status.suspended' },
  EXPIRING_SOON: { variant: 'warning', labelKey: 'subscriptions.status.expiringSoon' },
  RENEW_REQUIRED: { variant: 'warning', labelKey: 'subscriptions.status.renewRequired' },
  ATTENDANCE_WARNING: { variant: 'warning', labelKey: 'subscriptions.status.attendanceWarning' },
}

/* The badge for a status this build does not know about. Deliberately neutral
   rather than any specific status: the old fallback was `STATUS_STYLE.ACTIVE`,
   which meant a value added to the API before it was added here would be
   presented to the user as a healthy, paid-up subscription. Saying "Unknown" is
   unhelpful but honest, and it is the kind of unhelpful someone reports.
   `labelKey` is absent by design — see the render site for why. */
const UNKNOWN_STATUS = { variant: 'default' as const }

/* ─── Component ─── */

export function SubscriptionsPanel({ className }: SubscriptionsPanelProps) {
  const { t } = useTranslation('billing')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [debtTick, setDebtTick] = useState(0)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const { data } = await api.get('/billing/subscriptions')
      setSubscriptions(data.subscriptions ?? data ?? [])
    } catch (err: any) {
      // T5: no silent catch — surface + Retry.
      // What goes into state is the key, not the sentence: the banner outlives
      // the request that set it, and it has to follow a language switch.
      const msgKey = err?.response?.status >= 500
        ? 'subscriptions.error.server'
        : 'subscriptions.error.load'
      setLoadError(msgKey)
      setSubscriptions([])
      toast.error(
        t('subscriptions.toast.failedTitle'),
        t('subscriptions.toast.failedBody', { message: t(msgKey) }),
        { duration: 8000 },
      )
    } finally {
      setIsLoading(false)
    }
    // `t` is a dependency because the failure toast is composed here, in the
    // language of the retry — not the one that was active when the panel mounted.
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-16', className)}>
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{t('subscriptions.loading')}</span>
        </div>
      </div>
    )
  }

  /* ── Load error (never silent) ── */
  if (!isLoading && loadError) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <p className="text-sm font-semibold text-[var(--red)]">{t(loadError)}</p>
        <p className="text-xs text-[var(--muted)]">{t('subscriptions.error.notCleared')}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <RefreshCw size={13} />
          {t('common:action.retry')}
        </button>
      </div>
    )
  }

  /* ── Debt banner handler (Record Payment settles FIFO) ── */
  const handleSettle = (sub: Subscription) => {
    const n = sub.total_credits ?? 0
    const debt = getUnpaidDebtCount(sub.student_id, sub.group_id)
    if (debt === 0) {
      toast.info(
        t('subscriptions.toast.noDebt.title'),
        t('subscriptions.toast.noDebt.body', { student: sub.student_name }),
      )
      return
    }
    const preview = previewDebtSettlement(debt, n)
    const cleared = clearDebtFifo(sub.student_id, sub.group_id, preview.cleared, sub.id)
    // `tick`, not `t` — the translation function is in scope here.
    setDebtTick((tick) => tick + 1)
    toast.success(
      t('subscriptions.toast.settled.title'),
      preview.stillOwed > 0
        ? t('subscriptions.toast.settled.bodyOwed', {
            n,
            debt,
            remaining: preview.remaining,
            stillOwed: preview.stillOwed,
            cleared: cleared.length,
          })
        : t('subscriptions.toast.settled.body', {
            n,
            debt,
            remaining: preview.remaining,
            cleared: cleared.length,
          }),
      { duration: 8000 },
    )
  }

  /* ── Empty state ── */
  if (subscriptions.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <div className="w-16 h-16 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
          <Inbox className="w-7 h-7 text-[var(--muted)]/40" />
        </div>
        <p className="text-sm font-medium text-[var(--muted)]">{t('subscriptions.empty.title')}</p>
        <p className="text-xs text-[var(--muted)]/60">
          {t('subscriptions.empty.body')}
        </p>
      </div>
    )
  }

  /* ── Table ── */
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--glass-border)]">
            <th className="text-start px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.student')}</th>
            <th className="text-start px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.group')}</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.model')}</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.value')}</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('common:label.status')}</th>
            <th className="text-end px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.price')}</th>
            <th className="text-end px-3 py-2.5 text-xs font-medium text-[var(--muted)]">{t('subscriptions.table.created')}</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => {
            const modelStyle = BILLING_MODEL_STYLE[sub.billing_model] ?? BILLING_MODEL_STYLE.CREDIT_BASED
            const statusStyle = STATUS_STYLE[sub.status]
            // T5 debt-first: touch debtTick so the badge refreshes after settlement.
            void debtTick
            const debtCount = getUnpaidDebtCount(sub.student_id, sub.group_id)
            const preview = debtCount > 0 ? previewDebtSettlement(debtCount, sub.total_credits ?? 0) : null
            // T7 void restore overlay: +credits restored for THIS student's voided sessions.
            const voidBonus = listVoidRestores()
              .filter((v) => v.classId === sub.group_id)
              .reduce((sum, v) => sum + (v.restoredCredits[sub.student_id] ?? 0), 0)

            return (
              <tr
                key={sub.id}
                className={cn(
                  'border-b border-[var(--glass-border)]/50',
                  'hover:bg-[var(--glass)] transition-colors',
                )}
              >
                {/* Student name + debt badge */}
                <td className="px-3 py-3">
                  <span className="font-medium text-[var(--text)]">{sub.student_name}</span>
                  {debtCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSettle(sub)}
                      title={t('subscriptions.debt.tooltip', {
                        debt: debtCount,
                        credits: sub.total_credits ?? 0,
                        remaining: preview?.remaining ?? 0,
                      })}
                      className="ms-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--red-soft)] text-[var(--red)] hover:brightness-95 transition-all"
                    >
                      <AlertCircle size={10} />
                      {t('subscriptions.debt.badge', { debt: debtCount })}
                    </button>
                  )}
                </td>

                {/* Group name */}
                <td className="px-3 py-3">
                  <span className="text-[var(--text)]/80">{sub.group_name}</span>
                </td>

                {/* Billing model badge */}
                <td className="px-3 py-3 text-center">
                  <Badge variant={modelStyle.variant} size="sm">
                    <span className="inline-flex items-center gap-1">
                      {sub.billing_model === 'CREDIT_BASED'
                        ? <CreditCard className="w-3 h-3" />
                        : <CalendarClock className="w-3 h-3" />}
                      {t(modelStyle.labelKey)}
                    </span>
                  </Badge>
                </td>

                {/* Credits remaining / Access end date */}
                <td className="px-3 py-3 text-center">
                  {sub.billing_model === 'CREDIT_BASED' ? (
                    <span className="tabular-nums font-medium text-[var(--text)]">
                      {(sub.remaining_credits ?? 0) + voidBonus}
                      <span className="text-[var(--muted)] text-xs ms-0.5">
                        /{sub.total_credits ?? 0}
                      </span>
                      {voidBonus > 0 && (
                        <span
                          className="ms-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--emerald-soft)] text-[var(--emerald)]"
                          title={t('subscriptions.void.tooltip')}
                        >
                          {t('subscriptions.void.badge', { credits: voidBonus })}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--text)]">
                      {sub.access_end_date ? formatDateShort(sub.access_end_date) : t('common:dash')}
                    </span>
                  )}
                </td>

                {/* Status badge */}
                <td className="px-3 py-3 text-center">
                  <Badge variant={statusStyle?.variant ?? UNKNOWN_STATUS.variant} size="sm">
                    {/* An unmapped status is a gap in STATUS_STYLE, not a fact
                        about the subscription — so it says so rather than
                        naming a state the server never reported. */}
                    {statusStyle ? t(statusStyle.labelKey) : t('subscriptions.status.unknown')}
                  </Badge>
                </td>

                {/* Price */}
                <td className="px-3 py-3 text-end tabular-nums font-medium text-[var(--text)]">
                  {sub.amount_paid_da != null ? formatCurrency(sub.amount_paid_da) : t('common:dash')}
                </td>

                {/* Created */}
                <td className="px-3 py-3 text-end text-[var(--muted)]">
                  {sub.created_at ? formatDateShort(sub.created_at) : t('common:dash')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default SubscriptionsPanel
