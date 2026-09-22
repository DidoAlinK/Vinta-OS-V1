/**
 * Vinta School OS — T3 Hamburger (instance-only, frontend-only)
 * Single entry point (☰) on every session card/row. Contextual by lifecycle:
 * - SCHEDULED: Start Class, Edit THIS instance, Reschedule, Cancel Class,
 *   Teacher Absent, Mark NEXT as Free, Show Finances, View Log
 * - IN_PROGRESS: Extend +30, End Class, Edit THIS instance, Mark NEXT as Free,
 *   Void Live Session [Owner PIN], Add Compensatory Session, Show Finances, View Log
 * - CONDUCTED/CANCELLED: Show Finances, View Log (read-only)
 * Rule: Edit/Reschedule/Room touch THIS session only — never series, price, N,
 * template. Series edits live in the Classes page. Backend frozen: only existing
 * endpoints (PATCH/DELETE/POST /sessions, /billing/revenue, /billing/payouts,
 * /settings/activity-log, /settings/profile, /settings/staff, /auth/verify-pin).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Menu,
  Play,
  Pencil,
  CalendarClock,
  XCircle,
  UserX,
  Gift,
  Wallet,
  ScrollText,
  Timer,
  CheckCircle2,
  Ban,
  Plus,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { formatDa } from '../../lib/formatters'
import { isGrossProfitEnabled } from '../../lib/grossProfit'
import { getAbsenceConsumesCredit } from '../../lib/billingRules'
import { recordVoidRestore } from '../../lib/voidedSessions'
import type { Session } from '../../types/class'
import { isSessionFree } from '../../lib/freeSessions'
import {
  findConflicts,
  getScheduleDef,
  getSessionOrigin,
  saveScheduleDef,
} from '../../lib/scheduleDefs'
import {
  getFreeMark,
  getLifecycleRecord,
  isNextFreeMarked,
  markNextFree,
  unmarkNextFree,
  updateLifecycleRecord,
  type LifecycleStatus,
} from '../../lib/sessionLifecycle'

// ============================================
// Props
// ============================================

export interface SessionMenuProps {
  session: Session
  status: LifecycleStatus
  /** All loaded sessions — T8 edit-scope siblings + conflict checks */
  sessions?: Session[]
  onStart?: (session: Session) => void
  onFinish?: (session: Session) => void
  onChanged?: () => void
}

type ModalKind =
  | 'edit'
  | 'resched'
  | 'cancel'
  | 'absent'
  | 'free'
  | 'fin'
  | 'log'
  | 'void'
  | 'comp'

// ============================================
// Shared modal shell
// ============================================

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={cn(
          'w-full mx-4 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
          'flex flex-col max-h-[80vh]',
          wide ? 'max-w-lg' : 'max-w-sm',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <h2
            className="text-base font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'text-[var(--text)] outline-none',
  'focus:ring-2 focus:ring-[var(--gold)]/30',
  'disabled:opacity-50',
)

const primaryBtnCls = cn(
  'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
  'hover:opacity-90 active:scale-[0.98]',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-all duration-150',
)

const dangerBtnCls = cn(
  'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
  'bg-[var(--red)] hover:brightness-110 active:scale-[0.98]',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-all duration-150',
)

// ============================================
// T8 Edit scope: WEEKLY offers This / This+following (split) / All series;
// TEMPORARY edits directly, no prompt. Instance fields: date + times only
// (PATCH — scheduled only). Series ops touch future non-CONDUCTED sessions.
// ============================================

type EditScope = 'single' | 'following' | 'all'

function EditSessionModal({ session, sessions, locked, onClose, onChanged }: {
  session: Session
  sessions?: Session[]
  locked: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const origin = getSessionOrigin(session)
  const isWeekly = origin.kind === 'WEEKLY'
  const [date, setDate] = useState(session.date)
  const [start, setStart] = useState(session.start_time)
  const [end, setEnd] = useState(session.end_time)
  const [scope, setScope] = useState<EditScope>('single')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Series siblings: same definition (or same class+slot fallback), future,
  // non-CONDUCTED. Cancelled rows stay cancelled — never regen'd.
  const siblings = useMemo(() => {
    if (!isWeekly || !sessions) return []
    const sameDef = origin.defId
      ? sessions.filter((s: Session) => getSessionOrigin(s).defId === origin.defId)
      : sessions.filter((s: Session) =>
        s.class_id === session.class_id &&
        s.start_time === session.start_time &&
        s.end_time === session.end_time &&
        getSessionOrigin(s).kind === 'WEEKLY',
      )
    return sameDef
      .filter((s: Session) => {
        if (s.id === session.id) return false
        if (s.status === 'completed') return false
        if (s.status === 'cancelled') return false
        return s.date >= session.date
      })
      .sort((a: Session, b: Session) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  }, [isWeekly, sessions, origin.defId, session])

  const inScope = useMemo(() => {
    if (scope === 'single') return []
    if (scope === 'following') {
      // This + following: split the definition at THIS date — same slot,
      // date >= this date (definition untouched; times shift forward only).
      return siblings.filter((s: Session) => s.date >= session.date)
    }
    return siblings // all series: every future non-CONDUCTED sibling
  }, [scope, siblings, session.date])

  const handleSave = useCallback(async () => {
    if (locked) return
    if (!date || !start || !end) { setError('Date, start and end are required.'); return }
    if (end <= start) { setError('End time must be after start time.'); return }
    // T8 conflict BLOCK (room OR teacher vs non-CANCELLED) for the edited date.
    const conflicts = sessions ? findConflicts(sessions, {
      date, start, end,
      teacherId: session.teacher_id,
      roomId: session.classroom_id ?? null,
      ignoreId: session.id,
    }) : []
    if (conflicts.length > 0) {
      const kinds = [...new Set(conflicts.map((c) => c.kind))].join(' + ')
      const msg = `Blocked: ${kinds} overlap on ${date}. Pick another room/time.`
      setError(msg)
      toast.error('Edit blocked', msg)
      return
    }
    if (isWeekly && scope !== 'single' && inScope.length === 0) {
      setError('No future sessions in this series to update.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (!isWeekly || scope === 'single') {
        // Cancel-one-occurrence semantics: THIS session only, definition untouched.
        await api.patch(`/sessions/${session.id}`, { date, start_time: start, end_time: end })
        toast.success('Session updated', 'THIS instance only — series untouched.')
      } else {
        // Series PATCH: times shift, dates preserved per occurrence.
        // "This and following" splits at THIS date; "All" regens future non-CONDUCTED.
        let ok = 0
        let failed = 0
        const targets = scope === 'following'
          ? [{ id: session.id, date }, ...inScope.map((s) => ({ id: s.id, date: s.date }))]
          : inScope.map((s) => ({ id: s.id, date: s.date }))
        // When dates move, keep each occurrence's own date; only times shift.
        for (const t of targets) {
          try {
            const payload: Record<string, string> = { start_time: start, end_time: end }
            if (t.id === session.id) payload.date = date
            await api.patch(`/sessions/${t.id}`, payload)
            ok += 1
          } catch {
            failed += 1
          }
        }
        if (scope === 'following' && origin.defId) {
          // Split the definition: future occurrences keep the NEW times.
          const def = getScheduleDef(origin.defId)
          if (def) {
            saveScheduleDef({
              ...def,
              startTime: start,
              endTime: end,
              startsFrom: session.date,
            })
          }
        }
        if (failed > 0) {
          const msg = `${ok} updated, ${failed} failed. Press Retry (failed kept old times).`
          setError(msg)
          toast.warning('Series partially updated', msg)
        } else {
          toast.success(
            scope === 'following' ? 'This + following updated' : 'All series updated',
            `${ok} future session${ok === 1 ? '' : 's'} shifted — CONDUCTED untouched.`,
          )
        }
      }
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? 'Session already started — times locked.'
        : 'Could not save changes. Press Retry.'
      setError(msg)
      toast.error('Update failed', msg)
    } finally {
      setSaving(false)
    }
  }, [locked, date, start, end, sessions, session, isWeekly, scope, inScope, origin.defId, onChanged, onClose])

  return (
    <ModalShell title={isWeekly ? 'Edit weekly series' : 'Edit THIS instance'} onClose={onClose} wide={isWeekly}>
      {locked && (
        <p className="flex items-center gap-2 text-xs text-[var(--gold)] bg-[var(--gold-soft)] rounded-xl px-3 py-2.5 mb-4">
          <Lock size={13} className="shrink-0" />
          Times locked while the class is live. Series edits live in the Classes page.
        </p>
      )}
      {isWeekly && !locked && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Scope</label>
          <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
            {([
              { k: 'single', label: 'This session only' },
              { k: 'following', label: `This + following${inScope.length && scope === 'following' ? ` (${inScope.length + 1})` : ''}` },
              { k: 'all', label: `All series${scope === 'all' && inScope.length ? ` (${inScope.length})` : ''}` },
            ] as Array<{ k: EditScope; label: string }>).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setScope(o.k)}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold transition-all',
                  scope === o.k
                    ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                    : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1.5">
            {scope === 'single'
              ? 'Cancels/moves THIS occurrence only — definition untouched.'
              : scope === 'following'
                ? 'Splits the definition at THIS date — future keeps the new times.'
                : 'Regenerates future non-CONDUCTED — CONDUCTED history untouched.'}
          </p>
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={locked || saving} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Start</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={locked || saving} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">End</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={locked || saving} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--muted)]">Room changes: Classes page (series). THIS modal never touches price, N, or template.</p>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        {!locked && (
          <button onClick={() => void handleSave()} disabled={saving} className={primaryBtnCls}>
            {saving ? 'Saving…' : scope === 'single' || !isWeekly ? 'Save THIS session' : scope === 'following' ? 'Save this + following' : 'Save all series'}
          </button>
        )}
      </div>
    </ModalShell>
  )
}

// ============================================
// Reschedule (date only, PATCH — scheduled only)
// ============================================

function RescheduleModal({ session, onClose, onChanged }: {
  session: Session
  onClose: () => void
  onChanged?: () => void
}) {
  const [date, setDate] = useState(session.date)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!date) { setError('Pick a date.'); return }
    setError(null)
    setSaving(true)
    try {
      await api.patch(`/sessions/${session.id}`, { date })
      toast.success('Session rescheduled', 'THIS instance only — series untouched.')
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? 'Session already started — reschedule locked.'
        : 'Could not reschedule.'
      setError(msg)
      toast.error('Reschedule failed', msg)
    } finally {
      setSaving(false)
    }
  }, [date, session.id, onChanged, onClose])

  return (
    <ModalShell title="Reschedule THIS session" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">New date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} className={inputCls} />
        </div>
        <p className="text-[11px] text-[var(--muted)]">Keeps start/end times. Cancels nothing, moves THIS occurrence only.</p>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        <button onClick={() => void handleSave()} disabled={saving} className={primaryBtnCls}>
          {saving ? 'Moving…' : 'Move THIS session'}
        </button>
      </div>
    </ModalShell>
  )
}

// ============================================
// Danger confirm (Cancel / Teacher Absent — DELETE, scheduled only)
// ============================================

function DangerConfirmModal({ title, body, confirmLabel, session, onClose, onChanged }: {
  title: string
  body: string
  confirmLabel: string
  session: Session
  onClose: () => void
  onChanged?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = useCallback(async () => {
    setError(null)
    setSaving(true)
    try {
      await api.delete(`/sessions/${session.id}`)
      toast.success(title, 'THIS instance only — zero credit impact by construction.')
      onChanged?.()
      onClose()
    } catch {
      const msg = 'Could not cancel. Press Retry.'
      setError(msg)
      toast.error('Cancel failed', msg)
    } finally {
      setSaving(false)
    }
  }, [session.id, title, onChanged, onClose])

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="text-sm text-[var(--text)] leading-relaxed">{body}</p>
      <p className="text-[11px] text-[var(--muted)] mt-2">Series, price, and N are untouched. Cancel is allowed only from SCHEDULED.</p>
      {error && <p className="text-xs text-[var(--red)] mt-3">{error}</p>}
      <div className="mt-4">
        <button onClick={() => void handleConfirm()} disabled={saving} className={dangerBtnCls}>
          {saving ? 'Working…' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}

// ============================================
// Mark NEXT as Free (localStorage flag consumed by T6)
// ============================================

function FreeNextModal({ session, onClose }: {
  session: Session
  onClose: () => void
}) {
  const marked = isNextFreeMarked(session.class_id)
  const handleToggle = useCallback(() => {
    if (marked) {
      unmarkNextFree(session.class_id)
      toast.info('Free flag removed', 'Next session will bill normally.')
    } else {
      // T6 ctx: NEXT = strictly after THIS instance (never self-assign).
      markNextFree(session.class_id, {
        markedSessionId: session.id,
        markedLabel: `${session.date} ${session.start_time}`,
        afterDate: session.date,
        afterTime: session.start_time,
      })
      toast.success('Next session marked free', `${session.class_name} — teacher pays (T6). Stays until the NEXT session is created.`)
    }
    onClose()
  }, [marked, session.class_id, session.class_name, session.date, session.id, session.start_time, onClose])

  return (
    <ModalShell title="Mark NEXT as Free" onClose={onClose}>
      <p className="text-sm text-[var(--text)] leading-relaxed">
        {marked
          ? `Next ${session.class_name} session is currently marked FREE. Undo?`
          : `Teacher says next time free: the NEXT ${session.class_name} session bills 0 and pays 0.`}
      </p>
      <div className="mt-4">
        <button onClick={handleToggle} className={primaryBtnCls}>
          {marked ? 'Undo — bill normally' : 'Mark NEXT free'}
        </button>
      </div>
    </ModalShell>
  )
}

// ============================================
// Show Finances (read-only: revenue + payout for THIS session)
// ============================================

interface PayoutRow {
  session_id: string
  gross_revenue_da?: number
  teacher_cut_da?: number
  commission_type?: string
  status?: string
}

function FinancesModal({ session, onClose }: {
  session: Session
  onClose: () => void
}) {
  const [revenue, setRevenue] = useState<{ total_da: number; count: number } | null>(null)
  const [payout, setPayout] = useState<PayoutRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // T6: frontend free overlay — backend rows may briefly pre-date suppression.
  const free = isSessionFree(session.id)
  const pendingForGroup = getFreeMark(session.class_id)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [revRes, payRes] = await Promise.all([
        api.get('/billing/revenue', { params: { session_id: session.id } }),
        api.get('/billing/payouts'),
      ])
      setRevenue(revRes.data ?? null)
      const list: PayoutRow[] = payRes.data.payouts ?? []
      setPayout(list.find((p) => p.session_id === session.id) ?? null)
    } catch {
      const msg = 'Could not load finances.'
      setError(msg)
      toast.error('Finances failed', `${msg} Press Retry.`)
    } finally {
      setLoading(false)
    }
  }, [session.id])

  useEffect(() => { void load() }, [load])

  // T6 display: free sessions always render 0/0/0 regardless of backend rows.
  // Gross-profit OFF: gross/cut hidden (per-session pay only), status kept.
  const grossOn = isGrossProfitEnabled()
  const dispRevenue = free ? 0 : grossOn ? revenue?.total_da ?? null : null
  const dispCut = free ? 0 : grossOn ? payout?.teacher_cut_da ?? null : null
  const dispStatus = free ? 'FREE — teacher pays' : payout?.status ?? null

  return (
    <ModalShell title={free ? 'Session finances · FREE' : 'Session finances'} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-semibold text-[var(--red)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 transition-all"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {free && (
            <p className="text-xs font-semibold text-[var(--emerald)] bg-[var(--emerald-soft)]/40 rounded-xl px-3 py-2.5">
              🎁 FREE session — teacher pays. Revenue 0 · cut 0 · no credits moved.
            </p>
          )}
          {!free && pendingForGroup && (
            <p className="text-[11px] text-[var(--gold)] bg-[var(--gold-soft)]/50 rounded-xl px-3 py-2">
              NEXT session of this group is marked free — lands when it is created.
            </p>
          )}
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">Revenue (this session)</span>
            <span className="text-sm font-bold text-[var(--text)]">{dispRevenue != null ? formatDa(dispRevenue) : grossOn || free ? 'Not set' : '—'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">Teacher cut</span>
            <span className="text-sm font-bold text-[var(--emerald)]">{dispCut != null ? formatDa(dispCut) : grossOn || free ? 'Not set' : '—'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">Payout status</span>
            <span className="text-xs font-semibold text-[var(--text)]">{dispStatus ?? 'Not set'}</span>
          </div>
          {!grossOn && !free && (
            <p className="text-[11px] text-[var(--muted)]">Gross-profit math is off — turn it on in Billing.</p>
          )}
          {grossOn && !free && payout?.commission_type && (
            <p className="text-[11px] text-[var(--muted)]">Commission: {payout.commission_type}</p>
          )}
          <p className="text-[11px] text-[var(--muted)]">Read-only — THIS session only.</p>
        </div>
      )}
    </ModalShell>
  )
}

// ============================================
// View Log (read-only; backend exposes academy log — no per-session key)
// ============================================

interface LogEntry {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  staff_name: string
}

function LogModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/settings/activity-log', { params: { limit: 20 } })
      setItems(data.activities ?? [])
    } catch {
      const msg = 'Could not load log.'
      setError(msg)
      toast.error('Log failed', `${msg} Press Retry.`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <ModalShell title="View Log" onClose={onClose} wide>
      <p className="text-[11px] text-[var(--muted)] mb-3">Latest academy activity (session-scoped log unavailable — backend frozen).</p>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-semibold text-[var(--red)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 transition-all"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--muted)] text-center py-6">No log entries yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
              <p className="text-xs font-semibold text-[var(--text)] leading-snug">{a.title}</p>
              {a.description && a.description !== a.title && (
                <p className="text-[11px] text-[var(--muted)] mt-0.5 truncate">{a.description}</p>
              )}
              <p className="text-[10px] text-[var(--muted)]/70 mt-1">{a.staff_name}</p>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

// ============================================
// T7 Void Live Session [Owner PIN] — live abort without fake math.
// IN_PROGRESS only. No pro-rata: End Class normally = full pay per formula,
// or Void = CANCELLED(reason=LIVE_VOID), restore ONLY this session's credits,
// mark rows VOIDED. Existing endpoints only (backend frozen).
// ============================================

function VoidModal({ session, onClose, onChanged }: {
  session: Session
  onClose: () => void
  onChanged?: () => void
}) {
  const [pin, setPin] = useState('')
  const [working, setWorking] = useState(false)
  const [confirmArmed, setConfirmArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rosterPreview, setRosterPreview] = useState<number | null>(null)
  const staffName = useAuthStore((s) => s.user?.name ?? 'staff')

  // Preview roster size so the owner sees exactly what gets restored.
  useEffect(() => {
    let cancelled = false
    api.get(`/attendance/roster/${session.id}`)
      .then(({ data }) => {
        if (!cancelled) setRosterPreview((data.roster ?? []).length)
      })
      .catch(() => { if (!cancelled) setRosterPreview(null) })
    return () => { cancelled = true }
  }, [session.id])

  const handleVerify = useCallback(async () => {
    if (pin.length !== 4) return
    setError(null)
    setWorking(true)
    try {
      const prof = await api.get('/settings/profile')
      if (prof.data.role !== 'owner') {
        const msg = `Owner only (you are ${prof.data.role ?? 'staff'}).`
        setError(msg)
        toast.error('Void blocked', msg)
        return
      }
      const staff = await api.get('/settings/staff')
      const owner = (staff.data.staff ?? []).find((u: any) => u.role === 'owner')
      if (!owner) {
        const msg = 'Owner profile Not set.'
        setError(msg)
        toast.error('Void blocked', msg)
        return
      }
      await api.post('/auth/verify-pin', { user_id: owner.id, pin: pin.trim() })
      // PIN accepted — arm the destructive confirm (two-step, no accidents).
      setConfirmArmed(true)
    } catch (err: any) {
      const msg = err?.response?.status === 401 ? 'Invalid PIN.' : 'Verification failed. Press Retry.'
      setError(msg)
      toast.error('Void blocked', msg)
    } finally {
      setWorking(false)
    }
  }, [pin])

  const handleVoid = useCallback(async () => {
    if (!confirmArmed) return
    setError(null)
    setWorking(true)
    try {
      // 1. Snapshot THIS session's roster (charged rows) BEFORE cancelling.
      let rows: Array<{ student_id: string; is_present?: boolean; attendance_status?: string; status?: string; is_group_swap?: boolean }> = []
      try {
        const rRes = await api.get(`/attendance/roster/${session.id}`)
        rows = rRes.data.roster ?? []
      } catch {
        const msg = 'Roster unreadable — void aborted so no credit is lost silently. Press Retry.'
        setError(msg)
        toast.error('Void aborted', msg)
        return
      }

      // 2. Charged = PRESENT rows + ABSENT rows only when Toggle 1 was ON
      //    (backend consumed the seat). Suppressed T4 swap rows never consumed.
      const toggle1 = getAbsenceConsumesCredit(new Date())
      const charged = rows
        .filter((r) => !r.is_group_swap)
        .filter((r) => {
          const st = String((r.attendance_status as string | undefined) ?? r.status ?? (r.is_present ? 'PRESENT' : 'ABSENT')).toUpperCase()
          if (st === 'PRESENT') return true
          return st === 'ABSENT' && toggle1
        })
        .map((r) => r.student_id)
        .filter(Boolean)

      // 3. Cancel THIS session (backend DELETE; zero payout by construction —
      //    finalize is never called, so no PayoutRecord is created).
      await api.delete(`/sessions/${session.id}`)

      // 4. Per-session restore ONLY: +1 for each charged row of THIS session.
      //    Overlay ledger (no restore endpoint exists); other sessions untouched.
      recordVoidRestore({
        sessionId: session.id,
        classId: session.class_id,
        restoredBy: staffName,
        chargedStudentIds: charged,
        rosterSize: rows.length,
      })

      toast.warning(
        'Session voided (LIVE_VOID)',
        `THIS session only: ${charged.length}/${rows.length} credit(s) restored, rows VOIDED, no payout.`,
        { duration: 8000 },
      )
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? 'Session already finalized — void locked.'
        : 'Void failed. Session untouched. Press Retry.'
      setError(msg)
      toast.error('Void failed', msg)
    } finally {
      setWorking(false)
    }
  }, [confirmArmed, session, staffName, onChanged, onClose])

  return (
    <ModalShell title="Void Live Session" onClose={onClose}>
      <p className="flex items-center gap-2 text-xs text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2.5 mb-4">
        <Ban size={13} className="shrink-0" />
        Owner PIN required. Live abort restores THIS session's credits only — no pro-rata.
      </p>
      {!confirmArmed ? (
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Owner PIN"
            className={cn(inputCls, 'text-center tracking-[0.3em]')}
          />
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <button onClick={() => void handleVerify()} disabled={pin.length !== 4 || working} className={dangerBtnCls}>
            {working ? 'Verifying…' : 'Verify Owner PIN'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text)] leading-relaxed">
            Void <strong>{session.class_name}</strong> on {session.date}? This cancels the live
            session{rosterPreview != null ? ` (${rosterPreview} row${rosterPreview === 1 ? '' : 's'} → restore THIS session's credits only)` : ''},
            marks rows VOIDED, creates no payout.
          </p>
          <p className="text-[11px] text-[var(--muted)]">Or End Class normally = full pay per formula. No pro-rata either way.</p>
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <button onClick={() => void handleVoid()} disabled={working} className={dangerBtnCls}>
            {working ? 'Voiding…' : 'Void THIS live session'}
          </button>
          <button
            onClick={() => setConfirmArmed(false)}
            disabled={working}
            className="w-full py-2 rounded-xl text-xs font-medium bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
          >
            Back
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ============================================
// Add Compensatory Session (POST /sessions — whole group, new SCHEDULED)
// ============================================

function CompensatoryModal({ session, sessions, onClose, onChanged }: {
  session: Session
  sessions?: Session[]
  onClose: () => void
  onChanged?: () => void
}) {
  const [date, setDate] = useState(session.date)
  const [start, setStart] = useState(session.start_time)
  const [end, setEnd] = useState(session.end_time)
  const [roomId, setRoomId] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([])
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    setRoomsError(null)
    try {
      const { data } = await api.get('/classrooms')
      setRooms(data.classrooms ?? [])
    } catch {
      setRooms([])
      setRoomsError('Rooms Not set.')
      toast.error('Rooms failed to load', 'Room list Not set. Pick later or press Retry.')
    }
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const conflicts = sessions ? findConflicts(sessions, {
    date, start, end,
    teacherId: session.teacher_id,
    roomId: roomId || null,
  }) : []

  const handleCreate = useCallback(async () => {
    if (!date || !start || !end) { setError('Date, start and end are required.'); return }
    if (end <= start) { setError('End time must be after start time.'); return }
    const blocked = sessions ? findConflicts(sessions, {
      date, start, end,
      teacherId: session.teacher_id,
      roomId: roomId || null,
    }) : []
    if (blocked.length > 0) {
      const kinds = [...new Set(blocked.map((c) => c.kind))].join(' + ')
      const msg = `Blocked: ${kinds} overlap on ${date}. Pick another room/time.`
      setError(msg)
      toast.error('Create blocked', msg)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.post('/sessions', {
        class_id: session.class_id,
        teacher_id: session.teacher_id,
        date,
        start_time: start,
        end_time: end,
        classroom_id: roomId || undefined,
      })
      toast.success('Compensatory session created', 'New SCHEDULED session for the whole group.')
      onChanged?.()
      onClose()
    } catch {
      const msg = 'Could not create session. Press Retry.'
      setError(msg)
      toast.error('Create failed', msg)
    } finally {
      setSaving(false)
    }
  }, [date, start, end, roomId, sessions, session.class_id, session.teacher_id, onChanged, onClose])

  return (
    <ModalShell title="Add Compensatory Session" onClose={onClose}>
      <p className="text-[11px] text-[var(--muted)] mb-3">Creates a new SCHEDULED session for the WHOLE group (pick date/time/room).</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Start</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={saving} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">End</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={saving} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Room (THIS session)</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={saving} className={inputCls}>
            <option value="">— No room —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {roomsError && (
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="mt-1.5 text-[11px] font-semibold text-[var(--gold)] hover:underline"
            >
              {roomsError} Retry
            </button>
          )}
        </div>
        {conflicts.length > 0 && (
          <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
            Blocked: {[...new Set(conflicts.map((c) => c.kind))].join(' + ')} overlap on {date}. Submit disabled.
          </p>
        )}
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        <button onClick={() => void handleCreate()} disabled={saving || conflicts.length > 0} className={primaryBtnCls}>
          {saving ? 'Creating…' : 'Create SCHEDULED session'}
        </button>
      </div>
    </ModalShell>
  )
}

// ============================================
// Menu item
// ============================================

function MenuItem({ icon, label, hint, danger, disabled, onClick }: {
  icon: React.ReactNode
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium',
        'transition-colors first:rounded-t-xl last:rounded-b-xl',
        disabled
          ? 'opacity-40 cursor-not-allowed text-[var(--muted)]'
          : danger
            ? 'text-[var(--red)] hover:bg-[var(--red-soft)]/40'
            : 'text-[var(--text)] hover:bg-[var(--glass)]',
      )}
    >
      <span className={cn('shrink-0', danger ? 'text-[var(--red)]' : 'text-[var(--muted)]')}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[10px] text-[var(--muted)] shrink-0">{hint}</span>}
      {disabled && <Lock size={11} className="shrink-0" />}
    </button>
  )
}

// ============================================
// Hamburger
// ============================================

export function SessionMenu({ session, sessions, status, onStart, onFinish, onChanged }: SessionMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [modal, setModal] = useState<ModalKind | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const w = 208
      const x = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))
      const estH = 320
      const y = rect.bottom + 6 + estH > window.innerHeight
        ? Math.max(8, rect.top - estH)
        : rect.bottom + 6
      setPos({ x, y })
    }
    setOpen((o) => !o)
  }, [])

  // Close on outside click / Escape / scroll / resize (fixed position goes stale)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  const openModal = useCallback((kind: ModalKind) => {
    setModal(kind)
    setOpen(false)
  }, [])

  const fire = useCallback((fn?: (s: Session) => void) => {
    close()
    fn?.(session)
  }, [close, session])

  const handleExtend = useCallback(() => {
    const rec = getLifecycleRecord(session.id)
    updateLifecycleRecord(session.id, {
      lateMinutes: (rec.lateMinutes ?? 0) + 30,
      endNotified: false,
    })
    toast.success('Extended +30m', 'End-of-class check pushed 30 minutes.')
    close()
  }, [session.id, close])

  const isLive = status === 'in_progress'
  const isScheduled = status === 'scheduled'
  const freeMarked = isNextFreeMarked(session.class_id)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          'flex items-center justify-center w-5 h-5 rounded-md shrink-0',
          'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
        )}
        aria-label="Session menu"
        title="Session menu"
      >
        <Menu size={14} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] shadow-2xl animate-fade-in overflow-hidden"
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {isScheduled && (
            <>
              <MenuItem icon={<Play size={13} />} label="Start Class" hint="now" onClick={() => fire(onStart)} />
              <MenuItem icon={<Pencil size={13} />} label="Edit THIS instance" onClick={() => openModal('edit')} />
              <MenuItem icon={<CalendarClock size={13} />} label="Reschedule" onClick={() => openModal('resched')} />
              <MenuItem icon={<XCircle size={13} />} label="Cancel Class" danger onClick={() => openModal('cancel')} />
              <MenuItem icon={<UserX size={13} />} label="Teacher Absent" danger onClick={() => openModal('absent')} />
              <MenuItem icon={<Gift size={13} />} label={freeMarked ? 'Next marked Free ✓' : 'Mark NEXT as Free'} onClick={() => openModal('free')} />
              <MenuItem icon={<Wallet size={13} />} label="Show Finances" onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label="View Log" onClick={() => openModal('log')} />
            </>
          )}
          {isLive && (
            <>
              <MenuItem icon={<Timer size={13} />} label="Extend +30" onClick={handleExtend} />
              <MenuItem icon={<CheckCircle2 size={13} />} label="End Class" hint="PIN" onClick={() => fire(onFinish)} />
              <MenuItem icon={<Pencil size={13} />} label="Edit THIS instance" onClick={() => openModal('edit')} />
              <MenuItem icon={<CalendarClock size={13} />} label="Reschedule" hint="locked live" disabled />
              <MenuItem icon={<Gift size={13} />} label={freeMarked ? 'Next marked Free ✓' : 'Mark NEXT as Free'} onClick={() => openModal('free')} />
              <MenuItem icon={<Ban size={13} />} label="Void Live Session" hint="Owner PIN" danger onClick={() => openModal('void')} />
              <MenuItem icon={<Plus size={13} />} label="Add Compensatory Session" onClick={() => openModal('comp')} />
              <MenuItem icon={<Wallet size={13} />} label="Show Finances" onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label="View Log" onClick={() => openModal('log')} />
            </>
          )}
          {!isScheduled && !isLive && (
            <>
              <MenuItem icon={<Wallet size={13} />} label="Show Finances" onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label="View Log" onClick={() => openModal('log')} />
            </>
          )}
        </div>
      )}

      {modal === 'edit' && (
        <EditSessionModal session={session} sessions={sessions} locked={!isScheduled} onClose={() => setModal(null)} onChanged={onChanged} />
      )}
      {modal === 'resched' && (
        <RescheduleModal session={session} onClose={() => setModal(null)} onChanged={onChanged} />
      )}
      {modal === 'cancel' && (
        <DangerConfirmModal
          title="Cancel Class"
          body={`Cancel THIS ${session.class_name} session on ${session.date}?`}
          confirmLabel="Cancel THIS session"
          session={session}
          onClose={() => setModal(null)}
          onChanged={onChanged}
        />
      )}
      {modal === 'absent' && (
        <DangerConfirmModal
          title="Teacher Absent"
          body={`Mark the teacher absent for THIS ${session.class_name} session on ${session.date}? The session is cancelled.`}
          confirmLabel="Mark absent + cancel"
          session={session}
          onClose={() => setModal(null)}
          onChanged={onChanged}
        />
      )}
      {modal === 'free' && (
        <FreeNextModal session={session} onClose={() => setModal(null)} />
      )}
      {modal === 'fin' && (
        <FinancesModal session={session} onClose={() => setModal(null)} />
      )}
      {modal === 'log' && (
        <LogModal onClose={() => setModal(null)} />
      )}
      {modal === 'void' && (
        <VoidModal session={session} onClose={() => setModal(null)} onChanged={onChanged} />
      )}
      {modal === 'comp' && (
        <CompensatoryModal session={session} sessions={sessions} onClose={() => setModal(null)} onChanged={onChanged} />
      )}
    </>
  )
}

export default SessionMenu
