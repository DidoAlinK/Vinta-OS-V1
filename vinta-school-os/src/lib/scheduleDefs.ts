/**
 * Vinta School OS — T8 ScheduleDefinition registry (frontend-only)
 * Backend frozen: no ScheduleDefinition table/columns exist. The
 * `schedule_id` FK on sessions is the trace origin (serialized on sessions
 * created via POST /classes/:id/schedules); Temporary sessions have
 * schedule_id null (POST /sessions direct).
 *
 * - WEEKLY definitions live in localStorage (`vinta:schedule-defs:v1`):
 *   { id, classId, teacherId, dayOfWeek, start, end, roomId, startFrom,
 *     endKind: 'never'|'after_n'|'on_date', endN, endDate }.
 *   Rolling 8 weeks of sessions are generated via the existing
 *   POST /classes/:id/schedules (backend generates 12 weeks; the 8-week
 *   window is enforced frontend-side on display/counts).
 * - TEMPORARY = exactly 1 session via POST /sessions (no definition row).
 * - Badges: 🔁 WEEKLY (emerald) vs 🕐 + reason TEMPORARY (gold) — derived
 *   from definition presence (+ stored reason for temporaries).
 * - Edit scope for WEEKLY lives in SessionMenu (This / This+following split /
 *   All series). This module owns the data + conflict primitives.
 */

export type ScheduleEndKind = 'never' | 'after_n' | 'on_date'

export interface ScheduleDefinition {
  id: string
  type: 'WEEKLY'
  classId: string
  className: string
  teacherId: string
  dayOfWeek: number // 0=Sun … 6=Sat
  startTime: string // "HH:MM"
  endTime: string // "HH:MM"
  roomId: string | null
  startsFrom: string // YYYY-MM-DD
  endKind: ScheduleEndKind
  endN?: number // after_n count
  endDate?: string // on_date YYYY-MM-DD
  backendScheduleId: string | null
  createdAt: string
}

export type TempReason = 'Makeup' | 'Trial' | 'Extra' | 'Reschedule'

export interface TempRecord {
  sessionId: string
  reason: TempReason
  groupId: string | null
  createdAt: string
}

const DEFS_KEY = 'vinta:schedule-defs:v1'
const TEMP_KEY = 'vinta:temp-sessions:v1'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked — registry still applies for this tab read cycle
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ── WEEKLY definitions ──

export function listScheduleDefs(): ScheduleDefinition[] {
  const all = loadJson<Record<string, ScheduleDefinition>>(DEFS_KEY, {})
  return Object.values(all).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getScheduleDef(id: string): ScheduleDefinition | null {
  if (!id) return null
  return loadJson<Record<string, ScheduleDefinition>>(DEFS_KEY, {})[id] ?? null
}

export function saveScheduleDef(def: ScheduleDefinition): void {
  const all = loadJson<Record<string, ScheduleDefinition>>(DEFS_KEY, {})
  all[def.id] = def
  saveJson(DEFS_KEY, all)
}

export function createScheduleDef(input: Omit<ScheduleDefinition, 'id' | 'type' | 'createdAt'>): ScheduleDefinition {
  const def: ScheduleDefinition = {
    ...input,
    id: uid('scheddef'),
    type: 'WEEKLY',
    createdAt: new Date().toISOString(),
  }
  saveScheduleDef(def)
  return def
}

export function deleteScheduleDef(id: string): void {
  if (!id) return
  const all = loadJson<Record<string, ScheduleDefinition>>(DEFS_KEY, {})
  delete all[id]
  saveJson(DEFS_KEY, all)
}

/** Definitions for a group (used by the edit-scope splitter). */
export function getDefsForClass(classId: string): ScheduleDefinition[] {
  if (!classId) return []
  return listScheduleDefs().filter((d) => d.classId === classId)
}

// ── TEMPORARY records (reason badges) ──

export function getTempRecord(sessionId: string): TempRecord | null {
  if (!sessionId) return null
  return loadJson<Record<string, TempRecord>>(TEMP_KEY, {})[sessionId] ?? null
}

export function saveTempRecord(rec: TempRecord): void {
  const all = loadJson<Record<string, TempRecord>>(TEMP_KEY, {})
  all[rec.sessionId] = rec
  saveJson(TEMP_KEY, all)
}

export function createTempRecord(sessionId: string, reason: TempReason, groupId: string | null): TempRecord {
  const rec: TempRecord = { sessionId, reason, groupId, createdAt: new Date().toISOString() }
  saveTempRecord(rec)
  return rec
}

// ── Badge derivation ──

/**
 * Origin badge for a session:
 * - WEEKLY (🔁 emerald) when session.schedule_id matches a definition's
 *   backendScheduleId OR a definition covers (classId, weekday, time).
 * - TEMPORARY (🕐 + reason, gold) when schedule_id is null.
 */
export function getSessionOrigin(session: {
  id: string
  class_id: string
  schedule_id?: string | null
  date: string
  start_time: string
  end_time: string
}): { kind: 'WEEKLY' | 'TEMPORARY'; defId: string | null; reason: TempReason | null } {
  const temp = getTempRecord(session.id)
  if (temp) return { kind: 'TEMPORARY', defId: null, reason: temp.reason }
  if (!session.schedule_id) return { kind: 'TEMPORARY', defId: null, reason: null }

  const defs = listScheduleDefs()
  const direct = defs.find((d) => d.backendScheduleId === session.schedule_id)
  if (direct) return { kind: 'WEEKLY', defId: direct.id, reason: null }

  // Fallback: same class + same weekday + same time window = weekly origin.
  const dow = (() => {
    try {
      return new Date(`${session.date}T${session.start_time}:00`).getDay()
    } catch {
      return -1
    }
  })()
  const cover = defs.find(
    (d) =>
      d.classId === session.class_id &&
      d.dayOfWeek === dow &&
      d.startTime === session.start_time &&
      d.endTime === session.end_time,
  )
  if (cover) return { kind: 'WEEKLY', defId: cover.id, reason: null }
  return { kind: 'WEEKLY', defId: null, reason: null }
}

// ── Conflict primitives (frontend-side, vs non-CANCELLED sessions) ──

export interface ConflictSession {
  id: string
  date: string
  start_time: string
  end_time: string
  teacher_id: string
  classroom_id?: string | null
  status?: string
}

function toMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd)
}

export interface SessionConflict {
  kind: 'room' | 'teacher'
  sessionId: string
}

/**
 * BLOCKING conflict check: room overlap OR teacher overlap on the same date
 * vs non-CANCELLED sessions. Returns conflicts (empty = safe to submit).
 * `ignoreId` excludes the session being edited.
 */
export function findConflicts(
  sessions: ConflictSession[],
  input: { date: string; start: string; end: string; teacherId: string; roomId: string | null; ignoreId?: string },
): SessionConflict[] {
  const out: SessionConflict[] = []
  for (const s of sessions) {
    if (!s || s.id === input.ignoreId) continue
    if ((s.status ?? 'scheduled') === 'cancelled') continue
    if (s.date !== input.date) continue
    if (!overlaps(input.start, input.end, s.start_time, s.end_time)) continue
    if (input.roomId && s.classroom_id && s.classroom_id === input.roomId) {
      out.push({ kind: 'room', sessionId: s.id })
    }
    if (input.teacherId && s.teacher_id && s.teacher_id === input.teacherId) {
      out.push({ kind: 'teacher', sessionId: s.id })
    }
  }
  return out
}

/** Occurrence dates for a weekly definition (rolling window, default 8 weeks). */
export function weeklyOccurrences(
  def: Pick<ScheduleDefinition, 'dayOfWeek' | 'startsFrom' | 'endKind' | 'endN' | 'endDate'>,
  weeks = 8,
): string[] {
  const [y, m, d] = (def.startsFrom || '').split('-').map(Number)
  if (!y || !m || !d) return []
  const start = new Date(y, m - 1, d)
  const dates: string[] = []
  // First occurrence on/after startsFrom with matching weekday.
  const first = new Date(start)
  const delta = (def.dayOfWeek - first.getDay() + 7) % 7
  first.setDate(first.getDate() + delta)

  const maxCount = def.endKind === 'after_n' ? Math.min(def.endN ?? weeks, 52) : weeks
  const endDate = def.endKind === 'on_date' && def.endDate ? def.endDate : null

  const cur = new Date(first)
  while (dates.length < maxCount) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (endDate && iso > endDate) break
    if (dates.length >= weeks && def.endKind === 'never') break
    dates.push(iso)
    cur.setDate(cur.getDate() + 7)
    // Hard stop: 8-week rolling window for 'never', 52 for bounded.
    if (def.endKind === 'never' && dates.length >= weeks) break
    if (dates.length >= 52) break
  }
  return dates
}

export const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export const TEMP_REASONS: TempReason[] = ['Makeup', 'Trial', 'Extra', 'Reschedule']
