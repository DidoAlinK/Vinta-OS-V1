/**
 * Vinta School OS — T6 Free Session registry (frontend-only)
 * Backend frozen: no isFreeSession / pendingFreeSession columns exist.
 *
 * - Hamburger "Mark NEXT as Free" stages a per-group pending flag
 *   (sessionLifecycle.markNextFree, with afterDate/afterTime ctx).
 * - consumePendingFree() assigns the flag to the chronologically-NEXT
 *   non-terminal session of that group (regular Sunday generation OR ad-hoc
 *   Monday extra — both appear as sessions), marks it free, auto-clears pending.
 * - A free session: revenue=0, teacherCut=0 (all commission types),
 *   no credit decrement. Enforced by routing its check-ins through the
 *   billing-free add-to-session path (SessionCheckInModal) — backend finalize
 *   then naturally computes 0/0/0 with no RevenueEntry rows.
 */

import type { Session } from '../types/class'
import {
  getFreeMark,
  normalizeBackendStatus,
  unmarkNextFree,
} from './sessionLifecycle'

export interface FreeSessionRecord {
  sessionId: string
  classId: string
  markedAt: string
  consumedAt: string
}

const FREE_SESSIONS_KEY = 'vinta:free-sessions:v1'

function loadFreeSessions(): Record<string, FreeSessionRecord> {
  try {
    const raw = localStorage.getItem(FREE_SESSIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveFreeSessions(map: Record<string, FreeSessionRecord>): void {
  try {
    localStorage.setItem(FREE_SESSIONS_KEY, JSON.stringify(map))
  } catch {
    // Storage blocked — designation still applies for this tab read cycle
  }
}

/** True when THIS session instance was designated free (teacher pays). */
export function isSessionFree(sessionId: string): boolean {
  if (!sessionId) return false
  return Boolean(loadFreeSessions()[sessionId])
}

/** Designate a session instance as free. Idempotent per session. */
export function markSessionFree(sessionId: string, classId: string): FreeSessionRecord {
  const all = loadFreeSessions()
  const existing = all[sessionId]
  if (existing) return existing
  const now = new Date().toISOString()
  const rec: FreeSessionRecord = { sessionId, classId, markedAt: now, consumedAt: now }
  all[sessionId] = rec
  saveFreeSessions(all)
  return rec
}

/** Clear a free designation (undo / correction). */
export function unmarkSessionFree(sessionId: string): void {
  if (!sessionId) return
  const all = loadFreeSessions()
  delete all[sessionId]
  saveFreeSessions(all)
}

function isTerminal(session: Session): boolean {
  const st = normalizeBackendStatus(session?.status)
  return st === 'completed' || st === 'cancelled'
}

/**
 * Assign pending NEXT-free flags to the chronologically-next non-terminal
 * session of each flagged group. Call after every sessions fetch.
 * Returns assignments (for toasts). Pending clears on assignment.
 */
export function consumePendingFree(sessions: Session[]): Array<{ record: FreeSessionRecord; session: Session }> {
  if (!Array.isArray(sessions) || sessions.length === 0) return []
  const assigned: Array<{ record: FreeSessionRecord; session: Session }> = []

  const byClass = new Map<string, Session[]>()
  for (const s of sessions) {
    if (!s || !s.class_id) continue
    const list = byClass.get(s.class_id) ?? []
    list.push(s)
    byClass.set(s.class_id, list)
  }

  for (const [classId, list] of byClass) {
    const mark = getFreeMark(classId)
    if (!mark) continue

    const afterDate = mark.afterDate ?? mark.markedAt.slice(0, 10)
    const threshold =
      mark.afterTime ??
      (mark.markedAt.length >= 16 ? mark.markedAt.slice(11, 16) : '')

    const cands = list
      .filter((s) => {
        if (!s.id || s.id === mark.markedSessionId) return false
        if (isSessionFree(s.id)) return false
        if (isTerminal(s)) return false
        if (s.date > afterDate) return true
        if (s.date === afterDate && threshold !== '' && (s.start_time ?? '') > threshold) return true
        return false
      })
      .sort((a, b) =>
        a.date === b.date
          ? (a.start_time ?? '').localeCompare(b.start_time ?? '')
          : a.date.localeCompare(b.date),
      )

    if (cands.length === 0) continue // stays pending until the NEXT session exists
    const next = cands[0]
    const record = markSessionFree(next.id, classId)
    unmarkNextFree(classId)
    assigned.push({ record, session: next })
  }

  return assigned
}
