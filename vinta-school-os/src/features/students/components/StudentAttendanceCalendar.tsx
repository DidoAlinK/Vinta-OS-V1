/**
 * Vinta School OS — Student attendance calendar
 *
 * The register, laid out as a month grid: what this student was down for, what
 * they turned up to, and whether a plan was behind it. Spans every group they
 * study in, past and future, and is read-only — it is a rendering of the
 * server's `attendance_calendar`, which is itself a rendering of the register.
 * Nothing here is stored and nothing here resets except an academy wipe.
 *
 * The colours are the five the desk asked for:
 *
 *   green   attended, and covered
 *   yellow  attended, but nothing covered the day — chase the payment
 *   red     the register says they were not there
 *   grey    has not happened yet
 *   dim     a day before they joined, or a session of a group they had not
 *           joined yet
 *
 * Two states do not fit that palette because they are not facts about this
 * student — `cancelled` (the group did not meet) and `unrecorded` (the class
 * was never started, so no register was ever taken). They are drawn as outline
 * cells rather than being forced into green, red or yellow, because colouring
 * them would assert something the data does not say.
 *
 * Colour is never the only channel: every cell carries an aria-label and a
 * title naming its state and the sessions on it.
 */

import { useMemo, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { AttendanceCalendarEntry, AttendanceDayState } from '../../../types/student'
import { EmptyLine, InlineSpinner, ProfileCard } from './ProfileCard'
import { parseISODate } from './BillingSummaryCard'

export interface StudentAttendanceCalendarProps {
  calendar: { joined_on: string; today: string; entries: AttendanceCalendarEntry[] } | undefined
  loading?: boolean
}

// ============================================
// State → paint
// ============================================

interface StateStyle {
  /** The solid colour of the session dot. */
  dot: string
  /** The cell fill. */
  tint: string
  /** The day number's colour. */
  fg: string
  label: string
  /** Drawn as an outline instead of a fill — "no claim about this student". */
  outline?: boolean
  /** The day number is struck through — the class did not happen. */
  strike?: boolean
}

const STATE_STYLES: Record<AttendanceDayState, StateStyle> = {
  attended: {
    dot: 'var(--emerald)',
    tint: 'var(--emerald-soft)',
    fg: 'var(--emerald)',
    label: 'Attended',
  },
  unpaid: {
    dot: 'var(--gold)',
    tint: 'var(--gold-soft)',
    fg: 'var(--gold)',
    label: 'Attended, not paid',
  },
  absent: {
    dot: 'var(--red)',
    tint: 'var(--red-soft)',
    fg: 'var(--red)',
    label: 'Absent',
  },
  upcoming: {
    dot: 'var(--muted)',
    tint: 'var(--glass)',
    fg: 'var(--muted)',
    label: 'Upcoming',
  },
  cancelled: {
    dot: 'var(--muted)',
    tint: 'transparent',
    fg: 'var(--muted)',
    label: 'Cancelled',
    outline: true,
    strike: true,
  },
  not_enrolled: {
    dot: 'var(--divider)',
    tint: 'transparent',
    fg: 'var(--muted)',
    label: 'Not in this group yet',
    outline: true,
  },
  unrecorded: {
    dot: 'var(--divider)',
    tint: 'transparent',
    fg: 'var(--muted)',
    label: 'No register taken',
    outline: true,
  },
}

/**
 * Which state colours a day that carries more than one session.
 *
 * Attention first, then the record: a day where one group was attended and
 * another missed should not look like a clean green day. `upcoming` sorts last
 * because it is the absence of information, and should never mask a real fact.
 */
const STATE_PRIORITY: AttendanceDayState[] = [
  'unpaid',
  'absent',
  'attended',
  'cancelled',
  'not_enrolled',
  'unrecorded',
  'upcoming',
]

function dominantState(states: AttendanceDayState[]): AttendanceDayState {
  for (const state of STATE_PRIORITY) {
    if (states.includes(state)) return state
  }
  return 'upcoming'
}

/**
 * Duplicated from DayPicker so the two calendars agree on the week's shape.
 *
 * Unlike DayPicker there is no weekend tint here: every cell's colour already
 * carries a state, and a second colour axis would make Friday-afternoon
 * unreadable.
 */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ============================================
// Date helpers
// ============================================

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** [null, null, 1, 2, ...] — leading blanks so the 1st lands on its weekday. */
function monthCells(year: number, month: number): Array<{ day: number; iso: string } | null> {
  const blanks = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ day: number; iso: string } | null> = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let day = 1; day <= days; day++) cells.push({ day, iso: toISO(year, month, day) })
  return cells
}

function formatTime(entry: AttendanceCalendarEntry): string {
  if (!entry.start_time) return ''
  return entry.end_time ? `${entry.start_time}–${entry.end_time}` : entry.start_time
}

// ============================================
// Component
// ============================================

export function StudentAttendanceCalendar({
  calendar,
  loading = false,
}: StudentAttendanceCalendarProps) {
  const entries = calendar?.entries ?? []
  const joinedOn = calendar?.joined_on ?? ''
  const serverToday = calendar?.today ?? ''

  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceCalendarEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.date)
      if (list) list.push(entry)
      else map.set(entry.date, [entry])
    }
    return map
  }, [entries])

  // The server's today, not the browser's: the states were computed against
  // it, so a grid that trusted the local clock could disagree with its own
  // cells across a timezone boundary.
  const today = parseISODate(serverToday) ?? new Date()
  const todayISO = serverToday || toISO(today.getFullYear(), today.getMonth(), today.getDate())

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [showYear, setShowYear] = useState(false)

  const cells = useMemo(() => monthCells(viewYear, viewMonth), [viewYear, viewMonth])

  const step = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const openMonth = (month: number) => {
    setViewMonth(month)
    setShowYear(false)
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  /* ── A single day cell ── */
  const renderDay = (cell: { day: number; iso: string }) => {
    const dayEntries = byDate.get(cell.iso) ?? []
    const isToday = cell.iso === todayISO
    // Before they were a student at all. Their number is dimmed rather than
    // blank: an empty grid reads as a bug, a faint one reads as history.
    const beforeJoin = Boolean(joinedOn) && cell.iso < joinedOn

    if (dayEntries.length === 0) {
      return (
        <span
          key={cell.iso}
          aria-label={`${cell.day}: nothing scheduled`}
          className={cn(
            'aspect-square rounded-lg flex items-center justify-center text-[11px]',
            isToday && 'ring-1 ring-[var(--gold)]/50',
          )}
          style={{
            color: 'var(--muted)',
            opacity: beforeJoin ? 0.25 : 0.45,
          }}
        >
          {cell.day}
        </span>
      )
    }

    const states = dayEntries.map((e) => e.state)
    const style = STATE_STYLES[dominantState(states)]
    const detail = dayEntries
      .map((e) => `${e.class_name ?? 'Group'} · ${formatTime(e)} · ${STATE_STYLES[e.state].label}`)
      .join('\n')

    return (
      <span
        key={cell.iso}
        role="img"
        title={detail}
        aria-label={`${cell.day}: ${dayEntries.map((e) => STATE_STYLES[e.state].label).join(', ')}`}
        className={cn(
          'relative aspect-square rounded-lg flex items-center justify-center',
          'text-[11px] font-semibold transition-transform duration-150 hover:scale-105',
          isToday && 'ring-1 ring-[var(--gold)]',
        )}
        style={{
          background: style.tint,
          color: style.fg,
          border: style.outline ? '1px dashed var(--glass-border)' : '1px solid transparent',
          textDecoration: style.strike ? 'line-through' : undefined,
          // A day they were not in this group yet keeps the same colour but
          // recedes — the state is real, their participation was not.
          opacity: dayEntries.every((e) => !e.enrolled) ? 0.45 : 1,
        }}
      >
        {cell.day}
        {/* One dot per session, so a two-group day does not hide behind
            whichever state won the cell colour. */}
        {dayEntries.length > 1 && (
          <span
            className="absolute bottom-[3px] left-1/2 -translate-x-1/2 flex gap-[2px]"
            aria-hidden="true"
          >
            {dayEntries.slice(0, 3).map((e, i) => (
              <span
                key={i}
                className="w-[3px] h-[3px] rounded-full"
                style={{ background: STATE_STYLES[e.state].dot }}
              />
            ))}
          </span>
        )}
      </span>
    )
  }

  const isEmpty = entries.length === 0

  return (
    <ProfileCard
      title="Attendance"
      icon={<CalendarCheck size={13} />}
      action={
        loading ? (
          <InlineSpinner label="Loading attendance" />
        ) : isEmpty ? undefined : (
          <button
            type="button"
            onClick={() => setShowYear((y) => !y)}
            className={cn(
              'px-2 py-0.5 rounded-lg text-[10px] font-semibold',
              'border border-[var(--glass-border)] transition-colors duration-150',
              showYear
                ? 'bg-[var(--gold-soft)] text-[var(--gold)]'
                : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
            )}
          >
            {showYear ? 'Month' : 'Year'}
          </button>
        )
      }
    >
      {isEmpty ? (
        <EmptyLine>
          {loading
            ? 'Loading…'
            : 'No sessions yet — this student is not enrolled in a group that has any.'}
        </EmptyLine>
      ) : showYear ? (
        /* ── Year view: twelve months at a glance ── */
        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          {Array.from({ length: 12 }, (_, month) => {
            const label = new Date(viewYear, month, 1).toLocaleDateString('en-GB', {
              month: 'short',
            })
            return (
              <button
                key={month}
                type="button"
                onClick={() => openMonth(month)}
                className="text-left rounded-lg p-1 hover:bg-[var(--glass)] transition-colors duration-150"
                aria-label={`Open ${label} ${viewYear}`}
              >
                <p
                  className="text-[10px] font-semibold mb-1 text-center"
                  style={{ color: 'var(--muted)' }}
                >
                  {label}
                </p>
                <div className="grid grid-cols-7 gap-[1px]">
                  {monthCells(viewYear, month).map((cell, i) => {
                    if (!cell) return <span key={`e${i}`} />
                    const dayEntries = byDate.get(cell.iso) ?? []
                    const beforeJoin = Boolean(joinedOn) && cell.iso < joinedOn
                    const style =
                      dayEntries.length > 0
                        ? STATE_STYLES[dominantState(dayEntries.map((e) => e.state))]
                        : null
                    return (
                      <span
                        key={cell.iso}
                        className="aspect-square rounded-[2px]"
                        style={{
                          background: style
                            ? style.outline
                              ? 'var(--glass)'
                              : style.tint
                            : 'var(--divider)',
                          // Today is worth a ring here too: at this scale the
                          // grid is a texture, and without it there is nothing
                          // to say where "now" sits inside the year.
                          boxShadow:
                            cell.iso === todayISO
                              ? '0 0 0 1px var(--gold)'
                              : undefined,
                          opacity: beforeJoin
                            ? 0.15
                            : dayEntries.length === 0
                              ? 0.3
                              : dayEntries.every((e) => !e.enrolled)
                                ? 0.45
                                : 1,
                        }}
                      />
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        /* ── Month view ── */
        <>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="p-1 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors duration-150"
            >
              <ChevronLeft size={14} />
            </button>
            {/* Clicking the month name opens the year — the grid you are
                looking at is one twelfth of the picture, and the title is
                where the eye goes to ask for the rest of it. */}
            <button
              type="button"
              onClick={() => setShowYear(true)}
              title="Show the whole year"
              className="text-xs font-bold rounded-lg px-2 py-0.5 hover:bg-[var(--glass)] transition-colors duration-150"
              style={{ color: 'var(--text)', fontFamily: 'var(--font-heading)' }}
            >
              {monthLabel}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="p-1 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors duration-150"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                className="text-center text-[10px] font-semibold py-0.5"
                style={{ color: 'var(--muted)' }}
              >
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) =>
              cell ? renderDay(cell) : <span key={`e${i}`} />,
            )}
          </div>
        </>
      )}

      {!isEmpty && !loading && <AttendanceLegend />}
    </ProfileCard>
  )
}

/** The key. Only the states actually useful to read at a glance are spelled out. */
function AttendanceLegend() {
  const items: AttendanceDayState[] = ['attended', 'unpaid', 'absent', 'upcoming']
  return (
    <div className="mt-3 pt-2.5 border-t border-[var(--glass-border)]">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {items.map((state) => {
          const style = STATE_STYLES[state]
          return (
            <span key={state} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: style.dot }}
              />
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {style.label}
              </span>
            </span>
          )
        })}
      </div>
      <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
        A faint day is one before this student joined, or before they joined that
        group. A dashed day is one where no register was taken.
      </p>
    </div>
  )
}

export default StudentAttendanceCalendar
