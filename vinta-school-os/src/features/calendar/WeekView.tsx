/**
 * Vinta School OS — Week View
 * 7-day (Sun–Sat) calendar grid with session blocks,
 * drag-to-move, drag-from-palette, and edge-resize.
 */

import { useCallback, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import {
  CALENDAR_HOURS,
  HOUR_HEIGHT,
  SNAP_MINUTES,
} from '../../lib/constants'
import {
  formatHour12,
  formatDateISO,
  getWeekDates,
  getDayName,
  timeToDecimal,
  isToday,
} from '../../lib/formatters'
import SessionBlock from './SessionBlock'
import type { Session } from '../../types/class'
import type { CalendarSession, Subject } from '../../types/calendar'

// ============================================
// Props
// ============================================

export interface WeekViewProps {
  sessions: Session[]
  selectedDate: Date
  onMoveSession: (id: string, date: string, time: string) => void
  onResizeSession: (id: string, endTime: string) => void
  onSelectSession: (session: Session) => void
  onDropSubject: (subject: Subject, date: string, time: string) => void
}

// ============================================
// Helpers
// ============================================

const GRID_DAYS = 7 // Sun–Sat

function snapHour(hour: number): number {
  const snap = SNAP_MINUTES / 60
  return Math.round(hour / snap) * snap
}

function decimalToTime(h: number): string {
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** Convert pixel Y → snapped time string */
function yToTime(y: number): string {
  const hour = y / HOUR_HEIGHT + CALENDAR_HOURS[0]
  return decimalToTime(
    snapHour(Math.max(CALENDAR_HOURS[0], Math.min(hour, 21))),
  )
}

/** Convert pixel X → day index (0-6) based on container width */
function xToDayIndex(x: number, containerWidth: number): number {
  const colWidth = containerWidth / GRID_DAYS
  const idx = Math.floor(x / colWidth)
  return Math.max(0, Math.min(idx, GRID_DAYS - 1))
}

/** Session → CalendarSession with position data */
function toCalendarSession(
  s: Session,
  dayIndex: number,
  dayWidth: number,
  gap: number,
): CalendarSession {
  const topMinutes = (timeToDecimal(s.start_time) - CALENDAR_HOURS[0]) * 60
  const durationMinutes = s.duration * 60

  return {
    ...s,
    top: (topMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20),
    left: dayIndex * (dayWidth + gap) + gap / 2,
    width: dayWidth - gap,
    column: dayIndex,
  }
}

// ============================================
// Component
// ============================================

export default function WeekView({
  sessions,
  selectedDate,
  onMoveSession,
  onResizeSession,
  onSelectSession,
  onDropSubject,
}: WeekViewProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{
    dayIndex: number
    top: number
  } | null>(null)

  // Real-time resize preview state
  const [resizing, setResizing] = useState<{
    id: string
    edge: 'top' | 'bottom'
    top: number
    height: number
  } | null>(null)

  const weekDates = getWeekDates(selectedDate)
  const todayIndex = weekDates.findIndex((d) => isToday(d))

  // Compute layout constants
  const sideGutter = 48
  const gap = 4

  // ── Compute positioned sessions ───────────────

  const calendarSessions: CalendarSession[] = []

  weekDates.forEach((date, dayIndex) => {
    const dateStr = formatDateISO(date)
    const daySessions = sessions.filter((s) => s.date === dateStr)

    // Use gridRef width or fallback
    const containerWidth = gridRef.current?.clientWidth || 600
    const dayWidth = (containerWidth - sideGutter) / GRID_DAYS

    daySessions.forEach((s) => {
      calendarSessions.push(
        toCalendarSession(s, dayIndex, dayWidth, gap),
      )
    })
  })

  // ── Existing session drag ─────────────────────

  const handleSessionDragStart = useCallback(
    (session: CalendarSession) => {
      setDraggingId(session.id)

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
        if (!gridRef.current) return

        const rect = gridRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left + gridRef.current.scrollLeft
        const y = e.clientY - rect.top + gridRef.current.scrollTop

        const dayIdx = xToDayIndex(x - sideGutter, rect.width - sideGutter)
        const top = snapHour(y / HOUR_HEIGHT + CALENDAR_HOURS[0]) * HOUR_HEIGHT
        setDropIndicator({ dayIndex: dayIdx, top })
      }

      const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        if (!gridRef.current) {
          cleanup()
          return
        }

        const rect = gridRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left + gridRef.current.scrollLeft
        const y = e.clientY - rect.top + gridRef.current.scrollTop

        const dayIdx = xToDayIndex(x - sideGutter, rect.width - sideGutter)
        const newTime = yToTime(y)

        onMoveSession(session.id, formatDateISO(weekDates[dayIdx]), newTime)
        cleanup()
      }

      const cleanup = () => {
        setDraggingId(null)
        setDropIndicator(null)
        document.removeEventListener('dragover', handleDragOver)
        document.removeEventListener('drop', handleDrop)
      }

      document.addEventListener('dragover', handleDragOver)
      document.addEventListener('drop', handleDrop)
    },
    [onMoveSession, weekDates],
  )

  // ── Subject palette drop ──────────────────────

  const handleGridDragOver = useCallback(
    (e: React.DragEvent) => {
      const hasSubject = e.dataTransfer.types.includes('application/vinta-subject')
      if (!hasSubject) return

      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'

      if (!gridRef.current) return

      const rect = gridRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left + gridRef.current.scrollLeft - sideGutter
      const y = e.clientY - rect.top + gridRef.current.scrollTop

      const dayIdx = xToDayIndex(x, rect.width - sideGutter)
      const top = snapHour(y / HOUR_HEIGHT + CALENDAR_HOURS[0]) * HOUR_HEIGHT
      setDropIndicator({ dayIndex: dayIdx, top })
    },
    [],
  )

  const handleGridDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDropIndicator(null)

      const raw = e.dataTransfer.getData('application/vinta-subject')
      if (!raw || !gridRef.current) return

      let subject: Subject
      try {
        subject = JSON.parse(raw)
      } catch {
        return
      }
      const rect = gridRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left + gridRef.current.scrollLeft - sideGutter
      const y = e.clientY - rect.top + gridRef.current.scrollTop

      const dayIdx = xToDayIndex(x, rect.width - sideGutter)
      const time = yToTime(y)

      onDropSubject(subject, formatDateISO(weekDates[dayIdx]), time)
    },
    [onDropSubject, weekDates],
  )

  const handleGridDragLeave = useCallback(() => {
    setDropIndicator(null)
  }, [])

  // ── Resize handler ────────────────────────────

  const handleResizeStart = useCallback(
    (session: CalendarSession, edge: 'top' | 'bottom') => {
      const MIN_DURATION_MINUTES = 15
      const durationMinutes = timeToDecimal(session.end_time) * 60 - timeToDecimal(session.start_time) * 60

      if (edge === 'top') {
        // Top-edge resize: drag upward to extend start time earlier
        let currentY = session.top

        const handleMouseMove = (e: MouseEvent) => {
          if (!gridRef.current) return
          const rect = gridRef.current.getBoundingClientRect()
          currentY = e.clientY - rect.top + gridRef.current.scrollTop

          // Compute preview values
          const proposedStartHour = snapHour(
            currentY / HOUR_HEIGHT + CALENDAR_HOURS[0],
          )
          const endDecimal = timeToDecimal(session.end_time)
          const minStartHour = endDecimal - (durationMinutes / 60)
          const clampedStartHour = Math.min(
            proposedStartHour,
            endDecimal - MIN_DURATION_MINUTES / 60,
          )
          const newStartHour = Math.max(
            CALENDAR_HOURS[0],
            Math.min(minStartHour, clampedStartHour),
          )

          const previewTop = (newStartHour - CALENDAR_HOURS[0]) * HOUR_HEIGHT
          const previewHeight = Math.max(
            (endDecimal - newStartHour) * HOUR_HEIGHT,
            (MIN_DURATION_MINUTES / 60) * HOUR_HEIGHT,
          )

          setResizing({
            id: session.id,
            edge: 'top',
            top: previewTop,
            height: previewHeight,
          })
        }

        const handleMouseUp = () => {
          const proposedStartHour = snapHour(
            currentY / HOUR_HEIGHT + CALENDAR_HOURS[0],
          )
          const endDecimal = timeToDecimal(session.end_time)
          const minStartHour = endDecimal - (durationMinutes / 60)
          const clampedStartHour = Math.min(
            proposedStartHour,
            endDecimal - MIN_DURATION_MINUTES / 60,
          )
          const newStartHour = Math.max(
            CALENDAR_HOURS[0],
            Math.min(minStartHour, clampedStartHour),
          )
          const newStartTime = decimalToTime(newStartHour)
          onMoveSession(session.id, session.date, newStartTime)
          setResizing(null)
          cleanup()
        }

        const cleanup = () => {
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return
      }

      // Bottom-edge resize
      let currentY = session.top + session.height

      const handleMouseMove = (e: MouseEvent) => {
        if (!gridRef.current) return
        const rect = gridRef.current.getBoundingClientRect()
        currentY = e.clientY - rect.top + gridRef.current.scrollTop

        // Compute preview values
        const newEndHour = snapHour(
          Math.max(
            timeToDecimal(session.start_time) + MIN_DURATION_MINUTES / 60,
            currentY / HOUR_HEIGHT + CALENDAR_HOURS[0],
          ),
        )
        const startDecimal = timeToDecimal(session.start_time)

        const previewHeight = Math.max(
          (newEndHour - startDecimal) * HOUR_HEIGHT,
          (MIN_DURATION_MINUTES / 60) * HOUR_HEIGHT,
        )

        setResizing({
          id: session.id,
          edge: 'bottom',
          top: session.top,
          height: previewHeight,
        })
      }

      const handleMouseUp = () => {
        const newEndHour = snapHour(
          Math.max(
            timeToDecimal(session.start_time) + MIN_DURATION_MINUTES / 60,
            currentY / HOUR_HEIGHT + CALENDAR_HOURS[0],
          ),
        )
        onResizeSession(session.id, decimalToTime(newEndHour))
        setResizing(null)
        cleanup()
      }

      const cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onResizeSession, onMoveSession],
  )

  // ── Now indicator ─────────────────────────────

  const nowDecimal = new Date().getHours() + new Date().getMinutes() / 60
  const showNowLine =
    todayIndex >= 0 &&
    nowDecimal >= CALENDAR_HOURS[0] &&
    nowDecimal <= 21
  const nowTop =
    ((nowDecimal - CALENDAR_HOURS[0]) / 1) * HOUR_HEIGHT

  // ── Render ────────────────────────────────────

  const totalHeight = CALENDAR_HOURS.length * HOUR_HEIGHT

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Day headers */}
      <div
        className="flex border-b border-[var(--divider)] shrink-0"
        style={{ paddingLeft: sideGutter, position: 'relative', zIndex: 10 }}
      >
        {weekDates.map((date, i) => {
          const isTodayCol = i === todayIndex
          return (
            <div
              key={i}
              className={cn(
                'flex-1 py-2.5 text-center border-l border-[var(--divider)]',
                i === 0 && 'border-l-0',
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {getDayName(date)}
              </span>
              <div
                className={cn(
                  'mt-0.5 text-sm font-bold',
                  isTodayCol
                    ? 'text-[var(--gold)]'
                    : 'text-[var(--text)]',
                )}
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {date.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          ref={gridRef}
          className="relative flex"
          style={{
            height: totalHeight,
            minWidth: '100%',
          }}
          onDragOver={handleGridDragOver}
          onDrop={handleGridDrop}
          onDragLeave={handleGridDragLeave}
        >
          {/* ── Time gutter ──────────────────────── */}
          <div
            className="absolute left-0 top-0 bottom-0"
            style={{ width: sideGutter }}
          >
            {CALENDAR_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-[var(--divider)]"
                style={{
                  top: (hour - CALENDAR_HOURS[0]) * HOUR_HEIGHT,
                }}
              >
                <span className="absolute -top-2.5 right-2 text-[10px] text-[var(--muted)] select-none">
                  {formatHour12(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* ── Day columns ──────────────────────── */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: sideGutter,
              right: 0,
            }}
          >
            {/* Column separators — positioned to match the flex-based header layout */}
            {weekDates.map((_, i) => {
              const separatorPct = ((i + 1) / GRID_DAYS) * 100
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-[var(--divider)]"
                  style={{
                    left: `${separatorPct}%`,
                  }}
                />
              )
            })}

            {/* Hour row lines */}
            {CALENDAR_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-[var(--divider)]"
                style={{
                  top: (hour - CALENDAR_HOURS[0]) * HOUR_HEIGHT,
                }}
              />
            ))}

            {/* ── Drop indicator ──────────────────── */}
            {dropIndicator && (
              <div
                className="absolute z-30 pointer-events-none rounded-lg border-2 border-dashed border-[var(--gold)] bg-[var(--gold-soft)]"
                style={{
                  left: `${(dropIndicator.dayIndex / GRID_DAYS) * 100}%`,
                  width: `${(1 / GRID_DAYS) * 100}%`,
                  top: dropIndicator.top,
                  height: HOUR_HEIGHT,
                  marginLeft: gap / 2,
                  marginRight: gap / 2,
                }}
              />
            )}

            {/* ── Session blocks ──────────────────── */}
            {calendarSessions.map((cs) => (
              <div
                key={cs.id}
                className={cn(
                  'absolute',
                  draggingId === cs.id && 'opacity-40',
                )}
                style={{
                  left: cs.left,
                  width: cs.width,
                }}
                draggable={draggingId !== cs.id}
              >
                <SessionBlock
                  session={cs}
                  onClick={() => onSelectSession(cs)}
                  onDragStart={() => handleSessionDragStart(cs)}
                  onResizeStart={(edge) => handleResizeStart(cs, edge)}
                  overrideTop={resizing?.id === cs.id ? resizing.top : undefined}
                  overrideHeight={resizing?.id === cs.id ? resizing.height : undefined}
                  resizingEdge={resizing?.id === cs.id ? resizing.edge : null}
                />
              </div>
            ))}

            {/* ── Now indicator ───────────────────── */}
            {showNowLine && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: nowTop }}
              >
                <div className="absolute left-0 w-2.5 h-2.5 rounded-full bg-[var(--red)] -translate-x-1 -translate-y-1/2" />
                <div className="absolute left-2.5 right-0 h-px bg-[var(--red)] opacity-60" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

