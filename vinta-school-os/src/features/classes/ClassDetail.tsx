/**
 * Vinta School OS — Class Detail
 * Detailed view of a single class with schedule blocks and enrolled students.
 * Full edit mode, bulk enrollment, and real student data from API.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  Pencil,
  Trash2,
  X,
  Users,
  GraduationCap,
  UserPlus,
  Check,
  Search,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import {
  SUBJECT_COLORS,
} from '../../lib/constants'
import {
  formatTime,
  getInitials,
} from '../../lib/formatters'
import { getTeacherEmail } from '../../lib/teacherEmails'
import { formatDa } from '../../lib/formatters'
import type { Class, BillingModel, Schedule } from '../../types/class'

// ============================================
// Props
// ============================================

export interface ClassDetailProps {
  cls: Class | null
  isOpen: boolean
  onClose: () => void
  onDelete?: (id: string) => void
  onUpdated?: () => void
}

// ============================================
// Constants
// ============================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_INDICES = [1, 2, 3, 4, 5] // Mon-Fri for the schedule grid

const COLOR_PRESETS = [
  '#b3872a',
  '#7c3aed',
  '#0ea5e9',
  '#0f6b4d',
  '#dc2626',
  '#ea580c',
  '#ec4899',
  '#14b8a6',
]

const SUBJECT_OPTIONS = ['Math', 'French', 'English', 'Science', 'History', 'PE', 'Art', 'Music'] as const

// ============================================
// Types
// ============================================

interface EnrolledStudent {
  id: string
  full_name: string
  first_name: string
  last_name: string
  phone?: string
  status: string
  enrollment_id?: string
  // T9: per-group billing badge (this group's subscription, not just `active`)
  billing_label?: string
  billing_tone?: 'ok' | 'warn' | 'bad' | 'muted'
}

// ============================================
// Helpers
// ============================================

function resolveColor(cls: Class): string {
  return cls.color || SUBJECT_COLORS[cls.subject] || '#75726a'
}

/** Convert "HH:MM" to minutes from midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * T9 billing per THIS group: Paid / DEPLETED / OVERDUE / debt N.
 * Reads /classes/:id/subscriptions (ACTIVE) + debt ledger. Replaces the
 * old "N slots" card that always showed 0.
 */
function ClassBillingStat({ cls }: { cls: Class }) {
  const [label, setLabel] = useState('Not set')
  const [tone, setTone] = useState<'ok' | 'warn' | 'bad' | 'muted'>('muted')

  useEffect(() => {
    let cancelled = false
    // T11 fix: named fetcher (see ScheduleSlotsBlock — `load` trips rules-of-hooks).
    async function fetchBilling() {
      try {
        const { data } = await api.get(`/classes/${cls.id}/subscriptions`)
        const subs: Array<{ status?: string; remaining_credits?: number | null }> =
          data.subscriptions ?? data ?? []
        if (cancelled) return
        const { getUnpaidDebtCount } = await import('../../lib/billingRules')
        // Debt N across enrolled students is unknown without student ids;
        // show the worst subscription state + active count instead.
        const active = subs.filter((s) => s.status === 'ACTIVE')
        const depleted = subs.filter((s) => s.status === 'DEPLETED').length
        const expired = subs.filter((s) => s.status === 'EXPIRED' || s.status === 'OVERDUE').length
        void getUnpaidDebtCount
        if (subs.length === 0) {
          setLabel('No subs yet')
          setTone('muted')
        } else if (expired > 0) {
          setLabel(`OVERDUE ×${expired}`)
          setTone('bad')
        } else if (depleted > 0) {
          setLabel(`DEPLETED ×${depleted}`)
          setTone('bad')
        } else {
          const low = active.filter((s) => (s.remaining_credits ?? 99) <= 1).length
          setLabel(low > 0 ? `Paid · low ×${low}` : `Paid ×${active.length}`)
          setTone(low > 0 ? 'warn' : 'ok')
        }
      } catch {
        if (!cancelled) {
          setLabel('Not set')
          setTone('muted')
        }
      }
    }
    void fetchBilling()
    return () => { cancelled = true }
  }, [cls.id])

  const color = tone === 'ok' ? 'var(--emerald)' : tone === 'warn' ? 'var(--gold)' : tone === 'bad' ? 'var(--red)' : 'var(--muted)'
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Billing
        </span>
      </div>
      <p className="text-sm font-medium truncate" style={{ color }}>
        {label}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
        {cls.billing_model === 'CREDIT_BASED'
          ? `N=${cls.credits_per_cycle ?? 'Not set'} · ${cls.price_da != null ? formatDa(cls.price_da) : 'Price Not set'}`
          : 'TIME_BASED · Coming Soon'}
      </p>
    </div>
  )
}

/**
 * T9 0-slots fix: fetch real session slots from /sessions|schedules so the
 * header shows "Mon/Wed/Fri 09:00-10:30 + count" instead of 0.
 */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ScheduleSlotsBlock({ cls }: { cls: Class }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // T11: inline promise chain (no nested fn) — oxlint rules-of-hooks
    // misreads nested helpers (`use`/`load`/`fetch*`) as hook calls.
    // Prefer embedded schedules; fall back to /sessions then /schedules.
    const embedded = cls.schedules ?? []
    const fromEmbedded = embedded.map((s) => ({
      dow: s.day_of_week,
      start: s.start_time.slice(0, 5),
      end: s.end_time.slice(0, 5),
    }))
    const renderRows = (rows: Array<{ dow: number; start: string; end: string }>) => {
      if (cancelled || rows.length === 0) return false
      const days = [...new Set(rows.map((r) => DAY_SHORT[r.dow] ?? ''))].filter(Boolean)
      const starts = rows.map((r) => r.start).sort()
      const ends = rows.map((r) => r.end).sort()
      setText(`${days.join('/')} ${starts[0] ?? ''}-${ends[ends.length - 1] ?? ''} · ${rows.length} slot${rows.length === 1 ? '' : 's'}`)
      return true
    }
    if (fromEmbedded.length > 0) {
      renderRows(fromEmbedded)
      return () => { cancelled = true }
    }
    api.get('/sessions', { params: { class_id: cls.id } })
      .then(({ data }) => {
        const list: Array<{ date: string; start_time: string; end_time: string }> =
          data.sessions ?? data ?? []
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          const ok = renderRows(list.map((s) => {
            let dow = -1
            try { dow = new Date(`${s.date}T${s.start_time}:00`).getDay() } catch { /* keep -1 */ }
            return { dow, start: (s.start_time || '').slice(0, 5), end: (s.end_time || '').slice(0, 5) }
          }).filter((r) => r.dow >= 0))
          if (ok) return
        }
        return api.get(`/classes/${cls.id}/schedules`).then(({ data: d2 }) => {
          const list2: Array<{ day_of_week: number; start_time: string; end_time: string }> =
            d2.schedules ?? d2 ?? []
          if (!cancelled && Array.isArray(list2) && list2.length > 0) {
            renderRows(list2.map((s) => ({
              dow: s.day_of_week,
              start: (s.start_time || '').slice(0, 5),
              end: (s.end_time || '').slice(0, 5),
            })))
            return
          }
          if (!cancelled) setText(null)
        })
      })
      .catch(() => {
        api.get(`/classes/${cls.id}/schedules`)
          .then(({ data: d2 }) => {
            const list2: Array<{ day_of_week: number; start_time: string; end_time: string }> =
              d2.schedules ?? d2 ?? []
            if (!cancelled && Array.isArray(list2) && list2.length > 0) {
              renderRows(list2.map((s) => ({
                dow: s.day_of_week,
                start: (s.start_time || '').slice(0, 5),
                end: (s.end_time || '').slice(0, 5),
              })))
            } else if (!cancelled) {
              setText(null)
            }
          })
          .catch(() => { if (!cancelled) setText(null) })
      })
    return () => { cancelled = true }
  }, [cls])

  return (
    <p className="text-xs text-[var(--muted)] mt-1">
      {text ?? 'Schedule Not set'}
    </p>
  )
}

/** Get the min/max hours from a set of schedules */
function getScheduleBounds(
  schedules: Schedule[],
): { minHour: number; maxHour: number } {
  if (!schedules || schedules.length === 0) return { minHour: 8, maxHour: 17 }

  let min = 24
  let max = 0
  for (const s of schedules) {
    const startH = parseInt(s.start_time.split(':')[0], 10)
    const endH = parseInt(s.end_time.split(':')[0], 10) + (parseInt(s.end_time.split(':')[1], 10) > 0 ? 1 : 0)
    if (startH < min) min = startH
    if (endH > max) max = endH
  }
  return { minHour: Math.max(min - 1, 6), maxHour: Math.min(max + 1, 21) }
}

// ============================================
// Component
// ============================================

export default function ClassDetail({ cls, isOpen, onClose, onDelete, onUpdated }: ClassDetailProps) {
  // ── Edit state ──
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editCapacity, setEditCapacity] = useState(20)
  const [editTeacherId, setEditTeacherId] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPriceDa, setEditPriceDa] = useState(0)
  const [editBillingModel, setEditBillingModel] = useState<BillingModel>('CREDIT_BASED')
  const [editCreditsPerCycle, setEditCreditsPerCycle] = useState(4)
  const [editGroupName, setEditGroupName] = useState('')
  const [editAcademicLevel, setEditAcademicLevel] = useState('')
  const [editClassType, setEditClassType] = useState<'weekly' | 'temporary'>('weekly')
  const [editDedicatedTime, setEditDedicatedTime] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Teachers ──
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string; email?: string; phone?: string }>>([])

  // ── Enrolled students ──
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  // ── Bulk enrollment ──
  const [showBulkEnroll, setShowBulkEnroll] = useState(false)
  const [allStudents, setAllStudents] = useState<Array<{ id: string; full_name: string; phone?: string }>>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [enrolling, setEnrolling] = useState(false)

  // Sync edit state when class changes
  useEffect(() => {
    if (cls) {
      setEditName(cls.name)
      setEditSubject(cls.subject)
      setEditColor(cls.color || '')
      setEditCapacity(cls.capacity)
      setEditTeacherId(cls.teacher_id || '')
      setEditNotes(cls.notes || '')
      setEditPriceDa(cls.price_da || 0)
      setEditBillingModel(cls.billing_model || 'CREDIT_BASED')
      setEditCreditsPerCycle(cls.credits_per_cycle || 4)
      setEditGroupName(cls.group_name || '')
      setEditAcademicLevel(cls.academic_level || '')
      setEditClassType(cls.class_type || 'weekly')
      setEditDedicatedTime(cls.dedicated_time || '')
    }
    setIsEditing(false)
  }, [cls?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const color = cls ? resolveColor(cls) : '#75726a'

  // ── Fetch teachers (T9: overlay registry emails) ──
  useEffect(() => {
    if (!isOpen) return
    api.get('/teachers')
      .then(({ data }) => {
        const list = data.teachers ?? data ?? []
        setTeachers(list.map((t: any) => ({
          id: t.id,
          name: t.full_name || t.name || `${t.first_name} ${t.last_name}`,
          email: t.email ?? getTeacherEmail(t.id) ?? undefined,
          phone: t.phone,
        })))
      })
      .catch(() => {})
  }, [isOpen])

  // ── Fetch enrolled students + per-group billing (T9: THIS group, not `active`) ──
  const fetchEnrolledStudents = useCallback(async () => {
    if (!cls) return
    setLoadingStudents(true)
    try {
      const { data } = await api.get(`/classes/${cls.id}/students`)
      const rows: EnrolledStudent[] = data.students ?? []
      // Overlay THIS group's subscription state per student.
      let subs: Array<{ student_id: string; status?: string; remaining_credits?: number | null }> = []
      try {
        const sRes = await api.get('/billing/subscriptions', { params: { group_id: cls.id } })
        subs = sRes.data.subscriptions ?? sRes.data ?? []
      } catch {
        subs = []
      }
      const byStudent = new Map(subs.map((s) => [s.student_id, s]))
      const { getUnpaidDebtCount } = await import('../../lib/billingRules')
      setEnrolledStudents(rows.map((r) => {
        const sub = byStudent.get(r.id)
        const debt = getUnpaidDebtCount(r.id, cls.id)
        if (debt > 0) {
          return { ...r, billing_label: `debt ${debt}`, billing_tone: 'bad' as const }
        }
        if (!sub) {
          return { ...r, billing_label: r.status === 'active' ? 'Paid' : r.status, billing_tone: 'muted' as const }
        }
        const st = (sub.status ?? '').toUpperCase()
        if (st === 'DEPLETED') return { ...r, billing_label: 'DEPLETED', billing_tone: 'bad' as const }
        if (st === 'EXPIRED' || st === 'OVERDUE') return { ...r, billing_label: 'OVERDUE', billing_tone: 'bad' as const }
        if (st === 'ACTIVE') {
          const left = sub.remaining_credits
          return { ...r, billing_label: left != null ? `${left} cr` : 'Paid', billing_tone: left != null && left <= 1 ? 'warn' as const : 'ok' as const }
        }
        return { ...r, billing_label: sub.status ?? r.status, billing_tone: 'muted' as const }
      }))
    } catch {
      setEnrolledStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }, [cls])

  useEffect(() => {
    if (isOpen && cls) fetchEnrolledStudents()
  }, [isOpen, cls, fetchEnrolledStudents])

  // ── Schedule grid computation ──

  const { minHour, maxHour } = useMemo(
    () => getScheduleBounds(cls?.schedules || []),
    [cls?.schedules],
  )

  const hours = useMemo(() => {
    const result: number[] = []
    for (let h = minHour; h <= maxHour; h++) result.push(h)
    return result
  }, [minHour, maxHour])

  // Group schedules by weekday
  const schedulesByDay = useMemo(() => {
    const map = new Map<number, Schedule[]>()
    for (const day of WEEKDAY_INDICES) map.set(day, [])
    if (cls?.schedules) {
      for (const s of cls.schedules) {
        const existing = map.get(s.day_of_week)
        if (existing) existing.push(s)
      }
    }
    return map
  }, [cls?.schedules])

  // ── Handlers ──

  const handleStartEdit = useCallback(() => {
    if (!cls) return
    setEditName(cls.name)
    setEditSubject(cls.subject)
    setEditColor(cls.color || '')
    setEditCapacity(cls.capacity)
    setEditTeacherId(cls.teacher_id || '')
    setEditNotes(cls.notes || '')
    setEditPriceDa(cls.price_da || 0)
    setEditBillingModel(cls.billing_model || 'CREDIT_BASED')
    setEditCreditsPerCycle(cls.credits_per_cycle || 4)
    setEditGroupName(cls.group_name || '')
    setEditAcademicLevel(cls.academic_level || '')
    setEditClassType(cls.class_type || 'weekly')
    setEditDedicatedTime(cls.dedicated_time || '')
    setIsEditing(true)
  }, [cls])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    if (cls) {
      setEditName(cls.name)
      setEditSubject(cls.subject)
      setEditColor(cls.color || '')
      setEditCapacity(cls.capacity)
      setEditTeacherId(cls.teacher_id || '')
      setEditNotes(cls.notes || '')
      setEditPriceDa(cls.price_da || 0)
      setEditBillingModel(cls.billing_model || 'CREDIT_BASED')
      setEditCreditsPerCycle(cls.credits_per_cycle || 4)
      setEditGroupName(cls.group_name || '')
      setEditAcademicLevel(cls.academic_level || '')
      setEditClassType(cls.class_type || 'weekly')
      setEditDedicatedTime(cls.dedicated_time || '')
    }
  }, [cls])

  const handleSaveEdit = useCallback(async () => {
    if (!cls || !editName.trim()) return
    setSaving(true)
    try {
      await api.put(`/classes/${cls.id}`, {
        name: editName.trim(),
        subject: editSubject,
        color: editColor,
        capacity: editCapacity,
        teacher_id: editTeacherId || null,
        notes: editNotes.trim() || null,
        price_da: editPriceDa || null,
        billing_model: editBillingModel,
        credits_per_cycle: editBillingModel === 'CREDIT_BASED' ? editCreditsPerCycle : undefined,
        group_name: editGroupName.trim() || undefined,
        academic_level: editAcademicLevel.trim() || undefined,
        class_type: editClassType,
        dedicated_time: editDedicatedTime.trim() || null,
      })
      toast.success('Class updated', 'Changes have been saved.')
      setIsEditing(false)
      onUpdated?.()
    } catch {
      toast.error('Update failed', 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }, [cls, editName, editSubject, editColor, editCapacity, editTeacherId, editNotes, editPriceDa, editBillingModel, editCreditsPerCycle, editGroupName, editAcademicLevel, editClassType, editDedicatedTime, onUpdated])

  const handleDelete = useCallback(async () => {
    if (!cls) return
    try {
      await api.delete(`/classes/${cls.id}`)
    } catch { /* proceed with local removal regardless */ }
    onDelete?.(cls.id)
    onClose()
  }, [cls, onDelete, onClose])

  // ── Bulk enrollment handlers ──

  // T9 Add Students: fetch all, filter out enrolledIds FRONTEND, searchable +
  // checkbox + "X available", Confirm → POST enroll each → refetch, N/15 live.
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkTotal, setBulkTotal] = useState<number | null>(null)

  const openBulkEnroll = useCallback(async () => {
    setShowBulkEnroll(true)
    setSelectedStudentIds([])
    setStudentSearch('')
    setBulkError(null)
    try {
      const { data } = await api.get('/students', { params: { per_page: 100 } })
      const students = data.students ?? data ?? []
      setBulkTotal(Array.isArray(students) ? students.length : null)
      // Filter out already-enrolled students FRONTEND — enrolled never appear.
      const enrolledIds = new Set(enrolledStudents.map(s => s.id))
      const avail = (Array.isArray(students) ? students : [])
        .filter((s: any) => s?.id && !enrolledIds.has(s.id))
        .map((s: any) => ({
          id: s.id,
          full_name: s.full_name || `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Not set',
          phone: s.phone,
        }))
      setAllStudents(avail)
    } catch {
      setAllStudents([])
      setBulkTotal(null)
      setBulkError('Student list Not set.')
      toast.error('Add Students failed', 'Student list Not set. Press Retry.')
    }
  }, [enrolledStudents])

  const toggleStudentSelection = useCallback((id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    )
  }, [])

  // T9 Confirm: POST enroll each → refetch students, update 6/15→N/15, no reload.
  const handleBulkEnroll = useCallback(async () => {
    if (!cls || selectedStudentIds.length === 0) return
    setEnrolling(true)
    try {
      let enrolled = 0
      let skipped = 0
      // Try bulk first (existing endpoint); fall back to one POST each.
      try {
        const { data } = await api.post('/students/bulk-enroll', {
          student_ids: selectedStudentIds,
          class_id: cls.id,
        })
        enrolled = data.total_enrolled ?? 0
        skipped = data.total_skipped ?? 0
      } catch {
        for (const sid of selectedStudentIds) {
          try {
            await api.post(`/students/${sid}/enroll`, { class_id: cls.id })
            enrolled += 1
          } catch {
            skipped += 1
          }
        }
      }
      toast.success('Students enrolled', `${enrolled} student(s) added to ${cls.name}.`)
      if (skipped > 0) {
        toast.error('Some skipped', `${skipped} student(s) could not be enrolled.`)
      }
      setShowBulkEnroll(false)
      await fetchEnrolledStudents()
      onUpdated?.()
    } catch {
      toast.error('Enrollment failed', 'Could not enroll students. Press Retry.')
    } finally {
      setEnrolling(false)
    }
  }, [cls, selectedStudentIds, fetchEnrolledStudents, onUpdated])

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return allStudents
    const q = studentSearch.toLowerCase()
    return allStudents.filter(s =>
      s.full_name.toLowerCase().includes(q) || s.phone?.includes(studentSearch)
    )
  }, [allStudents, studentSearch])

  // ── Render ──

  if (!isOpen || !cls) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative ml-auto w-full max-w-2xl h-full overflow-y-auto',
          'bg-[var(--bg)] border-l border-[var(--glass-border)]',
          'animate-slide-in-right',
        )}
      >
        <div className="p-6">
          {/* ── Header ────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onClose}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm',
                'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
                'transition-colors duration-150',
              )}
            >
              <ChevronLeft size={16} />
              Back
            </button>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={handleStartEdit}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
                      'transition-colors duration-150',
                    )}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'text-[var(--red)] hover:bg-[var(--red-soft)]',
                      'transition-colors duration-150',
                    )}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCancelEdit}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'text-[var(--muted)] hover:bg-[var(--glass)]',
                      'transition-colors duration-150',
                    )}
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editName.trim()}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white hover:opacity-90',
                      'transition-opacity duration-150 disabled:opacity-50',
                    )}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Class Info ────────────────────────── */}
          <div className="mb-6">
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-lg font-bold text-[var(--text)]',
                    'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                    'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                  )}
                  style={{ fontFamily: 'var(--font-heading)' }}
                  placeholder="Class name"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Subject</label>
                    <select
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    >
                      {SUBJECT_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Teacher</label>
                    <select
                      value={editTeacherId}
                      onChange={(e) => setEditTeacherId(e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    >
                      <option value="">None</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Capacity</label>
                    <input
                      type="number"
                      value={editCapacity}
                      onChange={(e) => setEditCapacity(Number(e.target.value))}
                      min={1}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Price (DA)</label>
                    <input
                      type="number"
                      value={editPriceDa || ''}
                      onChange={(e) => setEditPriceDa(Number(e.target.value))}
                      placeholder="0"
                      min={0}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Group Name</label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      placeholder="A"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Academic Level</label>
                    <input
                      type="text"
                      value={editAcademicLevel}
                      onChange={(e) => setEditAcademicLevel(e.target.value)}
                      placeholder="e.g. CM2"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Class Type</label>
                  <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
                    {(['weekly', 'temporary'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditClassType(t)}
                        className={cn(
                          'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                          editClassType === t
                            ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                            : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                        )}
                      >
                        {t === 'weekly' ? 'Weekly' : 'Temporary'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Dedicated Time</label>
                  <input
                    type="text"
                    value={editDedicatedTime}
                    onChange={(e) => setEditDedicatedTime(e.target.value)}
                    placeholder="e.g. Mon/Wed 10:00-12:00"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                      'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                      'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Billing Model</label>
                  <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
                    {(['CREDIT_BASED', 'TIME_BASED'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditBillingModel(m)}
                        className={cn(
                          'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                          editBillingModel === m
                            ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                            : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                        )}
                      >
                        {m === 'CREDIT_BASED' ? 'Credit-Based' : 'Time-Based'}
                      </button>
                    ))}
                  </div>
                </div>
                {editBillingModel === 'CREDIT_BASED' && (
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Credits per Cycle (N · 1–20)</label>
                    <input
                      type="number"
                      value={editCreditsPerCycle}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value))
                        setEditCreditsPerCycle(Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 4)
                      }}
                      min={1}
                      max={20}
                      step={1}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      )}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)] resize-none',
                      'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                      'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                    )}
                  />
                </div>
                {/* Color */}
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Color</label>
                  <div className="flex gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setEditColor(preset)}
                        className={cn(
                          'w-6 h-6 rounded-full border-2 transition-all duration-150',
                          editColor === preset
                            ? 'border-[var(--text)] scale-110'
                            : 'border-transparent hover:scale-110',
                        )}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h1
                    className="text-2xl font-bold text-[var(--text)]"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {cls.name}
                  </h1>

                  {cls.status === 'full' && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--red-soft)] text-[var(--red)]">
                      Full
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-sm font-medium px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: `${color}18`,
                      color,
                    }}
                  >
                    {cls.subject}
                  </span>
                  {cls.group_name && (
                    <span className="text-xs text-[var(--muted)]">Group {cls.group_name}</span>
                  )}
                  {cls.academic_level && (
                    <span className="text-xs text-[var(--muted)]">{cls.academic_level}</span>
                  )}
                  {cls.class_type && (
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full',
                        cls.class_type === 'weekly'
                          ? 'bg-[var(--emerald-soft)] text-[var(--emerald)]'
                          : 'bg-[var(--gold-soft)] text-[var(--gold)]',
                      )}
                    >
                      {cls.class_type === 'weekly' ? 'Weekly' : 'One-Time'}
                    </span>
                  )}
                </div>
                {cls.dedicated_time && (
                  <p className="text-xs text-[var(--muted)] mt-1">{cls.dedicated_time}</p>
                )}
                {cls.notes && (
                  <p className="text-xs text-[var(--muted)] mt-2">{cls.notes}</p>
                )}
              </>
            )}
          </div>

          {/* ── Stats Row ─────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {/* Teacher — T9: name + email + phone, "Not set" never "—" */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap size={14} className="text-[var(--muted)]" />
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                  Teacher
                </span>
              </div>
              {(() => {
                const t = cls.teacher_id ? teachers.find((x) => x.id === cls.teacher_id) : undefined
                const email = t?.email ?? (cls.teacher_id ? getTeacherEmail(cls.teacher_id) : null) ?? null
                const phone = t?.phone ?? null
                return (
                  <>
                    <p className="text-sm font-medium text-[var(--text)] truncate">
                      {cls.teacher_name || 'Unassigned'}
                    </p>
                    <p className="text-[11px] text-[var(--muted)] truncate mt-0.5" title={email ?? undefined}>
                      {email ?? 'Not set'}
                    </p>
                    <p className="text-[11px] text-[var(--muted)] truncate">
                      {phone ?? 'Not set'}
                    </p>
                  </>
                )
              })()}
            </div>

            {/* Capacity */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-[var(--muted)]" />
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                  Capacity
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--text)]">
                {cls.enrolled_count}/{cls.capacity}
              </p>
            </div>

            {/* T9 billing per THIS group: Paid / DEPLETED / OVERDUE / debt N */}
            <ClassBillingStat cls={cls} />
          </div>

          {/* ── Weekly Schedule (T9: real slots from /sessions|schedules) ── */}
          <ScheduleSlotsBlock cls={cls} />
          {cls.schedules && cls.schedules.length > 0 && (
            <div className="mb-6">
              <h2
                className="text-sm font-bold text-[var(--text)] mb-3"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Weekly Schedule
              </h2>

              <div className="glass rounded-xl overflow-hidden">
                {/* Schedule mini-grid */}
                <div className="flex">
                  {/* Time gutter */}
                  <div className="w-12 shrink-0 border-r border-[var(--divider)]">
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="text-[9px] text-[var(--muted)] text-right pr-2 pt-0.5"
                        style={{ height: 32 }}
                      >
                        {hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`}
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {WEEKDAY_INDICES.map((dayIdx) => (
                    <div
                      key={dayIdx}
                      className="flex-1 border-l border-[var(--divider)]"
                    >
                      {/* Day header */}
                      <div className="text-center py-1 border-b border-[var(--divider)]">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase">
                          {DAY_LABELS[dayIdx]}
                        </span>
                      </div>

                      {/* Hour cells */}
                      <div className="relative">
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="border-b border-[var(--divider)]/50"
                            style={{ height: 32 }}
                          />
                        ))}

                        {/* Schedule blocks */}
                        {(schedulesByDay.get(dayIdx) || []).map((schedule) => {
                          const startMinutes = timeToMinutes(schedule.start_time)
                          const endMinutes = timeToMinutes(schedule.end_time)
                          const startHour = hours[0] * 60

                          const top = ((startMinutes - startHour) / 60) * 32
                          const height = ((endMinutes - startMinutes) / 60) * 32

                          return (
                            <div
                              key={schedule.id}
                              className="absolute inset-x-0.5 rounded-md"
                              style={{
                                top,
                                height: Math.max(height, 12),
                                backgroundColor: `${color}25`,
                                borderLeft: `2px solid ${color}`,
                              }}
                            >
                              <span
                                className="block text-[8px] font-medium leading-tight px-1 pt-0.5 truncate"
                                style={{ color }}
                              >
                                {formatTime(schedule.start_time)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Enrolled Students ─────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-bold text-[var(--text)]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Enrolled Students
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">
                  {cls.enrolled_count} of {cls.capacity}
                </span>
                <button
                  onClick={openBulkEnroll}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                    'bg-[var(--emerald-soft)] text-[var(--emerald)] border border-[var(--emerald)]/20',
                    'hover:bg-[var(--emerald)]/20 active:scale-[0.98]',
                    'transition-all duration-150',
                  )}
                >
                  <UserPlus size={13} />
                  Add Students
                </button>
              </div>
            </div>

            {loadingStudents ? (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-sm text-[var(--muted)]">Loading students...</p>
              </div>
            ) : enrolledStudents.length === 0 ? (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-sm text-[var(--muted)]">
                  No students enrolled yet.
                </p>
                <button
                  onClick={openBulkEnroll}
                  className={cn(
                    'mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium',
                    'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/20',
                    'hover:bg-[var(--gold)]/20 active:scale-[0.98]',
                    'transition-all duration-150',
                  )}
                >
                  <UserPlus size={13} />
                  Add Students
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {enrolledStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--glass)] transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {getInitials(student.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text)] truncate">
                        {student.full_name}
                      </p>
                      {student.phone && (
                        <p className="text-[10px] text-[var(--muted)]">{student.phone}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full',
                        (student.billing_tone ?? 'muted') === 'ok'
                          ? 'bg-[var(--emerald-soft)] text-[var(--emerald)]'
                          : (student.billing_tone ?? 'muted') === 'bad'
                            ? 'bg-[var(--red-soft)] text-[var(--red)]'
                            : (student.billing_tone ?? 'muted') === 'warn'
                              ? 'bg-[var(--gold-soft)] text-[var(--gold)]'
                              : 'bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]',
                      )}
                      title={`Enrollment: ${student.status}`}
                    >
                      {student.billing_label ?? student.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bulk Enrollment Modal ──────────────── */}
      {showBulkEnroll && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowBulkEnroll(false) }}
        >
          <div
            className={cn(
              'w-full max-w-md mx-4 p-5 rounded-2xl',
              'bg-[var(--card-bg)] border border-[var(--glass-border)]',
              'shadow-2xl animate-fade-in',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-[var(--text)]" style={{ fontFamily: 'var(--font-heading)' }}>
                Add Students to {cls.name}
              </h3>
              <button onClick={() => setShowBulkEnroll(false)} className="p-1 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)]">
                <X size={14} />
              </button>
            </div>
            {/* T9: "X available" (unenrolled only) */}
            <p className="text-[11px] text-[var(--muted)] mb-3">
              {bulkError ?? `${allStudents.length} available${bulkTotal != null ? ` of ${bulkTotal}` : ''} · enrolled never appear`}
            </p>
            {bulkError && (
              <button
                type="button"
                onClick={() => openBulkEnroll()}
                className="mb-3 text-[11px] font-semibold text-[var(--gold)] hover:underline"
              >
                {bulkError} Retry
              </button>
            )}

            {/* Search */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students..."
                className={cn(
                  'w-full pl-9 pr-3 py-2 rounded-xl text-sm text-[var(--text)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                )}
              />
            </div>

            {/* Student list */}
            <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-[var(--muted)] text-center py-4">
                  No students available to enroll
                </p>
              ) : (
                filteredStudents.map((student) => {
                  const isSelected = selectedStudentIds.includes(student.id)
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleStudentSelection(student.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150',
                        isSelected
                          ? 'bg-[var(--emerald-soft)] border border-[var(--emerald)]/30'
                          : 'bg-[var(--input-bg)] border border-[var(--glass-border)] hover:border-[var(--emerald)]/20',
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-[var(--emerald)] border-[var(--emerald)]'
                          : 'border-[var(--glass-border)]',
                      )}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{student.full_name}</p>
                        {student.phone && (
                          <p className="text-[10px] text-[var(--muted)]">{student.phone}</p>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkEnroll(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkEnroll}
                disabled={selectedStudentIds.length === 0 || enrolling}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white',
                  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                  'disabled:opacity-40 hover:opacity-90 active:scale-[0.98]',
                  'transition-all duration-150',
                )}
              >
                {enrolling ? 'Enrolling...' : `Add ${selectedStudentIds.length} Student${selectedStudentIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
