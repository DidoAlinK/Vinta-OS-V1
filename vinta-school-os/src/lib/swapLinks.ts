/**
 * Vinta School OS — T4 Auto-Link Guest Swap link store (frontend-only)
 * Backend frozen: no linkedSessionId / PRESENT_VIA_SWAP / billingSuppressed
 * columns exist. Links live in localStorage; rosters overlay them.
 *
 * - Original side: ABSENT -> PRESENT_VIA_SWAP (linkedSessionId=swapId,
 *   correctedBy, correctedAt). No backend call — the Mon ABSENT check-in
 *   already consumed exactly 1 credit; re-submitting would double-charge.
 * - Swap side: PRESENT + isGroupSwap + billingSuppressed + linkedSessionId.
 *   Suppression is achieved by creating the row via
 *   POST /attendance/add-to-session (no billing side effects) instead of
 *   POST /attendance/check-in. Hence 1 credit TOTAL.
 * - Linked absence NEVER creates a makeup token (frontend rule: linked rows
 *   are excluded from makeup display/counts; backend's row is untouched).
 */

export interface SwapLink {
  id: string
  studentId: string
  originalSessionId: string
  swapSessionId: string
  /** e.g. "Mon 14:00" — original side label for the toast */
  originalLabel: string
  /** e.g. "Wed 10:00" — swap side label for the original row */
  swapLabel: string
  correctedBy: string
  correctedAt: string
  billingSuppressed: true
  makeupSuppressed: true
}

const STORAGE_KEY = 'vinta:swap-links:v1'

function loadAll(): SwapLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(links: SwapLink[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
  } catch {
    // Storage blocked — links still apply in-memory for this read cycle
  }
}

function uid(): string {
  return `swap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function listSwapLinks(): SwapLink[] {
  return loadAll()
}

/** Active link where this session+student is the SWAP (suppressed) side. */
export function getLinkBySwap(studentId: string, swapSessionId: string): SwapLink | null {
  if (!studentId || !swapSessionId) return null
  return loadAll().find(
    (l) => l.studentId === studentId && l.swapSessionId === swapSessionId,
  ) ?? null
}

/** Active link where this session+student is the ORIGINAL (via-swap) side. */
export function getLinkByOriginal(studentId: string, originalSessionId: string): SwapLink | null {
  if (!studentId || !originalSessionId) return null
  return loadAll().find(
    (l) => l.studentId === studentId && l.originalSessionId === originalSessionId,
  ) ?? null
}

/** Any link touching this student (either side) — used to prevent double-link. */
export function getLinksForStudent(studentId: string): SwapLink[] {
  if (!studentId) return []
  return loadAll().filter((l) => l.studentId === studentId)
}

export function createSwapLink(input: Omit<SwapLink, 'id' | 'correctedAt' | 'billingSuppressed' | 'makeupSuppressed'> & {
  correctedAt?: string
}): SwapLink {
  const all = loadAll()
  // One swap session per guest row; one original per absence — replace stale.
  const pruned = all.filter(
    (l) => !(l.studentId === input.studentId && l.swapSessionId === input.swapSessionId),
  )
  const link: SwapLink = {
    ...input,
    id: uid(),
    correctedAt: input.correctedAt ?? new Date().toISOString(),
    billingSuppressed: true,
    makeupSuppressed: true,
  }
  pruned.push(link)
  saveAll(pruned)
  return link
}

/** Undo: remove the link. Caller decides billing (pre-submit: row bills as extra). */
export function removeSwapLink(id: string): void {
  if (!id) return
  saveAll(loadAll().filter((l) => l.id !== id))
}

export function removeLinkBySwap(studentId: string, swapSessionId: string): void {
  if (!studentId || !swapSessionId) return
  saveAll(
    loadAll().filter(
      (l) => !(l.studentId === studentId && l.swapSessionId === swapSessionId),
    ),
  )
}

/** Short label for toasts/badges: "Mon 14:00". Falls back to date/time. */
export function sessionLabel(dateStr: string, timeStr: string): string {
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`)
    if (Number.isNaN(d.getTime())) return `${dateStr} ${timeStr}`.trim()
    const day = d.toLocaleDateString('en-US', { weekday: 'short' })
    const t = (timeStr || '').slice(0, 5)
    return `${day} ${t}`
  } catch {
    return `${dateStr} ${timeStr}`.trim()
  }
}
