/**
 * Loads the full detail record for one student.
 *
 * Why this exists: the students *list* route returns a summary — no
 * `enrollments`, no `guardians`, no `billing_calendar`. The drawer needs all
 * three, so it fetches the detail route rather than trying to reconstruct them
 * from the row it was handed.
 *
 * The row passed into the drawer is still used as the initial value, so the
 * panel paints immediately with the name and status it already knows instead of
 * flashing empty. `profile` therefore starts as the summary and is replaced by
 * the detail payload when it lands.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../../lib/api'
import type { Student } from '../../../types/student'

export interface UseStudentProfileResult {
  /** Detail payload once loaded; the summary row until then. */
  profile: Student | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStudentProfile(
  studentId: string | null,
  /** Summary row from the list, used as the pre-fetch value. */
  seed?: Student | null,
): UseStudentProfileResult {
  const { t } = useTranslation('students')
  const [profile, setProfile] = useState<Student | null>(seed ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request id: a slow response for a previously-selected student
  // must never overwrite the record the user is looking at now.
  const requestId = useRef(0)

  const load = useCallback(async (id: string) => {
    const current = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<Student>(`/students/${id}`)
      if (current !== requestId.current) return
      setProfile(data)
    } catch {
      if (current !== requestId.current) return
      // Leave any seeded summary on screen — a failed detail fetch is not a
      // reason to blank a student who demonstrably exists in the list.
      //
      // Note: `StudentDrawer` currently reads only `profile` and `loading` from
      // this hook and never destructures `error`, so this sentence is not on
      // screen anywhere today. It is translated rather than left in English so
      // that wiring it up later does not uncover a stray English string.
      setError(t('drawer.profileError'))
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!studentId) {
      requestId.current++
      setProfile(null)
      setLoading(false)
      setError(null)
      return
    }
    setProfile(seed ?? null)
    void load(studentId)
    // `seed` is intentionally not a dependency: it is the same object the
    // caller already re-renders on, and depending on it would refetch on every
    // parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, load])

  const refresh = useCallback(() => {
    if (studentId) void load(studentId)
  }, [studentId, load])

  return { profile, loading, error, refresh }
}

export default useStudentProfile
