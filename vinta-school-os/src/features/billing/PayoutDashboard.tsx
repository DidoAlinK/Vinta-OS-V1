import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { isGrossProfitEnabled } from '../../lib/grossProfit'
import { formatCurrency, formatDateShort } from '../../lib/formatters'
import { Badge } from '../../components/ui/Badge'
import { Card, CardBody } from '../../components/ui/Card'
import {
  Wallet,
  CheckCircle2,
  Clock,
  Inbox,
  Check,
} from 'lucide-react'

/* ─── Props ─── */

interface PayoutDashboardProps {
  className?: string
}

/* ─── Payout record (matches backend shape) ─── */

interface PayoutRecord {
  id: string
  teacher_id: string
  teacher_name: string
  session_id?: string
  session_date?: string
  gross_revenue_da: number
  commission_type?: string
  commission_value?: number
  teacher_cut_da: number
  status: 'PENDING' | 'PAID' | 'Pending' | 'Paid'
  paid_at?: string
  paid_by_staff_id?: string
  created_at: string
}

/* API status → dictionary key. `status` arrives as either 'PENDING'/'PAID' or
   'Pending'/'Paid' depending on the endpoint, so it is upper-cased before the
   lookup, and an unmapped value resolves to a label rather than the raw enum. */
const PAYOUT_STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: 'payouts.status.pending',
  PAID: 'payouts.status.paid',
}

/* ─── Summary card ─── */

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  bgColor: string
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] shrink-0"
            style={{ backgroundColor: bgColor, color }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-[var(--muted)] font-medium">{label}</span>
            <span className="text-lg font-bold text-[var(--text)] font-[family-name:var(--font-heading)] tabular-nums">
              {value}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

/* ─── PIN input sub-component ─── */

function PinInput({
  onSubmit,
  onCancel,
  loading,
}: {
  /** Resolve `true` when the PIN was accepted, `false` when it was rejected. */
  onSubmit: (pin: string) => Promise<boolean>
  onCancel: () => void
  loading: boolean
}) {
  const { t } = useTranslation('billing')
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const submit = useCallback(
    async (digits: string[]) => {
      const pinStr = digits.join('')
      if (pinStr.length !== 4) return
      const accepted = await onSubmit(pinStr)
      if (accepted) return
      // Previously the caller swallowed the failure, so this branch was
      // unreachable and a wrong PIN produced no feedback whatsoever — the
      // operator had no way to tell a rejection from a hung request.
      setError(true)
      setPin(['', '', '', ''])
      inputRefs.current[0]?.focus()
      // Let the shake animation finish before re-arming the inputs.
      setTimeout(() => setError(false), 800)
    },
    [onSubmit],
  )

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    setError(false)
    if (value && index < 3) inputRefs.current[index + 1]?.focus()
    if (value && index === 3) void submit(next)
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        const next = [...pin]
        next[index - 1] = ''
        setPin(next)
        inputRefs.current[index - 1]?.focus()
      } else {
        const next = [...pin]
        next[index] = ''
        setPin(next)
      }
      setError(false)
    } else if (e.key === 'Enter') {
      void submit(pin)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted.length) return
    const next = ['', '', '', '']
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setPin(next)
    inputRefs.current[Math.min(pasted.length, 3)]?.focus()
    if (pasted.length === 4) void submit(next)
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-[var(--muted)]">{t('payouts.pin.prompt')}</p>
      <div className={cn('flex gap-3', error && 'animate-shake')}>
        {pin.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            disabled={loading}
            className="w-12 h-12 rounded-xl text-center text-lg font-bold outline-none transition-all duration-200"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: digit
                ? error ? '2px solid var(--red)' : '2px solid var(--gold)'
                : '2px solid var(--glass-border)',
              boxShadow: digit && !error ? '0 4px 16px rgba(179,135,42,.2)' : 'none',
            }}
            aria-label={t('payouts.pin.digit', { index: i + 1 })}
          />
        ))}
      </div>
      {error && (
        <p className="text-xs font-medium text-[var(--red)]">{t('payouts.pin.incorrect')}</p>
      )}
      {loading && (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--muted)]">{t('payouts.pin.processing')}</span>
        </div>
      )}
    </div>
  )
}

/* ─── Main component ─── */

export function PayoutDashboard({ className }: PayoutDashboardProps) {
  const { t } = useTranslation('billing')
  const [records, setRecords] = useState<PayoutRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingLoading, setMarkingLoading] = useState(false)
  // Gross-profit opt-in: OFF hides all gross/cut math (per-session pay only).
  const grossOn = isGrossProfitEnabled()

  /* ── Fetch payouts ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const { data } = await api.get('/billing/payouts')
        if (!cancelled) setRecords(data.payouts ?? data ?? [])
      } catch {
        if (!cancelled) setRecords([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  /* ── Summary totals ── */
  const totalPending = records
    .filter((r) => r.status === 'Pending' || r.status === 'PENDING')
    .reduce((sum, r) => sum + r.teacher_cut_da, 0)
  const totalPaid = records
    .filter((r) => r.status === 'Paid' || r.status === 'PAID')
    .reduce((sum, r) => sum + r.teacher_cut_da, 0)
  const totalAll = records.reduce((sum, r) => sum + r.teacher_cut_da, 0)

  /* ── Group by teacher ── */
  const grouped = records.reduce<Record<string, PayoutRecord[]>>((acc, rec) => {
    const key = rec.teacher_name || rec.teacher_id
    if (!acc[key]) acc[key] = []
    acc[key].push(rec)
    return acc
  }, {})

  /* ── Mark as paid flow ── */
  const openPinModal = (id: string) => {
    setMarkingId(id)
    setPinModalOpen(true)
  }

  /**
   * Returns `true` when the payout was marked paid, `false` when the request was
   * refused — the PIN was wrong, or the payout had already been settled by
   * someone else. `PinInput` renders that `false` as an inline error.
   *
   * The backend answers **403** for a wrong owner PIN (not 401), which is what
   * keeps a mistyped PIN from being read as an expired session by the axios
   * interceptor. Do not "simplify" that back to 401.
   */
  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    const id = markingId
    if (!id) return false
    setMarkingLoading(true)
    try {
      await api.post(`/billing/payouts/${id}/mark-paid`, { pin })
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: 'PAID' as const, paid_at: new Date().toISOString() }
            : r,
        ),
      )
      setPinModalOpen(false)
      setMarkingId(null)
      return true
    } catch {
      return false
    } finally {
      setMarkingLoading(false)
    }
  }

  const closePinModal = () => {
    setPinModalOpen(false)
    setMarkingId(null)
    setMarkingLoading(false)
  }

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-16', className)}>
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{t('payouts.loading')}</span>
        </div>
      </div>
    )
  }

  /* ── Empty ── */
  if (records.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <div className="w-16 h-16 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
          <Inbox className="w-7 h-7 text-[var(--muted)]/40" />
        </div>
        <p className="text-sm font-medium text-[var(--muted)]">{t('payouts.empty.title')}</p>
        <p className="text-xs text-[var(--muted)]/60">
          {t('payouts.empty.body')}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* ── Summary cards (gross math only when opted in) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label={t('payouts.summary.pending')}
          value={grossOn ? formatCurrency(totalPending) : t('common:dash')}
          icon={Clock}
          color="var(--gold)"
          bgColor="var(--gold-soft)"
        />
        <SummaryCard
          label={t('payouts.summary.paid')}
          value={grossOn ? formatCurrency(totalPaid) : t('common:dash')}
          icon={CheckCircle2}
          color="var(--emerald)"
          bgColor="var(--emerald-soft)"
        />
        <SummaryCard
          label={t('payouts.summary.all')}
          value={grossOn ? formatCurrency(totalAll) : t('common:dash')}
          icon={Wallet}
          color="var(--violet)"
          bgColor="var(--violet-soft)"
        />
      </div>
      {!grossOn && (
        <p className="text-xs text-[var(--muted)]">
          {t('payouts.grossOff')}
        </p>
      )}

      {/* ── Payout records grouped by teacher ── */}
      <div className="flex flex-col gap-4">
        {Object.entries(grouped).map(([teacherKey, teacherRecords]) => (
          <div
            key={teacherKey}
            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-[22px] overflow-hidden"
          >
            {/* Teacher header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]/50">
              <span className="text-sm font-semibold text-[var(--text)] font-[family-name:var(--font-heading)]">
                {teacherKey}
              </span>
              <span className="text-xs text-[var(--muted)] tabular-nums">
                {t('payouts.records', { count: teacherRecords.length })}
              </span>
            </div>

            {/* Records */}
            {teacherRecords.map((rec) => (
              <div
                key={rec.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  'border-b border-[var(--glass-border)]/30 last:border-b-0',
                  'hover:bg-[var(--glass-strong)] transition-colors',
                )}
              >
                {/* Session date */}
                <div className="flex flex-col min-w-0 shrink-0 w-20">
                  <span className="text-xs text-[var(--muted)]">
                    {rec.session_date
                      ? formatDateShort(rec.session_date)
                      : rec.created_at
                        ? formatDateShort(rec.created_at)
                        : t('common:dash')}
                  </span>
                </div>

                {/* Gross amount */}
                <div className="flex flex-col min-w-0 shrink-0 w-24">
                  <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{t('payouts.column.gross')}</span>
                  <span className="text-sm tabular-nums text-[var(--text)]">{grossOn ? formatCurrency(rec.gross_revenue_da) : t('common:dash')}</span>
                </div>

                {/* Commission type */}
                <div className="flex flex-col min-w-0 shrink-0 w-20">
                  <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{t('payouts.column.type')}</span>
                  <span className="text-xs text-[var(--text)]/80">{grossOn ? (rec.commission_type ?? t('common:dash')) : t('common:dash')}</span>
                </div>

                {/* Teacher cut */}
                <div className="flex flex-col min-w-0 shrink-0 w-24">
                  <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{t('payouts.column.cut')}</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--emerald)]">
                    {grossOn ? formatCurrency(rec.teacher_cut_da) : t('common:dash')}
                  </span>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Status */}
                <Badge
                  variant={rec.status === 'Paid' || rec.status === 'PAID' ? 'success' : 'warning'}
                  size="sm"
                >
                  {t(PAYOUT_STATUS_LABEL_KEYS[rec.status.toUpperCase()] ?? 'payouts.status.unknown')}
                </Badge>

                {/* Mark as Paid button */}
                {(rec.status === 'Pending' || rec.status === 'PENDING') && (
                  <button
                    type="button"
                    onClick={() => openPinModal(rec.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)]',
                      'text-xs font-medium',
                      'bg-[var(--emerald-soft)] text-[var(--emerald)]',
                      'hover:bg-[var(--emerald)] hover:text-white',
                      'transition-colors duration-150',
                      'shrink-0',
                    )}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('payouts.markPaid')}
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── PIN modal overlay ── */}
      {pinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10,10,10,.45)', backdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closePinModal() }}
        >
          <div
            className={cn(
              'w-full max-w-[360px]',
              'rounded-[var(--radius-lg)]',
              'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
              'border border-[var(--glass-border)]',
              'shadow-[var(--glass-shadow)]',
              'p-6',
              'animate-fade-in-scale',
            )}
          >
            <h3 className="text-base font-semibold text-[var(--text)] font-[family-name:var(--font-heading)] text-center mb-4">
              {t('payouts.pin.title')}
            </h3>
            <PinInput
              onSubmit={handlePinSubmit}
              onCancel={closePinModal}
              loading={markingLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default PayoutDashboard
