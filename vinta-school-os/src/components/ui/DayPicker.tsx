/**
 * Vinta School OS — Themed DayPicker popup
 * Gold/emerald + squircle + glass day selector (NOT a generic native input).
 * Controlled: value is "YYYY-MM-DD" ('' = none). onChange fires on day tap.
 * Past days are disabled by default (allowPast opts in).
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface DayPickerProps {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  allowPast?: boolean
  placeholder?: string
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayISO(): string {
  const t = new Date()
  return toISO(t.getFullYear(), t.getMonth(), t.getDate())
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Friday is the Algerian weekend — tinted subtly like the academy default.
const WEEKEND_DAY = 5

export function DayPicker({ value, onChange, disabled, allowPast, placeholder }: DayPickerProps) {
  const [open, setOpen] = useState(false)
  const today = todayISO()

  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
    if (m) return { y: Number(m[1]), m: Number(m[2]) - 1 }
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() }
  }, [value])
  const [viewY, setViewY] = useState(parsed.y)
  const [viewM, setViewM] = useState(parsed.m)

  const openPicker = () => {
    if (disabled) return
    setViewY(parsed.y)
    setViewM(parsed.m)
    setOpen((o) => !o)
  }

  const cells = useMemo(() => {
    const first = new Date(viewY, viewM, 1).getDay()
    const days = new Date(viewY, viewM + 1, 0).getDate()
    const out: Array<{ d: number; iso: string } | null> = []
    for (let i = 0; i < first; i++) out.push(null)
    for (let d = 1; d <= days; d++) out.push({ d, iso: toISO(viewY, viewM, d) })
    return out
  }, [viewY, viewM])

  const monthLabel = new Date(viewY, viewM, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const pick = (iso: string) => {
    if (!allowPast && iso < today) return
    onChange(iso)
    setOpen(false)
  }

  const pretty = useMemo(() => {
    if (!value) return ''
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!m) return value
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [value])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left',
          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
          'text-[var(--text)] outline-none transition-all duration-150',
          'hover:border-[var(--gold)]/40 focus:ring-2 focus:ring-[var(--gold)]/30',
          'disabled:opacity-50',
        )}
      >
        <CalendarDays size={14} className="text-[var(--gold)] shrink-0" />
        <span className={cn('flex-1 truncate', !value && 'text-[var(--muted)]/50')}>
          {pretty || placeholder || 'Pick a day…'}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute z-[81] mt-2 w-[280px] rounded-2xl p-3',
              'bg-[var(--card-bg)] border border-[var(--glass-border)]',
              'shadow-2xl animate-fade-in',
            )}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(viewY, viewM - 1, 1)
                  setViewY(d.getFullYear())
                  setViewM(d.getMonth())
                }}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <p className="text-xs font-bold text-[var(--text)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {monthLabel}
              </p>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(viewY, viewM + 1, 1)
                  setViewY(d.getFullYear())
                  setViewM(d.getMonth())
                }}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-center text-[10px] font-semibold text-[var(--muted)] py-1">
                  {w}
                </span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (!c) return <span key={`e${i}`} />
                const isPast = !allowPast && c.iso < today
                const isToday = c.iso === today
                const isSel = c.iso === value
                const isWeekend = new Date(viewY, viewM, c.d).getDay() === WEEKEND_DAY
                return (
                  <button
                    key={c.iso}
                    type="button"
                    disabled={isPast}
                    onClick={() => pick(c.iso)}
                    className={cn(
                      'aspect-square rounded-xl text-xs font-medium transition-all duration-150',
                      'flex items-center justify-center',
                      isSel
                        ? 'bg-gradient-to-br from-[#b3872a] to-[#0f6b4d] text-white shadow-md scale-105'
                        : isToday
                          ? 'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/40'
                          : isWeekend
                            ? 'bg-[var(--glass)]/60 text-[var(--muted)] hover:bg-[var(--gold-soft)]/40 hover:text-[var(--text)]'
                            : 'text-[var(--text)] hover:bg-[var(--gold-soft)]/50',
                      isPast && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                    )}
                  >
                    {c.d}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default DayPicker
