import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatCurrency } from '../../lib/formatters'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'

/* ─── Types ─── */

interface AgingEntry {
  name: string
  amount: number
  days_overdue: number
}

interface AgingBucket {
  range: string
  label: string
  count: number
  total_amount: number
  entries: AgingEntry[]
}

/* ─── Props ─── */

export interface FinanceBreakdownProps {
  isOpen: boolean
  onClose: () => void
  type: 'students' | 'teachers'
}

/* ─── Bucket colors ─── */

const BUCKET_COLORS: Record<string, { badge: 'red' | 'gold' | 'emerald'; bar: string }> = {
  '1-7': { badge: 'gold', bar: 'bg-[var(--gold)]' },
  '8-30': { badge: 'red', bar: 'bg-[var(--red)]' },
  '30+': { badge: 'red', bar: 'bg-[var(--red)]' },
}

/* ─── Component ─── */

export function FinanceBreakdown({ isOpen, onClose, type }: FinanceBreakdownProps) {
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>(type)
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<AgingBucket[]>([])
  const [isLoading, setIsLoading] = useState(false)

  /* ── Fetch breakdown data ── */
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const { data } = await api.get(`/billing/aging-buckets`, {
          params: { type: activeTab },
        })
        if (!cancelled) {
          // Transform backend shape {recent, aging, critical} → bucket array
          const BUCKET_MAP: { key: string; range: string; label: string }[] = [
            { key: 'recent', range: '1-7', label: '1–7 Days' },
            { key: 'aging', range: '8-30', label: '8–30 Days' },
            { key: 'critical', range: '30+', label: '30+ Days' },
          ]
          const raw = data.buckets ?? data
          if (Array.isArray(raw)) {
            // Already in expected format
            setBuckets(raw)
          } else if (raw && typeof raw === 'object') {
            const transformed: AgingBucket[] = BUCKET_MAP.map(({ key, range, label }) => {
              const bucket = raw[key] ?? {}
              const items = (bucket.items ?? []).map((item: Record<string, unknown>) => ({
                name: item.student_name ?? item.name ?? 'Unknown',
                amount: item.amount_da ?? item.amount ?? 0,
                days_overdue: item.days_overdue ?? 0,
              }))
              return {
                range,
                label,
                count: bucket.count ?? items.length,
                total_amount: items.reduce(
                  (sum: number, e: { amount: number }) => sum + (e.amount || 0),
                  0,
                ),
                entries: items,
              }
            })
            setBuckets(transformed)
          } else {
            setBuckets([])
          }
        }
      } catch {
        if (!cancelled) setBuckets([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isOpen, activeTab])

  const totalAmount = buckets.reduce((s, b) => s + b.total_amount, 0)
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)

  const toggleBucket = (range: string) => {
    setExpandedBucket((prev) => (prev === range ? null : range))
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Finance Breakdown" size="lg">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-[var(--radius-sm)] bg-[var(--input-bg)] border border-[var(--glass-border)] mb-5">
        {(['students', 'teachers'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab)
              setExpandedBucket(null)
            }}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-[var(--radius-xs)] capitalize transition-all',
              activeTab === tab
                ? 'bg-[var(--glass-strong)] text-[var(--text)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--text)]',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && buckets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-16 h-16 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-[var(--muted)]/30" />
          </div>
          <p className="text-sm text-[var(--muted)]">No overdue accounts</p>
          <p className="text-xs text-[var(--muted)]/60">Overdue {activeTab} will appear here</p>
        </div>
      )}

      {/* Data */}
      {!isLoading && buckets.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-4 mb-5 text-sm">
            <span className="text-[var(--muted)]">
              <span className="font-semibold text-[var(--text)]">{totalCount}</span> overdue
            </span>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)]">
              <span className="font-semibold text-[var(--red)]">{formatCurrency(totalAmount)}</span>{' '}
              total
            </span>
          </div>

          {/* Aging buckets */}
          <div className="flex flex-col gap-3">
            {buckets.map((bucket) => {
              const colors = BUCKET_COLORS[bucket.range] ?? BUCKET_COLORS['1-7']
              const isExpanded = expandedBucket === bucket.range
              const pct = totalAmount > 0 ? (bucket.total_amount / totalAmount) * 100 : 0

              return (
                <div
                  key={bucket.range}
                  className={cn(
                    'rounded-[var(--radius-sm)] border transition-colors',
                    isExpanded
                      ? 'border-[var(--glass-border)] bg-[var(--glass)]'
                      : 'border-transparent hover:bg-[var(--glass)]',
                  )}
                >
                  {/* Bucket header */}
                  <button
                    type="button"
                    onClick={() => toggleBucket(bucket.range)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <Badge variant={colors.badge} size="sm">
                      {bucket.label}
                    </Badge>

                    {/* Bar */}
                    <div className="flex-1 h-2 rounded-full bg-[var(--input-bg)] overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <span className="text-sm font-medium text-[var(--text)] tabular-nums shrink-0 w-24 text-right">
                      {formatCurrency(bucket.total_amount)}
                    </span>

                    <span className="text-xs text-[var(--muted)] tabular-nums shrink-0 w-6 text-center">
                      {bucket.count}
                    </span>
                  </button>

                  {/* Expanded table */}
                  {isExpanded && bucket.entries.length > 0 && (
                    <div className="px-3 pb-3">
                      <div className="rounded-[var(--radius-xs)] border border-[var(--glass-border)] overflow-hidden">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_100px_80px] gap-2 px-3 py-2 bg-[var(--input-bg)] text-xs font-medium text-[var(--muted)]">
                          <span>Name</span>
                          <span className="text-right">Amount</span>
                          <span className="text-right">Days</span>
                        </div>

                        {/* Rows */}
                        {bucket.entries.map((entry, i) => (
                          <div
                            key={i}
                            className={cn(
                              'grid grid-cols-[1fr_100px_80px] gap-2 px-3 py-2.5 text-sm',
                              'border-t border-[var(--glass-border)]',
                              'hover:bg-[var(--glass)] transition-colors',
                            )}
                          >
                            <span className="text-[var(--text)] truncate">{entry.name}</span>
                            <span className="text-right font-medium text-[var(--text)] tabular-nums">
                              {formatCurrency(entry.amount)}
                            </span>
                            <span className="text-right text-[var(--muted)] tabular-nums">
                              {entry.days_overdue}d
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isExpanded && bucket.entries.length === 0 && (
                    <div className="px-3 pb-3 text-sm text-[var(--muted)]">
                      No overdue accounts in this range.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}

export default FinanceBreakdown
