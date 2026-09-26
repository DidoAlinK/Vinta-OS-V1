import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Clock3, Gift, Repeat, X } from 'lucide-react'
import SessionMenu from './SessionMenu'
import { isSessionFree } from '../../lib/freeSessions'
import { getSessionOrigin } from '../../lib/scheduleDefs'
import { getEffectiveStatus } from '../../lib/sessionLifecycle'
import { cn } from '../../lib/cn'
import {
  getCurrentHour,
  formatHour12,
  formatTime12,
  formatDateISO,
  getDayName,
  getWeekDates,
  isToday,
} from '../../lib/formatters'
import {
  CALENDAR_HOURS,
  HOUR_HEIGHT,
} from '../../lib/constants'
import type { Session } from '../../types/class'

/* ─── Helpers ─── */

/** Convert hex color to an rgba string with the given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ─── Types ─── */

interface AgendaBoardProps {
  sessions: Session[]
  selectedSessionId?: string
  onSelectSession: (session: Session) => void
  viewMode: 'week' | 'day'
  onToggleView: () => void
  isLoading?: boolean
  /** The date currently being viewed (from parent navigation) */
  currentDate?: Date
  /** T3: hamburger actions shared with the detail panel */
  onStartSession?: (session: Session) => void
  onFinishSession?: (session: Session) => void
  onSessionsChanged?: () => void
  /** T8: open the scheduling window (the + New Class button only) */
  onNewClass?: (prefillDate?: string) => void
  /**
   * Open a live class's attendance register. The menu only offers
   * "Log Students Present" when a parent can actually open the grid, and on
   * this board the menu is the only way in — Start opens it once, but a desk
   * that closed it needs a second door.
   */
  onOpenRegister?: (session: Session) => void
}

interface PositionedSession {
  session: Session
  col: number
  totalCols: number
}

/** The ☰ panel's own box — `w-52` wide, and about this tall with every row. */
const MENU_WIDTH = 208
const MENU_EST_HEIGHT = 320

/**
 * Where to pin the panel for a click at `point`, kept inside the viewport —
 * a block near the right edge or the bottom of the board would otherwise open
 * its menu off-screen.
 */
function menuAnchorAt(point: { x: number; y: number }): { x: number; y: number } {
  const x = Math.max(8, Math.min(point.x, window.innerWidth - MENU_WIDTH - 8))
  const y = point.y + MENU_EST_HEIGHT > window.innerHeight
    ? Math.max(8, point.y - MENU_EST_HEIGHT)
    : point.y
  return { x, y }
}

/** Same, for a keyboard open — there is no pointer, so hang off the block. */
function menuAnchorForElement(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return menuAnchorAt({ x: rect.left, y: rect.bottom })
}

/* ─── Overlap Resolution ─── */

/**
 * Resolves overlapping sessions into columns so they render side-by-side.
 * Returns a Map keyed by session id with column index and total column count.
 */
function resolveOverlaps(sessions: Session[]): Map<string, { col: number; totalCols: number }> {
  const result = new Map<string, { col: number; totalCols: number }>()
  if (!sessions.length) return result

  const sorted = [...sessions].sort(
    (a, b) => a.start_hour - b.start_hour || b.duration - a.duration,
  )

  // Build groups of mutually-overlapping sessions
  const groups: Session[][] = []
  let currentGroup = [sorted[0]]
  let groupEnd = sorted[0].end_hour

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_hour < groupEnd) {
      currentGroup.push(sorted[i])
      groupEnd = Math.max(groupEnd, sorted[i].end_hour)
    } else {
      groups.push(currentGroup)
      currentGroup = [sorted[i]]
      groupEnd = sorted[i].end_hour
    }
  }
  groups.push(currentGroup)

  // Assign columns within each group
  for (const group of groups) {
    const columns: Session[][] = []

    for (const session of group) {
      let placed = false
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1]
        if (lastInCol.end_hour <= session.start_hour) {
          columns[c].push(session)
          result.set(session.id, { col: c, totalCols: 0 })
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([session])
        result.set(session.id, { col: columns.length - 1, totalCols: 0 })
      }
    }

    const totalCols = columns.length
    for (const session of group) {
      result.get(session.id)!.totalCols = totalCols
    }
  }

  return result
}

/* ─── Component ─── */

export function AgendaBoard({
  sessions,
  selectedSessionId,
  onSelectSession,
  viewMode,
  onToggleView,
  isLoading = false,
  currentDate,
  onStartSession,
  onFinishSession,
  onSessionsChanged,
  onNewClass,
  onOpenRegister,
}: AgendaBoardProps) {
  const [now, setNow] = useState(getCurrentHour)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overlapPopup, setOverlapPopup] = useState<{
    sessions: Session[]
    x: number
    y: number
    /** The block the picker was raised from — the menu's toggle-out anchor. */
    el: HTMLElement
  } | null>(null)
  /**
   * The session whose ☰ panel is open, opened by clicking its block rather
   * than by pressing the ☰. One instance for the whole board: the panel is
   * `fixed`, so it does not belong to the block it came from.
   */
  const [menuTarget, setMenuTarget] = useState<{
    session: Session
    x: number
    y: number
    el: HTMLElement
  } | null>(null)

  // Use the currentDate from parent navigation, falling back to today
  const anchorDate = currentDate ?? new Date()

  // Current week dates (or single date for day view)
  const days = useMemo(
    () => (viewMode === 'week' ? getWeekDates(anchorDate) : [anchorDate]),
    [viewMode, anchorDate.toISOString()],
  )

  // Group sessions by their date string
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return map
  }, [sessions])

  // Resolve column layout per day
  const positionedByDay = useMemo(() => {
    const map = new Map<string, PositionedSession[]>()
    for (const [date, daySessions] of sessionsByDay) {
      const layout = resolveOverlaps(daySessions)
      map.set(
        date,
        daySessions.map((s) => ({
          session: s,
          col: layout.get(s.id)?.col ?? 0,
          totalCols: layout.get(s.id)?.totalCols ?? 1,
        })),
      )
    }
    return map
  }, [sessionsByDay])

  // Tick the "now" line every 60 s
  useEffect(() => {
    const id = setInterval(() => setNow(getCurrentHour()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll to the current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const target = Math.max(0, (getCurrentHour() - CALENDAR_HOURS[0]) * HOUR_HEIGHT - 120)
      scrollRef.current.scrollTop = target
    }
  }, [])

  const totalHeight = CALENDAR_HOURS.length * HOUR_HEIGHT
  const nowOffset = (now - CALENDAR_HOURS[0]) * HOUR_HEIGHT
  const showNowLine = now >= CALENDAR_HOURS[0] && now <= CALENDAR_HOURS[CALENDAR_HOURS.length - 1] + 1

  // Close overlap popup when clicking outside
  const closeOverlapPopup = useCallback(() => setOverlapPopup(null), [])
  useEffect(() => {
    if (!overlapPopup) return
    const handler = () => setOverlapPopup(null)
    // Use setTimeout to avoid immediately closing from the same click
    const timer = setTimeout(() => {
      document.addEventListener('click', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [overlapPopup])

  /**
   * Select the session and raise its ☰ panel — the Dashboard's management
   * surface, opened by the block itself rather than a ☰ press.
   *
   * The select is skipped when that session is already the selected one: the
   * Dashboard's select *toggles*, so a desk opening the menu on the class the
   * right-hand panel is already showing would blank the panel it is managing.
   */
  const openSessionMenu = useCallback(
    (session: Session, el: HTMLElement, point?: { x: number; y: number }) => {
      if (selectedSessionId !== session.id) onSelectSession(session)
      const at = point ? menuAnchorAt(point) : menuAnchorForElement(el)
      setMenuTarget({ session, x: at.x, y: at.y, el })
    },
    [selectedSessionId, onSelectSession],
  )

  /**
   * Click on a session block.
   *
   * Overlapping blocks resolve to the picker first — "which session did you
   * mean" is a question the block cannot answer on its own. Otherwise the
   * click selects the session and opens its menu, and clicking the same block
   * again dismisses the menu without disturbing the panel.
   */
  const handleSessionClick = useCallback(
    (session: Session, e: React.MouseEvent) => {
      e.stopPropagation()
      // Find all sessions on the same date that overlap with this one
      const sameDay = sessions.filter((s) => s.date === session.date)
      const overlapping = sameDay.filter(
        (s) => s.start_hour < session.end_hour && s.end_hour > session.start_hour,
      )
      if (overlapping.length > 1) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        // Position popup near the clicked block, clamped to viewport
        const x = Math.min(rect.right + 8, window.innerWidth - 280)
        const y = Math.min(rect.top, window.innerHeight - 200)
        setOverlapPopup({
          sessions: overlapping,
          x,
          y,
          el: e.currentTarget as HTMLElement,
        })
        return
      }
      // This block's panel is already open — the click is a dismissal.
      if (menuTarget?.session.id === session.id) {
        setMenuTarget(null)
        return
      }
      openSessionMenu(session, e.currentTarget as HTMLElement, {
        x: e.clientX,
        y: e.clientY,
      })
    },
    [sessions, menuTarget, openSessionMenu],
  )

  return (
    <div className="relative flex flex-col h-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-[22px] overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <div>
          <h2 className="text-base font-semibold font-[family-name:var(--font-heading)] text-[var(--text)]">
            Schedule &amp; class agenda
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Click a block to run the class · + New Class to schedule one</p>
        </div>

        <div className="flex items-center gap-2">
          {/* T8 entry: + New Class */}
          <button
            type="button"
            onClick={() => onNewClass?.()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all"
          >
            + New Class
          </button>
          {/* Week / Day toggle */}
        <div className="flex rounded-lg bg-[var(--input-bg)] p-0.5 border border-[var(--glass-border)]">
          <button
            type="button"
            onClick={() => viewMode !== 'week' && onToggleView()}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-all duration-150',
              viewMode === 'week'
                ? 'bg-[var(--gold-soft)] text-[var(--gold)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--text)]',
            )}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => viewMode !== 'day' && onToggleView()}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-all duration-150',
              viewMode === 'day'
                ? 'bg-[var(--gold-soft)] text-[var(--gold)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--text)]',
            )}
          >
            Day
          </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable time grid ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* ── Day-header row (sticky inside scroll container) ── */}
        <div className="flex shrink-0 border-b border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-[22px] sticky top-0 z-10">
          {/* time-column spacer */}
          <div className="w-16 shrink-0" />

          {days.map((day, i) => {
            const key = formatDateISO(day)
            const today = isToday(day)
            return (
              <div
                key={key}
                className={cn(
                  'flex-1 text-center py-2.5',
                  i > 0 && 'border-l border-[var(--divider)]',
                  today && 'bg-[var(--gold-soft)]/20',
                )}
              >
                <div
                  className={cn(
                    'text-[10px] uppercase tracking-wider font-medium',
                    today ? 'text-[var(--gold)]' : 'text-[var(--muted)]',
                  )}
                >
                  {getDayName(day)}
                </div>
                <div
                  className={cn(
                    'text-sm font-semibold font-[family-name:var(--font-heading)]',
                    today ? 'text-[var(--gold)]' : 'text-[var(--text)]',
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Time grid ── */}
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Time labels */}
          <div className="w-16 shrink-0">
            {CALENDAR_HOURS.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2.5 right-3 text-[10px] text-[var(--muted)] font-medium select-none">
                  {formatHour12(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, i) => {
            const dateKey = formatDateISO(day)
            const daySessions = positionedByDay.get(dateKey) ?? []
            const today = isToday(day)

            return (
              <div
                key={dateKey}
                className={cn(
                  'flex-1 relative',
                  i > 0 && 'border-l border-[var(--divider)]',
                  today && 'bg-[var(--gold-soft)]/[0.04]',
                )}
                // No empty-cell click here, by design: scheduling belongs to
                // the Calendar tab and the + New Class button above is this
                // board's one way in. The Dashboard runs classes, it does not
                // place them.
              >
                {/* Hour grid-lines */}
                {CALENDAR_HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-b border-[var(--glass-border)]/40"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Session blocks */}
                {daySessions.map(({ session, col, totalCols }) => {
                  const top = (session.start_hour - CALENDAR_HOURS[0]) * HOUR_HEIGHT
                  const height = Math.max(session.duration * HOUR_HEIGHT, 22)
                  const left = `${(col / totalCols) * 100}%`
                  const width = `${(1 / totalCols) * 100}%`
                  const isSelected = session.id === selectedSessionId
                  const sessionColor = session.color || '#b3872a'

                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleSessionClick(session, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          // No pointer to hang off, so the block's own box
                          // anchors the panel.
                          openSessionMenu(session, e.currentTarget as HTMLElement)
                        }
                      }}
                      className={cn(
                        'absolute rounded-md px-1.5 py-1 cursor-pointer overflow-hidden',
                        'transition-all duration-150',
                        'border-l-[3px]',
                        'hover:shadow-lg hover:z-10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
                        isSelected && [
                          'ring-2 ring-[var(--gold)] z-10',
                          'shadow-[0_0_0_2px_var(--glass),0_0_0_4px_var(--gold)]',
                        ],
                      )}
                      style={{
                        top,
                        height,
                        left,
                        width,
                        backgroundColor: hexToRgba(sessionColor, 0.15),
                        borderLeftColor: sessionColor,
                      }}
                    >
                      {height > 28 && (
                        <div className="flex items-center gap-1 min-w-0">
                          {/* T6: FREE badge on the free session block */}
                          {isSessionFree(session) && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold bg-[var(--emerald)] text-white shrink-0"
                              title="FREE session — teacher pays (revenue 0, cut 0)"
                            >
                              <Gift size={8} />
                              FREE
                            </span>
                          )}
                          {/* T8: origin badges — 🔁 WEEKLY (emerald) vs 🕐 TEMPORARY (gold) */}
                          {(() => {
                            const origin = getSessionOrigin(session)
                            if (origin.kind === 'WEEKLY') {
                              return (
                                <span
                                  className="inline-flex items-center px-1 py-px rounded text-[8px] font-bold bg-[var(--emerald-soft)] text-[var(--emerald)] shrink-0"
                                  title="Weekly series"
                                >
                                  <Repeat size={8} />
                                </span>
                              )
                            }
                            return (
                              <span
                                className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold bg-[var(--gold-soft)] text-[var(--gold)] shrink-0"
                                title={origin.reason ? `Temporary · ${origin.reason}` : 'Temporary session'}
                              >
                                <Clock3 size={8} />
                                {origin.reason ? origin.reason.slice(0, 4) : '1×'}
                              </span>
                            )
                          })()}
                          <p className="text-[10px] font-semibold leading-tight truncate flex-1 min-w-0" style={{ color: sessionColor }}>
                            {session.class_name}
                          </p>
                          {/* No ☰ here any more: the block itself opens the
                              panel (see menuTarget), and two triggers on one
                              block could raise two panels at once. The ☰ still
                              lives on the detail panel's header. */}
                        </div>
                      )}
                      {height > 46 && (
                        <p className="text-[9px] leading-tight truncate text-[var(--muted)]">
                          {formatTime12(session.start_hour)}
                        </p>
                      )}
                      {height > 62 && (
                        <p className="text-[9px] leading-tight truncate mt-0.5 text-[var(--muted)]">
                          {session.teacher_name}
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* Now line — only on today */}
                {today && showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowOffset }}
                  >
                    <div className="h-[2px] bg-[var(--red)] shadow-[0_0_8px_var(--red)]" />
                    <div className="absolute -left-[3px] -top-[3px] w-[8px] h-[8px] rounded-full bg-[var(--red)]" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Overlap popup ── */}
      {overlapPopup && (
        <div
          className="fixed z-50 w-[260px] rounded-xl border border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-xl shadow-2xl animate-fade-in"
          style={{ left: overlapPopup.x, top: overlapPopup.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--glass-border)]">
            <span className="text-xs font-semibold text-[var(--text)]">
              {overlapPopup.sessions.length} sessions
            </span>
            <button
              onClick={closeOverlapPopup}
              className="p-0.5 rounded hover:bg-[var(--glass)] text-[var(--muted)]"
            >
              <X size={12} />
            </button>
          </div>
          <div className="max-h-[160px] overflow-y-auto">
            {overlapPopup.sessions.map((s) => {
              const sc = s.color || '#b3872a'
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    // The picked session's menu takes the picker's place: the
                    // picker answered "which one", the menu answers "what do
                    // I do with it". The block stays the anchor, so clicking
                    // that block again still toggles the panel shut.
                    openSessionMenu(s, overlapPopup.el, {
                      x: overlapPopup.x,
                      y: overlapPopup.y,
                    })
                    setOverlapPopup(null)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                    'hover:bg-[var(--glass)] transition-colors',
                    'border-b border-[var(--glass-border)]/40 last:border-b-0',
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: sc }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--text)] truncate">
                      {s.class_name}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      {formatTime12(s.start_hour)}–{formatTime12(s.end_hour)}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]/70 truncate">
                      {s.teacher_name}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Block-click menu ──
          One instance for the whole board: the panel is `fixed`, so it does
          not belong to the block it was opened from. `onOpenChange` is what
          clears `menuTarget` — every way the panel can shut (an item, Escape,
          an outside click, a scroll) reports through it, so the board never
          keeps rendering a panel nobody can see or close. */}
      {menuTarget && (
        <SessionMenu
          key={menuTarget.session.id}
          session={menuTarget.session}
          sessions={sessions}
          status={getEffectiveStatus(menuTarget.session)}
          onStart={onStartSession}
          onFinish={onFinishSession}
          onChanged={onSessionsChanged}
          onOpenRegister={onOpenRegister}
          defaultOpen
          hideTrigger
          anchor={{ x: menuTarget.x, y: menuTarget.y, el: menuTarget.el }}
          onOpenChange={(open) => { if (!open) setMenuTarget(null) }}
        />
      )}

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--glass)]/70 backdrop-blur-sm">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  )
}

export default AgendaBoard
