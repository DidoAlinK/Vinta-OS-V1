import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatCurrency } from '../../lib/formatters'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { ChevronDown } from 'lucide-react'

/* ─── Property options ─── */

const PROPERTIES = [
  { value: 'income', label: 'Total Income' },
  { value: 'paid', label: 'Paid vs Overdue' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'enrollments', label: 'Enrollments' },
] as const

const isCurrencyProp = (p: string) =>
  ['income', 'paid', 'overdue'].includes(p)

/* ─── Props ─── */

export interface RevenueChartProps {
  data: any[]
  property: string
  onPropertyChange: (property: string) => void
}

/* ─── Custom Tooltip ─── */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0].value as number
  return (
    <div
      className={cn(
        'rounded-[var(--radius-sm)] px-3 py-2',
        'bg-[var(--glass-strong)] backdrop-blur-md',
        'border border-[var(--glass-border)]',
        'shadow-lg text-sm',
      )}
    >
      <p className="text-[var(--muted)] text-xs mb-1">{label}</p>
      <p className="font-semibold text-[var(--text)] font-[family-name:var(--font-heading)]">
        {isCurrencyProp(payload[0].dataKey) ? formatCurrency(val) : val.toLocaleString()}
      </p>
    </div>
  )
}

/* ─── Component ─── */

export function RevenueChart({ data, property, onPropertyChange }: RevenueChartProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const currentLabel = PROPERTIES.find((p) => p.value === property)?.label ?? property

  return (
    <Card>
      <CardHeader
        title="Revenue"
        actions={
          <div className="flex items-center gap-2">
            {/* Property dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1.5 h-8 px-3',
                  'rounded-[var(--radius-xs)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'text-sm text-[var(--text)]',
                  'hover:bg-[var(--glass-strong)] transition-colors',
                )}
              >
                {currentLabel}
                <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)]" />
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div
                    className={cn(
                      'absolute right-0 top-full mt-1 z-20 w-44',
                      'rounded-[var(--radius-sm)]',
                      'bg-[var(--glass-strong)] backdrop-blur-xl',
                      'border border-[var(--glass-border)]',
                      'shadow-[0_12px_32px_rgba(0,0,0,.12)]',
                      'py-1 overflow-hidden',
                      'animate-fade-in',
                    )}
                  >
                    {PROPERTIES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onPropertyChange(opt.value)
                          setDropdownOpen(false)
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm',
                          'transition-colors',
                          property === opt.value
                            ? 'bg-[var(--gold-soft)] text-[var(--gold)] font-medium'
                            : 'text-[var(--text)] hover:bg-[var(--glass)]',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />

      <CardBody>
        <div className="h-[260px] w-full">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div className="w-16 h-16 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-[var(--muted)]/30" />
              </div>
              <p className="text-sm text-[var(--muted)]">No revenue data yet</p>
              <p className="text-xs text-[var(--muted)]/60">Data will appear here once billing records exist</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b3872a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#b3872a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey={property}
                  stroke="#b3872a"
                  strokeWidth={2.5}
                  fill="url(#goldGradient)"
                  dot={{ r: 4, fill: '#b3872a', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#b3872a', stroke: 'var(--glass)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export default RevenueChart
