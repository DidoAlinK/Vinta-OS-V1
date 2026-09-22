/**
 * Vinta School OS — T9 Teacher email registry (frontend-only)
 * Backend frozen: Teacher has NO email column; POST/PUT /teachers accept only
 * first_name/last_name/phone/subject(+ids)/contract/rate/commission/notes.
 * Unknown keys would 400 or be ignored — so email is NEVER sent to the API.
 *
 * - Email is required + unique per academy + validated (frontend registry
 *   `vinta:teacher-emails:v1`, keyed by teacher id, academy-scoped).
 * - Class header shows name + email + phone (email/phone fall back to
 *   "Not set" — never "— — —").
 */

export interface TeacherEmailRecord {
  teacherId: string
  academyId: string
  email: string
  updatedAt: string
}

const EMAIL_KEY = 'vinta:teacher-emails:v1'

function loadAll(): Record<string, TeacherEmailRecord> {
  try {
    const raw = localStorage.getItem(EMAIL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, TeacherEmailRecord>): void {
  try {
    localStorage.setItem(EMAIL_KEY, JSON.stringify(map))
  } catch {
    // Storage blocked — email still applies for this tab read cycle
  }
}

function currentAcademy(): string {
  // Token keys use the vinta_ prefix (see constants: vinta_academy_id).
  // Also probe legacy keys so uniqueness still scopes per academy.
  try {
    return (
      localStorage.getItem('vinta_academy_id') ??
      localStorage.getItem('vinta:academy-id') ??
      localStorage.getItem('academy_id') ??
      localStorage.getItem('academyId') ??
      ''
    )
  } catch {
    return ''
  }
}

/** Simple RFC-5322-ish check — good enough for front-desk input. */
export function isValidEmail(email: string): boolean {
  const v = (email || '').trim()
  if (!v || v.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

export function getTeacherEmail(teacherId: string): string | null {
  if (!teacherId) return null
  return loadAll()[teacherId]?.email ?? null
}

/**
 * Validate + store an email. Returns an error string, or null on success.
 * - required, valid format
 * - unique per academy (case-insensitive), excluding this teacher id
 */
export function setTeacherEmail(teacherId: string, email: string): string | null {
  const v = (email || '').trim()
  if (!v) return 'Email is required.'
  if (!isValidEmail(v)) return 'Enter a valid email address.'
  if (!teacherId) return 'Teacher Not set.'
  const academyId = currentAcademy()
  const lower = v.toLowerCase()
  const clash = Object.values(loadAll()).find(
    (r) => r.teacherId !== teacherId &&
      r.email.toLowerCase() === lower &&
      (!academyId || !r.academyId || r.academyId === academyId),
  )
  if (clash) return 'Email already used by another teacher.'
  const all = loadAll()
  all[teacherId] = { teacherId, academyId, email: v, updatedAt: new Date().toISOString() }
  saveAll(all)
  return null
}

/** All stored emails (for uniqueness checks without a teacher context). */
export function listTeacherEmails(): TeacherEmailRecord[] {
  return Object.values(loadAll())
}
