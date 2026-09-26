/**
 * Vinta School OS — extending a class that is running long
 *
 * The hamburger's "Extend +15" and the end-of-class toast's "Extend again"
 * are the same act, so they are the same function: push the session's end
 * time on the server, and let everything else follow from it.
 *
 * It used to be a number in localStorage — `lateMinutes` — that the end
 * toast added to the scheduled end. Nothing else could see it. The class
 * log still said the class ran 90 minutes, the register still closed on the
 * old time, and the extension evaporated when the browser was reloaded or
 * the class was ended from another machine. An extension that exists in one
 * tab does not make a class longer.
 *
 * Now the session's own `end_time` is the record of how long the class
 * runs, which is also what the log line is generated from: extend by 15 and
 * the log reads 1 h 45 min rather than 1 h 30 min, because those are two
 * readings of one number rather than two numbers.
 *
 * The end-of-class toast re-arms by itself. It remembers the end time it
 * last fired for, not a boolean, so moving the end time forward is all it
 * takes for the desk to be asked again when the new one arrives — no
 * coordination between this module and the scheduler.
 */

import api from './api'
import type { Session } from '../types/class'

/** How much longer each press of Extend makes the class. */
export const EXTEND_MINUTES = 15

/**
 * "HH:MM" moved forward by `minutes`.
 *
 * Clamped to 23:59 rather than rolling into the next day: a class that runs
 * past midnight is not something this button is for, and a session whose end
 * time is on the following date would break every "how long did it run"
 * reading in the app. A malformed time is returned unchanged, which the
 * caller refuses.
 */
export function addMinutes(time: string, minutes: number): string {
  const [rawHours, rawMinutes] = (time || '').split(':')
  const hours = Number(rawHours)
  const mins = Number(rawMinutes)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return time
  const total = Math.min(hours * 60 + mins + minutes, 23 * 60 + 59)
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export interface ExtendResult {
  /** The end time now stored on the session. */
  end_time: string
  /** "1 h 45 min" — the new length, as the log reads it. */
  duration_label?: string
}

/**
 * Push this session's end time out by `minutes`.
 *
 * Throws on refusal — a class that has already finished, or one that was
 * cancelled while the button was on screen, cannot be extended, and the
 * caller is expected to say so rather than pretend.
 */
export async function extendSession(
  session: Session,
  minutes: number = EXTEND_MINUTES,
): Promise<ExtendResult> {
  const current = session.end_time ?? ''
  const next = addMinutes(current, minutes)
  if (!current || next === current) {
    throw new Error('This session has no end time to extend.')
  }
  const { data } = await api.patch(`/sessions/${session.id}`, { end_time: next })
  return {
    end_time: data?.end_time ?? next,
    duration_label: data?.duration_label,
  }
}

export default extendSession
