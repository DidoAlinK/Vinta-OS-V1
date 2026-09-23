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
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Loader2, CalendarOff, AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { Modal } from '../../components/ui/Modal'
import type { Class, Session } from '../../types/class'
import { getEffectiveStatus } from '../../lib/sessionLifecycle'
import SessionMenu from '../dashboard/SessionMenu'

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

export interface ClassCardMenuProps {
  cls: Class
  /** Bump to make every card re-read its next session. */
  refreshToken?: number
  /** Something about this group changed — the page may want to reload. */
  onChanged?: () => void
  /** Open the group's own panel, for when there is no session to act on. */
  onOpenGroup?: () => void
}

export function ClassCardMenu({
  cls,
  refreshToken = 0,
  onChanged,
  onOpenGroup,
}: ClassCardMenuProps) {
  /** null until the first read lands — distinct from "read it, nothing there". */
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pinFor, setPinFor] = useState<Session | null>(null)

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

  const handleStart = useCallback(
    async (session: Session) => {
      try {
        const { data } = await api.post(`/sessions/${session.id}/start`)
        const opened = data?.roster_created ?? 0
        toast.success(
          data?.already_started ? 'Class already running' : 'Class started',
          opened > 0
            ? `Register opened — ${opened} student${opened === 1 ? '' : 's'} marked absent until they arrive.`
            : `${session.class_name ?? cls.name} is now in progress.`,
        )
        handleChanged()
      } catch (err) {
        toast.error(
          'Could not start the class',
          serverMessage(err, 'The server refused the request.'),
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
  const next =
    sessions?.find((s) => s.status === 'in_progress') ?? sessions?.[0] ?? null

  return (
    <>
      {next ? (
        <SessionMenu
          session={next}
          status={getEffectiveStatus(next)}
          sessions={sessions ?? undefined}
          onStart={handleStart}
          onFinish={setPinFor}
          onChanged={handleChanged}
        />
      ) : (
        <NoSessionTrigger
          loading={sessions === null}
          failed={failed}
          onOpenGroup={onOpenGroup}
        />
      )}

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
    </>
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
