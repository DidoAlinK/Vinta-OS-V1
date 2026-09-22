/**
 * Vinta School OS — T1 Session Lifecycle Lock (frontend-only)
 * Backend frozen: no start endpoint exists.
 * Canonical states: SCHEDULED -> IN_PROGRESS -> CONDUCTED, SCHEDULED -> CANCELLED.
 * CANCELLED NEVER from IN_PROGRESS (enforced here; T7 owns void/cancel UI).
 */

import type { Session } from '../types/class'

export type LifecycleStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface LifecycleRecord {
  /** ISO timestamp recorded on first successful Start click */
  actualStartTime?: string
  /** ISO timestamp — start toast snoozed until this time */
  snoozedUntil?: string
  /** Extra minutes added via "Running Late +10min" (T1) / "Extend +30" (T3) */
  lateMinutes?: number
  startNotified?: boolean
  endNotified?: boolean
}

const STORAGE_KEY = 'vinta:session-lifecycle:v1'

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
 * Effective lifecycle status = backend status overlaid with frontend start record.
 * - backend completed/conducted/cancelled always win (terminal, frozen)
 * - frontend actualStartTime promotes SCHEDULED -> IN_PROGRESS
 * - backend in_progress stays IN_PROGRESS even without a local record
 */
export function getEffectiveStatus(session: Session): LifecycleStatus {
  const backend = normalizeBackendStatus(session?.status)
  if (backend === 'completed' || backend === 'cancelled') return backend
  if (session?.is_finalized) return 'completed'
  const rec = getLifecycleRecord(session.id)
  if (backend === 'in_progress' || rec.actualStartTime) return 'in_progress'
  return 'scheduled'
}

export function getActualStartTime(sessionId: string): string | null {
  return getLifecycleRecord(sessionId).actualStartTime ?? null
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
