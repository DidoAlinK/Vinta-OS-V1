/**
 * Vinta School OS — T1 session start/end scheduler (frontend-only)
 * Fires a "scheduled to start NOW" toast with [Start Class] [Snooze 5 min]
 * and an end-time "Has this class finished?" toast that opens the finish flow.
 * Callbacks are injected by the dashboard so this module stays UI-agnostic
 * except for the toast store.
 */

import { toast } from '../stores/uiStore'
import type { Session } from '../types/class'
import {
  getLifecycleRecord,
  getScheduledEnd,
  getScheduledStart,
  isSnoozed,
  updateLifecycleRecord,
} from './sessionLifecycle'

export interface SessionNotifierHooks {
  /** Start flow (hamburger early-start path): POST /sessions/<id>/start */
  onStartClass: (session: Session) => void
  /** End flow: open FinalizeSessionModal (PIN) -> CONDUCTED + payout + freeze */
  onFinishClass: (session: Session) => void
  /** Extra "Running Late +10min" — extends the end-toast trigger */
  onRunningLate: (session: Session) => void
  /** Status resolver — effective lifecycle status for gating toasts */
  getStatus: (session: Session) => 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}

const START_GRACE_MS = 2 * 60 * 1000
const SNOOZE_MS = 5 * 60 * 1000

export function checkSessionNotifications(
  sessions: Session[],
  hooks: SessionNotifierHooks,
  now: Date = new Date(),
): void {
  for (const session of sessions) {
    const status = hooks.getStatus(session)
    if (status === 'completed' || status === 'cancelled') continue

    const rec = getLifecycleRecord(session.id)

    // ── Start toast: at scheduledStartTime (once, unless snoozed) ──
    if (status === 'scheduled' && !rec.startNotified) {
      const start = getScheduledStart(session)
      if (start && now.getTime() >= start.getTime() && !isSnoozed(session.id, now)) {
        updateLifecycleRecord(session.id, { startNotified: true })
        toast.info(`🔔 ${session.class_name} scheduled to start NOW`, `${session.subject} · ${session.teacher_name}`, {
          duration: 0,
          actions: [
            { label: 'Start Class', primary: true, keepOnClick: true, onClick: () => hooks.onStartClass(session) },
            {
              label: 'Snooze 5 min',
              onClick: () => updateLifecycleRecord(session.id, {
                startNotified: false,
                snoozedUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
              }),
            },
          ],
        })
      }
    }

    // ── End toast: at scheduledEndTime while IN_PROGRESS (once) ──
    if (status === 'in_progress' && !rec.endNotified) {
      const end = getScheduledEnd(session, rec.lateMinutes ?? 0)
      if (end && now.getTime() >= end.getTime() - START_GRACE_MS) {
        updateLifecycleRecord(session.id, { endNotified: true })
        toast.warning('Has this class finished?', `${session.class_name} · scheduled end reached`, {
          duration: 0,
          actions: [
            { label: 'Yes, Class Done', primary: true, keepOnClick: true, onClick: () => hooks.onFinishClass(session) },
            { label: 'No, Running Late +10min', onClick: () => hooks.onRunningLate(session) },
          ],
        })
      }
    }
  }
}
