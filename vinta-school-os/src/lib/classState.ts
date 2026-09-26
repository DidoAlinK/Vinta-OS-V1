/**
 * Vinta School OS — A group's enrollment state
 *
 * `GET /classes` decides this for every group and sends it as `status_color`
 * (red / amber / green / grey), derived from the active enrollment count with one
 * guard worth repeating: a capacity of 0 means "nobody has set a capacity", not
 * "no seats left". The screens are where that is easy to get wrong — `enrolled >=
 * capacity` reads a group with no capacity as permanently full, and an unguarded
 * `enrolled / capacity` prints `NaN%`.
 *
 * So the server's answer is the answer, and the fallback mirrors it exactly for
 * any payload that predates the field. Nothing here invents a state the server
 * would not have chosen — which is why the fallback can never return
 * `unscheduled`: whether a group meets is in the database, not in the payload,
 * and guessing it from a missing field would put "No schedule" on every card the
 * moment one request came back thin.
 */

import type { Class } from '../types/class'

export type ClassState = 'full' | 'active' | 'empty' | 'unscheduled'

/** Full / active / empty / unscheduled, as the server sees it. */
export function classStateOf(cls: Class): ClassState {
  switch (cls.status_color) {
    case 'red':
      return 'full'
    case 'amber':
      return 'unscheduled'
    case 'green':
      return 'active'
    case 'grey':
      return 'empty'
  }

  // No status_color on this payload: derive it the way `list_classes` does.
  const capacity = cls.capacity ?? 0
  const enrolled = cls.enrolled_count ?? 0
  if (capacity > 0 && enrolled >= capacity) return 'full'
  return enrolled > 0 ? 'active' : 'empty'
}

/**
 * How far along the enrollment bar is, as a percentage.
 *
 * 0 when there is no capacity to divide by. `Math.min(NaN, 100)` is NaN, and a
 * width of `NaN%` is dropped by the browser — which leaves the bar at its full
 * width, so a group with no capacity looked like a full one.
 */
export function classFillPercent(cls: Class): number {
  const capacity = cls.capacity ?? 0
  const enrolled = cls.enrolled_count ?? 0
  if (capacity <= 0) return 0
  return Math.min((enrolled / capacity) * 100, 100)
}
