/**
 * Vinta School OS — Day View
 * Single-day calendar with full-height time column and session blocks.
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
  timeToDecimal,
  formatDateISO,
  isToday,
  getDayName,
} from '../../lib/formatters'
import SessionBlock from './SessionBlock'
import type { Session } from '../../types/class'
import type { CalendarSession } from '../../types/calendar'

// ============================================
// Props
// ============================================

export interface DayViewProps {
  sessions: Session[]
  date: Date
  onMoveSession: (id: string, time: string) => void
  onResizeSession: (id: string, endTime: string) => void
  onSelectSession: (session: Session) => void
}

// ============================================
// Helpers
// ============================================

/** Snap a decimal hour to the nearest SNAP_MINUTES boundary */
function snapHour(hour: number): number {
  const snapFraction = SNAP_MINUTES / 60
  return Math.round(hour / snapFraction) * snapFraction
}

/** Decimal hour → "HH:MM" string */
function decimalToTime(h: number): string {
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** Convert a pixel Y offset to a snapped time string */
function yToTime(y: number, containerTop: number): string {
  const hour = (y - containerTop) / HOUR_HEIGHT + CALENDAR_HOURS[0]
  return decimalToTime(snapHour(Math.max(CALENDAR_HOURS[0], Math.min(hour, 21))))
}

/** Convert a Session → CalendarSession (positioned) */
function toCalendarSession(s: Session, _index: number): CalendarSession {
  const topMinutes = (timeToDecimal(s.start_time) - CALENDAR_HOURS[0]) * 60
  const durationMinutes = s.duration * 60

  return {
    ...s,
    top: (topMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20),
    left: 0,
    width: 100,
    column: 0,
  }
}

// ============================================
// Component
// ============================================

export default function DayView({
  sessions,
  date,
  onMoveSession,
  onResizeSession,
  onSelectSession,
}: DayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null)

  const dateStr = formatDateISO(date)
  const daySessions = sessions.filter((s) => s.date === dateStr)
  const calendarSessions = daySessions.map(toCalendarSession)
  const today = isToday(date)

  // ── Drag-to-move ──────────────────────────────

  const handleSessionDragStart = useCallback(
    (session: CalendarSession) => {
      setDraggingSessionId(session.id)

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
      }

      const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        if (!gridRef.current) return

        const rect = gridRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top + gridRef.current.scrollTop
        const newTime = yToTime(y, 0)

        onMoveSession(session.id, newTime)
        cleanup()
      }

      const cleanup = () => {
        setDraggingSessionId(null)
        document.removeEventListener('dragover', handleDragOver)
        document.removeEventListener('drop', handleDrop)
      }

      document.addEventListener('dragover', handleDragOver)
      document.addEventListener('drop', handleDrop)
    },
    [onMoveSession],
  )

  // ── Resize handler ────────────────────────────

  const handleResizeStart = useCallback(
    (session: CalendarSession, edge: 'top' | 'bottom') => {
      const durationMinutes = timeToDecimal(session.end_time) * 60 - timeToDecimal(session.start_time) * 60

      if (edge === 'top') {
        // Top-edge resize: drag upward to extend start time earlier
        let currentY = session.top

        const handleMouseMove = (e: MouseEvent) => {
          if (!gridRef.current) return
          const rect = gridRef.current.getBoundingClientRect()
          currentY = e.clientY - rect.top + gridRef.current.scrollTop
        }

        const handleMouseUp = () => {
          const proposedStartHour = snapHour(
            currentY / HOUR_HEIGHT + CALENDAR_HOURS[0],
          )
          const endDecimal = timeToDecimal(session.end_time)
          const minStartHour = endDecimal - (durationMinutes / 60)
          // Ensure minimum duration of 15 minutes
          const clampedStartHour = Math.min(
            proposedStartHour,
            endDecimal - MIN_DURATION_HOURS,
          )
          const newStartHour = Math.max(
            CALENDAR_HOURS[0],
            Math.min(minStartHour, clampedStartHour),
          )
          const newStartTime = decimalToTime(newStartHour)
          onMoveSession(session.id, newStartTime)
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

      // Bottom-edge resize (original logic)
      let currentY = session.top + session.height

      const handleMouseMove = (e: MouseEvent) => {
        if (!gridRef.current) return
        const rect = gridRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top + gridRef.current.scrollTop
        currentY = y
      }

      const handleMouseUp = () => {
        if (!gridRef.current) {
          cleanup()
          return
        }
        const newEndHour = snapHour(
          Math.max(
            timeToDecimal(session.start_time) + MIN_DURATION_HOURS,
            (currentY / HOUR_HEIGHT) + CALENDAR_HOURS[0],
          ),
        )
        onResizeSession(session.id, decimalToTime(newEndHour))
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
  const showNowLine = today && nowDecimal >= CALENDAR_HOURS[0] && nowDecimal <= 21
  const nowTop = ((nowDecimal - CALENDAR_HOURS[0]) / 1) * HOUR_HEIGHT

  // ── Render ────────────────────────────────────

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Day header */}
      <div className="px-5 py-3 border-b border-[var(--divider)]">
        <div className="flex items-baseline gap-3">
          <span
            className="text-xl font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {getDayName(date, false)}
          </span>
          <span className="text-sm text-[var(--muted)]">
            {date.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          {today && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--gold-soft)] text-[var(--gold)]">
              Today
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          {daySessions.length} session{daySessions.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {/* Time grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div
          ref={gridRef}
          className="relative"
          style={{ height: CALENDAR_HOURS.length * HOUR_HEIGHT }}
        >
          {/* Hour rows */}
          {CALENDAR_HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-[var(--divider)]"
              style={{ top: (hour - CALENDAR_HOURS[0]) * HOUR_HEIGHT }}
            >
              <span
                className="absolute -top-3 left-3 text-[10px] text-[var(--muted)] select-none"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {formatHour12(hour)}
              </span>
            </div>
          ))}

          {/* Session blocks */}
          {calendarSessions.map((cs) => (
            <div
              key={cs.id}
              className="absolute left-14 right-4"
              draggable={draggingSessionId !== cs.id}
            >
              <SessionBlock
                session={cs}
                onClick={() => onSelectSession(cs)}
                onDragStart={() => handleSessionDragStart(cs)}
                onResizeStart={(edge) => handleResizeStart(cs, edge)}
              />
            </div>
          ))}

          {/* Now indicator */}
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
  )
}

const MIN_DURATION_HOURS = 5 / 60 // MIN_SESSION_DURATION from constants, in hours

