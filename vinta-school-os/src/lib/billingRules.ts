/**
 * Vinta School OS — Billing Rules, as the server records them
 *
 * The Billing Rules card in Settings used to be a set of localStorage
 * preferences with week-versioning: a flip was staged and took effect the
 * following Monday, on the strength of a change log the browser kept for
 * itself. The server was never told. That meant the rules that actually
 * decided who was charged were the columns on `academy_settings` — which
 * every money path reads live (see app/services/academy_rules.py) — and the
 * screen called "Billing Rules" was a separate, unconnected answer to the
 * same question. An owner could turn "charge for missed sessions" off and
 * an absence would still spend a credit, because the only party that counts
 * had not been asked.
 *
 * There is one copy now, and it is the server's. This module reads it, caches
 * the last answer, and writes changes back.
 *
 * Why a cache at all: several of these rules are read synchronously where the
 * answer is printed — "ABSENT consumes 1" is text on a button, and the void
 * flow has to know which rows were charged before it acts. Making those call
 * sites async to fetch a boolean would put a network round trip inside a
 * render for an answer that changes a few times a year. So the cache holds
 * the last answer the server gave, and callers read it.
 *
 * A cache is not a source of truth, and this one is not allowed to become
 * one: it is filled on sign-in, replaced on every write, and never consulted
 * for a decision the server makes. Where it has no answer it falls back to
 * the default the model column declares, which is the same answer the server
 * gives for an academy whose settings row has never been written.
 */

import api from './api'

// ─────────────────────────────────────────────
// The rules
// ─────────────────────────────────────────────

/**
 * Every toggle the server stores, with the default its column declares.
 *
 * These names are the wire names. They are snake_case and read like the
 * server's own vocabulary on purpose — a translation layer here would be one
 * more place for the two sides to drift apart, and the drift is what this
 * whole module exists to remove.
 */
export type BillingRuleField =
  | 'absence_consumes_credit'
  | 'count_gap_sessions'
  | 'restore_credits_on_cancellation'
  | 'free_session_auto_present'
  | 'share_credits_across_groups'
  | 'early_payment_on_extra_sessions'
  | 'allow_makeups_default'

export const BILLING_RULE_DEFAULTS: Record<BillingRuleField, boolean> = {
  // Toggle 1 — a missed session still spends a credit.
  absence_consumes_credit: true,
  // Toggle 2 — sessions missed while overdue are charged against the next plan.
  count_gap_sessions: false,
  // Toggle 5 — a cancelled class gives back a credit it already charged.
  restore_credits_on_cancellation: false,
  // Toggle 6 — a free session fills its own register.
  free_session_auto_present: true,
  // Toggle 7 — one credit pool spans groups of the same subject.
  share_credits_across_groups: false,
  // Toggle 8 — ask for renewal as soon as extra sessions drain the credits.
  early_payment_on_extra_sessions: true,
  // Default for a new group: absences bank a makeup instead of burning the seat.
  allow_makeups_default: true,
}

export const BILLING_RULE_FIELDS = Object.keys(BILLING_RULE_DEFAULTS) as BillingRuleField[]

let cache: Record<BillingRuleField, boolean> = { ...BILLING_RULE_DEFAULTS }
let hydrated = false

/**
 * Read the academy's rules into the cache and hand them back.
 *
 * Called at sign-in and by the Settings card. A refusal is not an error worth
 * showing anyone at startup: the endpoint is owner-only, so staff get a 403
 * every time, and the defaults above are the honest answer for someone who
 * cannot read the row. Startup failures are swallowed deliberately — nothing
 * in the app should fail to open because a settings read did not land — but
 * the caller that *did* ask for them still gets a rejection, because there a
 * failed read has to be said out loud rather than silently shown as an answer.
 */
export async function hydrateBillingRules(): Promise<Record<BillingRuleField, boolean>> {
  const { data } = await api.get('/settings/billing-config')
  cache = pickRules(data)
  hydrated = true
  return { ...cache }
}

/** The cached rules, copied so a caller cannot write into the cache by accident. */
export function snapshotBillingRules(): Record<BillingRuleField, boolean> {
  return { ...cache }
}

/** Read the booleans out of a settings payload, ignoring anything else. */
function pickRules(data: unknown): Record<BillingRuleField, boolean> {
  const next = { ...cache }
  const row = data as Record<string, unknown> | null
  for (const field of BILLING_RULE_FIELDS) {
    const value = row?.[field]
    if (typeof value === 'boolean') next[field] = value
  }
  return next
}

/** The cached answer for one rule. */
export function getBillingRule(field: BillingRuleField): boolean {
  return cache[field]
}

/** True once a read has succeeded — i.e. these are the server's answers. */
export function areBillingRulesLoaded(): boolean {
  return hydrated
}

/**
 * Change one rule, on the server.
 *
 * Writes immediately rather than staging: the server reads its columns live
 * at each decision, so a staged promise ("from next Monday") would be a
 * description of behaviour the app does not have. What the rules do guarantee
 * is that a change cannot rewrite the past — every decision is made when a
 * class is finalised, not when it was scheduled.
 *
 * Throws on refusal. The caller shows the server's own sentence: a 403 means
 * the owner role, and a 400 names the field it did not like.
 */
export async function setBillingRule(field: BillingRuleField, value: boolean): Promise<void> {
  await api.put('/settings/billing-config', { [field]: value })
  // The write response is an acknowledgement, not the row, so the value is
  // cached from what was sent. That is safe here only because the request
  // carries a real boolean and the server rejects anything it cannot read as
  // one — a 200 means the column now holds exactly this.
  cache = { ...cache, [field]: value }
  hydrated = true
}

// ─────────────────────────────────────────────
// The questions the desk actually asks
// ─────────────────────────────────────────────

/**
 * Toggle 1 — does an absence spend a credit?
 *
 * Read in the register, the void flow and the cancellation confirmation, all
 * of which have to say what will happen before it happens.
 */
export function getAbsenceConsumesCredit(): boolean {
  return getBillingRule('absence_consumes_credit')
}

/** Toggle 6 — does a free session fill its own register? */
export function isFreeSessionAutoPresent(): boolean {
  return getBillingRule('free_session_auto_present')
}

// ─────────────────────────────────────────────
// Guest swap window
//
// SAME_DAY: link only within the same calendar day (Algiers).
// OPEN: 7-day rolling, closes on payout PAID, hard cap 30d.
//
// This one has no column on the server, so it stays a preference of this
// desk, and the Settings card says so. It is not staged for Monday either —
// there was never anything to stage it into.
// ─────────────────────────────────────────────

export type SwapLinkWindow = 'SAME_DAY' | 'OPEN'

const SWAPWIN_KEY = 'vinta:billing-toggles:swapwin'

export function getSwapWindow(): SwapLinkWindow {
  try {
    const raw = localStorage.getItem(SWAPWIN_KEY)
    return raw === 'OPEN' ? 'OPEN' : 'SAME_DAY'
  } catch {
    return 'SAME_DAY'
  }
}

export function setSwapWindow(value: SwapLinkWindow): void {
  try {
    localStorage.setItem(SWAPWIN_KEY, value)
  } catch {
    // Storage blocked — the choice applies for this tab's lifetime only
  }
}

// ─────────────────────────────────────────────
// Debt-first ledger
//
// Front-desk check-in with no subscription writes an unpaid row here. This
// is genuinely client-side: there is no endpoint that records "this student
// attended with nothing to pay from", and the alternative — refusing the
// check-in — loses the attendance instead of recording the debt.
// ─────────────────────────────────────────────

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
