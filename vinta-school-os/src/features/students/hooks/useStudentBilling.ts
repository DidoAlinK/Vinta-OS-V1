/**
 * Loads a student's purchase history — one row per subscription.
 *
 * This is the money trail: what was actually paid, when, by which method, and
 * how many credits it bought. It is deliberately separate from the student
 * profile, which answers "what plan are they on" and derives that from the
 * group they are enrolled in.
 *
 * An empty list is a legitimate, common answer (a newly-created student has
 * bought nothing). It is reported as an empty list, never as an error, so the
 * UI can say "no payments recorded yet" rather than implying a failure.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../../lib/api'
import type { Subscription } from '../../../types/billing'

export interface UseStudentBillingResult {
  subscriptions: Subscription[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStudentBilling(studentId: string | null): UseStudentBillingResult {
  const { t } = useTranslation('students')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestId = useRef(0)

  const load = useCallback(async (id: string) => {
    const current = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ subscriptions?: Subscription[] }>(
        '/billing/subscriptions',
        { params: { student_id: id } },
      )
      if (current !== requestId.current) return
      const list = data?.subscriptions
      setSubscriptions(Array.isArray(list) ? list : [])
    } catch {
      if (current !== requestId.current) return
      setSubscriptions([])
      // The one sentence this hook owns. It is resolved here because the
      // hook's contract is a ready-to-render string — so a language switch
      // *after* a failure leaves this sentence in the language it failed in
      // until the next retry, which the red pane makes obvious enough.
      setError(t('history.error'))
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!studentId) {
      requestId.current++
      setSubscriptions([])
      setLoading(false)
      setError(null)
      return
    }
    void load(studentId)
  }, [studentId, load])

  const refresh = useCallback(() => {
    if (studentId) void load(studentId)
  }, [studentId, load])

  return { subscriptions, loading, error, refresh }
}

export default useStudentBilling
