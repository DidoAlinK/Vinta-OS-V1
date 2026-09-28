/**
 * Vinta School OS — the subject a teacher teaches
 *
 * A teacher is registered with the subject they teach: `subject`, the single
 * string on the profile, plus the `subjects` links the teacher form writes.
 * The groups they are assigned to are groups of that subject — which is why
 * picking a teacher in a class form should fill the subject in, exactly as
 * picking a group fills the teacher in.
 *
 * Read once, here, because three forms ask for a teacher next to a subject and
 * all three must agree on the answer. If one derived it from the profile
 * string and another from the links, the same teacher would file one group as
 * "Math" and the next as "Arabic".
 *
 * Only an unambiguous answer is returned. A teacher registered for one subject
 * fills the field; a teacher registered for several (or none) returns
 * undefined and the form leaves whatever is there alone — silently picking
 * between two subjects is how a group ends up filed under the wrong one.
 */

/** The teacher's subject, or undefined when the profile does not say (or says several). */
export function teacherSubjectOf(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const teacher = raw as { subject?: unknown; subjects?: unknown }

  // The profile's own field wins: it is the stated primary subject.
  if (typeof teacher.subject === 'string') {
    const primary = teacher.subject.trim()
    if (primary) return primary
  }

  // Nothing stated — fall back to the links, and only when there is exactly one.
  if (!Array.isArray(teacher.subjects)) return undefined
  const names = teacher.subjects
    .map((link) => {
      const name = (link as { name?: unknown } | null)?.name
      return typeof name === 'string' ? name.trim() : ''
    })
    .filter(Boolean)

  return names.length === 1 ? names[0] : undefined
}
