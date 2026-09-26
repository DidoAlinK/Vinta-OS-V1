/**
 * Vinta School OS — Themed DayPicker popup
 * Gold/emerald + squircle + glass day selector (NOT a generic native input).
 * Controlled: value is "YYYY-MM-DD" ('' = none). onChange fires on day tap.
 * Past days are disabled by default (allowPast opts in).
 *
 * The menu is portalled to `document.body` and positioned `fixed`, following
 * `Select`. It used to be `absolute z-[81]` inside its own trigger wrapper,
 * which is fine in a page but wrong in a modal: modal panels are
 * `overflow-hidden` with a scrolling body, so a calendar opened near the bottom
 * of one was clipped — the bottom rows of the month simply were not there. The
 * fix is the same one `Select` already made, for the same reason.
 *
 * `todayISO` reads the local calendar (`getFullYear`/`getMonth`/`getDate`) and
 * not `toISOString()`, deliberately: this file compares its output against day
 * cells to decide what is "today" and what is past, and a UTC reading names
 * yesterday for the first hour of every Algerian day.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface DayPickerProps {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  allowPast?: boolean
  placeholder?: string
  /**
   * Field scale. The default `md` is shaped to sit beside `TimePicker`'s
   * trigger without a seam — the two are neighbours in most of these forms.
   * Callers with their own `inputCls` pass it through `className`, which wins.
   */
  size?: 'sm' | 'md' | 'lg'
  /** Overrides the trigger's padding/radius; later classes win in `cn`. */
  className?: string
  /** Rendered above the trigger, matching `Select` and `Input`. */
  label?: string
  'aria-label'?: string
}

const PANEL_WIDTH = 280

const sizeStyles = {
  md: 'px-3 py-2 rounded-xl text-sm',
  sm: 'px-2.5 py-1.5 rounded-lg text-xs',
  lg: 'px-4 py-3 rounded-2xl text-base',
} as const

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

export function DayPicker({
  value,
  onChange,
  disabled = false,
  allowPast,
  placeholder,
  size = 'md',
  className,
  label,
  'aria-label': ariaLabel,
}: DayPickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const autoId = useId()
  const panelId = `${autoId}-panel`
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const today = todayISO()

  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
    if (m) return { y: Number(m[1]), m: Number(m[2]) - 1 }
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() }
  }, [value])
  const [viewY, setViewY] = useState(parsed.y)
  const [viewM, setViewM] = useState(parsed.m)

  /* ── Placement (Select's math, for Select's reasons) ── */
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
    // Month nav + weekday row + six week rows is the tallest a month gets.
    const panelHeight = 320
    const below = rect.bottom + 4
    const flip = below + panelHeight > window.innerHeight && rect.top - panelHeight - 4 > 8
    setPos({ top: flip ? rect.top - panelHeight - 4 : below, left })
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const openPicker = useCallback(() => {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    setViewY(parsed.y)
    setViewM(parsed.m)
    setOpen(true)
    requestAnimationFrame(() => reposition())
  }, [disabled, open, parsed.y, parsed.m, reposition])

  /* ── Reposition while open ── */
  useEffect(() => {
    if (!open) return
    const onMove = () => reposition()
    reposition()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, reposition])

  /* ── Outside click ── */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!open) {
        if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault()
          openPicker()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // The modal behind must not read this Escape as "close me" — an open
        // calendar is the innermost thing on screen and swallows it first,
        // the same way Select does.
        e.stopPropagation()
        close()
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    },
    [open, openPicker, close],
  )

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
      {label && (
        <label
          htmlFor={autoId}
          className="block mb-1.5 text-xs font-semibold text-[var(--muted)]"
        >
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={autoId}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        className={cn(
          'w-full flex items-center gap-2 text-left',
          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
          'text-[var(--text)] outline-none transition-all duration-150',
          'hover:border-[var(--gold)]/40 focus:ring-2 focus:ring-[var(--gold)]/30',
          'disabled:opacity-50',
          sizeStyles[size],
          className,
          open && 'ring-2 ring-[var(--gold)]/30 border-[var(--gold)]',
        )}
      >
        <CalendarDays size={size === 'sm' ? 12 : 14} className="text-[var(--gold)] shrink-0" />
        <span className={cn('flex-1 truncate', !value && 'text-[var(--muted)]/50')}>
          {pretty || placeholder || 'Pick a day…'}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className={cn(
              'fixed z-[90] rounded-2xl p-3',
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
          </div>,
          document.body,
        )}
    </div>
  )
}

export default DayPicker
