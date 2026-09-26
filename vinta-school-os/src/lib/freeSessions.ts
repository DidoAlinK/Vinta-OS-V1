/**
 * Vinta School OS — free sessions, as the server records them
 *
 * A free session is one nobody is charged for: the teacher pays, no credit
 * leaves the student's plan, and no revenue is written. That is a fact
 * about a session row, and it lives in `sessions.is_free_session` — the
 * column the register's start-up path, the billing service and the
 * finalise step all already read.
 *
 * It used to live in localStorage instead. The hamburger staged a per-group
 * "the next one is free" mark, and a sweep adopted it onto whichever
 * session turned out to be next. The server never saw any of it, which
 * meant the one thing the flag exists to do — stop a credit being spent —
 * did not happen, and two browsers could disagree about whether a session
 * was free. A mark that only exists in the tab that made it is not a
 * decision the academy can rely on.
 *
 * There is one answer now, and it is read off the session being rendered.
 */

import api from './api'
import type { Session } from '../types/class'

/**
 * Is this session free?
 *
 * Takes the session rather than its id on purpose: the answer is a field on
 * the row, so a caller holding only an id has nothing to answer with — and
 * that is exactly how the localStorage version came to exist.
 */
export function isSessionFree(session: Session | null | undefined): boolean {
  return Boolean(session?.is_free_session)
}

/**
 * Write the flag. The only way it changes.
 *
 * `is_free_session` is one of the few fields a scheduled session may be
 * PATCHed with, and the server refuses it on a finished or cancelled row —
 * which is the right answer: there is no billing left to suppress.
 */
export async function setSessionFree(sessionId: string, isFree: boolean): Promise<void> {
  await api.patch(`/sessions/${sessionId}`, { is_free_session: isFree })
}

/**
 * The group's next session after `session` — the row a "next time free" mark
 * belongs on.
 *
 * Asked of the server rather than read off the loaded week, because the next
 * session of a group is usually *not* in the week on screen: the weekly grid
 * shows seven days, and a group that meets on Mondays has no next session
 * anywhere in a Thursday view. Searching the loaded list would have answered
 * "there is none" for almost every session the desk opens.
 *
 * Rows that are already finished or cancelled are excluded before the choice
 * is made, not after: "after" has to mean the next session that can still be
 * billed, and a cancelled occurrence is not a candidate just because it sorts
 * first.
 *
 * Returns null when the group has nothing left scheduled — an honest answer,
 * and one the caller has to say out loud rather than silently mark this
 * session instead.
 */
export async function findNextSession(session: Session | null | undefined): Promise<Session | null> {
  if (!session?.class_id) return null
  const { data } = await api.get('/sessions', {
    params: {
      class_id: session.class_id,
      from: session.date,
      status: 'scheduled',
      limit: 50,
    },
  })
  const list: Session[] = data?.sessions ?? []
  const thisStart = session.start_time ?? ''
  return (
    list
      .filter((s) => s.id !== session.id)
      .filter((s) => s.date > session.date || (s.date === session.date && (s.start_time ?? '') > thisStart))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))[0] ?? null
  )
}

export default isSessionFree
