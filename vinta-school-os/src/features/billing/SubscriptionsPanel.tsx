import { useState, useEffect, useCallback } from 'react'
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

const BILLING_MODEL_STYLE: Record<string, { variant: 'warning' | 'info'; label: string }> = {
  CREDIT_BASED: { variant: 'warning', label: 'Credits' },
  TIME_BASED: { variant: 'info', label: 'Time' },
}

/* ─── Status badge helpers ─── */

const STATUS_STYLE: Record<string, { variant: 'success' | 'danger' | 'warning' | 'default'; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  EXPIRED: { variant: 'danger', label: 'Expired' },
  DEPLETED: { variant: 'danger', label: 'Depleted' },
  EXPIRING_SOON: { variant: 'warning', label: 'Expiring Soon' },
  RENEW_REQUIRED: { variant: 'warning', label: 'Renew Required' },
  ATTENDANCE_WARNING: { variant: 'warning', label: 'Attn Warning' },
}

/* ─── Component ─── */

export function SubscriptionsPanel({ className }: SubscriptionsPanelProps) {
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
      const msg = err?.response?.status >= 500
        ? 'Server error loading subscriptions (500).'
        : 'Could not load subscriptions.'
      setLoadError(msg)
      setSubscriptions([])
      toast.error('Subscriptions failed to load', `${msg} Press Retry.`, { duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-16', className)}>
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading subscriptions…</span>
        </div>
      </div>
    )
  }

  /* ── Load error (never silent) ── */
  if (!isLoading && loadError) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <p className="text-sm font-semibold text-[var(--red)]">{loadError}</p>
        <p className="text-xs text-[var(--muted)]">Nothing was silently cleared.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    )
  }

  /* ── Debt banner handler (Record Payment settles FIFO) ── */
  const handleSettle = (sub: Subscription) => {
    const n = sub.total_credits ?? 0
    const debt = getUnpaidDebtCount(sub.student_id, sub.group_id)
    if (debt === 0) {
      toast.info('No unpaid debt', `${sub.student_name} — nothing to settle.`)
      return
    }
    const preview = previewDebtSettlement(debt, n)
    const cleared = clearDebtFifo(sub.student_id, sub.group_id, preview.cleared, sub.id)
    setDebtTick((t) => t + 1)
    toast.success(
      'Debt settled oldest-first',
      `N=${n} − debt ${debt} → ${preview.remaining} remaining${preview.stillOwed > 0 ? `, ${preview.stillOwed} still owed` : ''} (${cleared.length} cleared).`,
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
        <p className="text-sm font-medium text-[var(--muted)]">No subscriptions yet</p>
        <p className="text-xs text-[var(--muted)]/60">
          Student subscriptions will appear here once created.
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
            <th className="text-left px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Student</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Group</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Model</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Value</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Status</th>
            <th className="text-right px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Price</th>
            <th className="text-right px-3 py-2.5 text-xs font-medium text-[var(--muted)]">Created</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => {
            const modelStyle = BILLING_MODEL_STYLE[sub.billing_model] ?? BILLING_MODEL_STYLE.CREDIT_BASED
            const statusStyle = STATUS_STYLE[sub.status] ?? STATUS_STYLE.ACTIVE
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
                      title={`Unpaid debt ${debtCount} — pay N=${sub.total_credits ?? 0} oldest-first → ${preview?.remaining ?? 0} remaining. Click to mark settled.`}
                      className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--red-soft)] text-[var(--red)] hover:brightness-95 transition-all"
                    >
                      <AlertCircle size={10} />
                      debt {debtCount}
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
                      {modelStyle.label}
                    </span>
                  </Badge>
                </td>

                {/* Credits remaining / Access end date */}
                <td className="px-3 py-3 text-center">
                  {sub.billing_model === 'CREDIT_BASED' ? (
                    <span className="tabular-nums font-medium text-[var(--text)]">
                      {(sub.remaining_credits ?? 0) + voidBonus}
                      <span className="text-[var(--muted)] text-xs ml-0.5">
                        /{sub.total_credits ?? 0}
                      </span>
                      {voidBonus > 0 && (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--emerald-soft)] text-[var(--emerald)]"
                          title="T7 void restore — THIS session's credit only"
                        >
                          +{voidBonus} void-restore
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--text)]">
                      {sub.access_end_date ? formatDateShort(sub.access_end_date) : '—'}
                    </span>
                  )}
                </td>

                {/* Status badge */}
                <td className="px-3 py-3 text-center">
                  <Badge variant={statusStyle.variant} size="sm">
                    {statusStyle.label}
                  </Badge>
                </td>

                {/* Price */}
                <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--text)]">
                  {sub.amount_paid_da != null ? formatCurrency(sub.amount_paid_da) : '—'}
                </td>

                {/* Created */}
                <td className="px-3 py-3 text-right text-[var(--muted)]">
                  {sub.created_at ? formatDateShort(sub.created_at) : '—'}
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
