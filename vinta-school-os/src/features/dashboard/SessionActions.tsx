/**
 * Vinta School OS — T1 Session Lifecycle Actions
 * Start Class (greys + disabled on first click, records actualStartTime,
 * idempotent attendance init keyed by UNIQUE(studentId, sessionId)).
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
  updateLifecycleRecord,
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
    // Guard: double-click creates 1 row per student (button disables first).
    if (starting || started) return
    setStarting(true)
    try {
      // 1. Record actualStartTime (frontend lifecycle record; backend frozen).
      updateLifecycleRecord(session.id, {
        actualStartTime: new Date().toISOString(),
      })

      // 2. Idempotent attendance init — one row per enrolled student.
      //    Backend add_student_to_session returns (record, is_new): existing
      //    rows are returned without duplication = UNIQUE(studentId, sessionId).
      try {
        const { data } = await api.get(`/classes/${session.class_id}/students`)
        const enrolled: Array<{ id: string }> = data.students ?? []
        await Promise.all(
          enrolled.map((s) =>
            api.post('/attendance/add-to-session', {
              session_id: session.id,
              student_id: s.id,
            }).catch(() => null),
          ),
        )
      } catch {
        // T2 owns the attendance grid + Retry UX; Start must not fail here.
        toast.warning('Class started, roster pending', 'Attendance rows will retry when the grid opens.')
      }

      toast.success('Class started', `${session.class_name} is now in progress.`)
      onStarted?.(session)
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
