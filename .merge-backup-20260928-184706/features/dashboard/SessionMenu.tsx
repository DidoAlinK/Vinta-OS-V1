/**
 * Vinta School OS — T3 Hamburger (instance-only)
 * Single entry point (☰) on every session card/row. Contextual by lifecycle:
 * - SCHEDULED: Start Class, Edit THIS instance, Reschedule, Cancel Class,
 *   Teacher Absent, Mark NEXT as Free, Show Finances, View Log
 * - IN_PROGRESS: Log Students Present [register], Extend +15, End Class,
 *   Mark NEXT as Free, Void Live Session [Owner PIN], Add Compensatory
 *   Session, Show Finances, View Log
 * - CONDUCTED/CANCELLED: Show Finances, View Log (read-only)
 *
 * Rule: Edit/Reschedule/Room touch THIS session only — never series, price, N,
 * template. Series edits live in the Classes page.
 *
 * A live class is locked to its own ending: the server accepts `end_time` (and
 * only forward) on an in-progress session and refuses everything else, so
 * there is no Edit entry here for one — a form that can only be refused is
 * worse than no form. See LIVE_EDITABLE_FIELDS in scheduling_service.
 *
 * Backend frozen: only existing endpoints (PATCH/DELETE/POST /sessions,
 * /billing/revenue, /billing/payouts, /settings/activity-log, /settings/profile,
 * /settings/staff, /auth/verify-pin).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
  UserCheck,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import PinStep from '../../components/ui/PinStep'
import { Select } from '../../components/ui/Select'
import { DayPicker } from '../../components/ui/DayPicker'
import { TimePicker } from '../../components/ui/TimePicker'
import { useAuthStore } from '../../stores/authStore'
import { formatDa, formatDateTime } from '../../lib/formatters'
import { isGrossProfitEnabled } from '../../lib/grossProfit'
import { getAbsenceConsumesCredit } from '../../lib/billingRules'
import { recordVoidRestore } from '../../lib/voidedSessions'
import type { Session } from '../../types/class'
import { isSessionFree, findNextSession, setSessionFree } from '../../lib/freeSessions'
import { extendSession, EXTEND_MINUTES } from '../../lib/extendSession'
import { findConflicts } from '../../lib/scheduleDefs'
import { startBlockReason, type LifecycleStatus } from '../../lib/sessionLifecycle'

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
  /**
   * Open the attendance register — the false-until-true grid — for a live class.
   *
   * Section 1 of the operational model puts the desk's core loop inside a
   * running class: every enrolled student starts ABSENT, and the desk flips
   * them to PRESENT as they walk in. On the Dashboard that grid opens by
   * itself the moment Start Class is pressed, so the menu never needed an
   * entry for it. On the Classrooms tab it did: a class could be started from
   * the group's ☰ and then had no way to reach the register at all — the only
   * two ways to end it were End and Void, and nobody could be marked present
   * in between. Passing this handler is what closes that gap, which is why the
   * entry only renders when a parent supplies one.
   */
  onOpenRegister?: (session: Session) => void
  /**
   * Start with the panel already open, for a parent that owns the click
   * gesture — the Dashboard's agenda board opens it from a session block, so
   * there is no ☰ press to hang the panel off.
   */
  defaultOpen?: boolean
  /** Hide the ☰ trigger. Only for a parent that opens the panel itself. */
  hideTrigger?: boolean
  /**
   * Where to pin the panel when a parent opened it, plus the element it was
   * opened *from*. Clicks inside that element are not "outside" clicks, which
   * is what lets clicking the same block again toggle the panel shut instead
   * of closing it and immediately reopening it.
   */
  anchor?: { x: number; y: number; el?: HTMLElement | null } | null
  /**
   * Told whenever the panel closes — outside click, Escape, scroll, resize, or
   * an item that does its own work. Nothing is reported on open: the parent is
   * what opened it.
   */
  onOpenChange?: (open: boolean) => void
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
  // The title arrives already translated from each caller — they know which
  // dialog they are; the shell only owns the ✕.
  const { t } = useTranslation('dashboard')

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
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
            aria-label={t('common:action.close')}
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

/**
 * Which half of a clash `findConflicts` is reporting, as a key.
 *
 * It reports low, lowercase halves — "room", "teacher" — and they land in the
 * middle of a translated sentence ("Blocked: room + teacher overlap on…"), so
 * they are mapped like every other enum here: a desk reading "chevauchement
 * room + teacher" would be reading the API rather than the interface.
 */
const CONFLICT_KIND_KEYS: Record<string, string> = {
  room: 'kind.room',
  teacher: 'kind.teacher',
}

/** A clash's halves as one label — "salle + enseignant". Unlisted kinds (the
 *  union has two members) fall back to a word rather than to the raw value. */
function conflictLabels(t: TFunction, conflicts: { kind: string }[]): string {
  return [...new Set(conflicts.map((c) => c.kind))]
    .map((kind) => t(CONFLICT_KIND_KEYS[kind] ?? 'kind.unknown'))
    .join(' + ')
}

// ============================================
// Edit THIS instance — date and times only, and only while SCHEDULED.
//
// There used to be a scope selector here (this / this+following / all series)
// that rewrote the whole series from the hamburger. It is gone: the hamburger
// edits the occurrence it was opened from, and nothing else. Moving a weekly
// group's slot is a decision about the GROUP, and it belongs on the Classes
// page next to the rest of the group's definition — not behind a small ☰ on
// one card, where the desk would be changing sessions it cannot see.
// ============================================

function EditSessionModal({ session, sessions, locked, onClose, onChanged }: {
  session: Session
  sessions?: Session[]
  locked: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const [date, setDate] = useState(session.date)
  const [start, setStart] = useState(session.start_time)
  const [end, setEnd] = useState(session.end_time)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('dashboard')

  const handleSave = useCallback(async () => {
    if (locked) return
    if (!date || !start || !end) { setError(t('edit.required')); return }
    if (end <= start) { setError(t('edit.endBeforeStart')); return }
    // T8 conflict BLOCK (room OR teacher vs non-CANCELLED) for the edited date.
    const conflicts = sessions ? findConflicts(sessions, {
      date, start, end,
      teacherId: session.teacher_id,
      roomId: session.classroom_id ?? null,
      ignoreId: session.id,
    }) : []
    if (conflicts.length > 0) {
      const msg = t('edit.blocked', { kinds: conflictLabels(t, conflicts), date })
      setError(msg)
      toast.error(t('edit.toastBlockedTitle'), msg)
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Cancel-one-occurrence semantics: THIS session only, definition untouched.
      await api.patch(`/sessions/${session.id}`, { date, start_time: start, end_time: end })
      toast.success(t('edit.toastUpdatedTitle'), t('edit.toastUpdatedBody'))
      onChanged?.()
      onClose()
    } catch (err: any) {
      // 404 covers both "no such session for this academy" and the server's
      // refusal of an edit it does not allow — a live class accepts a later
      // end time and nothing else, and a finished one accepts nothing.
      const msg = err?.response?.status === 404
        ? t('edit.notAllowed')
        : t('edit.saveFailed')
      setError(msg)
      toast.error(t('edit.toastFailedTitle'), msg)
    } finally {
      setSaving(false)
    }
  }, [t, locked, date, start, end, sessions, session, onChanged, onClose])

  return (
    <ModalShell title={t('edit.title')} onClose={onClose} wide>
      {locked && (
        <p className="flex items-center gap-2 text-xs text-[var(--gold)] bg-[var(--gold-soft)] rounded-xl px-3 py-2.5 mb-4">
          <Lock size={13} className="shrink-0" />
          {t('edit.locked')}
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('common:label.date')}</label>
          <DayPicker value={date} onChange={setDate} disabled={locked || saving} allowPast className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('edit.start')}</label>
            <TimePicker value={start} onChange={setStart} disabled={locked || saving} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('edit.end')}</label>
            <TimePicker value={end} onChange={setEnd} disabled={locked || saving} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--muted)]">{t('edit.note')}</p>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        {!locked && (
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryBtnCls}>
            {saving ? t('common:state.saving') : t('edit.save')}
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
  const { t } = useTranslation('dashboard')

  const handleSave = useCallback(async () => {
    if (!date) { setError(t('resched.pickDate')); return }
    setError(null)
    setSaving(true)
    try {
      await api.patch(`/sessions/${session.id}`, { date })
      toast.success(t('resched.toastDoneTitle'), t('resched.toastDoneBody'))
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? t('resched.locked')
        : t('resched.failed')
      setError(msg)
      toast.error(t('resched.toastFailedTitle'), msg)
    } finally {
      setSaving(false)
    }
  }, [t, date, session.id, onChanged, onClose])

  return (
    <ModalShell title={t('resched.title')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('resched.newDate')}</label>
          <DayPicker value={date} onChange={setDate} disabled={saving} allowPast className={inputCls} />
        </div>
        <p className="text-[11px] text-[var(--muted)]">{t('resched.note')}</p>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryBtnCls}>
          {saving ? t('resched.saving') : t('resched.save')}
        </button>
      </div>
    </ModalShell>
  )
}

// ============================================
// Danger confirm (Cancel / Teacher Absent — DELETE, scheduled only)
//
// `reason` is sent with the DELETE and stored on the row, because these are
// two different facts that were being recorded as the same one. "The teacher
// did not come" is the entry the desk searches for when a parent asks, and
// it decides whether the seat still spent a credit — a plain cancellation
// does not. Without it the log said "Session cancelled" for both, and the
// only way to tell them apart was to remember.
//
// The PIN step is INSIDE this dialog rather than a second dialog stacked on
// top of it. Two modals for one action is two things to dismiss and two places
// for the same sentence; the reason field, the class name and the dates this
// dialog already shows are all part of what is being confirmed.
// ============================================

function DangerConfirmModal({ title, body, confirmLabel, reason, session, onClose, onChanged }: {
  title: string
  body: string
  confirmLabel: string
  /** Recorded on the session and in the log. Omitted for a plain cancellation. */
  reason?: 'TEACHER_ABSENT' | 'CANCELLED_BY_STAFF' | 'OTHER'
  session: Session
  onClose: () => void
  onChanged?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('dashboard')

  const handleConfirm = useCallback(async () => {
    setError(null)
    setSaving(true)
    try {
      await api.delete(`/sessions/${session.id}`, { data: reason ? { reason } : {} })
      // What happens to the credit is decided by the Billing Rules, not by
      // this button, so say which rule applied instead of promising either
      // outcome.
      const credits = reason === 'TEACHER_ABSENT'
        ? (getAbsenceConsumesCredit()
          ? t('danger.creditAbsenceSpends')
          : t('danger.creditRestored'))
        : t('danger.creditNone')
      toast.success(title, t('danger.toastBody', { credits }))
      onChanged?.()
      onClose()
    } catch {
      const msg = t('danger.failed')
      setError(msg)
      toast.error(t('danger.toastFailedTitle'), msg)
    } finally {
      setSaving(false)
    }
  }, [t, session.id, title, reason, onChanged, onClose])

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="text-sm text-[var(--text)] leading-relaxed">{body}</p>
      <p className="text-[11px] text-[var(--muted)] mt-2">{t('danger.note')}</p>
      {error && <p className="text-xs text-[var(--red)] mt-3">{error}</p>}
      <div className="mt-4">
        {saving ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <PinStep
            hint={t('danger.pinHint')}
            submitLabel={confirmLabel}
            busyLabel={t('danger.busy')}
            onVerified={handleConfirm}
          />
        )}
      </div>
    </ModalShell>
  )
}

// ============================================
// Free sessions.
//
// The flag is written onto the session it applies to, on the server, so the
// register, the billing service and the finalise step all read the same
// answer. Nothing is staged in the browser: the desk picks the occurrence it
// means, sees its date, and that row is what changes.
//
// The panel therefore always shows what it is about to touch — the next
// session of this group, by date and time. The old one could only say "the
// next one", which is a sentence the desk had to take on faith and which the
// server never heard.
// ============================================

function FreeNextModal({ session, onClose, onChanged }: {
  session: Session
  onClose: () => void
  onChanged?: () => void
}) {
  const [next, setNext] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('dashboard')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setNext(await findNextSession(session))
    } catch {
      setError(t('free.unreachable'))
    } finally {
      setLoading(false)
    }
  }, [t, session])

  useEffect(() => { void load() }, [load])

  const toggle = useCallback(async (target: Session, isFree: boolean) => {
    setWorking(true)
    setError(null)
    try {
      await setSessionFree(target.id, isFree)
      if (isFree) {
        toast.success(
          t('free.toastMarkedTitle'),
          t('free.toastMarkedBody', { date: target.date, time: target.start_time }),
        )
      } else {
        toast.info(t('free.toastRemovedTitle'), t('free.toastRemovedBody'))
      }
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? t('free.gone')
        : t('free.saveFailed')
      setError(msg)
      toast.error(t('free.toastFailedTitle'), msg)
    } finally {
      setWorking(false)
    }
  }, [t, onChanged, onClose])

  // The instance the menu was opened from, if it is already free. Separate
  // from "next" because it is a different row and the desk has to be able to
  // undo the one they are looking at.
  const thisIsFree = isSessionFree(session)

  return (
    <ModalShell title={t('free.title')} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
              {t('free.nextLabel')}
            </p>
            {next ? (
              <>
                <p className="text-sm text-[var(--text)] leading-relaxed">
                  {next.date} · {next.start_time}–{next.end_time}
                  {next.is_free_session && (
                    <span className="ms-2 text-xs font-semibold text-[var(--emerald)]">{t('free.tag')}</span>
                  )}
                </p>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  {next.is_free_session
                    ? t('free.nextIsFree')
                    : t('free.nextWillBeFree')}
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--text)]">{t('free.none')}</p>
            )}
          </div>

          {thisIsFree && (
            <div className="rounded-xl bg-[var(--emerald-soft)]/40 px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--emerald)]">
                {t('free.thisIsFree', { date: session.date, time: session.start_time })}
              </p>
              <button
                type="button"
                onClick={() => void toggle(session, false)}
                disabled={working}
                className="mt-2 text-xs font-semibold text-[var(--text)] underline underline-offset-2 disabled:opacity-40"
              >
                {t('free.billNormally')}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-[var(--red)]">{error}</p>}

          {next ? (
            <button
              type="button"
              onClick={() => void toggle(next, !next.is_free_session)}
              disabled={working}
              className={primaryBtnCls}
            >
              {working
                ? t('common:state.saving')
                : next.is_free_session
                  ? t('free.undo')
                  : t('free.mark')}
            </button>
          ) : error ? (
            <button type="button" onClick={() => void load()} className={primaryBtnCls}>{t('common:action.retry')}</button>
          ) : null}
        </div>
      )}
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

/**
 * Two more rendered enums, so two more key maps.
 *
 * `PENDING` and `Pending` are one state spelled two ways by different rows, and
 * `FLAT_HOURLY` is nobody's word for anything — the value goes in, a label
 * comes out, and the value itself is never printed. Both lookups are
 * case-insensitive because the payout rows are not consistent about it.
 */
const PAYOUT_STATUS_KEYS: Record<string, string> = {
  PENDING: 'fin.payoutPending',
  PAID: 'fin.payoutPaid',
}

const COMMISSION_TYPE_KEYS: Record<string, string> = {
  FLAT_HOURLY: 'fin.commissionFlatHourly',
  PERCENTAGE: 'fin.commissionPercentage',
  FIXED_SESSION: 'fin.commissionFixedSession',
}

function FinancesModal({ session, onClose }: {
  session: Session
  onClose: () => void
}) {
  const [revenue, setRevenue] = useState<{ total_da: number; count: number } | null>(null)
  const [payout, setPayout] = useState<PayoutRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('dashboard')
  // Read straight off the row. This used to be a client-side overlay over
  // the backend numbers, which could only disagree with them.
  const free = isSessionFree(session)

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
      const msg = t('fin.loadFailed')
      setError(msg)
      toast.error(t('fin.toastFailedTitle'), t('fin.toastFailedBody', { message: msg }))
    } finally {
      setLoading(false)
    }
  }, [t, session.id])

  useEffect(() => { void load() }, [load])

  // T6 display: free sessions always render 0/0/0 regardless of backend rows.
  // Gross-profit OFF: gross/cut hidden (per-session pay only), status kept.
  const grossOn = isGrossProfitEnabled()
  const dispRevenue = free ? 0 : grossOn ? revenue?.total_da ?? null : null
  const dispCut = free ? 0 : grossOn ? payout?.teacher_cut_da ?? null : null
  // Three different kinds of "nothing": a free session has no payout row by
  // design, a row can carry a status we have no label for, and a session that
  // was never finalised has no row at all. Each one reads differently.
  const statusKey = payout?.status
    ? PAYOUT_STATUS_KEYS[payout.status.toUpperCase()]
    : undefined
  const dispStatus = free
    ? t('fin.statusFree')
    : statusKey
      ? t(statusKey)
      : payout?.status
        ? t('fin.payoutUnknown')
        : t('fin.notSet')

  return (
    <ModalShell title={free ? t('fin.titleFree') : t('fin.title')} onClose={onClose}>
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
            {t('common:action.retry')}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {free && (
            <p className="text-xs font-semibold text-[var(--emerald)] bg-[var(--emerald-soft)]/40 rounded-xl px-3 py-2.5">
              {t('fin.freeNote')}
            </p>
          )}
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">{t('fin.revenue')}</span>
            <span className="text-sm font-bold text-[var(--text)]">
              {dispRevenue != null ? formatDa(dispRevenue) : grossOn || free ? t('fin.notSet') : t('common:dash')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">{t('fin.cut')}</span>
            <span className="text-sm font-bold text-[var(--emerald)]">
              {dispCut != null ? formatDa(dispCut) : grossOn || free ? t('fin.notSet') : t('common:dash')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
            <span className="text-xs text-[var(--muted)]">{t('fin.payoutStatus')}</span>
            <span className="text-xs font-semibold text-[var(--text)]">{dispStatus}</span>
          </div>
          {!grossOn && !free && (
            <p className="text-[11px] text-[var(--muted)]">{t('fin.grossOff')}</p>
          )}
          {grossOn && !free && payout?.commission_type && (
            <p className="text-[11px] text-[var(--muted)]">
              {t('fin.commission', {
                type: COMMISSION_TYPE_KEYS[payout.commission_type.toUpperCase()]
                  ? t(COMMISSION_TYPE_KEYS[payout.commission_type.toUpperCase()])
                  : t('fin.commissionUnknown'),
              })}
            </p>
          )}
          <p className="text-[11px] text-[var(--muted)]">{t('fin.readOnly')}</p>
        </div>
      )}
    </ModalShell>
  )
}

// ============================================
// View Log — this group's own history.
//
// The academy-wide log answers "what happened at the desk today" and is on
// the dashboard. This one answers "what happened to THIS class", which is the
// question being asked when the menu is opened from a session card, and which
// the old academy-wide list could not answer at all — it showed other
// groups' entries and gave no way to tell which were which.
//
// `class_id` is filtered server-side against the group's own sessions too, so
// group-level events (a rename), session events (a cancellation) and the
// newer entries that carry `class_id` in their metadata all land in one list.
// ============================================

interface LogEntry {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  staff_name: string
}

function LogModal({ classId, onClose }: { classId: string; onClose: () => void }) {
  const [items, setItems] = useState<LogEntry[]>([])
  const [retentionDays, setRetentionDays] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('dashboard')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/settings/activity-log', {
        params: { limit: 100, class_id: classId },
      })
      setItems(data.activities ?? [])
      setRetentionDays(data.retention_days ?? null)
    } catch {
      const msg = t('classLog.loadFailed')
      setError(msg)
      toast.error(t('classLog.toastFailedTitle'), t('classLog.toastFailedBody', { message: msg }))
    } finally {
      setLoading(false)
    }
  }, [t, classId])

  useEffect(() => { void load() }, [load])

  return (
    <ModalShell title={t('menu.viewLog')} onClose={onClose} wide>
      <p className="text-[11px] text-[var(--muted)] mb-3">
        {retentionDays != null
          ? t('classLog.introWithRetention', { days: retentionDays })
          : t('classLog.intro')}
      </p>
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
            {t('common:action.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--muted)] text-center py-6">{t('classLog.empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl bg-[var(--input-bg)] border border-[var(--glass-border)] px-3.5 py-2.5">
              <p className="text-xs font-semibold text-[var(--text)] leading-snug">{a.title}</p>
              {a.description && a.description !== a.title && (
                <p className="text-[11px] text-[var(--muted)] mt-0.5">{a.description}</p>
              )}
              <p className="text-[10px] text-[var(--muted)]/70 mt-1">
                {a.staff_name}
                {a.timestamp ? ` · ${formatDateTime(a.timestamp)}` : ''}
              </p>
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

/**
 * Void a live class: owner PIN, roster snapshot, then cancel.
 *
 * Exported because the end-of-class toast ("Has this class finished?") offers
 * Void as its third answer, and that toast is raised by the page — not by the
 * menu this modal was written inside. Rendering a second copy of this flow
 * there would mean two implementations of the one action that discards money
 * quietly diverging, so both mount points use this component.
 */
export function VoidModal({ session, onClose, onChanged }: {
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
  const { t } = useTranslation('dashboard')

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
        // The role is an enum, so it is labelled rather than printed: "you are
        // staff" was the only sentence this could ever produce in English.
        const roleLabel = prof.data.role === 'owner'
          ? t('void.roleOwner')
          : t('void.roleStaff')
        const msg = t('void.ownerOnly', { role: roleLabel })
        setError(msg)
        toast.error(t('void.toastBlockedTitle'), msg)
        return
      }
      const staff = await api.get('/settings/staff')
      const owner = (staff.data.staff ?? []).find((u: any) => u.role === 'owner')
      if (!owner) {
        const msg = t('void.noOwner')
        setError(msg)
        toast.error(t('void.toastBlockedTitle'), msg)
        return
      }
      await api.post('/auth/verify-pin', { user_id: owner.id, pin: pin.trim() })
      // PIN accepted — arm the destructive confirm (two-step, no accidents).
      setConfirmArmed(true)
    } catch (err: any) {
      const msg = err?.response?.status === 401 ? t('void.invalidPin') : t('void.verifyFailed')
      setError(msg)
      toast.error(t('void.toastBlockedTitle'), msg)
    } finally {
      setWorking(false)
    }
  }, [t, pin])

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
        const msg = t('void.rosterUnreadable')
        setError(msg)
        toast.error(t('void.toastAbortedTitle'), msg)
        return
      }

      // 2. Charged = PRESENT rows + ABSENT rows only when Toggle 1 was ON
      //    (backend consumed the seat). Suppressed T4 swap rows never consumed.
      const toggle1 = getAbsenceConsumesCredit()
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
      //
      //    The reason is sent rather than left off: without it the row's
      //    `cancelled_reason` stayed NULL, so a void left no explanation at
      //    all in the log. CANCELLED_BY_STAFF is the closest value the
      //    database's enum accepts — a void is not given a value of its own,
      //    because that means altering a native enum. Nothing is lost by it:
      //    this session has `actual_start_time` set, which is exactly what
      //    separates a class that was voided from one cancelled before it ran.
      await api.delete(`/sessions/${session.id}`, { data: { reason: 'CANCELLED_BY_STAFF' } })

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
        t('void.toastDoneTitle'),
        t('void.toastDoneBody', { charged: charged.length, total: rows.length }),
        { duration: 8000 },
      )
      onChanged?.()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? t('void.finalized')
        : t('void.failed')
      setError(msg)
      toast.error(t('void.toastFailedTitle'), msg)
    } finally {
      setWorking(false)
    }
  }, [t, confirmArmed, session, staffName, onChanged, onClose])

  return (
    <ModalShell title={t('menu.voidLive')} onClose={onClose}>
      <p className="flex items-center gap-2 text-xs text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2.5 mb-4">
        <Ban size={13} className="shrink-0" />
        {t('void.warning')}
      </p>
      {!confirmArmed ? (
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={t('void.pinPlaceholder')}
            className={cn(inputCls, 'text-center tracking-[0.3em]')}
          />
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <button type="button" onClick={() => void handleVerify()} disabled={pin.length !== 4 || working} className={dangerBtnCls}>
            {working ? t('void.verifying') : t('void.verify')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text)] leading-relaxed">
            {rosterPreview != null
              ? t('void.confirmWithRoster', {
                  class: session.class_name,
                  date: session.date,
                  rows: t('void.rows', { count: rosterPreview }),
                })
              : t('void.confirm', { class: session.class_name, date: session.date })}
          </p>
          <p className="text-[11px] text-[var(--muted)]">{t('void.note')}</p>
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <button type="button" onClick={() => void handleVoid()} disabled={working} className={dangerBtnCls}>
            {working ? t('void.voiding') : t('void.submit')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmArmed(false)}
            disabled={working}
            className="w-full py-2 rounded-xl text-xs font-medium bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
          >
            {t('common:action.back')}
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
  const { t } = useTranslation('dashboard')

  const loadRooms = useCallback(async () => {
    setRoomsError(null)
    try {
      const { data } = await api.get('/classrooms')
      setRooms(data.classrooms ?? [])
    } catch {
      setRooms([])
      setRoomsError(t('comp.roomsNotSet'))
      toast.error(t('comp.toastRoomsTitle'), t('comp.toastRoomsBody'))
    }
  }, [t])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const conflicts = sessions ? findConflicts(sessions, {
    date, start, end,
    teacherId: session.teacher_id,
    roomId: roomId || null,
  }) : []

  const handleCreate = useCallback(async () => {
    if (!date || !start || !end) { setError(t('comp.required')); return }
    if (end <= start) { setError(t('comp.endBeforeStart')); return }
    const blocked = sessions ? findConflicts(sessions, {
      date, start, end,
      teacherId: session.teacher_id,
      roomId: roomId || null,
    }) : []
    if (blocked.length > 0) {
      const msg = t('comp.blocked', { kinds: conflictLabels(t, blocked), date })
      setError(msg)
      toast.error(t('comp.toastBlockedTitle'), msg)
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
      toast.success(t('comp.toastCreatedTitle'), t('comp.toastCreatedBody'))
      onChanged?.()
      onClose()
    } catch {
      const msg = t('comp.createFailed')
      setError(msg)
      toast.error(t('comp.toastFailedTitle'), msg)
    } finally {
      setSaving(false)
    }
  }, [t, date, start, end, roomId, sessions, session.class_id, session.teacher_id, onChanged, onClose])

  return (
    <ModalShell title={t('menu.addCompensatory')} onClose={onClose}>
      <p className="text-[11px] text-[var(--muted)] mb-3">{t('comp.note')}</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('common:label.date')}</label>
          <DayPicker value={date} onChange={setDate} disabled={saving} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('comp.start')}</label>
            <TimePicker value={start} onChange={setStart} disabled={saving} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('comp.end')}</label>
            <TimePicker value={end} onChange={setEnd} disabled={saving} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t('comp.room')}</label>
          <Select
            value={roomId}
            onChange={setRoomId}
            disabled={saving}
            placeholder={t('comp.noRoom')}
            options={[
              { value: '', label: t('comp.noRoom') },
              ...rooms.map((r) => ({ value: r.id, label: r.name })),
            ]}
            className={cn(inputCls, 'h-auto')}
            aria-label={t('comp.room')}
          />
          {roomsError && (
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="mt-1.5 text-[11px] font-semibold text-[var(--gold)] hover:underline"
            >
              {roomsError} {t('common:action.retry')}
            </button>
          )}
        </div>
        {conflicts.length > 0 && (
          <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
            {t('comp.conflict', {
              kinds: conflictLabels(t, conflicts),
              date,
            })}
          </p>
        )}
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        <button type="button" onClick={() => void handleCreate()} disabled={saving || conflicts.length > 0} className={primaryBtnCls}>
          {saving ? t('comp.creating') : t('comp.create')}
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
        'w-full flex items-center gap-2.5 px-3 py-2 text-start text-xs font-medium',
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

export function SessionMenu({
  session,
  sessions,
  status,
  onStart,
  onFinish,
  onChanged,
  onOpenRegister,
  defaultOpen = false,
  hideTrigger = false,
  anchor,
  onOpenChange,
}: SessionMenuProps) {
  const [open, setOpenState] = useState(defaultOpen)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [modal, setModal] = useState<ModalKind | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('dashboard')

  /**
   * Every close funnels through here — the items, outside clicks, Escape,
   * scroll and resize — so a parent that opened the panel is always told it
   * shut. That is what lets the board drop its `menuTarget` and stop rendering
   * this instance.
   */
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    if (!next) onOpenChange?.(false)
  }, [onOpenChange])

  const close = useCallback(() => setOpen(false), [setOpen])

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
    setOpen(!open)
  }, [open, setOpen])

  // Close on outside click / Escape / scroll / resize (fixed position goes stale)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // The panel, its own ☰, and the element a parent opened it from all read
      // as "inside". The last one matters: clicking the block the panel came
      // from is a toggle, and closing here would race the reopen in the same
      // gesture.
      const inside =
        menuRef.current?.contains(target) ||
        btnRef.current?.contains(target) ||
        anchor?.el?.contains(target)
      if (!inside) close()
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
  }, [open, close, anchor?.el])

  const openModal = useCallback((kind: ModalKind) => {
    setModal(kind)
    setOpen(false)
  }, [setOpen])

  const fire = useCallback((fn?: (s: Session) => void) => {
    close()
    fn?.(session)
  }, [close, session])

  // Extend pushes the session's end time on the SERVER. It used to be a
  // localStorage counter that only the end-of-class toast read, so the class
  // log still said 90 minutes and the extension vanished on reload — or on
  // the next device. See lib/extendSession.ts.
  const [extending, setExtending] = useState(false)
  const handleExtend = useCallback(async () => {
    if (extending) return
    setExtending(true)
    try {
      const result = await extendSession(session)
      toast.success(
        t('extend.toastDoneTitle', { minutes: EXTEND_MINUTES }),
        result.duration_label
          ? t('extend.toastDoneBodyWithDuration', {
              class: session.class_name,
              time: result.end_time,
              duration: result.duration_label,
            })
          : t('extend.toastDoneBody', {
              class: session.class_name,
              time: result.end_time,
            }),
      )
      onChanged?.()
    } catch (err: any) {
      const backend = err?.response?.data?.error
      toast.error(
        t('extend.toastFailedTitle'),
        typeof backend === 'string' && backend
          ? backend
          : t('extend.toastFailedBody'),
      )
    } finally {
      setExtending(false)
      close()
    }
  }, [t, extending, session, onChanged, close])

  const isLive = status === 'in_progress'
  const isScheduled = status === 'scheduled'
  // The free flag is a field on the session it applies to, so the menu cannot
  // answer "is the next one free" without asking the schedule. It does that
  // once, when the menu opens, and says nothing rather than guessing if the
  // request fails — a wrong "✓" here would be read as "already handled".
  const [nextFree, setNextFree] = useState<boolean | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    findNextSession(session)
      .then((next) => { if (!cancelled) setNextFree(Boolean(next?.is_free_session)) })
      .catch(() => { if (!cancelled) setNextFree(null) })
    return () => { cancelled = true }
    // Keyed on the id, not the object: a refetch hands this component a new
    // session object with the same id, and re-asking on every render of the
    // board would be a request per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.id])

  return (
    <>
      {!hideTrigger && (
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
          aria-label={t('menu.trigger')}
          title={t('menu.trigger')}
        >
          <Menu size={14} />
        </button>
      )}

      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] shadow-2xl animate-fade-in overflow-hidden"
          style={{ left: anchor?.x ?? pos.x, top: anchor?.y ?? pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {isScheduled && (
            <>
              {/* A class may only be started on its own day, and the server
                  enforces it. "Scheduled" is not enough on its own: every
                  past instance of a weekly group is still `scheduled`, so
                  without the date this item would offer Start on last
                  week's class and a 409 would be the only outcome. Read at
                  render — the menu opens on a click, so there is nothing to
                  keep ticking here. */}
              {(() => {
                const blocked = startBlockReason(session, new Date())
                return (
                  <MenuItem
                    icon={<Play size={13} />}
                    label={t('menu.startClass')}
                    hint={blocked ? t('menu.hintOwnDay') : t('menu.hintNow')}
                    disabled={blocked !== null}
                    onClick={() => fire(onStart)}
                  />
                )
              })()}
              <MenuItem icon={<Pencil size={13} />} label={t('menu.editThis')} onClick={() => openModal('edit')} />
              <MenuItem icon={<CalendarClock size={13} />} label={t('menu.reschedule')} onClick={() => openModal('resched')} />
              <MenuItem icon={<XCircle size={13} />} label={t('menu.cancelClass')} danger onClick={() => openModal('cancel')} />
              <MenuItem icon={<UserX size={13} />} label={t('menu.teacherAbsent')} danger onClick={() => openModal('absent')} />
              <MenuItem icon={<Gift size={13} />} label={nextFree === true ? t('menu.nextMarkedFree') : t('menu.markNextFree')} onClick={() => openModal('free')} />
              <MenuItem icon={<Wallet size={13} />} label={t('menu.showFinances')} onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label={t('menu.viewLog')} onClick={() => openModal('log')} />
            </>
          )}
          {isLive && (
            <>
              {/* First, because during a live class it is the whole job:
                  everyone starts ABSENT and the desk marks arrivals present.
                  Only rendered when the parent can actually open the grid. */}
              {onOpenRegister && (
                <MenuItem
                  icon={<UserCheck size={13} />}
                  label={t('menu.logStudentsPresent')}
                  hint={t('menu.hintRegister')}
                  onClick={() => fire(onOpenRegister)}
                />
              )}
              <MenuItem icon={<Timer size={13} />} label={t('menu.extend', { minutes: EXTEND_MINUTES })} onClick={() => void handleExtend()} disabled={extending} />
              <MenuItem icon={<CheckCircle2 size={13} />} label={t('menu.endClass')} hint={t('menu.hintPin')} onClick={() => fire(onFinish)} />
              {/* No Edit here. A live class accepts a later end time and
                  nothing else, so the only edits that exist are Extend and
                  the two ways to stop — End Class, or Void. */}
              <MenuItem icon={<Gift size={13} />} label={nextFree === true ? t('menu.nextMarkedFree') : t('menu.markNextFree')} onClick={() => openModal('free')} />
              <MenuItem icon={<Ban size={13} />} label={t('menu.voidLive')} hint={t('menu.hintOwnerPin')} danger onClick={() => openModal('void')} />
              <MenuItem icon={<Plus size={13} />} label={t('menu.addCompensatory')} onClick={() => openModal('comp')} />
              <MenuItem icon={<Wallet size={13} />} label={t('menu.showFinances')} onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label={t('menu.viewLog')} onClick={() => openModal('log')} />
            </>
          )}
          {!isScheduled && !isLive && (
            <>
              <MenuItem icon={<Wallet size={13} />} label={t('menu.showFinances')} onClick={() => openModal('fin')} />
              <MenuItem icon={<ScrollText size={13} />} label={t('menu.viewLog')} onClick={() => openModal('log')} />
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
          title={t('menu.cancelClass')}
          body={t('danger.bodyCancel', { class: session.class_name, date: session.date })}
          confirmLabel={t('danger.confirmCancel')}
          session={session}
          onClose={() => setModal(null)}
          onChanged={onChanged}
        />
      )}
      {modal === 'absent' && (
        <DangerConfirmModal
          title={t('menu.teacherAbsent')}
          body={t('danger.bodyAbsent', { class: session.class_name, date: session.date })}
          confirmLabel={t('danger.confirmAbsent')}
          reason="TEACHER_ABSENT"
          session={session}
          onClose={() => setModal(null)}
          onChanged={onChanged}
        />
      )}
      {modal === 'free' && (
        <FreeNextModal session={session} onClose={() => setModal(null)} onChanged={onChanged} />
      )}
      {modal === 'fin' && (
        <FinancesModal session={session} onClose={() => setModal(null)} />
      )}
      {modal === 'log' && (
        <LogModal classId={session.class_id} onClose={() => setModal(null)} />
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
