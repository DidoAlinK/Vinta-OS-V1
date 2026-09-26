/**
 * Vinta School OS — T1 Session Lifecycle
 *
 * Canonical states: SCHEDULED -> IN_PROGRESS -> CONDUCTED, SCHEDULED ->
 * CANCELLED. CANCELLED never from IN_PROGRESS.
 *
 * Which state a class is in is the SERVER's answer, not this file's. It is
 * what decides who gets charged, and it is the only answer that survives a
 * reload, a second device, and a cleared browser. So the backend status is
 * authoritative and this module only folds its spellings together — see
 * normalizeBackendStatus.
 *
 * What is genuinely client-side here is the toast UX: whether the "class is
 * starting" nudge has been shown, whether it was snoozed, and how many
 * minutes late the desk said a class was running. Those are preferences about
 * when to be interrupted, not facts about the class.
 */

import type { Session } from '../types/class'
import { toLocalISO } from './sessionTime'

export type LifecycleStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface LifecycleRecord {
  /**
   * There is deliberately no `actualStartTime` here. A class's start time is
   * `session.actual_start_time`, and a client-side copy of it could only ever
   * disagree with the server — the version that existed for a build did
   * exactly that, and won, which is why a class the server had as `scheduled`
   * could show as running in a browser that had once been clicked.
   */
  /**
   * ISO timestamp — the start prompt is quiet until this time.
   *
   * This is the whole of the start-prompt bookkeeping now. It used to be a
   * one-shot `startNotified` boolean as well, which made the nudge
   * fire-once-and-be-lost: a single flag, cleared only by pressing Snooze,
   * so a prompt that arrived while the desk was away from the screen was
   * gone for good. The browser held 17 such records while 555 sessions sat
   * `scheduled` — every one of them a class nobody was ever asked about
   * again. Re-arming off a timestamp instead means a missed prompt is
   * re-asked, which is the behaviour the desk actually wants.
   */
  snoozedUntil?: string
  /**
   * The `end_time` the end-of-class toast was last fired for.
   *
   * Deliberately the time and not a boolean. Extending a class moves its end
   * time, and the desk should be asked again when the new one arrives — with
   * a flag that would need clearing at exactly the right moment from
   * wherever the extension happened, and a missed clear would either nag
   * forever or go silent. Comparing against the end time makes re-arming a
   * consequence of the extension rather than a second thing to remember.
   *
   * It also means an extension made on another device re-arms this one.
   */
  endNotifiedFor?: string
}

/**
 * Bumped from v1 to retire records written by the previous build, which
 * stored a client-side start time. Those records claimed classes were running
 * that the server still had as `scheduled`, and the claim could not be cleared
 * — see getEffectiveStatus. Changing the key drops them in one step, which is
 * the only safe way to do it: after the fact, nothing can tell a legitimate
 * old record from a stale one.
 *
 * Bumped from v2 for the same reason at a smaller scale: `startNotified` is
 * gone (see snoozedUntil), and the sessions the old one-shot flag had gone
 * quiet on are exactly the ones the desk was never asked about. Dropping the
 * records lets the new re-prompt speak for them instead of inheriting a
 * silence nothing can distinguish from an answer.
 */
const STORAGE_KEY = 'vinta:session-lifecycle:v3'

function loadAll(): Record<string, LifecycleRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, LifecycleRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage full/blocked — lifecycle still works in-memory for this tab
  }
}

export function getLifecycleRecord(sessionId: string): LifecycleRecord {
  return loadAll()[sessionId] ?? {}
}

export function updateLifecycleRecord(sessionId: string, patch: Partial<LifecycleRecord>): LifecycleRecord {
  const all = loadAll()
  const next = { ...(all[sessionId] ?? {}), ...patch }
  all[sessionId] = next
  saveAll(all)
  return next
}

/** Backend may return `conducted` (new money-model) or `completed` (legacy). Both are terminal CONDUCTED. */
export function normalizeBackendStatus(status: Session['status'] | string | undefined): LifecycleStatus {
  if (status === 'conducted') return 'completed'
  if (status === 'scheduled' || status === 'in_progress' || status === 'completed' || status === 'cancelled') {
    return status
  }
  return 'scheduled'
}

/**
 * Effective lifecycle status — a fold of the backend spelling, nothing more.
 *
 * This used to promote SCHEDULED -> IN_PROGRESS whenever a local
 * `actualStartTime` existed, which made a stale record self-perpetuating: the
 * browser would insist a class was running, `canStart` would refuse to start
 * it, and the record saying so could never be cleared — because the server was
 * never asked, so it never answered. Two sources of truth for one fact, and
 * the wrong one won.
 *
 * The server is the only party that knows, so it is the only party asked.
 * `is_finalized` stays as a fallback for payloads that predate the lifecycle
 * columns.
 */
export function getEffectiveStatus(session: Session): LifecycleStatus {
  const backend = normalizeBackendStatus(session?.status)
  if (backend === 'completed' || backend === 'cancelled') return backend
  if (session?.is_finalized) return 'completed'
  return backend
}

/** Attendance grid may open ONLY while IN_PROGRESS. */
export function canOpenAttendance(status: LifecycleStatus): boolean {
  return status === 'in_progress'
}

/**
 * Start allowed ONLY from SCHEDULED (manual early start included).
 *
 * This is the status half of the question. `canStartSession` is the other
 * half — the clock — and is what the UI should ask before offering a Start
 * button. Kept, because a caller that has a status but no session (or no
 * clock) still has a real question to ask.
 */
export function canStart(status: LifecycleStatus): boolean {
  return status === 'scheduled'
}

/** Local-time YYYY-MM-DD of the day `session` is scheduled on. */
function sessionDay(session: Session): string {
  return session?.date ?? ''
}

/**
 * Is this class on today's date?
 *
 * The "its own day" rule, in one place, because three things depend on it
 * agreeing with itself: the server's start guard, the Start button, and how
 * long the start prompt keeps asking. `now` is local and `session.date` is a
 * local wall-clock date, so this is a local-against-local comparison on
 * purpose — formatting `now` through `toISOString()` would shift the
 * boundary by the UTC offset and call a class on its own evening tomorrow.
 */
export function isSessionDay(session: Session, now: Date = new Date()): boolean {
  const day = sessionDay(session)
  return day !== '' && day === toLocalISO(now)
}

/**
 * Why this class cannot be started right now, or `null` if it can.
 *
 * One function rather than a boolean plus a separate explanation, so the
 * disabled button and the sentence under it can never disagree.
 *
 * The clock rule mirrors the server exactly —
 * `session_lifecycle_service.start_session` refuses a class whose `date` is
 * not today, and this must not offer a Start it is going to answer with a
 * 409. Same day, not "within N hours": it explains itself to the desk
 * without a rule they cannot see, and it survives a late start, an early
 * start, and a browser whose clock is a little off.
 *
 * The asymmetry the desk will notice: a class that was never started and
 * whose day has passed is *not* startable. It is late, not running, and its
 * outcome is either Cancel (by hand) or, for a one-off class, the nightly
 * close-out — see `close_past_temporary_sessions` on the server.
 *
 * `session.date` is a local wall-clock date and `now` is local, so this
 * compares local against local on purpose. Going through `toISOString()`
 * here would move the boundary by the UTC offset and refuse a class on its
 * own evening. (`lib/sessionTime.ts` carries the same warning.)
 */
export function startBlockReason(session: Session, now: Date = new Date()): string | null {
  if (!session) return 'No class selected.'
  if (isSessionDay(session, now)) return null

  const day = sessionDay(session) || 'an unknown date'
  return `A class can only be started on its own day (${day}); today is ${toLocalISO(now)}.`
}

/**
 * May this class be started, now?
 *
 * The gate for every Start affordance. Note it is *not* `canStart(status)`
 * alone: that would offer Start on a class from last week, and on one dated
 * next month, and the server refuses both.
 */
export function canStartSession(session: Session, now: Date = new Date()): boolean {
  return canStart(getEffectiveStatus(session)) && startBlockReason(session, now) === null
}

/** Cancel / Teacher-Absent allowed ONLY from SCHEDULED — never from live. */
export function canCancel(status: LifecycleStatus): boolean {
  return status === 'scheduled'
}

/**
 * T7: Void allowed ONLY from IN_PROGRESS (live abort). Never from SCHEDULED
 * (use Cancel there), never from terminal states. Owner PIN gated in UI.
 */
export function canVoid(status: LifecycleStatus): boolean {
  return status === 'in_progress'
}

/** Finish ("Class Done") allowed ONLY from IN_PROGRESS. */
export function canFinish(status: LifecycleStatus): boolean {
  return status === 'in_progress'
}

/** Combine session date + "HH:MM" into a local Date. Null when unparsable. */
export function getScheduledDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null
  const d = new Date(`${dateStr}T${timeStr}:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getScheduledStart(session: Session): Date | null {
  return getScheduledDateTime(session.date, session.start_time)
}

/**
 * When this class is expected to end.
 *
 * Read straight off the session, with no adjustment: an extended class has a
 * later `end_time` on the server, so the extension is already in this
 * number. It used to take an `extraMinutes` argument fed from a localStorage
 * counter, which meant the app held two ends for one class and the wrong one
 * won.
 */
export function getScheduledEnd(session: Session): Date | null {
  return getScheduledDateTime(session.date, session.end_time)
}

export function isSnoozed(sessionId: string, now: Date = new Date()): boolean {
  const rec = getLifecycleRecord(sessionId)
  if (!rec.snoozedUntil) return false
  const until = new Date(rec.snoozedUntil)
  return !Number.isNaN(until.getTime()) && now < until
}

// ─────────────────────────────────────────────
// Phase — what the clock says, as opposed to what the server says
// ─────────────────────────────────────────────

/**
 * Where a class sits relative to *now*, for display.
 *
 * This exists because the server's status alone cannot answer "is this class
 * running?". The server only changes a status when something asks it to: a
 * class goes `in_progress` when the desk starts it and leaves `in_progress`
 * only when the desk finishes it. Nothing closes a class on a timer — see
 * `tasks/cron_jobs.py`, which deliberately does not — so a class that
 * overran stays `in_progress` on the server until a human acts, and any UI
 * that reads the status alone will claim a class that ended hours ago is
 * still running. That is the reported bug.
 *
 *   scheduled  — not started yet
 *   live       — in progress, and its end time has not passed
 *   overdue    — in progress, but past its end time: still open on the
 *                server, and the desk owes it a decision (Finish, Extend,
 *                or Void). Not an error state — a class that runs long is
 *                ordinary — so it must not be rendered as one.
 *   done       — terminal: conducted or cancelled
 *
 * DISPLAY ONLY. Never gate an action or a charge on this — use
 * `getEffectiveStatus` and the `can*` guards below, which read the server.
 * A phase is derived from `end_time` plus the browser clock, so two devices
 * can disagree about it and a wrong clock can invent one.
 *
 * Note the asymmetry: a class that was *never started* and whose time has
 * passed stays `scheduled`, not `overdue`. It is late, not running, so it is
 * not the thing being reported — and it needs a different prompt (Start or
 * Cancel) than an overrun does. When that becomes its own feature it should
 * be its own phase rather than an overload of this one.
 */
export type SessionPhase = 'scheduled' | 'live' | 'overdue' | 'done'

export function getSessionPhase(session: Session, now: Date = new Date()): SessionPhase {
  const status = getEffectiveStatus(session)
  if (status === 'completed' || status === 'cancelled') return 'done'
  if (status !== 'in_progress') return 'scheduled'

  const end = getScheduledEnd(session)
  // An unparsable end time means we cannot prove the class is over, so the
  // server's `in_progress` stands.
  if (!end) return 'live'

  return now > end ? 'overdue' : 'live'
}

// ─────────────────────────────────────────────
// "Mark NEXT as Free" no longer lives here.
//
// It used to be a per-group localStorage flag that a later sweep adopted
// onto whichever session turned out to be next. The server never saw it, so
// the flag did not stop a credit being spent — the one thing it was for.
// The free flag is now written straight onto the next session's own
// `is_free_session` column, and read back from it: see lib/freeSessions.ts
// and the hamburger's FreeNextModal.
// ─────────────────────────────────────────────
