/**
 * Vinta School OS — What a group's card says is happening
 *
 * `GET /classes` decides this for every group and sends it as `status_color`:
 *
 *   amber  Scheduled   students enrolled and a time on the books; the class
 *                      has not started
 *   green  Active      the class is running and somebody is in the room
 *   red    Empty       the class is running with nobody in it, or the group
 *                      has students and no time at all — it can never run as
 *                      it stands
 *   grey   Empty       nobody enrolled, nothing to teach
 *
 * Two colours share the word "Empty" deliberately: the word is about the room
 * (there is nobody in it), and the colour is about whether the desk should
 * care (red = somebody is supposed to be in there).
 *
 * "Full" was a state here and is gone. A room at capacity is not a state of
 * the day's teaching — it outranked everything else, so a full group running
 * with everybody present was painted the same red as a full group that never
 * meets, and the colour said nothing. The count is still on the card, in the
 * enrollment bar, which is where a number belongs.
 *
 * The server's answer is the answer. The fallback below mirrors it for any
 * payload that predates a field, using only facts that payload actually
 * carries — an absent fact is never read as one, or a thin response would put
 * the same word on every card.
 */

import type { Class } from '../types/class'

export type ClassState = 'scheduled' | 'active' | 'empty' | 'unattended'

/** Scheduled / active / empty / unattended, as the server sees it. */
export function classStateOf(cls: Class): ClassState {
  switch (cls.status_color) {
    case 'amber':
      return 'scheduled'
    case 'green':
      return 'active'
    case 'grey':
      return 'empty'
    case 'red':
      return 'unattended'
  }

  // No status_color on this payload: derive it the way `list_classes` does.
  //
  // `is_running` is the server's own fact about its own clock. Only `true` can
  // make a card say Active; when the flag is missing we cannot know a class is
  // on, so the worst we may say is "scheduled" — never "active".
  const enrolled = cls.enrolled_count ?? 0
  if (cls.is_running === true) {
    return (cls.students_present ?? 0) > 0 ? 'active' : 'unattended'
  }
  if (enrolled <= 0) return 'empty'

  // Students, so the server's last branch turns on whether the group meets.
  // Answer it only from a schedule list this payload really carried — `[]`
  // means no time was ever set, `undefined` means nobody asked.
  if (Array.isArray(cls.schedules) && cls.schedules.length === 0) return 'unattended'
  return 'scheduled'
}

/**
 * How far along the enrollment bar is, as a percentage.
 *
 * 0 when there is no capacity to divide by. `Math.min(NaN, 100)` is NaN, and a
 * width of `NaN%` is dropped by the browser — which leaves the bar at its full
 * width, so a group with no capacity set looked like a packed room.
 */
export function classFillPercent(cls: Class): number {
  const capacity = cls.capacity ?? 0
  const enrolled = cls.enrolled_count ?? 0
  if (capacity <= 0) return 0
  return Math.min((enrolled / capacity) * 100, 100)
}
