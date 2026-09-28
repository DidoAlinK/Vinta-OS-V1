/**
 * Vinta School OS — T1 Session Lifecycle Actions
 * Start Class POSTs /sessions/:id/start — the backend owns the clock and the
 * register (it materialises one ABSENT row per enrolled student, idempotently).
 * Finish ("Class Done") opens the PIN finalize flow owned by the parent.
 */

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import type { Session } from '../../types/class'
import { useNow } from '../../hooks/useNow'
import { formatDateISO } from '../../lib/formatters'
import {
  canFinish,
  canStart,
  startBlockReason,
  type LifecycleStatus,
} from '../../lib/sessionLifecycle'

export interface SessionActionsProps {
  session: Session
  status: LifecycleStatus
  onStarted?: (session: Session) => void
  onFinishRequest?: (session: Session) => void
}

export function SessionActions({ session, status, onStarted, onFinishRequest }: SessionActionsProps) {
  const { t } = useTranslation('dashboard')
  const [starting, setStarting] = useState(false)
  const now = useNow()
  const started = !canStart(status)

  /**
   * The clock half of the start rule.
   *
   * `started` answers the status question and the label says "In Progress".
   * This answers the other one — the class's own day — which the server
   * enforces too (`session_lifecycle_service.start_session`). Showing an
   * enabled Start on a class dated last week, or next month, would be
   * offering a button whose only outcome is a 409.
   */
  const blockedReason = started ? null : startBlockReason(session, now)

  /**
   * Why the button is off, in the reader's language.
   *
   * `startBlockReason` is the gate and stays the gate — it is the sentence the
   * library owns, and it is `null` for exactly one reason here (the class is
   * not on today's date; the "no class selected" branch cannot fire, the prop
   * is required). So the message is rebuilt from the same two dates rather
   * than printed from the library, which is English-only and off-limits.
   */
  const blockedMessage = t('actions.blocked', {
    // The library falls back to a word for a class with no date on it; an empty
    // pair of parentheses would read as a bug rather than as that same edge.
    date: session.date || t('actions.blockedUnknownDay'),
    today: formatDateISO(now),
  })

  // The tooltip repeats what the button says, including the reason it is off —
  // a disabled control with no explanation is what the desk rings the office
  // about, and the rule is a date they can check against the chip above.
  const startTitle = started
    ? t('actions.alreadyStarted')
    : blockedReason
      ? blockedMessage
      : t('actions.startNow')

  const handleStart = useCallback(async () => {
    // Guard: the button disables on first click; the endpoint is idempotent
    // anyway (a repeat POST returns already_started and does not restart).
    if (starting || started || blockedReason) return
    setStarting(true)
    try {
      // Server owns Start: it stamps actual_start_time and materialises the
      // attendance register (one ABSENT row per enrolled student). The
      // frontend no longer seeds the roster — that was a second pass.
      await api.post(`/sessions/${session.id}/start`)
      toast.success(
        t('actions.toast.startedTitle'),
        t('actions.toast.startedBody', { class: session.class_name }),
      )
      onStarted?.(session)
    } catch (err: any) {
      // 404 = session not in this academy; 409 = already conducted/cancelled.
      const backend = err?.response?.data?.error
      toast.error(
        t('actions.toast.startFailedTitle'),
        typeof backend === 'string' && backend
          ? backend
          : t('actions.toast.startFailedBody'),
      )
    } finally {
      setStarting(false)
    }
  }, [t, session, started, blockedReason, starting, onStarted])

  const handleFinish = useCallback(() => {
    onFinishRequest?.(session)
  }, [session, onFinishRequest])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={started || blockedReason !== null || starting}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-semibold text-white',
            'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
            'hover:opacity-90 active:scale-[0.98] transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
          )}
          title={startTitle}
        >
          {starting ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {started
            ? t('actions.inProgress')
            : starting
              ? t('actions.starting')
              : t('actions.start')}
        </button>

        <button
          type="button"
          onClick={handleFinish}
          disabled={!canFinish(status)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-semibold',
            'bg-[var(--emerald-soft)] text-[var(--emerald)]',
            'hover:brightness-95 active:scale-[0.98] transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
          )}
          title={canFinish(status) ? t('actions.finishTitle') : t('actions.finishDisabled')}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('actions.finish')}
        </button>
      </div>

      {/*
        Say why, not just grey the button out. A disabled control with no
        reason is the thing the desk asks the office about — and the rule
        here is a date, which they can check against the chip above.
      */}
      {blockedReason && (
        <p className="text-[11px] leading-snug text-[var(--muted)]">
          {blockedMessage}
        </p>
      )}
    </div>
  )
}

export default SessionActions
