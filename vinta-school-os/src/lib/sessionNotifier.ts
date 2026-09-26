/**
 * Vinta School OS — T1 session start/end scheduler (frontend-only)
 * Fires a "scheduled to start NOW" toast with [Start Class] [Snooze 5 min]
 * and an end-time "Has this class finished?" toast offering the three answers
 * the desk can give: finish it, extend it, or void it.
 * Callbacks are injected by the caller so this module stays UI-agnostic
 * except for the toast store.
 */

import { toast } from '../stores/uiStore'
import type { Session } from '../types/class'
import { EXTEND_MINUTES } from './extendSession'
import {
  getLifecycleRecord,
  getScheduledEnd,
  getScheduledStart,
  isSessionDay,
  isSnoozed,
  updateLifecycleRecord,
} from './sessionLifecycle'

export interface SessionNotifierHooks {
  /** Start flow (hamburger early-start path): POST /sessions/<id>/start */
  onStartClass: (session: Session) => void
  /** End flow: open FinalizeSessionModal (PIN) -> CONDUCTED + payout + freeze */
  onFinishClass: (session: Session) => void
  /** "Extend +15" — pushes the session's end time out on the server */
  onExtend: (session: Session) => void
  /**
   * "Void Class" — abandons a class that ran but will not be charged.
   *
   * Optional, and the action is hidden without it, so a mount point that has
   * no session menu to open a void modal from can leave it out rather than
   * offering a button that does nothing.
   *
   * Note the verb: a class that has *started* is VOIDED, never cancelled.
   * `canVoid` is `in_progress`-only and `canCancel` is `scheduled`-only (see
   * sessionLifecycle), so offering "Cancel" on a live class would be offering
   * an action the server refuses.
   */
  onVoid?: (session: Session) => void
  /** Status resolver — effective lifecycle status for gating toasts */
  getStatus: (session: Session) => 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}

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

    // ── Start toast: at scheduledStartTime, and re-asked until answered ──
    //
    // Re-asked, not asked once. A class stays a plan until the desk starts it
    // — nothing else promotes it — so this prompt is the only thing between a
    // scheduled class and a class that quietly never happened. It used to
    // fire once behind a boolean cleared only by pressing Snooze, so a prompt
    // that arrived while nobody was at the screen was gone for good: the
    // browser held 17 such records while 555 sessions sat `scheduled`, every
    // one a class the desk was never asked about again.
    //
    // Firing now puts it quiet for SNOOZE_MS and then it comes back, which is
    // what "reprompt every 5 minutes till handled" means in practice. It
    // stops when the class is started (status leaves `scheduled`), when it is
    // cancelled, or when its day is over — and the day bound is the same one
    // the server enforces on Start, because prompting about a class the
    // server will refuse to start is offering a button that cannot work.
    //
    // That bound is also what keeps this from nagging about history: the 555
    // past `scheduled` rows are all outside their day and stay quiet.
    if (
      status === 'scheduled' &&
      isSessionDay(session, now) &&
      !isSnoozed(session.id, now)
    ) {
      const start = getScheduledStart(session)
      if (start && now.getTime() >= start.getTime()) {
        // Quiet for the next five minutes. This is also what makes a second
        // mount point in the same instant safe: whichever page fires first
        // writes the snooze, and loadAll() re-reads storage on every call, so
        // the other sees it rather than raising a duplicate prompt.
        updateLifecycleRecord(session.id, {
          snoozedUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
        })
        toast.info(`🔔 ${session.class_name} scheduled to start NOW`, `${session.subject} · ${session.teacher_name}`, {
          // One question, one answer: re-asking replaces the copy on screen
          // rather than stacking another. See `key` on the toast store.
          key: `session-start:${session.id}`,
          // 0 = stays until the desk answers it. A nudge that has to be read
          // before the class starts should not time out.
          duration: 0,
          actions: [
            // Both actions dismiss: one starts the class, the other puts the
            // nudge off for five minutes. Either way this toast has been
            // dealt with, and the start flow raises its own error if the
            // server refuses.
            { label: 'Start Class', primary: true, onClick: () => hooks.onStartClass(session) },
            {
              // Same five minutes it would have waited anyway, but pressed:
              // it takes the question off the screen now and brings it back
              // on a clock the desk started themselves.
              label: 'Snooze 5 min',
              onClick: () => updateLifecycleRecord(session.id, {
                snoozedUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
              }),
            },
          ],
        })
      }
    }

    // ── End toast: once IN_PROGRESS and past its end time ──
    //
    // "Once" is per end time, not per class: the record holds the end time
    // this toast was fired for, so pressing Extend moves the session's end
    // and the desk is asked again when the new one arrives. A boolean would
    // have to be cleared by whoever extended — and an extension made on
    // another device would never clear it here.
    //
    // The prompt fires when the class is OVER, not two minutes before it.
    // It used to fire at `end - 2min`, which made the toast ask "has this
    // finished?" about a class that had not; and since the running lamp went
    // amber at `end`, the two disagreed for those two minutes — the lamp
    // saying "should have finished" while the prompt had not yet been asked.
    // Deriving both from the same boundary keeps them in step: the moment the
    // lamp turns amber is the moment this question is put.
    if (status === 'in_progress' && rec.endNotifiedFor !== session.end_time) {
      const end = getScheduledEnd(session)
      // An unparsable end time means we cannot say the class is over, so we
      // stay quiet rather than nagging on a guess.
      if (end && now.getTime() >= end.getTime()) {
        updateLifecycleRecord(session.id, { endNotifiedFor: session.end_time })
        toast.warning('Has this class finished?', `${session.class_name} · past its scheduled end`, {
          // Same reason as the start prompt: one question, one answer, so a
          // repeat replaces rather than stacks. This one is normally armed
          // once per end time, but if a storage write ever fails the record
          // never lands and every tick would raise a fresh copy.
          key: `session-end:${session.id}`,
          // 0 = stays until the desk answers it. Finishing, extending and
          // voiding are all deliberate acts, and none should be raced by a
          // timer — least of all voiding, which is the one that discards money.
          duration: 0,
          actions: [
            // Every action dismisses. "Yes" opens the PIN/finalize flow, which
            // has its own error reporting; "Extend" pushes the end time out and
            // this toast re-arms itself for the new one; "Void" opens the
            // owner-PIN void modal. Leaving any of them on screen after it has
            // been answered just makes the desk dismiss the same question twice.
            { label: 'Yes, Class Done', primary: true, onClick: () => hooks.onFinishClass(session) },
            { label: `No, Extend +${EXTEND_MINUTES} min`, onClick: () => hooks.onExtend(session) },
            ...(hooks.onVoid
              ? [{ label: 'Void Class', onClick: () => hooks.onVoid!(session) }]
              : []),
          ],
        })
      }
    }
  }
}
