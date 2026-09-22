/**
 * Vinta School OS — Session Check-In Modal (T2: False-Until-True paper grid)
 * On Start: all enrolled bulk-created as ABSENT (− red) [+ Present].
 * Click flips to PRESENT (+ green) [− Absent] for undo.
 * Bottom search bar + Guest: search any student, adds row + blue ⚡ Swap [Remove].
 * No silent catch: load failure shows toast + Retry; empty shows
 * "No students enrolled yet [Add Students]".
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  UserCheck,
  UserX,
  ArrowRightLeft,
  Lock,
  Check,
  CheckCircle2,
  Search,
  UserPlus,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { formatDa } from '../../lib/formatters'
import {
  getAbsenceConsumesCredit,
  getUnpaidDebt,
  getUnpaidDebtCount,
  recordUnpaidDebt,
} from '../../lib/billingRules'
import type { Session, SessionStudent, AttendanceStatus } from '../../types/class'
import { getToggle6 } from '../../lib/billingRules'
import { isSessionFree } from '../../lib/freeSessions'
import { getVoidRestoredCredits, isSessionVoided } from '../../lib/voidedSessions'
import {
  createSwapLink,
  getLinkByOriginal,
  getLinkBySwap,
  getLinksForStudent,
  removeLinkBySwap,
  sessionLabel,
} from '../../lib/swapLinks'

// ============================================
// Types
// ============================================

interface RosterEntry extends SessionStudent {
  subscription_badge?: string | null
  credits_remaining?: number | null
  access_end?: string | null
  /** True when added via bottom Guest search (not enrolled in this group) */
  is_guest_added?: boolean
  /** T4: display side — 'via_swap' (original Mon) or 'suppressed' (swap Wed) */
  via_swap_of?: string | null
  swap_suppressed_of?: string | null
  corrected_by?: string | null
  corrected_at?: string | null
}

interface StudentSearchResult {
  id: string
  full_name: string
  first_name?: string
  last_name?: string
  phone?: string
}

// ============================================
// Props
// ============================================

export interface SessionCheckInModalProps {
  isOpen: boolean
  onClose: () => void
  session: Session | null
  onSuccess?: () => void
}

// ============================================
// Status Config
// ============================================

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: typeof UserCheck; color: string; bg: string }> = {
  PRESENT: { label: 'Present', icon: UserCheck, color: 'var(--emerald)', bg: 'var(--emerald-soft)' },
  ABSENT: { label: 'Absent', icon: UserX, color: 'var(--red)', bg: 'var(--red-soft)' },
}

// ============================================
// Component
// ============================================

export default function SessionCheckInModal({
  isOpen,
  onClose,
  session,
  onSuccess,
}: SessionCheckInModalProps) {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<'roster' | 'pin' | 'done'>('roster')
  // T2: explicit error (never silent) + seeding state
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)

  // Bottom guest search
  const [guestQuery, setGuestQuery] = useState('')
  const [guestResults, setGuestResults] = useState<StudentSearchResult[]>([])
  const [guestSearching, setGuestSearching] = useState(false)
  const [showGuestResults, setShowGuestResults] = useState(false)
  const guestBoxRef = useRef<HTMLDivElement>(null)

  // Student statuses: student_id -> { status, is_group_swap }
  const [statuses, setStatuses] = useState<Record<string, { status: AttendanceStatus; is_group_swap: boolean }>>({})

  // T4 auto-link state (suppressed guest rows + via-swap overlays)
  const [swapTick, setSwapTick] = useState(0)
  const [linkBusy, setLinkBusy] = useState<string | null>(null)
  const staffName = useAuthStore((s) => s.user?.name ?? 'staff')

  // T5 debt-first state: group price/N + per-row subscription snapshot + Toggle 1
  const [groupN, setGroupN] = useState<number | null>(null)
  const [groupPrice, setGroupPrice] = useState<number | null>(null)
  const [creditMap, setCreditMap] = useState<Record<string, { remaining: number | null; hasSub: boolean }>>({})
  const [debtTick, setDebtTick] = useState(0)

  // T6: free-session routing (zero billing) + Toggle 6 (auto-present vs track)
  const isFree = session ? isSessionFree(session.id) : false
  const autoPresent = getToggle6(new Date())
  // T7: voided sessions freeze the grid — rows VOIDED, read-only.
  const isVoided = session ? isSessionVoided(session.id) : false

  // ── Fetch roster (extracted for Retry) ──
  const loadRoster = useCallback(async () => {
    if (!session) return
    setIsLoading(true)
    setStep('roster')
    setPin('')
    setRosterError(null)
    try {
      const { data } = await api.get(`/attendance/roster/${session.id}`)
      const entries: RosterEntry[] = data.roster ?? []
      setRoster(entries)
      // T2 FALSE-UNTIL-TRUE: every row starts ABSENT (red). Flip to PRESENT per row.
      // T6 Toggle 6 ON (default): FREE sessions auto-mark PRESENT, skip tracking.
      const freeNow = isSessionFree(session.id)
      const autoNow = getToggle6(new Date())
      const init: Record<string, { status: AttendanceStatus; is_group_swap: boolean }> = {}
      entries.forEach(e => {
        const s = (e.attendance_status as AttendanceStatus | undefined)
        const swap = e.is_group_swap ?? false
        // Trust backend PRESENT rows (already checked in); everything else starts ABSENT.
        init[e.student_id] = {
          status: freeNow && autoNow ? 'PRESENT' : (s === 'PRESENT' || e.is_present ? 'PRESENT' : 'ABSENT'),
          is_group_swap: swap,
        }
      })
      setStatuses(init)
      if (freeNow && autoNow) {
        toast.info('FREE session — auto-present', 'Teacher pays. Tracking skipped, billing 0.')
      }
    } catch (err: any) {
      // T2: no silent catch — surface + Retry.
      const status = err?.response?.status
      const msg = status === 500 || status >= 500
        ? 'Server error loading roster (500).'
        : 'Could not load roster.'
      setRosterError(msg)
      setRoster([])
      toast.error('Roster failed to load', `${msg} Press Retry.`, { duration: 8000 })
    } finally {
      setIsLoading(false)
    }
  }, [session])

  // T5: load group N + price + per-student credit snapshot when the grid opens.
  // Missing data shows Not set / Retry — never silent.
  const [creditError, setCreditError] = useState<string | null>(null)
  const loadCredits = useCallback(async () => {
    if (!session) return
    setCreditError(null)
    try {
      const clsRes = await api.get(`/classes/${session.class_id}`)
      const g = clsRes.data
      setGroupN(typeof g?.credits_per_cycle === 'number' ? g.credits_per_cycle : null)
      setGroupPrice(typeof g?.price_da === 'number' ? g.price_da : null)
    } catch {
      setGroupN(null)
      setGroupPrice(null)
      setCreditError('Group billing Not set.')
    }
    try {
      const subRes = await api.get('/billing/subscriptions', { params: { group_id: session.class_id, status: 'ACTIVE' } })
      const subs: Array<{ student_id: string; remaining_credits?: number | null }> =
        subRes.data.subscriptions ?? subRes.data ?? []
      const map: Record<string, { remaining: number | null; hasSub: boolean }> = {}
      for (const s of subs ?? []) {
        if (!s?.student_id) continue
        map[s.student_id] = { remaining: s.remaining_credits ?? null, hasSub: true }
      }
      setCreditMap(map)
    } catch {
      // No active-subscription rows readable — rows render "Not set", debt still works.
      setCreditMap({})
      setCreditError((prev) => prev ?? 'Subscription data Not set.')
    }
  }, [session])

  useEffect(() => {
    if (!isOpen || !session) return
    setStatuses({})
    setCreditError(null)
    setDebtTick((t) => t + 1)
    void loadCredits()
    setGuestQuery('')
    setGuestResults([])
    setShowGuestResults(false)
    setSwapTick((t) => t + 1)
    void loadRoster()
  }, [isOpen, session, loadRoster])

  // T4: overlay stored links onto the roster (both sides), re-run on swapTick.
  useEffect(() => {
    if (!session) return
    // Touch swapTick so ESLint keeps the overlay reactive to link changes.
    void swapTick
    setRoster((prev) => {
      let changed = false
      const next = prev.map((r) => {
        const swapSide = getLinkBySwap(r.student_id, session.id)
        const origSide = getLinkByOriginal(r.student_id, session.id)
        const viaSwapOf = origSide ? origSide.swapSessionId : null
        const suppressedOf = swapSide ? swapSide.originalSessionId : null
        if (r.via_swap_of !== viaSwapOf || r.swap_suppressed_of !== suppressedOf) {
          changed = true
          return {
            ...r,
            via_swap_of: viaSwapOf,
            swap_suppressed_of: suppressedOf,
            corrected_by: (swapSide ?? origSide)?.correctedBy ?? r.corrected_by ?? null,
            corrected_at: (swapSide ?? origSide)?.correctedAt ?? r.corrected_at ?? null,
          }
        }
        return r
      })
      return changed ? next : prev
    })
  }, [session, swapTick])

  // Close guest dropdown on outside click
  useEffect(() => {
    if (!showGuestResults) return
    const onDown = (e: MouseEvent) => {
      if (guestBoxRef.current && !guestBoxRef.current.contains(e.target as Node)) {
        setShowGuestResults(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showGuestResults])

  // ── Toggle student status (single row only, others untouched) ──
  const toggleStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setStatuses(prev => ({
      ...prev,
      [studentId]: { status, is_group_swap: prev[studentId]?.is_group_swap ?? false },
    }))
  }, [])

  // ── Toggle guest swap ──
  const toggleSwap = useCallback((studentId: string) => {
    setStatuses(prev => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status ?? 'ABSENT',
        is_group_swap: !prev[studentId]?.is_group_swap,
      },
    }))
  }, [])

  // ── Seed from enrolled list when roster is empty ("[Add Students]") ──
  const handleSeedFromClass = useCallback(async () => {
    if (!session || isSeeding) return
    setIsSeeding(true)
    try {
      const { data } = await api.get(`/classes/${session.class_id}/students`)
      const enrolled: Array<{ id: string }> = data.students ?? []
      if (enrolled.length === 0) {
        toast.warning('No students enrolled yet', 'Enroll students in the Classes page first.')
        return
      }
      let failed = 0
      await Promise.all(
        enrolled.map((s) =>
          api.post('/attendance/add-to-session', {
            session_id: session.id,
            student_id: s.id,
          }).catch(() => { failed += 1; return null }),
        ),
      )
      if (failed > 0) {
        toast.warning('Roster partially seeded', `${failed} row(s) failed — press Retry.`)
      } else {
        toast.success('Roster seeded', `${enrolled.length} ABSENT rows created.`)
      }
      await loadRoster()
    } catch {
      toast.error('Add Students failed', 'Could not seed roster. Press Retry.')
    } finally {
      setIsSeeding(false)
    }
  }, [session, isSeeding, loadRoster])

  // ── Guest search (frontend-side filter; backend has no search param) ──
  const handleGuestSearch = useCallback(async (q: string) => {
    setGuestQuery(q)
    if (!q || q.trim().length < 2) {
      setGuestResults([])
      setShowGuestResults(false)
      return
    }
    setGuestSearching(true)
    try {
      const { data } = await api.get('/students', { params: { per_page: 100 } })
      const all: StudentSearchResult[] = data.students ?? data ?? []
      const needle = q.trim().toLowerCase()
      const inRoster = new Set(roster.map(r => r.student_id))
      const filtered = all
        .filter(s => !inRoster.has(s.id))
        .filter(s => {
          const name = (s.full_name || `${s.first_name ?? ''} ${s.last_name ?? ''}`).toLowerCase()
          return name.includes(needle) || (s.phone ?? '').includes(q.trim())
        })
        .slice(0, 8)
      setGuestResults(filtered)
      setShowGuestResults(true)
    } catch {
      toast.error('Guest search failed', 'Could not search students. Try again.')
      setGuestResults([])
    } finally {
      setGuestSearching(false)
    }
  }, [roster])

  const handleGuestAdd = useCallback((s: StudentSearchResult) => {
    const name = s.full_name || `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Guest'
    setRoster(prev => {
      if (prev.some(r => r.student_id === s.id)) return prev
      return [...prev, {
        id: `guest-${s.id}`,
        session_id: session?.id ?? '',
        student_id: s.id,
        student_name: name,
        is_present: true,
        attendance_status: 'PRESENT',
        is_group_swap: true,
        created_at: new Date().toISOString(),
        is_guest_added: true,
      } as RosterEntry]
    })
    // Guest rows arrive PRESENT + blue ⚡ Swap (T4 auto-link owns billing later).
    setStatuses(prev => ({ ...prev, [s.id]: { status: 'PRESENT', is_group_swap: true } }))
    setGuestQuery('')
    setGuestResults([])
    setShowGuestResults(false)
    toast.info('Guest added', `${name} — ⚡ Swap`)
  }, [session?.id])

  const handleGuestRemove = useCallback((studentId: string) => {
    setRoster(prev => prev.filter(r => r.student_id !== studentId))
    setStatuses(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
  }, [])

  // ── T4 AUTO-LINK GUEST SWAP (no modal): 1 visit = 1 credit ──
  // Rules: same teacher, ABSENT within 7 days (swapTime − originalStart ≤ 7d),
  // same active cycle (subscription intact), original payout != PAID.
  // 2+ candidates → OLDEST FIFO. Different teacher → plain Extra.
  // None in window → plain Extra. TIME_BASED → no linking, swap flag only.
  const handleGuestAutoLink = useCallback(async (guestStudentId: string) => {
    if (!session || linkBusy) return
    setLinkBusy(guestStudentId)
    try {
      const guest = roster.find((r) => r.student_id === guestStudentId)
      if (!guest) return

      // TIME_BASED: disable linking entirely — guest stays PRESENT + swap, zero billing.
      let targetBilling: string | null = null
      try {
        const clsRes = await api.get(`/classes/${session.class_id}`)
        targetBilling = clsRes.data?.billing_model ?? null
      } catch {
        targetBilling = null
      }
      if (targetBilling === 'TIME_BASED') {
        toast.info('TIME_BASED — no link', 'Guest = PRESENT + swap flag, zero billing. // TODO Coming Soon')
        return
      }

      const guestStart = new Date(`${session.date}T${session.start_time}:00`).getTime()
      if (Number.isNaN(guestStart)) {
        toast.error('Link failed', 'Swap session time is Not set.')
        return
      }

      // 1. Same teacher? (student detail carries enrollments w/ class ids)
      let studentClasses: string[] = []
      try {
        const stRes = await api.get(`/students/${guestStudentId}`)
        const enrollments: Array<{ class_id: string }> = stRes.data?.enrollments ?? []
        studentClasses = enrollments.map((e) => e.class_id).filter(Boolean)
      } catch {
        toast.error('Link failed', 'Could not load student groups. Guest stays as Extra — press Retry.')
        return
      }

      // Candidate groups = student's groups with the SAME teacher as this session.
      const sameTeacherGroups: Array<{ id: string; teacher_id?: string; subject?: string; academic_level?: string }> = []
      for (const gid of studentClasses) {
        if (gid === session.class_id) continue
        try {
          const gRes = await api.get(`/classes/${gid}`)
          const g = gRes.data
          if (g?.teacher_id && session.teacher_id && g.teacher_id === session.teacher_id) {
            sameTeacherGroups.push({ id: gid, teacher_id: g.teacher_id, subject: g.subject, academic_level: g.academic_level })
          }
        } catch {
          // One unreadable group must not kill the link — skip it (no silent overall catch).
          continue
        }
      }
      if (sameTeacherGroups.length === 0) {
        toast.info('No link — different teacher', 'Plain Extra, bills normally.')
        return
      }

      // 2. ABSENT rows within 7 days in those groups (oldest first = FIFO).
      //    Backend has no cross-session attendance query → filter frontend-side
      //    over the recent week/day calendars.
      const now = new Date(`${session.date}T${session.start_time}:00`)
      const windowStart = new Date(now)
      windowStart.setDate(windowStart.getDate() - 7)
      const fmtDay = (d: Date) => d.toISOString().split('T')[0]

      const sameTeacherIds = new Set(sameTeacherGroups.map((g) => g.id))
      const candidateSessions: Session[] = []
      try {
        const weekRes = await api.get('/calendar/week', { params: { date: fmtDay(windowStart) } })
        const sessions: Session[] = weekRes.data.sessions ?? weekRes.data ?? []
        for (const s of sessions ?? []) {
          if (!s || s.id === session.id) continue
          if (!sameTeacherIds.has(s.class_id)) continue
          if ((s.status ?? 'scheduled') === 'cancelled') continue
          const sTime = new Date(`${s.date}T${s.start_time}:00`).getTime()
          if (Number.isNaN(sTime)) continue
          const diffDays = (guestStart - sTime) / 86_400_000
          if (diffDays < 0 || diffDays > 7) continue
          candidateSessions.push(s)
        }
      } catch {
        toast.error('Link failed', 'Could not scan past sessions. Guest stays as Extra — press Retry.')
        return
      }

      interface AbsentCandidate {
        sessionId: string
        label: string
        startMs: number
        groupId: string
        subject?: string
        academicLevel?: string
      }
      const absent: AbsentCandidate[] = []
      for (const s of candidateSessions) {
        let rows: Array<{ student_id: string; is_present?: boolean; attendance_status?: string; status?: string }> = []
        try {
          const rRes = await api.get(`/attendance/roster/${s.id}`)
          rows = rRes.data.roster ?? []
        } catch {
          continue // per-session roster miss skips that session only
        }
        const mine = rows.find((r) => r.student_id === guestStudentId)
        if (!mine) continue
        const st = (mine.attendance_status as string | undefined) ?? mine.status ?? (mine.is_present ? 'PRESENT' : 'ABSENT')
        if (String(st).toUpperCase() !== 'ABSENT') continue
        // Already linked (either side)? Skip — one link per absence.
        if (getLinksForStudent(guestStudentId).some(
          (l) => l.originalSessionId === s.id || l.swapSessionId === s.id,
        )) continue
        absent.push({
          sessionId: s.id,
          label: sessionLabel(s.date, s.start_time),
          startMs: new Date(`${s.date}T${s.start_time}:00`).getTime(),
          groupId: s.class_id,
        })
      }
      // Oldest FIFO.
      absent.sort((a, b) => a.startMs - b.startMs)
      if (absent.length === 0) {
        // T1 rule: old ABSENT locks per Toggle 1 (no retroactive consumption changes).
        toast.info('No linkable absence', 'Plain Extra. Old ABSENT locks per Toggle 1.')
        return
      }
      const pick = absent[0]

      // 3. Same active cycle: level subscription for (teacher, subject, level) must exist + ACTIVE + credit left.
      let cycleOk = false
      let payoutBlocks = false
      try {
        const subRes = await api.get('/billing/subscriptions', { params: { student_id: guestStudentId, status: 'ACTIVE' } })
        const subs: Array<{
          group_id: string; status: string; remaining_credits?: number | null; billing_model?: string
        }> = subRes.data.subscriptions ?? subRes.data ?? []
        const targetGroup = sameTeacherGroups.find((g) => g.id === pick.groupId)
        cycleOk = subs.some((s) => {
          if (s.status !== 'ACTIVE') return false
          if ((s.billing_model ?? 'CREDIT_BASED') !== 'CREDIT_BASED') return false
          if ((s.remaining_credits ?? 1) <= 0) return false
          // Same cycle = same group (level-sharing resolves backend-side) or same level triple.
          if (s.group_id === pick.groupId) return true
          return targetGroup ? s.group_id === targetGroup.id : false
        })
        if (!cycleOk) {
          // Fallback: any ACTIVE credit subscription for this student + same teacher group counts as the cycle.
          const groupRes = await api.get(`/classes/${pick.groupId}`).catch(() => null)
          const gTeacher = groupRes?.data?.teacher_id
          cycleOk = subs.some((s) => s.status === 'ACTIVE' && (s.remaining_credits ?? 1) > 0) && gTeacher === session.teacher_id
        }
      } catch {
        toast.error('Link failed', 'Could not verify active cycle. Guest stays as Extra — press Retry.')
        return
      }
      if (!cycleOk) {
        toast.info('No link — cycle ended', 'Plain Extra, bills normally.')
        return
      }

      // 4. Original payout != PAID (else the books closed — plain Extra).
      try {
        const payRes = await api.get('/billing/payouts')
        const payouts: Array<{ session_id: string; status?: string }> = payRes.data.payouts ?? []
        const orig = payouts.find((p) => p.session_id === pick.sessionId)
        if (orig && String(orig.status ?? '').toUpperCase() === 'PAID') {
          payoutBlocks = true
        }
      } catch {
        // Payout list unreadable → fail OPEN as Extra (never block check-in on a read miss).
        payoutBlocks = false
      }
      if (payoutBlocks) {
        toast.info('No link — payout PAID', 'Original books closed. Plain Extra.')
        return
      }

      // ── AUTO-LINK ──
      // Swap side: row already exists via /attendance/add-to-session at submit
      // (no billing side effects) → mark suppressed. Original side: leave the
      // backend ABSENT row untouched (1 credit already consumed) and overlay
      // PRESENT_VIA_SWAP from the link store.
      let guestName = guest.student_name
      try {
        await api.post('/sessions/add-to-session', {
          session_id: session.id,
          student_id: guestStudentId,
        })
      } catch (err: any) {
        const url404 = err?.response?.status === 404
        if (url404) {
          try {
            await api.post('/attendance/add-to-session', {
              session_id: session.id,
              student_id: guestStudentId,
            })
          } catch (err2: any) {
            toast.error('Link failed', `Swap row not created (${err2?.response?.status ?? 'error'}). Guest stays as Extra — press Retry.`)
            return
          }
        } else {
          toast.error('Link failed', `Swap row not created (${err?.response?.status ?? 'error'}). Guest stays as Extra — press Retry.`)
          return
        }
      }

      const link = createSwapLink({
        studentId: guestStudentId,
        originalSessionId: pick.sessionId,
        swapSessionId: session.id,
        originalLabel: pick.label,
        swapLabel: sessionLabel(session.date, session.start_time),
        correctedBy: staffName,
      })

      // Mark the guest row swap+suppressed locally; flip original overlay on next open.
      setStatuses((prev) => ({
        ...prev,
        [guestStudentId]: { status: 'PRESENT', is_group_swap: true },
      }))
      setRoster((prev) => prev.map((r) =>
        r.student_id === guestStudentId
          ? { ...r, is_group_swap: true, attendance_status: 'PRESENT', is_present: true, swap_suppressed_of: pick.sessionId, corrected_by: staffName, corrected_at: link.correctedAt }
          : r,
      ))
      setSwapTick((t) => t + 1)

      toast.success(`Linked to ${pick.label}`, '1 credit total — swap billed, original held. [Undo]', {
        duration: 8000,
        actions: [{
          label: 'Undo',
          onClick: () => {
            removeLinkBySwap(guestStudentId, session.id)
            setRoster((prev) => prev.map((r) =>
              r.student_id === guestStudentId
                ? { ...r, swap_suppressed_of: null }
                : r,
            ))
            setSwapTick((t) => t + 1)
            toast.info('Link undone', 'Swap row bills as Extra.')
          },
        }],
      })
    } finally {
      setLinkBusy(null)
    }
  }, [session, roster, linkBusy, staffName])

  // ── Submit check-ins ──
  const handleSubmit = useCallback(async () => {
    if (!session || !pin.trim() || pin.length !== 4) return
    setIsSubmitting(true)
    // T5 Toggle 1 (effective this week): ABSENT consumes at finalize when ON.
    const toggle1 = getAbsenceConsumesCredit(new Date())
    void toggle1
    try {
      // T6 FREE: every row routes billing-free (add-to-session) — revenue 0,
      // cut 0 for ALL commission types, no credit decrement. Toggle 6 ON skips
      // tracking (rows pre-marked PRESENT); OFF tracks normally for records.
      const freeNow = isSessionFree(session.id)
      // T4: SUPPRESSED swap rows skip /check-in (no billing side effects) so the
      // visit costs 1 credit TOTAL — the original ABSENT already consumed it.
      // Linked absences NEVER create makeup tokens: we never upsert the original
      // side (overlay only), and the suppressed POST below is billing-free.
      const promises = roster.map(student => {
        const s = statuses[student.student_id]
        if (!s) return Promise.resolve()
        if (freeNow || student.swap_suppressed_of || getLinkBySwap(student.student_id, session.id)) {
          return api.post('/attendance/add-to-session', {
            session_id: session.id,
            student_id: student.student_id,
          }).then(() => undefined)
        }
        return api.post('/attendance/check-in', {
          session_id: session.id,
          student_id: student.student_id,
          status: s.status,
          is_group_swap: s.is_group_swap,
          pin: pin.trim(),
        })
      })
      await Promise.all(promises)
      // T6 FREE: rows never become debt — no subscription touch, no credit motion.
      // T5 debt-first: rows with NO subscription become unpaid debt (oldest-first
      // ledger). Front-desk CAN check-in — debt is real, settled on Record Payment.
      // ABSENT rows also land here only when Toggle 1 is OFF (no credit to consume);
      // when ON the backend consumed the seat credit at check-in.
      const freeDone = isSessionFree(session.id)
      if (freeDone) {
        // FREE: no debt, no consumption — teacher pays.
        setStep('done')
        toast.success('FREE check-in recorded', `${roster.length} rows · 0 Da revenue · 0 cut · no credits moved.`)
      } else {
      try {
        const subRes = await api.get('/billing/subscriptions', { params: { group_id: session.class_id, status: 'ACTIVE' } })
        const subs: Array<{ student_id: string }> = subRes.data.subscriptions ?? subRes.data ?? []
        const covered = new Set((subs ?? []).map((s) => s.student_id))
        let fresh = 0
        for (const student of roster) {
          if (covered.has(student.student_id)) continue
          if (student.swap_suppressed_of || getLinkBySwap(student.student_id, session.id)) continue
          const st = statuses[student.student_id]
          if (!st) continue
          const already = getUnpaidDebt(student.student_id, session.class_id)
            .some((d) => d.sessionId === session.id)
          if (already) continue
          recordUnpaidDebt({
            studentId: student.student_id,
            studentName: student.student_name,
            groupId: session.class_id,
            groupName: session.class_name,
            sessionId: session.id,
            sessionDate: session.date,
            kind: st.status === 'PRESENT' ? 'PRESENT_UNPAID' : 'ABSENT_UNPAID',
          })
          fresh += 1
        }
        setDebtTick((t) => t + 1)
        setStep('done')
        toast.success(
          'Check-in recorded',
          fresh > 0
            ? `${roster.length} processed · ${fresh} unpaid debt (no subscription)`
            : `${roster.length} students processed`,
        )
      } catch {
        // Debt scan unreadable — check-ins already landed; surface, don't hide.
        setStep('done')
        toast.warning('Check-in recorded, debt scan failed', 'Unpaid rows Not set — reopen to retry the debt scan.')
      }
      }
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 1200)
    } catch {
      toast.error('Check-in failed', 'Please check the PIN and try again')
    } finally {
      setIsSubmitting(false)
    }
  }, [session, roster, statuses, pin, onSuccess, onClose])

  // ── Stats ──
  const presentCount = Object.values(statuses).filter(s => s.status === 'PRESENT').length
  const absentCount = Object.values(statuses).filter(s => s.status === 'ABSENT').length
  const swapCount = Object.values(statuses).filter(s => s.is_group_swap).length

  if (!isOpen || !session) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={cn(
          'w-full max-w-lg mx-4 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
          'flex flex-col max-h-[80vh]',
        )}
      >
        {/* ── Header ──────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--gold-soft)' }}
            >
              <UserCheck size={16} style={{ color: 'var(--gold)' }} />
            </div>
            <div>
              <h2
                className="text-base font-bold text-[var(--text)]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Door Check-In
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {session.class_name} · {session.subject}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Content ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'done' ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'var(--emerald-soft)' }}
              >
                <CheckCircle2 size={28} style={{ color: 'var(--emerald)' }} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Check-In Complete</p>
              <p className="text-xs text-[var(--muted)]">
                {presentCount} present · {absentCount} absent
              </p>
            </div>
          ) : step === 'roster' ? (
            <>
              {/* ── T5 credit strip + T6 FREE banner ── */}
              {isFree && (
                <p className="text-[11px] font-semibold text-[var(--emerald)] bg-[var(--emerald-soft)]/40 rounded-xl px-3 py-2 mb-3">
                  🎁 FREE session — teacher pays · revenue 0 · cut 0 · no credits moved
                  {autoPresent ? ' · auto-present (Toggle 6 ON)' : ' · tracking for records (Toggle 6 OFF)'}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--input-bg)] border border-[var(--glass-border)] text-[var(--text)]">
                  N = {groupN ?? 'Not set'}
                </span>
                <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--input-bg)] border border-[var(--glass-border)] text-[var(--text)]">
                  {isFree ? '0 Da (FREE)' : groupPrice != null ? formatDa(groupPrice) : 'Price Not set'}
                </span>
                <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--input-bg)] border border-[var(--glass-border)] text-[var(--muted)]">
                  {isFree ? 'credits frozen' : <>ABSENT {getAbsenceConsumesCredit(new Date()) ? 'consumes 1' : 'free'} (Toggle 1)</>}
                </span>
                {creditError && (
                  <button
                    type="button"
                    onClick={() => void loadCredits()}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--gold-soft)] text-[var(--gold)] hover:brightness-95 transition-all"
                    title={creditError}
                  >
                    Retry
                  </button>
                )}
              </div>
              {/* ── Summary bar ── */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-medium text-[var(--muted)]">
                  {roster.length} student{roster.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1" />
                <span className="text-xs" style={{ color: 'var(--emerald)' }}>
                  {presentCount} present
                </span>
                {absentCount > 0 && (
                  <span className="text-xs" style={{ color: 'var(--red)' }}>
                    {absentCount} absent
                  </span>
                )}
                {swapCount > 0 && (
                  <span className="text-xs" style={{ color: 'var(--gold)' }}>
                    {swapCount} swap{swapCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* ── T7 VOIDED banner: rows frozen, restore shown ── */}
              {!isLoading && !rosterError && isVoided && (
                <p className="text-[11px] font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2 mb-3">
                  ⛔ VOIDED (LIVE_VOID) — rows frozen, no payout. Restore applied to THIS session only.
                </p>
              )}

              {/* ── Student list (paper grid: ABSENT red / PRESENT green) ── */}
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : rosterError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-sm font-semibold text-[var(--red)]">{rosterError}</p>
                  <p className="text-xs text-[var(--muted)]">Roster was not loaded. Nothing was silently cleared.</p>
                  <button
                    type="button"
                    onClick={() => void loadRoster()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    <RefreshCw size={13} />
                    Retry
                  </button>
                </div>
              ) : roster.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-sm text-[var(--muted)]">No students enrolled yet</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadRoster()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:text-[var(--text)] transition-colors"
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSeedFromClass()}
                      disabled={isSeeding}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      <UserPlus size={13} />
                      {isSeeding ? 'Adding…' : 'Add Students'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {roster.map(student => {
                    const s = statuses[student.student_id]
                    const cur: AttendanceStatus = s?.status ?? 'ABSENT'
                    const isPresent = cur === 'PRESENT'
                    const isSwap = s?.is_group_swap ?? student.is_group_swap ?? false
                    const isGuest = student.is_guest_added ?? false
                    // T4 sides: original Mon flips to PRESENT_VIA_SWAP (blue ⚡);
                    // swap Wed is SUPPRESSED (no billing). Linked = no makeup token.
                    const isViaSwap = !isGuest && Boolean(student.via_swap_of)
                    const origLink = !isGuest && student.via_swap_of
                      ? getLinkByOriginal(student.student_id, session.id)
                      : null
                    const isSuppressed = Boolean(student.swap_suppressed_of)
                    const rowPresent = isPresent || isViaSwap

                    return (
                      <div
                        key={student.student_id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl',
                          'border transition-all duration-150',
                          rowPresent
                            ? 'border-[var(--emerald)]/25 bg-[var(--emerald-soft)]/30'
                            : 'border-[var(--red)]/25 bg-[var(--red-soft)]/20',
                          (isViaSwap || isSuppressed) && 'border-sky-500/30',
                        )}
                      >
                        {/* Paper-grid mark: − red / + green / ⚡ blue for via-swap */}
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                          style={isViaSwap || isSuppressed
                            ? { background: 'rgba(14,165,233,.15)', color: '#0ea5e9' }
                            : rowPresent
                              ? { background: 'var(--emerald-soft)', color: 'var(--emerald)' }
                              : { background: 'var(--red-soft)', color: 'var(--red)' }}
                        >
                          {isViaSwap || isSuppressed ? <Zap size={12} /> : rowPresent ? '+' : '−'}
                        </span>

                        {/* Student name + badges */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">
                            {student.student_name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {student.subscription_badge && (
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] font-semibold',
                                  student.subscription_badge === 'DEPLETED' || student.subscription_badge === 'EXPIRED'
                                    ? 'bg-[var(--red-soft)] text-[var(--red)]'
                                    : student.subscription_badge === 'RENEW_REQUIRED'
                                      ? 'bg-[var(--gold-soft)] text-[var(--gold)]'
                                      : 'bg-[var(--gold-soft)] text-[var(--gold)]',
                                )}
                              >
                                {student.subscription_badge}
                              </span>
                            )}
                            {(() => {
                              // T5 per-row credit + debt-first (touch debtTick for refresh).
                              void debtTick
                              const snap = creditMap[student.student_id]
                              const debt = getUnpaidDebtCount(student.student_id, session.class_id)
                              return (
                                <>
                                  {snap ? (
                                    <span className="text-[10px] text-[var(--muted)]">
                                      {snap.remaining ?? 'Not set'} cr left
                                    </span>
                                  ) : student.credits_remaining != null ? (
                                    <span className="text-[10px] text-[var(--muted)]">
                                      {student.credits_remaining} cr left
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-[var(--muted)]" title="No active subscription">
                                      Not set
                                    </span>
                                  )}
                                  {debt > 0 && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--red-soft)] text-[var(--red)]"
                                      title={getUnpaidDebt(student.student_id, session.class_id).map((d) => `${d.sessionDate} ${d.kind}`).join(' · ')}
                                    >
                                      unpaid {debt}
                                    </span>
                                  )}
                                  {isVoided && getVoidRestoredCredits(session.id, student.student_id) > 0 && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--emerald-soft)] text-[var(--emerald)]"
                                      title="T7 void restore — THIS session's credit only"
                                    >
                                      +1 restored · VOIDED
                                    </span>
                                  )}
                                  {isVoided && getVoidRestoredCredits(session.id, student.student_id) === 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]">
                                      VOIDED
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                            {isSwap && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/10 text-sky-500">
                                <Zap size={9} />
                                Swap
                              </span>
                            )}
                            {isViaSwap && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-600">
                                <Zap size={9} />
                                via-swap
                              </span>
                            )}
                            {isSuppressed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-600">
                                suppressed · 1 credit total
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Guest swap toggle */}
                          <button
                            onClick={() => toggleSwap(student.student_id)}
                            disabled={isViaSwap || isVoided}
                            className={cn(
                              'p-1.5 rounded-lg transition-all duration-150 disabled:opacity-40',
                              isSwap
                                ? 'bg-sky-500/15 text-sky-500'
                                : 'text-[var(--muted)] hover:bg-[var(--glass)]',
                            )}
                            title={isViaSwap ? 'Via-swap rows are swap-locked' : 'Group swap'}
                          >
                            <ArrowRightLeft size={14} />
                          </button>

                          {/* Guest remove */}
                          {isGuest && !isVoided && (
                            <button
                              onClick={() => handleGuestRemove(student.student_id)}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--red-soft)]/40 transition-colors"
                              title="Remove guest row"
                            >
                              Remove
                            </button>
                          )}

                          {/* T4: guest auto-link trigger (1 visit = 1 credit, no modal) */}
                          {isGuest && !isSuppressed && !isVoided && (
                            <button
                              onClick={() => void handleGuestAutoLink(student.student_id)}
                              disabled={linkBusy === student.student_id}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-600 border border-sky-500/20 hover:bg-sky-500/20 transition-colors disabled:opacity-40"
                              title="Auto-link to oldest ABSENT same teacher ≤7d"
                            >
                              <Zap size={11} />
                              {linkBusy === student.student_id ? 'Linking…' : 'Auto-link'}
                            </button>
                          )}

                          {/* Present / Absent flip: [+ Present] on red, [− Absent] on green */}
                          <button
                            onClick={() => toggleStatus(
                              student.student_id,
                              isPresent ? 'ABSENT' : 'PRESENT',
                            )}
                            disabled={isViaSwap || isSuppressed || isVoided}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                              'transition-all duration-150 disabled:opacity-60',
                              isPresent
                                ? 'bg-[var(--emerald)] text-white'
                                : 'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/20',
                            )}
                            title={isViaSwap ? `Present via swap (${origLink?.swapLabel ?? ''}) — flip the swap side instead` : undefined}
                          >
                            {isPresent ? <X size={12} /> : <Check size={12} />}
                            {isViaSwap ? 'via-swap' : isPresent ? '− Absent' : '+ Present'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Bottom search bar + Guest ── */}
              {!isLoading && !rosterError && (
                <div ref={guestBoxRef} className="relative mt-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                      <input
                        type="text"
                        value={guestQuery}
                        onChange={(e) => void handleGuestSearch(e.target.value)}
                        onFocus={() => { if (guestResults.length > 0) setShowGuestResults(true) }}
                        placeholder="Search any student…"
                        className={cn(
                          'w-full pl-9 pr-3 py-2.5 rounded-xl text-sm',
                          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                          'text-[var(--text)] outline-none',
                          'focus:ring-2 focus:ring-[var(--gold)]/30',
                          'placeholder:text-[var(--muted)]/50',
                        )}
                      />
                    </div>
                    <span className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-sky-500/10 text-sky-500 border border-sky-500/20 shrink-0">
                      <UserPlus size={13} />
                      Guest
                    </span>
                  </div>
                  {guestSearching && (
                    <p className="text-[11px] text-[var(--muted)] mt-1.5">Searching…</p>
                  )}
                  {showGuestResults && (
                    <div className="absolute bottom-full mb-2 left-0 right-0 rounded-xl border border-[var(--glass-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden z-10">
                      {guestResults.length === 0 ? (
                        <p className="text-xs text-[var(--muted)] text-center py-3">No matches</p>
                      ) : (
                        guestResults.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleGuestAdd(s)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--glass)] transition-colors"
                          >
                            <span className="flex-1 min-w-0 text-xs font-medium text-[var(--text)] truncate">
                              {s.full_name || `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-500 shrink-0">
                              <Zap size={10} />
                              Swap
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── Footer: PIN + Submit (hidden when VOIDED — frozen) ── */}
        {step === 'roster' && !isVoided && (
          <div className="px-5 py-4 border-t border-[var(--glass-border)] shrink-0">
            <div className="flex items-center gap-3">
              {/* PIN input */}
              <div className="relative flex-1">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN"
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-center tracking-[0.3em]',
                    'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                    'text-[var(--text)] outline-none',
                    'focus:ring-2 focus:ring-[var(--gold)]/30',
                    'placeholder:text-[var(--muted)]/50 placeholder:tracking-normal',
                  )}
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={pin.length !== 4 || isSubmitting}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white',
                  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                  'hover:opacity-90 active:scale-[0.98]',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-all duration-150',
                )}
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Submit
              </button>
            </div>
            {pin.length > 0 && pin.length < 4 && (
              <p className="text-[10px] text-[var(--muted)] mt-1.5 text-center">
                Enter 4-digit PIN to confirm
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
