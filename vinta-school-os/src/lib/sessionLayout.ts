/**
 * Vinta School OS — Overlapping session layout
 *
 * Two sessions can legitimately share a slot (a compensatory sitting next to
 * the weekly one, a duplicate rolled out by mistake, two groups in one room
 * before the clash is resolved). Drawn full-width on top of each other, only
 * the last one painted is reachable — the ones underneath can never be
 * clicked. This splits a day into columns so every block stays visible and
 * every block stays clickable.
 *
 * Reads `start_time` / `end_time` rather than the derived `start_hour` /
 * `end_hour` so it works on raw API rows too.
 */

import type { Session } from '../types/class'
import { timeToHours } from './sessionTime'

export interface SlotLayout {
  /** 0-based column within the day. */
  col: number
  /** How many columns the day ended up needing at this point. */
  totalCols: number
}

interface Span {
  id: string
  start: number
  end: number
}

function spanOf(session: Session): Span {
  const start = session.start_time
    ? timeToHours(session.start_time)
    : session.start_hour ?? 0
  const end = session.end_time
    ? timeToHours(session.end_time)
    : session.end_hour ?? start
  return { id: session.id, start, end: end > start ? end : start }
}

/**
 * Lay out one day's sessions into non-overlapping columns.
 * Returns a map keyed by session id; unknown ids fall back to the caller.
 */
export function layoutDay(sessions: Session[]): Map<string, SlotLayout> {
  const result = new Map<string, SlotLayout>()
  if (!sessions.length) return result

  const sorted = [...sessions].map(spanOf).sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )

  // Group mutually-overlapping spans, then pack each group greedily.
  const groups: Span[][] = []
  let current: Span[] = [sorted[0]]
  let groupEnd = sorted[0].end

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < groupEnd) {
      current.push(sorted[i])
      groupEnd = Math.max(groupEnd, sorted[i].end)
    } else {
      groups.push(current)
      current = [sorted[i]]
      groupEnd = sorted[i].end
    }
  }
  groups.push(current)

  for (const group of groups) {
    const columns: Span[][] = []

    for (const span of group) {
      let placed = false
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1]
        if (last.end <= span.start) {
          columns[c].push(span)
          result.set(span.id, { col: c, totalCols: 1 })
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([span])
        result.set(span.id, { col: columns.length - 1, totalCols: 1 })
      }
    }

    for (const span of group) {
      const entry = result.get(span.id)
      if (entry) entry.totalCols = columns.length
    }
  }

  return result
}
