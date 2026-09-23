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

export type LifecycleStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface LifecycleRecord {
  /**
   * There is deliberately no `actualStartTime` here. A class's start time is
   * `session.actual_start_time`, and a client-side copy of it could only ever
   * disagree with the server — the version that existed for a build did
   * exactly that, and won, which is why a class the server had as `scheduled`
   * could show as running in a browser that had once been clicked.
   */
  /** ISO timestamp — start toast snoozed until this time */
  snoozedUntil?: string
  /** Extra minutes added via "Running Late +10min" (T1) / "Extend +30" (T3) */
  lateMinutes?: number
  startNotified?: boolean
  endNotified?: boolean
}

/**
 * Bumped from v1 to retire records written by the previous build, which
 * stored a client-side start time. Those records claimed classes were running
 * that the server still had as `scheduled`, and the claim could not be cleared
 * — see getEffectiveStatus. Changing the key drops them in one step, which is
 * the only safe way to do it: after the fact, nothing can tell a legitimate
 * old record from a stale one.
 */
const STORAGE_KEY = 'vinta:session-lifecycle:v2'

/** T6: per-group flag id — teacher says NEXT session is free (teacher pays). */
const FREE_KEY = 'vinta:session-free-next:v1'

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

/** Start allowed ONLY from SCHEDULED (manual early start included). */
export function canStart(status: LifecycleStatus): boolean {
  return status === 'scheduled'
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

export function getScheduledEnd(session: Session, extraMinutes = 0): Date | null {
  const end = getScheduledDateTime(session.date, session.end_time)
  if (!end) return null
  if (extraMinutes > 0) end.setMinutes(end.getMinutes() + extraMinutes)
  return end
}

export function isSnoozed(sessionId: string, now: Date = new Date()): boolean {
  const rec = getLifecycleRecord(sessionId)
  if (!rec.snoozedUntil) return false
  const until = new Date(rec.snoozedUntil)
  return !Number.isNaN(until.getTime()) && now < until
}

// ─────────────────────────────────────────────
// T3/T6: "Mark NEXT as Free" per-group flag (frontend-only, backend frozen).
// The hamburger sets it; T6 consumes it on the NEXT created session.
// ─────────────────────────────────────────────

export interface FreeNextRecord {
  markedAt: string
  /** Session id the hamburger was opened from (never the free session itself). */
  markedSessionId?: string
  /** Short label of the marked session for toasts (e.g. "Sat 10:00"). */
  markedLabel?: string
  /** NEXT = strictly after this date (YYYY-MM-DD). Falls back to markedAt day. */
  afterDate?: string
  /** NEXT = after this HH:MM on afterDate. Falls back to markedAt time. */
  afterTime?: string
}

function loadFreeAll(): Record<string, FreeNextRecord> {
  try {
    const raw = localStorage.getItem(FREE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveFreeAll(map: Record<string, FreeNextRecord>): void {
  try {
    localStorage.setItem(FREE_KEY, JSON.stringify(map))
  } catch {
    // Storage blocked — flag still applies in-memory for this tab read
  }
}

/** True when the teacher flagged the NEXT session of this group as free. */
export function isNextFreeMarked(classId: string): boolean {
  if (!classId) return false
  return Boolean(loadFreeAll()[classId])
}

/** Full pending NEXT-free record (null when none). */
export function getFreeMark(classId: string): FreeNextRecord | null {
  if (!classId) return null
  return loadFreeAll()[classId] ?? null
}

/**
 * Flag the NEXT session of this group as free (teacher pays).
 * ctx pins the NEXT boundary: strictly after the marked session so the
 * CURRENT instance can never self-assign (incl. Sunday/extra regen timing).
 */
export function markNextFree(
  classId: string,
  ctx?: { markedSessionId?: string; markedLabel?: string; afterDate?: string; afterTime?: string },
): void {
  if (!classId) return
  const all = loadFreeAll()
  all[classId] = {
    markedAt: new Date().toISOString(),
    markedSessionId: ctx?.markedSessionId,
    markedLabel: ctx?.markedLabel,
    afterDate: ctx?.afterDate,
    afterTime: ctx?.afterTime,
  }
  saveFreeAll(all)
}

/** Clear the flag (undo, or consumed by T6 on the NEXT created session). */
export function unmarkNextFree(classId: string): void {
  if (!classId) return
  const all = loadFreeAll()
  delete all[classId]
  saveFreeAll(all)
}
