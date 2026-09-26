/**
 * Vinta School OS — Themed TimePicker
 *
 * Replaces the native `<input type="time">`. A native time field is the worst
 * of the OS-default controls: the spinner is a different shape in every
 * browser, it is drag-only on some platforms and type-only on others, and
 * Chrome renders a clock glyph that has nothing to do with this interface.
 * Sixteen fields across the app were using it.
 *
 * There was no themed alternative to reach for — `Select` and `DayPicker`
 * existed, but nothing picked a time — so this is that component.
 *
 * Two deliberate choices:
 *
 * 1. **No AM/PM, 24-hour only.** `start_time`/`end_time` are `"HH:MM"` on the
 *    wire and are displayed through `lib/sessionTime.ts`, which reads them as
 *    24-hour. A 12-hour dial here would add a conversion between what is
 *    picked and what is stored, and a conversion is a place for a 09:00 to
 *    become 21:00. The rest of the app already speaks 24-hour; so does this.
 *
 * 2. **Minutes are stepped, not free.** The backend snaps every session time
 *    to five minutes (`snap_time_obj`), and the fields this replaces carried
 *    `step={300}`. Offering 14:37 would be offering a value the server is
 *    going to change on the way in, so the minute column only lists the
 *    minutes that can survive the round trip.
 *
 * Menu placement follows `Select`, for the same reason its header gives: this
 * sits inside modals whose panel is `overflow-hidden` while the body scrolls,
 * so an absolutely positioned menu gets clipped mid-list. It is portalled to
 * `document.body` and positioned `fixed` from the trigger's rect, at `z-[90]`
 * — above every modal and above `DayPicker`, below the toast stack.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock } from 'lucide-react'
import { cn } from '../../lib/cn'
import { timeLabel } from '../../lib/sessionTime'

/* ─── Types ─── */

export interface TimePickerProps {
  /** `"HH:MM"` (24-hour). `''` means nothing picked. */
  value: string
  onChange: (time: string) => void
  disabled?: boolean
  placeholder?: string
  /** Minute granularity. Defaults to 5, matching the backend's snapping. */
  minuteStep?: number
  /**
   * Field scale. The default `md` is shaped like `DayPicker`'s trigger, so a
   * date field and a time field in the same form line up without a seam.
   * Callers with their own `inputCls` should pass it through `className`,
   * which wins over this.
   */
  size?: 'sm' | 'md' | 'lg'
  className?: string
  'aria-label'?: string
}

/* ─── Constants ─── */

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

const MENU_WIDTH = 176
const COLUMN_HEIGHT = 196

const sizeStyles = {
  // Matches DayPicker's shell exactly — these two are neighbours.
  md: 'px-3 py-2 rounded-xl text-sm',
  sm: 'px-2.5 py-1.5 rounded-lg text-xs',
  lg: 'px-4 py-3 rounded-2xl text-base',
} as const

/** `"HH:MM"` → `["HH", "MM"]`, or `["", ""]` when unset/unparsable. */
function parse(value: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || '')
  if (!m) return ['', '']
  const h = Number(m[1])
  if (!Number.isFinite(h) || h < 0 || h > 23) return ['', '']
  return [String(h).padStart(2, '0'), m[2]]
}

/** The minutes this step allows, 00 first. */
function minutesFor(step: number): string[] {
  const s = Number.isFinite(step) && step > 0 ? Math.floor(step) : 5
  const out: string[] = []
  for (let m = 0; m < 60; m += s) out.push(String(m).padStart(2, '0'))
  return out
}

/* ─── Component ─── */

export function TimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Pick a time…',
  minuteStep = 5,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const autoId = useId()
  const listId = `${autoId}-list`

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  /** Which column the keyboard is driving. */
  const [column, setColumn] = useState<'hour' | 'minute'>('hour')

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const hourListRef = useRef<HTMLDivElement | null>(null)
  const minuteListRef = useRef<HTMLDivElement | null>(null)

  const minutes = useMemo(() => minutesFor(minuteStep), [minuteStep])
  const [hour, minute] = parse(value)

  /**
   * What the arrow keys are highlighting, per column.
   *
   * Kept separate from `value` so opening the menu does not silently write a
   * time: the highlight shows where you would land, and nothing is committed
   * until a row is clicked or Enter is pressed.
   */
  const [cursor, setCursor] = useState<{ hour: string; minute: string }>({
    hour: '09',
    minute: '00',
  })

  const selectedHour = hour || ''
  const selectedMinute = minute || ''

  /* ── Placement (Select's math, for Select's reasons) ── */
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, MENU_WIDTH)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))

    // Header (41) + two columns + footer (41).
    const menuHeight = COLUMN_HEIGHT + 41 + 41
    const below = rect.bottom + 4
    const flip = below + menuHeight > window.innerHeight && rect.top - menuHeight - 4 > 8

    setPos({ top: flip ? rect.top - menuHeight - 4 : below, left, width })
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const openMenu = useCallback(() => {
    if (disabled) return
    // Start the highlight on the current value, or on the top of each column.
    setCursor({
      hour: selectedHour || HOURS[0],
      minute: selectedMinute || minutes[0],
    })
    setColumn('hour')
    setOpen(true)
    requestAnimationFrame(() => reposition())
  }, [disabled, selectedHour, selectedMinute, minutes, reposition])

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

  /* ── Outside click / Escape ── */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  /* ── Keep the highlighted rows in view ── */
  useEffect(() => {
    if (!open) return
    const list = column === 'hour' ? hourListRef.current : minuteListRef.current
    const key = column === 'hour' ? cursor.hour : cursor.minute
    list?.querySelector<HTMLElement>(`[data-value="${key}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, column, cursor])

  /**
   * Commit one column and leave the menu open.
   *
   * Deliberately not "pick and dismiss": setting 14:30 by hand would then cost
   * two openings, and the hour would be written on its own in between — a
   * half-set value on the way to the real one. Staying open lets both columns
   * be set in one visit, and the trigger behind the menu shows the value
   * changing so the click is visibly doing something.
   */
  const commitHour = useCallback(
    (h: string) => {
      setColumn('hour')
      onChange(`${h}:${selectedMinute || minutes[0]}`)
    },
    [onChange, selectedMinute, minutes],
  )

  const commitMinute = useCallback(
    (m: string) => {
      setColumn('minute')
      onChange(`${selectedHour || cursor.hour}:${m}`)
    },
    [onChange, selectedHour, cursor.hour],
  )

  const step = useCallback(
    (delta: 1 | -1) => {
      const list = column === 'hour' ? HOURS : minutes
      setCursor((c) => {
        const current = column === 'hour' ? c.hour : c.minute
        const i = list.indexOf(current)
        const next = list[(i + delta + list.length) % list.length]
        return column === 'hour' ? { ...c, hour: next } : { ...c, minute: next }
      })
    },
    [column, minutes],
  )

  const commitCursor = useCallback(() => {
    if (column === 'hour') commitHour(cursor.hour)
    else commitMinute(cursor.minute)
  }, [column, cursor, commitHour, commitMinute])

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault()
          openMenu()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          step(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          step(-1)
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          // Move between the columns rather than out of the control.
          e.preventDefault()
          setColumn((c) => (c === 'hour' ? 'minute' : 'hour'))
          break
        case 'Home':
          e.preventDefault()
          setCursor((c) => (column === 'hour' ? { ...c, hour: HOURS[0] } : { ...c, minute: minutes[0] }))
          break
        case 'End': {
          e.preventDefault()
          const last = column === 'hour' ? HOURS[HOURS.length - 1] : minutes[minutes.length - 1]
          setCursor((c) => (column === 'hour' ? { ...c, hour: last } : { ...c, minute: last }))
          break
        }
        case 'Enter':
          e.preventDefault()
          commitCursor()
          close()
          requestAnimationFrame(() => triggerRef.current?.focus())
          break
        case 'Escape':
          e.preventDefault()
          // Stop the modal behind this menu from treating Escape as "close me".
          e.stopPropagation()
          close()
          break
        case 'Tab':
          close()
          break
      }
    },
    [open, openMenu, step, column, minutes, commitCursor, close],
  )

  const label = value ? formatLabel(hour, minute) : ''

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={autoId}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={cn(
          'w-full flex items-center gap-2 text-left',
          'font-[family-name:var(--font-body)]',
          'bg-[var(--input-bg)] backdrop-blur-sm',
          'border border-[var(--glass-border)]',
          'text-[var(--text)] outline-none',
          'transition-all duration-150',
          'hover:border-[var(--gold)]/40',
          'focus:ring-2 focus:ring-[var(--gold)]/30',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyles[size],
          className,
          open && 'ring-2 ring-[var(--gold)]/30 border-[var(--gold)]',
        )}
      >
        <Clock size={size === 'sm' ? 12 : 14} className="text-[var(--gold)] shrink-0" />
        <span className={cn('flex-1 truncate', !value && 'text-[var(--muted)]/50')}>
          {label || placeholder}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={cn(
              'fixed z-[90] rounded-2xl overflow-hidden',
              'bg-[var(--card-bg)] border border-[var(--glass-border)]',
              'shadow-2xl animate-fade-in',
            )}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onKeyDown={onKeyDown}
          >
            {/* Draft value — updates as each column is set, so the two halves
                are visibly being assembled into one time. */}
            <div className="px-3 py-2.5 border-b border-[var(--glass-border)] text-center">
              <span className="text-sm font-bold text-[var(--text)] tabular-nums font-[family-name:var(--font-heading)]">
                {formatLabel(selectedHour || cursor.hour, selectedMinute || cursor.minute)}
              </span>
            </div>

            <div id={listId} role="listbox" aria-label={ariaLabel ?? 'Time'} className="flex">
              <Column
                ref={hourListRef}
                values={HOURS}
                selected={selectedHour}
                cursor={column === 'hour' ? cursor.hour : ''}
                onPick={commitHour}
                onHover={() => setColumn('hour')}
              />
              <div className="w-px bg-[var(--glass-border)]" />
              <Column
                ref={minuteListRef}
                values={minutes}
                selected={selectedMinute}
                cursor={column === 'minute' ? cursor.minute : ''}
                onPick={commitMinute}
                onHover={() => setColumn('minute')}
              />
            </div>

            <div className="border-t border-[var(--glass-border)]">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  close()
                }}
                className={cn(
                  'w-full px-3 py-2.5 text-sm font-semibold text-center',
                  'text-[var(--gold)] hover:bg-[var(--gold-soft)]',
                  'transition-colors duration-75',
                )}
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ─── One scrollable column ─── */

const Column = ({
  ref,
  values,
  selected,
  cursor,
  onPick,
  onHover,
}: {
  ref: React.RefObject<HTMLDivElement | null>
  values: string[]
  selected: string
  /** The row the keyboard is on, or `''` when the other column has focus. */
  cursor: string
  onPick: (v: string) => void
  onHover: () => void
}) => (
  <div
    ref={ref}
    className="flex-1 overflow-y-auto py-1"
    style={{ maxHeight: COLUMN_HEIGHT }}
    onMouseEnter={onHover}
  >
    <div className="flex flex-col items-center">
      {values.map((v) => {
        const isSelected = v === selected
        const isCursor = v === cursor
        return (
          <button
            key={v}
            type="button"
            data-value={v}
            role="option"
            aria-selected={isSelected}
            // onMouseDown, not onClick: it keeps focus on the trigger and
            // stops the native focus shift from racing the commit.
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPick(v)
            }}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-2 py-1.5',
              'text-sm tabular-nums transition-colors duration-75',
              isSelected
                ? 'bg-[var(--gold-soft)] text-[var(--text)] font-semibold'
                : isCursor
                  ? 'bg-[var(--glass)] text-[var(--text)]'
                  : 'text-[var(--text)] hover:bg-[var(--glass)]',
            )}
          >
            {v}
            {isSelected && <Check size={12} className="shrink-0 text-[var(--gold)]" />}
          </button>
        )
      })}
    </div>
  </div>
)

Column.displayName = 'TimePickerColumn'

/**
 * `("14", "30")` → `"2:30 PM"`, and `("09", "00")` → `"9 AM"`.
 *
 * Delegates to `timeLabel` in `lib/sessionTime.ts` instead of re-deriving the
 * format here. The label is read on the trigger, immediately beside the same
 * time printed elsewhere on the page, so two formatters would eventually
 * disagree about something like midnight — and the disagreement would be
 * visible. `hour` is `''` before anything is chosen, which `timeLabel` has no
 * way to express, so that one case is answered locally.
 */
function formatLabel(hour: string, minute: string): string {
  if (!hour) return ''
  return timeLabel(`${hour}:${minute || '00'}`)
}

export default TimePicker
