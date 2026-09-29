/**
 * Vinta School OS — weekly slot blocks.
 *
 * A group can meet more than once a week, and both places that collect a
 * group's timetable collect it the same way: a list of blocks, each with its
 * own weekday and its own start and end. This module is that shape, plus the
 * conversions it needs — a block into the body `POST /classes/:id/schedules`
 * takes, and the fingerprint the forms use to refuse the same slot twice
 * before the server has to.
 *
 * Shared by the Add Course Group drawer (ClassesPage) and the group's own edit
 * panel (ClassDetail) so the two cannot drift apart.
 */

/** A slot of a weekly timetable, as the forms hold it. */
export interface WeeklySlot {
  /**
   * A stable React key. Deliberately not the array index: a block can be
   * removed from the middle, and an index would then re-key every block after
   * it, resetting their inputs mid-edit.
   */
  id: string
  /** Anchor date, "YYYY-MM-DD" — only the weekday is used. */
  dayAnchor: string
  startTime: string
  endTime: string
}

/** A block as `POST /classes/:id/schedules` takes it. */
export interface WeeklyScheduleInput {
  day_of_week: number
  start_time: string
  end_time: string
}

/** One block per weekday is the most a weekly timetable can mean. */
export const WEEKLY_SLOT_LIMIT = 7

let slotSeq = 0

/**
 * A key for one open form's block list.
 *
 * Not `crypto.randomUUID`: that is only exposed in a secure context, and this
 * academy's server may well be reached over plain http on the staff LAN, where
 * reaching for it would throw. A counter plus noise is unique enough for keys
 * that live only as long as one open form.
 */
export function newSlotId(): string {
  slotSeq += 1
  return `slot-${slotSeq}-${Math.random().toString(36).slice(2, 10)}`
}

export function blankSlot(): WeeklySlot {
  return { id: newSlotId(), dayAnchor: '', startTime: '', endTime: '' }
}

/**
 * The model's own weekday indexing — 0 is Sunday — from an anchor date, or -1
 * when the block has no day yet.
 *
 * Midday is deliberate: midnight would let a timezone or DST shift roll the
 * date onto the previous weekday and silently move the meeting by a day.
 */
export function dowOf(anchor: string): number {
  if (!anchor) return -1
  const dow = new Date(`${anchor}T12:00:00`).getDay()
  return Number.isNaN(dow) ? -1 : dow
}

/**
 * What makes two blocks the same meeting.
 *
 * The server dedupes on `(class_id, classroom_id, day_of_week, start_time,
 * end_time)` and answers 409 for a repeat. Catching it here means the desk
 * hears about it while the form is still open — a weekly group created through
 * this form is not rolled back, so a duplicate found afterwards has already
 * cost a request and a toast to explain.
 */
export function slotFingerprint(dayAnchor: string, startTime: string, endTime: string): string {
  return `${dowOf(dayAnchor)}|${startTime}|${endTime}`
}

export function toScheduleInput(slot: WeeklySlot): WeeklyScheduleInput {
  return {
    day_of_week: dowOf(slot.dayAnchor),
    start_time: slot.startTime,
    end_time: slot.endTime,
  }
}
