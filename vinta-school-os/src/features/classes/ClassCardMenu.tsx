/**
 * Vinta School OS — the ☰ on a Classrooms card
 *
 * The Classrooms tab lists GROUPS, not sessions, and that is the whole reason
 * it had no burger, no Start Class and no free-session flag while the Dashboard
 * had all three: SessionMenu takes a session, and nothing in this tab was one.
 * The tab showed a group's weekly template — recurring slots, not dates — so
 * there was no instance for the menu to act on.
 *
 * This component resolves that missing piece. It asks the server for the
 * group's next session (GET /sessions?class_id=) and hands it to SessionMenu,
 * which then offers the same menu a session card on the Dashboard offers.
 *
 * The lookup is per card and local to the card. A group's sessions belong to
 * that group alone, and when the menu changes one it is this card that has to
 * reload — a page-wide cache would only add a way to go stale.
 *
 * That read is also why the running lamp lives here rather than on the card
 * itself: "is this group live right now" is a fact about its sessions, and
 * this is the only part of a Classrooms card that has them. One fetch feeds
 * both the lamp and the menu, so the two cannot tell different stories.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Loader2, CalendarOff, AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { Modal } from '../../components/ui/Modal'
import type { Class, Session } from '../../types/class'
import { getEffectiveStatus, getSessionPhase } from '../../lib/sessionLifecycle'
import { useNow } from '../../hooks/useNow'
import { checkSessionNotifications } from '../../lib/sessionNotifier'
import { extendSession } from '../../lib/extendSession'
import SessionMenu, { VoidModal } from '../dashboard/SessionMenu'

/**
 * How many of the group's upcoming sessions to load.
 *
 * One would be enough to name the next class, but SessionMenu uses the array
 * for conflict checks when rescheduling and for its edit-scope siblings, so a
 * short window is worth the few extra rows. It stays short deliberately: this
 * is the near horizon, not the group's history.
 */
const NEXT_WINDOW = 5

/**
 * The server's own words, when it has any.
 *
 * A wrong step-up PIN is a 403 here, not a 401 — the session is perfectly
 * valid, the PIN is not — so the message has to come from the response rather
 * than from a guess at the status code.
 */
function serverMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })
    ?.response?.data
  return data?.error || data?.message || fallback
}

/**
 * Does this session still need the desk?
 *
 * `in_progress` and nothing else — which covers both a class that is running
 * and one that ran past its end and is still open (the phase below tells those
 * two apart; this does not need to). A `scheduled` class is only expected, and
 * counting it would hand the menu a session it can only offer "Start" for,
 * over one that is actually mid-class.
 *
 * The menu picks its session with this predicate, so a card can never show a
 * lamp beside a menu that has nothing to say about it.
 */
function isRunning(session: Session): boolean {
  return getEffectiveStatus(session) === 'in_progress'
}

export interface ClassCardMenuProps {
  cls: Class
  /** Bump to make every card re-read its next session. */
  refreshToken?: number
  /** Something about this group changed — the page may want to reload. */
  onChanged?: () => void
  /** Open the group's own panel, for when there is no session to act on. */
  onOpenGroup?: () => void
  /** Open the attendance register for a live class. Owned by the page. */
  onOpenRegister?: (session: Session) => void
}

export function ClassCardMenu({
  cls,
  refreshToken = 0,
  onChanged,
  onOpenGroup,
  onOpenRegister,
}: ClassCardMenuProps) {
  /** null until the first read lands — distinct from "read it, nothing there". */
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pinFor, setPinFor] = useState<Session | null>(null)
  /** The session whose void modal is open — raised by the ☰ or the end toast. */
  const [voidFor, setVoidFor] = useState<Session | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/sessions', {
        params: {
          class_id: cls.id,
          status: 'scheduled,in_progress',
          limit: NEXT_WINDOW,
        },
      })
      setSessions((data.sessions ?? []) as Session[])
      setFailed(false)
    } catch {
      // An unreachable backend and a group with nothing scheduled both leave
      // this card with no session to offer. They are not the same situation,
      // so they do not get the same words.
      setSessions([])
      setFailed(true)
    }
  }, [cls.id])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const handleChanged = useCallback(() => {
    void load()
    onChanged?.()
  }, [load, onChanged])

  /**
   * Start Class, once.
   *
   * The menu closes on click but the ☰ does not go away, so until the reload
   * lands the same button is still there offering the same thing — and a
   * desk that presses it twice used to get a second request and a second
   * toast ("Class already running" over the top of "Class started"), which
   * reads as the start having gone wrong. The server is idempotent and was
   * never going to open two registers; the noise was the whole cost, and it
   * is enough to swallow the repeat here.
   *
   * A ref rather than state: the second press can arrive in the same tick as
   * the first, before a re-render would have disabled anything.
   */
  const starting = useRef(false)
  const handleStart = useCallback(
    async (session: Session) => {
      if (starting.current) return
      starting.current = true
      try {
        const { data } = await api.post(`/sessions/${session.id}/start`)
        const opened = data?.roster_created ?? 0
        toast.success(
          data?.already_started ? 'Class already running' : 'Class started',
          opened > 0
            ? `Register opened — ${opened} student${opened === 1 ? '' : 's'} marked absent until they arrive.`
            : `${session.class_name ?? cls.name} is now in progress.`,
        )
        // "Register opened" has to be true, not just said: the whole point of
        // the false-until-true rule is that somebody now walks the list. Same
        // move the Dashboard makes on Start.
        onOpenRegister?.(session)
        handleChanged()
      } catch (err) {
        toast.error(
          'Could not start the class',
          serverMessage(err, 'The server refused the request.'),
        )
      } finally {
        starting.current = false
      }
    },
    [cls.name, handleChanged, onOpenRegister],
  )

  /**
   * "No, Extend +15" from the end-of-class toast — the same server call the
   * ☰ menu's Extend makes, because it is the same act: the session's end time
   * moves and everything else follows from it (see lib/extendSession). The
   * toast re-arms itself for the new end time, so the desk is asked again when
   * the extension runs out rather than never.
   */
  const handleExtend = useCallback(
    async (session: Session) => {
      try {
        const result = await extendSession(session)
        toast.success(
          'Class extended',
          `${session.class_name ?? cls.name} now ends at ${result.end_time}` +
            (result.duration_label ? ` · ${result.duration_label}` : ''),
        )
        handleChanged()
      } catch (err) {
        toast.error(
          'Could not extend',
          serverMessage(err, 'The end time was not changed. Please try again.'),
        )
      }
    },
    [cls.name, handleChanged],
  )

  /**
   * The next class, preferring one already running.
   *
   * The list arrives soonest-first, so the first row is almost always the
   * answer — but a class started early is still filed under the time it was
   * scheduled for, and the desk should get the live one, not the later plan.
   */
  const next = sessions?.find(isRunning) ?? sessions?.[0] ?? null

  /**
   * The clock, shared, one tick a minute for every card on the page.
   *
   * The lamp is derived from session phases, and a phase moves on its own: a
   * class that is `live` at 08:59 is `overdue` at 09:01 with no data change
   * and no refetch. Without a tick the card would sit on the phase it last
   * rendered and keep the green pulse going — the reported staleness. Only
   * the lamp needs this; the menu below reads the server.
   */
  const now = useNow()

  /**
   * The lamp, from the clock rather than from the status alone.
   *
   * Not a `useMemo` for speed — it saves nothing on a list this short. It is
   * here because `now` changes under the card every minute and would otherwise
   * rebuild the array on every unrelated render too.
   *
   * `live` outranks `overdue`: a group can have both at once when an earlier
   * class overruns into a later one, and the live one is the stronger claim.
   *
   * `unknown` is not the same as `idle`, and it is worth its own state:
   * showing amber or green on a class while the first read is still in flight
   * would be a claim this card has no basis for.
   */
  const phases = useMemo(
    () => (sessions ?? []).map((s) => getSessionPhase(s, now)),
    [sessions, now],
  )

  const light: RunningLightState =
    sessions === null || failed
      ? 'unknown'
      : phases.includes('live')
        ? 'running'
        : phases.includes('overdue')
          ? 'overdue'
          : 'idle'

  /**
   * Tell the desk this group's class is over, and let them answer.
   *
   * Mounted here rather than on the page because this is the only component
   * that has both the session *and* the flows the answer needs: Start, End
   * Class (PIN) and Void all live in this card's ☰, so the page would have to
   * reimplement all three to offer the same buttons. The Dashboard mounts the
   * same notifier for its own day view.
   *
   * Driven by `useNow` instead of its own interval: that tick is shared by
   * every card on the page (see hooks/useNow), so twenty cards cost one timer
   * rather than twenty. The prompt itself is raised once per session per end
   * time — the record it writes is keyed on `end_time`, so an extension
   * re-arms it and a second card asking about the same session is a no-op.
   */
  useEffect(() => {
    if (!next) return
    checkSessionNotifications(
      [next],
      {
        onStartClass: handleStart,
        onFinishClass: setPinFor,
        onExtend: handleExtend,
        onVoid: setVoidFor,
        getStatus: getEffectiveStatus,
      },
      now,
    )
  }, [next, now, handleStart, handleExtend])

  return (
    <>
      {/* The card's top-right corner. The lamp sits left of the ☰ because both
          are fed by the fetch above — wherever the corner goes, they go, and
          the FREE chip goes with them for the same reason. */}
      <div className="flex items-center gap-1.5">
        <RunningLight state={light} />
        {next?.is_free_session && <FreeChip />}

        {next ? (
          <SessionMenu
            session={next}
            status={getEffectiveStatus(next)}
            sessions={sessions ?? undefined}
            onStart={handleStart}
            onFinish={setPinFor}
            onChanged={handleChanged}
            onOpenRegister={onOpenRegister}
          />
        ) : (
          <NoSessionTrigger
            loading={sessions === null}
            failed={failed}
            onOpenGroup={onOpenGroup}
          />
        )}
      </div>

      {pinFor && (
        <EndClassModal
          session={pinFor}
          onClose={() => setPinFor(null)}
          onEnded={() => {
            setPinFor(null)
            handleChanged()
          }}
        />
      )}

      {/* The end-of-class toast's third answer. Same component the ☰ opens, so
          the owner-PIN check and the roster snapshot before the cancel stay in
          one place — this is the action that discards money, and a second copy
          of it is a second chance to get that wrong. */}
      {voidFor && (
        <VoidModal
          session={voidFor}
          onClose={() => setVoidFor(null)}
          onChanged={() => {
            setVoidFor(null)
            handleChanged()
          }}
        />
      )}

      {/* The register itself is not rendered here on purpose. Both of this
          card's ways into it — Start, and "Log Students Present" — run through
          the page's `onOpenRegister`, because a card is the wrong lifetime to
          own it: `handleChanged` sends the page back for the class list, and
          while that fetch is in flight ClassGrid swaps the whole grid for
          skeletons. Every card unmounts, so state kept here was destroyed
          before the modal could paint and "Register opened" stayed a promise
          the screen never kept. Held one level up, the grid can come and go
          around it. */}
    </>
  )
}

/* ═══════════════════════════════════════════════════════
   The running lamp
   ═══════════════════════════════════════════════════════ */

type RunningLightState = 'running' | 'overdue' | 'idle' | 'unknown'

/**
 * A green pulse while a class of this group is running; a steady amber dot
 * once that class is past its end and still open. Nothing otherwise.
 *
 * This used to be a two-colour lamp — green live, red idle — and the red one
 * was the bug the desk reported. It sat immediately beside the card's other
 * dot, the enrollment state the server sends as `status_color`, so every
 * ordinary group wore a green dot and a red dot at the same time with nothing
 * to say which was which. Red is read as a fault; "this group meets on
 * Thursday and today is Tuesday" is not one, and it is the state of almost
 * every card at almost every moment. A fault light that is on 95% of the time
 * carries no information at all.
 *
 * So the lamp speaks only when it has something to say. A group that is live
 * gets a pulsing green dot — a real, rare, actionable fact, and the same one
 * that unlocks "End Class" in the ☰ beside it. A group that is not gets
 * nothing, and the card is left with a single dot whose meaning is unambiguous
 * because there is only one of it.
 *
 * Amber is the other half of the same fix. A class whose end time has passed
 * is *still* `in_progress` on the server — nothing closes a class on a timer
 * (`tasks/cron_jobs.py` deliberately does not; ending a class is what settles
 * money and it is PIN-gated) — so a lamp reading the status alone went on
 * pulsing green for a class that finished at nine. Green now means running and
 * amber means "this one is over and needs a decision", which is the same fact
 * the ☰ beside it is waiting to act on.
 *
 * It is a different colour rather than the same dot with a different label
 * because the desk reads this corner at a glance from across the room, and the
 * two call for opposite actions: extend the class, or close it. It does not
 * pulse — a pulse says "happening now", and what is happening is that nothing
 * is. `--gold` matches the "unscheduled" mark in `ClassGrid`, so amber already
 * means attention in this tab, not running.
 *
 * `unknown` (the first read has not landed) renders nothing for the same
 * reason it always did: guessing would be inventing a fact.
 */
function RunningLight({ state }: { state: RunningLightState }) {
  if (state === 'idle' || state === 'unknown') return null

  const overdue = state === 'overdue'
  const label = overdue
    ? 'A class of this group is past its end time and still open'
    : 'A class of this group is in progress'

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      // ring-2 plus the 2px dot is 6px of paint; `shrink-0` keeps the flex row
      // from eating into the gap between it and the ☰ on a long class name.
      className={cn(
        'w-2 h-2 rounded-full shrink-0 transition-colors duration-200',
        overdue
          ? 'bg-[var(--gold)] ring-2 ring-[var(--gold)]/25'
          : 'bg-[var(--emerald)] ring-2 ring-[var(--emerald)]/25 animate-pulse',
      )}
    />
  )
}

/* ═══════════════════════════════════════════════════════
   The free-session chip
   ═══════════════════════════════════════════════════════ */

/**
 * "This group's next class is on the house."
 *
 * The free flag is a fact about one session, not about the group, so this
 * chip reports the session the menu would open — the same `next` the lamp and
 * the ☰ are built from. It is read off the row the server sent; nothing is
 * inferred, and a group whose free session has already run shows nothing.
 *
 * It exists because the flag's whole purpose is invisible otherwise: a free
 * session spends no credit and writes no revenue, and without a mark on the
 * card the only way to know one is coming was to open the menu and look. The
 * chip is the tell — on the Classes page it is the only place a group's week
 * is visible at all.
 */
function FreeChip() {
  const label = 'The next class of this group is free — no credit spent, no revenue'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 px-1.5 py-[1px] rounded-full',
        'text-[9px] font-bold tracking-wide leading-none',
        'text-[var(--emerald)] bg-[var(--emerald-soft)]/60',
        'ring-1 ring-[var(--emerald)]/30',
      )}
    >
      FREE
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   The ☰ when there is no session to open a menu on
   ═══════════════════════════════════════════════════════ */

/**
 * Same shape and colours as SessionMenu's own trigger, repeated here because
 * SessionMenu refuses to render without a session — which is right, and is
 * also why this corner needed a second trigger for the states where it has
 * none. Two class lists is the cost of not teaching the menu to run empty.
 */
const triggerCls = cn(
  'flex items-center justify-center w-5 h-5 rounded-md shrink-0',
  'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
  'disabled:opacity-40 disabled:cursor-default',
)

function NoSessionTrigger({
  loading,
  failed,
  onOpenGroup,
}: {
  loading: boolean
  failed: boolean
  onOpenGroup?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Same anchored placement as SessionMenu: fixed, measured from the button,
  // and flipped above when there is no room below.
  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const w = 224
      const x = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))
      const estH = 120
      const y =
        rect.bottom + 6 + estH > window.innerHeight
          ? Math.max(8, rect.top - estH)
          : rect.bottom + 6
      setPos({ x, y })
    }
    setOpen((o) => !o)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', () => setOpen(false), true)
    window.addEventListener('resize', () => setOpen(false))
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => e.stopPropagation()}
        disabled={loading}
        className={triggerCls}
        aria-label="Group menu"
        title={loading ? 'Loading this group’s sessions…' : 'Group menu'}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Menu size={14} />}
      </button>

      {open && (
        <div
          ref={popRef}
          className={cn(
            'fixed z-50 w-56 rounded-xl border border-[var(--glass-border)]',
            'bg-[var(--card-bg)] shadow-2xl animate-fade-in overflow-hidden',
            'p-3',
          )}
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            {failed ? (
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-[var(--red)]" />
            ) : (
              <CalendarOff size={14} className="shrink-0 mt-0.5 text-[var(--muted)]" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text)]">
                {failed ? 'Could not read the schedule' : 'No upcoming session'}
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">
                {failed
                  ? 'The server did not answer, so this group has no menu to offer. Reload to try again.'
                  : 'Start Class, End Class and the free-session flag all act on one session, and this group has none scheduled from today on.'}
              </p>
            </div>
          </div>

          {onOpenGroup && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenGroup() }}
              className={cn(
                'mt-2.5 w-full flex items-center justify-between gap-2',
                'px-2 py-1.5 rounded-lg text-[11px] font-medium',
                'text-[var(--text)] bg-[var(--glass)] hover:bg-[var(--glass-border)]',
                'transition-colors duration-150',
              )}
            >
              Open the group
              <ArrowRight size={11} />
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════
   End Class — the PIN step
   ═══════════════════════════════════════════════════════ */

/**
 * Ending a class is where money moves: every student left ABSENT is charged
 * according to the academy's Billing Rules, and the register is closed. That
 * is why the server gates it behind a step-up PIN and why this modal exists —
 * SessionMenu's "End Class" fires `onFinish` and expects its parent to collect
 * the PIN, so a card that passed no handler would look like a dead menu item.
 */
function EndClassModal({
  session,
  onClose,
  onEnded,
}: {
  session: Session
  onClose: () => void
  onEnded: () => void
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = useCallback(async () => {
    const trimmed = pin.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setErr(null)
    try {
      const { data } = await api.post(`/sessions/${session.id}/end`, { pin: trimmed })
      const absent = data?.absent ?? 0
      const charged = data?.charged_absences ?? 0
      toast.success(
        data?.already_ended ? 'Class already finished' : 'Class finished',
        absent > 0
          ? `${absent} absent — ${charged} charged for the missed session.`
          : 'Everyone was present. No credits moved.',
      )
      onEnded()
    } catch (e) {
      // A wrong PIN is a 403 from verify_staff_pin; show the server's own
      // sentence, which distinguishes it from a tenant or permission refusal.
      setErr(serverMessage(e, 'Could not end the class.'))
    } finally {
      setBusy(false)
    }
  }, [pin, busy, session.id, onEnded])

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="End class"
      size="sm"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={cn(
              'flex-1 py-2 rounded-xl text-sm font-medium',
              'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
              'hover:bg-[var(--glass)] transition-colors duration-150',
              'disabled:opacity-40',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !pin.trim()}
            className={cn(
              'flex-1 py-2 rounded-xl text-sm font-semibold text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            )}
          >
            {busy ? 'Ending…' : 'End Class'}
          </button>
        </div>
      }
    >
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        {session.class_name ?? 'This class'}
        {session.date ? ` · ${session.date}` : ''}
        {session.start_time ? ` · ${session.start_time}` : ''}
      </p>
      <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
        Closing the register marks the class conducted. Anyone still marked absent
        is charged for the missed session, under this academy's Billing Rules.
      </p>

      <label className="block text-xs font-medium mt-4 mb-1.5 text-[var(--muted)]">
        Staff PIN
      </label>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => { setPin(e.target.value); setErr(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
        placeholder="••••"
        className={cn(
          'w-full px-3 py-2 rounded-xl text-sm tracking-[0.3em]',
          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
          'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
          'placeholder:text-[var(--muted)]/50 transition-shadow duration-150',
        )}
      />
      {err && (
        <p className="text-xs mt-2 text-[var(--red)]" role="alert">{err}</p>
      )}
    </Modal>
  )
}

export default ClassCardMenu
