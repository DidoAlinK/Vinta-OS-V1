import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'

/* ─── Props ─── */

export interface DonutSegment {
  name: string
  value: number
  color: string
}

export interface DonutCardsProps {
  title: string
  data: DonutSegment[]
  centerLabel: string
  centerValue: string
}

/* ─── Component ─── */

export function DonutCards({ title, data, centerLabel, centerValue }: DonutCardsProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 14

  /* Build cumulative offset for each segment */
  let cumulative = 0
  const segments = data.map((segment) => {
    const pct = total > 0 ? segment.value / total : 0
    const offset = cumulative
    cumulative += pct
    return { ...segment, pct, offset }
  })

  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        <div className="flex items-center gap-6">
          {/* Donut SVG */}
          <div className="relative shrink-0">
            <svg width={132} height={132} viewBox="0 0 132 132">
              {/* Background ring */}
              <circle
                cx={66}
                cy={66}
                r={radius}
                fill="none"
                stroke="var(--glass-border)"
                strokeWidth={strokeWidth}
              />
              {/* Colored segments */}
              {segments.map((seg, i) => {
                if (seg.pct === 0) return null
                const dashLen = circumference * seg.pct
                const dashOffset = circumference * (1 - seg.offset)
                return (
                  <circle
                    key={i}
                    cx={66}
                    cy={66}
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{
                      transform: 'rotate(-90deg)',
                      transformOrigin: '66px 66px',
                      transition: 'stroke-dasharray 0.6s ease',
                    }}
                  />
                )
              })}
            </svg>

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-[var(--muted)] leading-none">{centerLabel}</span>
              <span className="text-lg font-bold text-[var(--text)] font-[family-name:var(--font-heading)] mt-0.5">
                {centerValue}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2.5 min-w-0">
            {data.map((segment, i) => (
              <div key={i} className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-sm text-[var(--muted)] truncate">{segment.name}</span>
                <span className="ml-auto text-sm font-semibold text-[var(--text)] tabular-nums shrink-0">
                  {segment.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

export default DonutCards
