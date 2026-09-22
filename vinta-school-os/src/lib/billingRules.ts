/**
 * Vinta School OS — T5 Credits + Debt-First + N + Toggle 1 (frontend-only)
 * Backend frozen: no absenceConsumesCredit column, no unpaid/debt endpoints.
 * Week-versioning lives in localStorage; backend credit motion is untouched.
 *
 * - CourseGroup.creditsPerCycle: int 1-20 (4 standard, 8 = 2000Da example).
 *   Snapshot to Subscription.totalCredits happens backend-side at payment.
 * - PRESENT in own group decrements immediately (backend check-in path).
 * - ABSENT consumes 1 credit at End-Class finalize when Toggle 1
 *   (absenceConsumesCredit, default true) is ON for the effective week;
 *   when OFF, ABSENT never consumes.
 * - Front-desk CAN check-in with no subscription → unpaid debt rows
 *   (frontend-only `vinta:credit-debt:v1`).
 * - On Record Payment: remaining = N − unpaidDebtCount (oldest first).
 *   Debt 4 + pay N=4 → 0 DEPLETED. Debt 4 + pay N=8 → 4 remaining.
 * - Toggles effective next Monday 00:00 (week-versioning, no retroactive).
 */

// ── Toggle 1: absenceConsumesCredit (default true) ──

export interface BillingToggleVersion {
  value: boolean
  /** ISO of the Monday 00:00 this version takes effect */
  effectiveFrom: string
  updatedAt: string
}

const TOGGLE_KEY = 'vinta:billing-toggles:v1'

interface ToggleStore {
  absenceConsumesCredit: BillingToggleVersion[]
}

function loadToggles(): ToggleStore {
  try {
    const raw = localStorage.getItem(TOGGLE_KEY)
    if (!raw) return { absenceConsumesCredit: [] }
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { absenceConsumesCredit: [] }
    const list = (parsed as ToggleStore).absenceConsumesCredit
    return { absenceConsumesCredit: Array.isArray(list) ? list : [] }
  } catch {
    return { absenceConsumesCredit: [] }
  }
}

function saveToggles(store: ToggleStore): void {
  try {
    localStorage.setItem(TOGGLE_KEY, JSON.stringify(store))
  } catch {
    // Storage blocked — version still applies for this tab read cycle
  }
}

/** Next Monday 00:00 local from `from` (a future Monday stays as-is). */
export function nextMondayMidnight(from: Date = new Date()): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=Sun … 1=Mon
  let add = (8 - dow) % 7
  if (add === 0) {
    // Today IS Monday 00:00 exactly → effective now; otherwise next Monday.
    add = from.getHours() === 0 && from.getMinutes() === 0 &&
      from.getSeconds() === 0 && from.getMilliseconds() === 0 ? 0 : 7
  }
  d.setDate(d.getDate() + add)
  return d
}

/**
 * Stage Toggle 1 — takes effect NEXT Monday 00:00 (no retroactive).
 * Returns the staged version.
 */
export function setAbsenceConsumesCredit(value: boolean, now: Date = new Date()): BillingToggleVersion {
  const store = loadToggles()
  const version: BillingToggleVersion = {
    value,
    effectiveFrom: nextMondayMidnight(now).toISOString(),
    updatedAt: now.toISOString(),
  }
  store.absenceConsumesCredit.push(version)
  // Keep the log bounded.
  if (store.absenceConsumesCredit.length > 52) {
    store.absenceConsumesCredit = store.absenceConsumesCredit.slice(-52)
  }
  saveToggles(store)
  return version
}

/**
 * Effective Toggle 1 for a reference date (default today).
 * No version yet → default true. Only versions with effectiveFrom <= ref apply.
 */
export function getAbsenceConsumesCredit(ref: Date = new Date()): boolean {
  const store = loadToggles()
  const refMs = ref.getTime()
  let value = true // default true
  let best = -Infinity
  for (const v of store.absenceConsumesCredit) {
    const eff = new Date(v.effectiveFrom).getTime()
    if (Number.isNaN(eff) || eff > refMs) continue
    if (eff >= best) {
      best = eff
      value = v.value
    }
  }
  return value
}

/** Pending (future-dated) Toggle 1 versions — shown as "takes effect Mon". */
export function getPendingToggleVersions(now: Date = new Date()): BillingToggleVersion[] {
  const nowMs = now.getTime()
  return loadToggles().absenceConsumesCredit
    .filter((v) => new Date(v.effectiveFrom).getTime() > nowMs)
    .sort((a, b) => +new Date(a.effectiveFrom) - +new Date(b.effectiveFrom))
}

/** Latest staged version regardless of date (for the Settings label). */
export function getLatestToggleVersion(): BillingToggleVersion | null {
  const list = loadToggles().absenceConsumesCredit
  if (list.length === 0) return null
  return [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0]
}

// ── Toggle 6: freeSessionAutoPresent (default true) ──
// When true, a FREE session auto-marks rows PRESENT and skips tracking.
// When false, rows track normally for records (still zero billing).
// Same next-Monday week-versioning as Toggle 1.

interface Toggle6Store {
  freeSessionAutoPresent: BillingToggleVersion[]
}

const TOGGLE6_KEY = 'vinta:billing-toggles:t6'

function loadToggle6(): Toggle6Store {
  try {
    const raw = localStorage.getItem(TOGGLE6_KEY)
    if (!raw) return { freeSessionAutoPresent: [] }
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { freeSessionAutoPresent: [] }
    const list = (parsed as Toggle6Store).freeSessionAutoPresent
    return { freeSessionAutoPresent: Array.isArray(list) ? list : [] }
  } catch {
    return { freeSessionAutoPresent: [] }
  }
}

function saveToggle6(store: Toggle6Store): void {
  try {
    localStorage.setItem(TOGGLE6_KEY, JSON.stringify(store))
  } catch {
    // Storage blocked — version still applies for this tab read cycle
  }
}

/** Stage Toggle 6 — takes effect NEXT Monday 00:00 (no retroactive). */
export function setToggle6(value: boolean, now: Date = new Date()): BillingToggleVersion {
  const store = loadToggle6()
  const version: BillingToggleVersion = {
    value,
    effectiveFrom: nextMondayMidnight(now).toISOString(),
    updatedAt: now.toISOString(),
  }
  store.freeSessionAutoPresent.push(version)
  if (store.freeSessionAutoPresent.length > 52) {
    store.freeSessionAutoPresent = store.freeSessionAutoPresent.slice(-52)
  }
  saveToggle6(store)
  return version
}

/** Effective Toggle 6 for a reference date. No version yet → default true. */
export function getToggle6(ref: Date = new Date()): boolean {
  const refMs = ref.getTime()
  let value = true // default true
  let best = -Infinity
  for (const v of loadToggle6().freeSessionAutoPresent) {
    const eff = new Date(v.effectiveFrom).getTime()
    if (Number.isNaN(eff) || eff > refMs) continue
    if (eff >= best) {
      best = eff
      value = v.value
    }
  }
  return value
}

/** Pending (future-dated) Toggle 6 versions. */
export function getPendingToggle6(now: Date = new Date()): BillingToggleVersion[] {
  const nowMs = now.getTime()
  return loadToggle6().freeSessionAutoPresent
    .filter((v) => new Date(v.effectiveFrom).getTime() > nowMs)
    .sort((a, b) => +new Date(a.effectiveFrom) - +new Date(b.effectiveFrom))
}

/** Latest staged Toggle 6 regardless of date (for the Settings label). */
export function getLatestToggle6(): BillingToggleVersion | null {
  const list = loadToggle6().freeSessionAutoPresent
  if (list.length === 0) return null
  return [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0]
}

// ── T10 final toggles (frontend-only, same next-Monday versioning) ──
// - allowMakeups (default false)
// - shareCreditsAcrossGroups (default false)
// - earlyPaymentOnExtraSessions (default true)
// absenceConsumesCredit (T5) + freeSessionAutoPresent (T6) stay separate above.

export type FinalToggleKey = 'allowMakeups' | 'shareCreditsAcrossGroups' | 'earlyPaymentOnExtraSessions'

export const FINAL_TOGGLE_DEFAULTS: Record<FinalToggleKey, boolean> = {
  allowMakeups: false,
  shareCreditsAcrossGroups: false,
  earlyPaymentOnExtraSessions: true,
}

interface FinalToggleStore {
  versions: Record<FinalToggleKey, BillingToggleVersion[]>
}

const FINAL_KEY = 'vinta:billing-toggles:final'

function loadFinal(): FinalToggleStore {
  const empty: FinalToggleStore = {
    versions: { allowMakeups: [], shareCreditsAcrossGroups: [], earlyPaymentOnExtraSessions: [] },
  }
  try {
    const raw = localStorage.getItem(FINAL_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<FinalToggleStore>
    if (typeof parsed !== 'object' || parsed === null || !parsed.versions) return empty
    for (const k of Object.keys(empty.versions) as FinalToggleKey[]) {
      const list = (parsed.versions as Record<string, unknown>)[k]
      empty.versions[k] = Array.isArray(list) ? (list as BillingToggleVersion[]) : []
    }
    return empty
  } catch {
    return empty
  }
}

function saveFinal(store: FinalToggleStore): void {
  try {
    localStorage.setItem(FINAL_KEY, JSON.stringify(store))
  } catch {
    // Storage blocked — version still applies for this tab read cycle
  }
}

/** Stage a final toggle — takes effect NEXT Monday 00:00 (no retroactive). */
export function setFinalToggle(key: FinalToggleKey, value: boolean, now: Date = new Date()): BillingToggleVersion {
  const store = loadFinal()
  const version: BillingToggleVersion = {
    value,
    effectiveFrom: nextMondayMidnight(now).toISOString(),
    updatedAt: now.toISOString(),
  }
  store.versions[key].push(version)
  if (store.versions[key].length > 52) {
    store.versions[key] = store.versions[key].slice(-52)
  }
  saveFinal(store)
  return version
}

/** Effective value for a reference date. No version yet → spec default. */
export function getFinalToggle(key: FinalToggleKey, ref: Date = new Date()): boolean {
  const refMs = ref.getTime()
  let value = FINAL_TOGGLE_DEFAULTS[key]
  let best = -Infinity
  for (const v of loadFinal().versions[key]) {
    const eff = new Date(v.effectiveFrom).getTime()
    if (Number.isNaN(eff) || eff > refMs) continue
    if (eff >= best) {
      best = eff
      value = v.value
    }
  }
  return value
}

/** Pending (future-dated) versions for a key. */
export function getPendingFinal(key: FinalToggleKey, now: Date = new Date()): BillingToggleVersion[] {
  const nowMs = now.getTime()
  return loadFinal().versions[key]
    .filter((v) => new Date(v.effectiveFrom).getTime() > nowMs)
    .sort((a, b) => +new Date(a.effectiveFrom) - +new Date(b.effectiveFrom))
}

/** Latest staged version regardless of date (for the Settings label). */
export function getLatestFinal(key: FinalToggleKey): BillingToggleVersion | null {
  const list = loadFinal().versions[key]
  if (list.length === 0) return null
  return [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0]
}

// ── T10 swapLinkWindow: SAME_DAY (default) vs OPEN ──
// SAME_DAY: link only within the same calendar day (Algiers).
// OPEN: 7-day rolling window, closes on payout PAID, hard cap 30d.

export type SwapLinkWindow = 'SAME_DAY' | 'OPEN'

export interface SwapWindowVersion {
  value: SwapLinkWindow
  effectiveFrom: string
  updatedAt: string
}

const SWAPWIN_KEY = 'vinta:billing-toggles:swapwin'

function loadSwapWin(): SwapWindowVersion[] {
  try {
    const raw = localStorage.getItem(SWAPWIN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSwapWin(list: SwapWindowVersion[]): void {
  try {
    localStorage.setItem(SWAPWIN_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked — version still applies for this tab read cycle
  }
}

/** Stage swapLinkWindow — takes effect NEXT Monday 00:00 (no retroactive). */
export function setSwapWindow(value: SwapLinkWindow, now: Date = new Date()): SwapWindowVersion {
  const list = loadSwapWin()
  const version: SwapWindowVersion = {
    value,
    effectiveFrom: nextMondayMidnight(now).toISOString(),
    updatedAt: now.toISOString(),
  }
  list.push(version)
  saveSwapWin(list.length > 52 ? list.slice(-52) : list)
  return version
}

/** Effective window for a reference date. No version yet → SAME_DAY. */
export function getSwapWindow(ref: Date = new Date()): SwapLinkWindow {
  const refMs = ref.getTime()
  let value: SwapLinkWindow = 'SAME_DAY'
  let best = -Infinity
  for (const v of loadSwapWin()) {
    const eff = new Date(v.effectiveFrom).getTime()
    if (Number.isNaN(eff) || eff > refMs) continue
    if (eff >= best) {
      best = eff
      value = v.value
    }
  }
  return value
}

/** Pending (future-dated) window versions. */
export function getPendingSwapWindow(now: Date = new Date()): SwapWindowVersion[] {
  const nowMs = now.getTime()
  return loadSwapWin()
    .filter((v) => new Date(v.effectiveFrom).getTime() > nowMs)
    .sort((a, b) => +new Date(a.effectiveFrom) - +new Date(b.effectiveFrom))
}

/** Latest staged window regardless of date (for the Settings label). */
export function getLatestSwapWindow(): SwapWindowVersion | null {
  const list = loadSwapWin()
  if (list.length === 0) return null
  return [...list].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0]
}

// ── Debt-first ledger (frontend-only unpaid rows) ──

export interface DebtRow {
  id: string
  studentId: string
  studentName: string
  groupId: string
  groupName: string
  sessionId: string
  sessionDate: string
  kind: 'PRESENT_UNPAID' | 'ABSENT_UNPAID'
  recordedAt: string
  clearedByPaymentId?: string
}

const DEBT_KEY = 'vinta:credit-debt:v1'

function loadDebt(): DebtRow[] {
  try {
    const raw = localStorage.getItem(DEBT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveDebt(rows: DebtRow[]): void {
  try {
    localStorage.setItem(DEBT_KEY, JSON.stringify(rows))
  } catch {
    // Storage blocked — ledger still applies for this tab read cycle
  }
}

function debtUid(): string {
  return `debt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function listDebtRows(): DebtRow[] {
  return loadDebt()
}

/** All void restores live here — see voidedSessions.listVoidRestores. */
export { listVoidRestores as listVoidRestoreSessions } from './voidedSessions'

/** Uncleared (oldest first) debt for a student+group — payment clears FIFO. */
export function getUnpaidDebt(studentId: string, groupId: string): DebtRow[] {
  if (!studentId || !groupId) return []
  return loadDebt()
    .filter((d) => d.studentId === studentId && d.groupId === groupId && !d.clearedByPaymentId)
    .sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt))
}

export function getUnpaidDebtCount(studentId: string, groupId: string): number {
  return getUnpaidDebt(studentId, groupId).length
}

/** Record one unpaid row (front-desk check-in with no subscription). */
export function recordUnpaidDebt(input: Omit<DebtRow, 'id' | 'recordedAt'> & { recordedAt?: string }): DebtRow {
  const all = loadDebt()
  const row: DebtRow = {
    ...input,
    id: debtUid(),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  }
  all.push(row)
  saveDebt(all)
  return row
}

/**
 * Debt-first settlement preview: remaining = N − unpaidDebtCount (oldest first).
 * Backend creates the Subscription(total=N); this ledger only marks cleared rows.
 */
export function previewDebtSettlement(unpaidCount: number, n: number): { remaining: number; cleared: number; stillOwed: number } {
  const count = Math.max(0, Math.floor(unpaidCount))
  const total = Math.max(0, Math.floor(n))
  const cleared = Math.min(count, total)
  return { remaining: total - cleared, cleared, stillOwed: count - cleared }
}

/** Mark the oldest `count` rows cleared by a payment (FIFO). Returns cleared rows. */
export function clearDebtFifo(studentId: string, groupId: string, count: number, paymentId: string): DebtRow[] {
  if (!studentId || !groupId || count <= 0) return []
  const all = loadDebt()
  const targets = all
    .filter((d) => d.studentId === studentId && d.groupId === groupId && !d.clearedByPaymentId)
    .sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt))
    .slice(0, count)
  const ids = new Set(targets.map((t) => t.id))
  const next = all.map((d) => (ids.has(d.id) ? { ...d, clearedByPaymentId: paymentId } : d))
  saveDebt(next)
  return targets.map((t) => ({ ...t, clearedByPaymentId: paymentId }))
}

// ── N validation ──

/** creditsPerCycle must be an int 1-20 (4 standard). Null when valid, reason when not. */
export function validateCreditsPerCycle(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isInteger(n)) return 'N must be a whole number.'
  if (n < 1 || n > 20) return 'N must be 1–20.'
  return null
}
