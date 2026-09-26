/**
 * Vinta School OS — Session time helpers
 *
 * The API serializes a session with `date`, `start_time` and `end_time`
 * ("HH:MM") and nothing else. `start_hour`, `end_hour` and `duration` are
 * declared on the `Session` type, but no endpoint ever computes them — so
 * every grid that positioned a block by `start_hour` was reading `undefined`
 * and stacking its blocks instead of placing them. This module is the single
 * place those fields get derived.
 */

import type { Session } from '../types/class'

// ============================================
// Time conversion
// ============================================

/** "HH:MM" → decimal hours (e.g. "10:30" → 10.5) */
export function timeToHours(time: string): number {
  const [h, m] = (time || '00:00').split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

/** Decimal hours → "HH:MM" (clamped to a single day) */
export function hoursToTime(hours: number): string {
  const clamped = Math.max(0, Math.min(hours, 23.99))
  const h = Math.floor(clamped)
  const m = Math.round((clamped - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" → "1:30 PM" */
export function timeLabel(time: string): string {
  const hours = timeToHours(time)
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`
}

/** "09:00" + "10:30" → "9 AM – 10:30 AM" */
export function timeRangeLabel(start: string, end: string): string {
  return `${timeLabel(start)} – ${timeLabel(end)}`
}

// ============================================
// Derived session fields
// ============================================

/** Fill in the computed time fields the API does not send. */
export function enrichSession(session: Session): Session {
  const start = timeToHours(session.start_time)
  const end = timeToHours(session.end_time)
  return {
    ...session,
    start_hour: start,
    end_hour: end,
    duration: Math.max(end - start, 0),
  }
}

export function enrichSessions(sessions: Session[] | undefined | null): Session[] {
  return Array.isArray(sessions) ? sessions.map(enrichSession) : []
}

// ============================================
// Date helpers (local-time, never UTC)
// ============================================

/**
 * Local-time YYYY-MM-DD.
 *
 * `Date#toISOString()` is UTC, so anywhere east or west of Greenwich it
 * reports a different calendar day for part of every day — which silently
 * moves a session onto the wrong date. Always format dates through here.
 */
export function toLocalISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a YYYY-MM-DD string as a local date (not UTC midnight). */
export function fromLocalISO(iso: string): Date {
  const [y, m, d] = (iso || '').split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

/** The Sunday that opens `date`'s week. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** 0 = Sunday … 6 = Saturday */
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * The date to ask `/calendar/week` for.
 *
 * The backend derives its week start as `target - (weekday + 1)` days. That
 * lands on the correct Sunday for Mon–Sat, but jumps a whole week backwards
 * when the target *is* a Sunday (`weekday()` returns 6, so it subtracts 7).
 * Handing it the Monday of the week we are drawing sidesteps that entirely.
 */
export function weekRequestDate(weekStart: Date): string {
  return toLocalISO(addDays(weekStart, 1))
}
