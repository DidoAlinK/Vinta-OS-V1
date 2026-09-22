/**
 * Vinta School OS — T7 Void registry (frontend-only)
 * Backend frozen: no reason/LIVE_VOID columns, no restore endpoint.
 *
 * - Void applies to IN_PROGRESS only, Owner PIN gated (SessionMenu).
 * - Credit restore is per-session ONLY: the frontend replays, for THIS
 *   session's roster rows, the single credit the backend consumed at each
 *   /check-in — by topping up the student's level subscription via the
 *   existing Record Payment flow is NOT possible without new routes, so the
 *   restore is recorded as a frontend compensating ledger
 *   (`vinta:void-restores:v1`) that the Subscriptions panel + door grid
 *   overlay as restored credits. No pro-rata: full single-session restore
 *   or nothing. Other sessions are never touched.
 * - Rows are marked VOIDED (overlay badge + frozen grid).
 * - Cancel/Teacher Absent stay SCHEDULED-only (canCancel gate); live abort
 *   goes through Void only. End Class normally = full pay per formula.
 */

export interface VoidRestore {
  sessionId: string
  classId: string
  reason: 'LIVE_VOID'
  restoredAt: string
  restoredBy: string
  /** student_id -> credits restored for THIS session (0 or 1 each) */
  restoredCredits: Record<string, number>
  /** roster size at void time */
  rosterSize: number
}

const VOID_KEY = 'vinta:void-restores:v1'

function loadAll(): Record<string, VoidRestore> {
  try {
    const raw = localStorage.getItem(VOID_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, VoidRestore>): void {
  try {
    localStorage.setItem(VOID_KEY, JSON.stringify(map))
  } catch {
    // Storage blocked — void still applies for this tab read cycle
  }
}

/** True when THIS session was voided live (rows VOIDED, grid frozen). */
export function isSessionVoided(sessionId: string): boolean {
  if (!sessionId) return false
  return Boolean(loadAll()[sessionId])
}

export function getVoidRestore(sessionId: string): VoidRestore | null {
  if (!sessionId) return null
  return loadAll()[sessionId] ?? null
}

/** All void restores (newest first) — Subscriptions panel overlay. */
export function listVoidRestores(): VoidRestore[] {
  return Object.values(loadAll()).sort((a, b) =>
    b.restoredAt.localeCompare(a.restoredAt),
  )
}

/** Credits restored for a student in a voided session (0 when untouched). */
export function getVoidRestoredCredits(sessionId: string, studentId: string): number {
  if (!sessionId || !studentId) return 0
  return loadAll()[sessionId]?.restoredCredits?.[studentId] ?? 0
}

/**
 * Record a void + per-session restore. `chargedStudentIds` = roster rows that
 * consumed exactly 1 credit for THIS session (PRESENT, plus ABSENT only when
 * Toggle 1 was ON at void time). Each gets exactly +1 back — never more,
 * never other sessions. Idempotent per session.
 */
export function recordVoidRestore(input: {
  sessionId: string
  classId: string
  restoredBy: string
  chargedStudentIds: string[]
  rosterSize: number
}): VoidRestore {
  const existing = loadAll()[input.sessionId]
  if (existing) return existing
  const restoredCredits: Record<string, number> = {}
  for (const sid of input.chargedStudentIds) {
    if (!sid) continue
    restoredCredits[sid] = 1
  }
  const rec: VoidRestore = {
    sessionId: input.sessionId,
    classId: input.classId,
    reason: 'LIVE_VOID',
    restoredAt: new Date().toISOString(),
    restoredBy: input.restoredBy,
    restoredCredits,
    rosterSize: input.rosterSize,
  }
  const all = loadAll()
  all[input.sessionId] = rec
  saveAll(all)
  return rec
}
