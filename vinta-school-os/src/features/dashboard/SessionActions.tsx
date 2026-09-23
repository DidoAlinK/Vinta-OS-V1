/**
 * Vinta School OS — T1 Session Lifecycle Actions
 * Start Class POSTs /sessions/:id/start — the backend owns the clock and the
 * register (it materialises one ABSENT row per enrolled student, idempotently).
 * Finish ("Class Done") opens the PIN finalize flow owned by the parent.
 */

import { useCallback, useState } from 'react'
import { Play, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import type { Session } from '../../types/class'
import {
  canFinish,
  canStart,
  type LifecycleStatus,
} from '../../lib/sessionLifecycle'

export interface SessionActionsProps {
  session: Session
  status: LifecycleStatus
  onStarted?: (session: Session) => void
  onFinishRequest?: (session: Session) => void
}

export function SessionActions({ session, status, onStarted, onFinishRequest }: SessionActionsProps) {
  const [starting, setStarting] = useState(false)
  const started = !canStart(status)

  const handleStart = useCallback(async () => {
    // Guard: the button disables on first click; the endpoint is idempotent
    // anyway (a repeat POST returns already_started and does not restart).
    if (starting || started) return
    setStarting(true)
    try {
      // Server owns Start: it stamps actual_start_time and materialises the
      // attendance register (one ABSENT row per enrolled student). The
      // frontend no longer seeds the roster — that was a second pass.
      await api.post(`/sessions/${session.id}/start`)
      toast.success('Class started', `${session.class_name} is now in progress.`)
      onStarted?.(session)
    } catch (err: any) {
      // 404 = session not in this academy; 409 = already conducted/cancelled.
      const backend = err?.response?.data?.error
      toast.error(
        'Could not start class',
        typeof backend === 'string' && backend
          ? backend
          : 'The class was not started. Please try again.',
      )
    } finally {
      setStarting(false)
    }
  }, [session, started, starting, onStarted])

  const handleFinish = useCallback(() => {
    onFinishRequest?.(session)
  }, [session, onFinishRequest])

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleStart}
        disabled={started || starting}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-semibold text-white',
          'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
          'hover:opacity-90 active:scale-[0.98] transition-all',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
        )}
        title={started ? 'Class already started' : 'Start Class Now'}
      >
        {starting ? (
          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {started ? 'In Progress' : starting ? 'Starting…' : 'Start Class'}
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
        title={canFinish(status) ? 'Finish class (PIN) — finalize + payout' : 'Finish available once the class is in progress'}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Class Done
      </button>
    </div>
  )
}

export default SessionActions
