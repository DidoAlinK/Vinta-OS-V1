/**
 * Vinta School OS — Teacher Drawer
 * Slide-in panel from the right showing teacher details,
 * assigned classes, weekly schedule, and payout summary.
 * (Hourly/contract payroll removed — commission only when gross-profit is on.)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Phone,
  Clock,
  Users,
  BookOpen,
  CreditCard,
  Calendar,
  TrendingUp,
  GraduationCap,
  Trash2,
  Plus,
  Wallet,
  Pencil,
  Save,
  ChevronDown,
  Search as SearchIcon,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Toggle } from '../../components/ui/Toggle'
import { isGrossProfitEnabled } from '../../lib/grossProfit'
import { toast } from '../../stores/uiStore'
import {
  getInitials,
  formatPhone,
  formatDa,
  formatDateShort,
} from '../../lib/formatters'
import type { Teacher } from '../../types/teacher'
import { COMMISSION_TYPE_LABELS } from '../../types/teacher'
import type { CommissionType } from '../../types/teacher'
import { getTeacherEmail, setTeacherEmail } from '../../lib/teacherEmails'
import type { PayoutRecord } from '../../types/billing'

// ============================================
// Props
// ============================================

export interface TeacherDrawerProps {
  teacher: Teacher | null
  isOpen: boolean
  onClose: () => void
  onDelete?: (id: string) => void
  onClassCreated?: () => void
  onUpdated?: () => void
}

// ============================================
// Weekly Schedule Mock
// ============================================

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'] as const

/** Generate a weekly schedule grid based on the teacher's assigned classes */
function generateWeeklySchedule(teacher: Teacher | null) {
  if (!teacher) return []

  const schedule: {
    day: string
    time: string
    className: string
    color: string
  }[] = []

  const classes = teacher.classes_assigned ?? []
  if (classes.length === 0) return schedule

  // Distribute classes across the week
  classes.forEach((cls, i) => {
    const dayIdx = i % DAYS.length
    const timeIdx = Math.floor(i / DAYS.length) % TIME_SLOTS.length

    schedule.push({
      day: DAYS[dayIdx],
      time: TIME_SLOTS[timeIdx],
      className: cls,
      color: `hsl(${(i * 67) % 360}, 50%, 45%)`,
    })
  })

  return schedule
}

// ============================================
// Commission badge label helper
// ============================================

function commissionBadgeLabel(commissionType: CommissionType, commissionValue: number): string {
  switch (commissionType) {
    case 'PERCENTAGE':
      return `${commissionValue}% of gross`
    case 'FLAT_HOURLY':
      return `${formatDa(commissionValue)}/h`
    case 'FIXED_SESSION':
      return `${formatDa(commissionValue)}/session`
  }
}

// ============================================
// Component
// ============================================

export default function TeacherDrawer({ teacher, isOpen, onClose, onDelete, onClassCreated, onUpdated }: TeacherDrawerProps) {
  const weeklySchedule = generateWeeklySchedule(teacher)

  /* ── Create Class inline form ── */
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [createClassLoading, setCreateClassLoading] = useState(false)
  const [createClassError, setCreateClassError] = useState<string | null>(null)

  /* ── Payout summary state ── */
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutsError, setPayoutsError] = useState<string | null>(null)

  /* ── Edit mode state ── */
  const [isEditing, setIsEditing] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editEmailError, setEditEmailError] = useState<string | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [editSubjectIds, setEditSubjectIds] = useState<string[]>([])
  const [editGrossOn, setEditGrossOn] = useState(false)
  const [editCommissionType, setEditCommissionType] = useState<CommissionType>('PERCENTAGE')
  const [editCommissionValue, setEditCommissionValue] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  /* ── Subject dropdown for edit mode ── */
  const [subjects, setSubjects] = useState<{ id: string; name: string; color: string }[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

  /* ── ESC key handler ── */
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  /* ── Click outside handler ── */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  /* ── Create Class handler ── */
  const handleCreateClass = useCallback(async () => {
    const trimmed = newClassName.trim()
    if (!trimmed || !teacher) return

    setCreateClassLoading(true)
    setCreateClassError(null)

    try {
      const res = await api.post('/classes', {
        name: trimmed,
        teacher_id: teacher.id,
      })
      if (res.data?.error) {
        setCreateClassError(res.data.error)
        return
      }
      setNewClassName('')
      setShowCreateClass(false)
      onClassCreated?.()
    } catch (err: any) {
      setCreateClassError(err?.response?.data?.error ?? 'Failed to create class.')
    } finally {
      setCreateClassLoading(false)
    }
  }, [newClassName, teacher, onClassCreated])

  /* ── Edit mode handlers ── */
  const startEditing = useCallback(() => {
    if (!teacher) return
    setEditFirstName(teacher.first_name)
    setEditLastName(teacher.last_name)
    setEditEmail(teacher.email ?? getTeacherEmail(teacher.id) ?? '')
    setEditEmailError(null)
    setEditPhone(teacher.phone ?? '')
    setEditSubjectIds((teacher.subjects ?? []).map((s: any) => s.id).filter(Boolean))
    const hasCommission = teacher.commission_type != null && teacher.commission_value != null
    setEditGrossOn(hasCommission)
    setEditCommissionType(teacher.commission_type ?? 'PERCENTAGE')
    setEditCommissionValue(teacher.commission_value != null ? teacher.commission_value.toString() : '')
    setEditNotes(teacher.notes ?? '')
    setIsEditing(true)
  }, [teacher])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setDropdownOpen(false)
    setSearchTerm('')
  }, [])

  const handleSave = useCallback(async () => {
    if (!teacher) return
    if (!editFirstName.trim()) { toast.error('First name is required'); return }
    // T9: email required + unique + validated; stored in registry, never PUT.
    const mailErr = (() => {
      const v = editEmail.trim()
      if (!v) return 'Email is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.'
      return null
    })()
    setEditEmailError(mailErr)
    if (mailErr) { toast.error(mailErr); return }
    setEditSaving(true)
    try {
      // No contract/rate fields: hourly model removed. Commission only when
      // the gross-profit toggle is ON for this teacher.
      const payload: Record<string, unknown> = {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim() || undefined,
        subject_ids: editSubjectIds,
        notes: editNotes.trim() || undefined,
      }
      if (editGrossOn) {
        payload.commission_type = editCommissionType
        payload.commission_value = editCommissionValue ? Number(editCommissionValue) : 0
      }

      await api.put(`/teachers/${teacher.id}`, payload)
      // T9: persist validated email to the frontend registry (never sent).
      const storeErr = setTeacherEmail(teacher.id, editEmail.trim())
      if (storeErr) {
        toast.warning('Teacher saved, email rejected', storeErr)
      } else {
        toast.success('Teacher updated successfully')
      }
      setIsEditing(false)
      onUpdated?.()
    } catch {
      toast.error('Failed to update teacher')
    } finally {
      setEditSaving(false)
    }
  }, [teacher, editFirstName, editLastName, editEmail, editPhone, editSubjectIds, editGrossOn, editCommissionType, editCommissionValue, editNotes, onUpdated])

  /* ── Filtered subjects for edit dropdown ── */
  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )
  const toggleEditSubject = useCallback((subjectId: string) => {
    setEditSubjectIds(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    )
  }, [])

  const removeEditSubject = useCallback((subjectId: string) => {
    setEditSubjectIds(prev => prev.filter(id => id !== subjectId))
  }, [])

  /* ── Dropdown position for portal ── */
  const updateDropdownPos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  /* ── Reset create class state when drawer closes ── */
  useEffect(() => {
    if (!isOpen) {
      setShowCreateClass(false)
      setNewClassName('')
      setCreateClassError(null)
    }
  }, [isOpen])

  /* ── Fetch payouts when drawer opens ── */
  useEffect(() => {
    if (!isOpen || !teacher) return
    let cancelled = false

    const fetchPayouts = async () => {
      setPayoutsLoading(true)
      setPayoutsError(null)
      try {
        const res = await api.get('/billing/payouts', {
          params: { teacher_id: teacher.id },
        })
        if (!cancelled) {
          setPayouts(res.data?.payouts ?? res.data ?? [])
        }
      } catch {
        if (!cancelled) {
          setPayoutsError('Could not load payout data.')
          setPayouts([])
        }
      } finally {
        if (!cancelled) setPayoutsLoading(false)
      }
    }

    fetchPayouts()
    return () => { cancelled = true }
  }, [isOpen, teacher])

  /* ── Reset payouts when drawer closes ── */
  useEffect(() => {
    if (!isOpen) {
      setPayouts([])
      setPayoutsError(null)
    }
  }, [isOpen])

  /* ── Fetch subjects when entering edit mode ── */
  useEffect(() => {
    if (!isEditing) return
    let cancelled = false
    const fetchEditSubjects = async () => {
      setSubjectsLoading(true)
      try {
        const res = await api.get('/subjects')
        const list = (res.data.subjects ?? []) as Array<{ id?: string | null; name: string; color: string }>
        if (!cancelled) setSubjects(list.filter((s) => s.id).map((s) => ({ id: s.id as string, name: s.name, color: s.color })))
      } catch {
        if (!cancelled) setSubjects([])
      } finally {
        if (!cancelled) setSubjectsLoading(false)
      }
    }
    fetchEditSubjects()
    return () => { cancelled = true }
  }, [isEditing])

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setDropdownOpen(false)
      setSearchTerm('')
    }
    const handleScroll = () => { if (dropdownOpen) updateDropdownPos() }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [dropdownOpen, updateDropdownPos])

  /* ── Focus search input when dropdown opens ── */
  useEffect(() => {
    if (dropdownOpen) requestAnimationFrame(() => searchRef.current?.focus())
  }, [dropdownOpen])

  /* ── Reset edit state when drawer closes ── */
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false)
      setDropdownOpen(false)
      setSearchTerm('')
    }
  }, [isOpen])

  /* ── Derived payout data (session money model; hourly payroll removed) ── */
  const isPaidStatus = (s: string) => s === 'Paid' || s === 'PAID'
  const totalPending = payouts
    .filter((p) => !isPaidStatus(p.status))
    .reduce((sum, p) => sum + p.teacher_cut_da, 0)
  const totalPaid = payouts
    .filter((p) => isPaidStatus(p.status))
    .reduce((sum, p) => sum + p.teacher_cut_da, 0)

  if (!isOpen || !teacher) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />

      {/* Drawer */}
      <div
        className={cn(
          'relative h-full w-[400px] max-w-[90vw]',
          'bg-[var(--glass)] border-l border-[var(--glass-border)]',
          'backdrop-blur-xl shadow-2xl',
          'flex flex-col',
          'animate-slide-in-right',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <h3
            className="text-base font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Teacher Profile
          </h3>
          <button
            onClick={onClose}
            className={cn(
              'p-1.5 rounded-lg',
              'hover:bg-[var(--glass)] text-[var(--muted)]',
              'transition-colors duration-150',
            )}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Content ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {isEditing ? (
            /* ── Edit Form ──────────────────────────── */
            <div className="space-y-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                Edit Teacher
              </p>

              {/* First Name */}
              <EditField label="First Name" required>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className={editInputCls}
                />
              </EditField>

              {/* Last Name */}
              <EditField label="Last Name">
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className={editInputCls}
                />
              </EditField>

              {/* Email — T9 required, unique, validated */}
              <EditField label="Email" required>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => {
                    setEditEmail(e.target.value)
                    const v = e.target.value.trim()
                    setEditEmailError(!v ? 'Email is required.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid email address.')
                  }}
                  placeholder="teacher@academy.dz"
                  className={cn(editInputCls, editEmailError && 'border-[var(--red)]/50')}
                />
                {editEmailError && (
                  <p className="text-[10px] text-[var(--red)] mt-1">{editEmailError}</p>
                )}
              </EditField>

              {/* Phone */}
              <EditField label="Phone">
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="0555 12 34 56"
                  className={editInputCls}
                />
              </EditField>

              {/* Subject — multi-select with portal dropdown */}
              <EditField label="Subjects">
                {/* Selected chips */}
                {editSubjectIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editSubjectIds.map(id => {
                      const s = subjects.find(sub => sub.id === id)
                      if (!s) return null
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--glass)] border border-[var(--glass-border)]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-[var(--text)]">{s.name}</span>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); removeEditSubject(id) }}
                            className="ml-0.5 p-0.5 rounded text-[var(--muted)] hover:text-[var(--red)] transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Trigger */}
                <div ref={triggerRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen((o) => {
                        if (!o) requestAnimationFrame(() => updateDropdownPos())
                        setSearchTerm('')
                        return !o
                      })
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left cursor-pointer',
                      'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                      'hover:border-[var(--muted)]/40',
                      'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                      'transition-all duration-150',
                      dropdownOpen && 'ring-2 ring-[var(--gold)]/30 border-[var(--gold)]/40',
                    )}
                  >
                    <BookOpen size={14} className="text-[var(--muted)] shrink-0" />
                    <span className="flex-1 text-left truncate">
                      {editSubjectIds.length > 0
                        ? `${editSubjectIds.length} subject${editSubjectIds.length > 1 ? 's' : ''} selected`
                        : <span className="text-[var(--muted)]">Select subjects…</span>
                      }
                    </span>
                    <ChevronDown size={14} className={cn('text-[var(--muted)] ml-auto shrink-0 transition-transform', dropdownOpen && 'rotate-180')} />
                  </button>
                </div>

                {/* Portal dropdown */}
                {dropdownOpen && createPortal(
                  <div
                    ref={dropdownRef}
                    className="fixed z-[9999]"
                    style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                  >
                    <div
                      className="rounded-xl border border-[var(--glass-border)] shadow-2xl overflow-hidden animate-fade-in"
                      style={{ backgroundColor: 'var(--card-bg)' }}
                    >
                      {/* Search input */}
                      <div className="relative border-b border-[var(--glass-border)]">
                        <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                        <input
                          ref={searchRef}
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search subjects…"
                          className="w-full pl-9 pr-3 py-2.5 text-sm text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--muted)]/50"
                        />
                      </div>

                      {/* Options list */}
                      <div className="max-h-56 overflow-y-auto py-1">
                        {subjectsLoading ? (
                          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                            Loading subjects…
                          </div>
                        ) : filteredSubjects.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                            {subjects.length === 0 ? 'No subjects yet — create them in Settings' : 'No match'}
                          </div>
                        ) : (
                          filteredSubjects.map((s) => {
                            const isSelected = editSubjectIds.includes(s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  toggleEditSubject(s.id)
                                }}
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left cursor-pointer',
                                  'hover:bg-[var(--glass)] transition-colors duration-75',
                                  isSelected && 'bg-[var(--gold-soft)]',
                                )}
                              >
                                <div className={cn(
                                  'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-100',
                                  isSelected ? 'bg-[var(--gold)] border-[var(--gold)]' : 'border-[var(--glass-border)]',
                                )}>
                                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                                </div>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                <span className="truncate text-[var(--text)]">{s.name}</span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
              </EditField>

              {/* Gross-profit opt-in (commission model, OPTIONAL) */}
              <div className="pt-2 border-t border-[var(--glass-border)]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                    Turn on calculating gross profit
                  </p>
                  <Toggle checked={editGrossOn} onCheckedChange={(v) => { setEditGrossOn(v); if (!v) setEditCommissionValue('') }} />
                </div>
                {!editGrossOn && (
                  <p className="text-[11px] text-[var(--muted)] mb-1">
                    Off — paid per session formula only, no gross/cut math.
                  </p>
                )}
                {editGrossOn && (
                <>
                {/* Commission Type Toggle */}
                <div className="flex gap-2 mb-3">
                  {(['PERCENTAGE', 'FLAT_HOURLY', 'FIXED_SESSION'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setEditCommissionType(type); setEditCommissionValue('') }}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-[11px] font-medium transition-all duration-150 leading-tight',
                        editCommissionType === type
                          ? 'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/30'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:border-[var(--muted)]/30',
                      )}
                    >
                      <span className="block">{COMMISSION_TYPE_LABELS[type]}</span>
                      <span className={cn(
                        'block text-[10px] mt-0.5',
                        editCommissionType === type ? 'text-[var(--gold)]/70' : 'text-[var(--muted)]/60',
                      )}>
                        {type === 'PERCENTAGE' && '% of gross revenue'}
                        {type === 'FLAT_HOURLY' && 'DA per hour'}
                        {type === 'FIXED_SESSION' && 'Flat DA per session'}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Commission Value Input */}
                <EditField label="Commission Value">
                  <div className="relative">
                    <input
                      type="number"
                      value={editCommissionValue}
                      onChange={(e) => {
                        const val = e.target.value
                        if (editCommissionType === 'PERCENTAGE') {
                          const num = Number(val)
                          if (val === '' || (num >= 0 && num <= 100)) {
                            setEditCommissionValue(val)
                          }
                        } else {
                          setEditCommissionValue(val)
                        }
                      }}
                      placeholder={editCommissionType === 'PERCENTAGE' ? '30' : editCommissionType === 'FLAT_HOURLY' ? '1500' : '800'}
                      min={0}
                      max={editCommissionType === 'PERCENTAGE' ? 100 : undefined}
                      className={cn(editInputCls, 'pr-20')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">
                      {editCommissionType === 'PERCENTAGE' ? '%' : editCommissionType === 'FLAT_HOURLY' ? 'DA/h' : 'DA/session'}
                    </span>
                  </div>
                </EditField>
                </>
                )}
              </div>

              {/* Notes */}
              <EditField label="Notes">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional notes about this teacher…"
                  rows={2}
                  className={cn(editInputCls, 'resize-none')}
                />
              </EditField>

              {/* Edit actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCancelEdit}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-medium',
                    'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
                    'hover:bg-[var(--glass)] transition-colors duration-150',
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={editSaving}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white',
                    'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                    'hover:opacity-90 active:scale-[0.98]',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    'transition-all duration-150',
                  )}
                >
                  {editSaving ? 'Saving…' : <><Save size={14} /> Save Changes</>}
                </button>
              </div>
            </div>
          ) : (
          <>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0',
                'text-lg font-bold',
              )}
              style={{
                background: 'linear-gradient(135deg, var(--violet-soft), var(--emerald-soft))',
                color: 'var(--text)',
              }}
            >
              {getInitials(teacher.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-bold text-[var(--text)] truncate">
                {teacher.full_name}
              </h4>
              {/* T9: name + email + phone — "Not set" fallbacks, never "— — —" */}
              <p className="text-sm text-[var(--muted)] flex items-center gap-1.5 mt-1 truncate">
                <span className="shrink-0">✉️</span>
                <span className="truncate">{teacher.email ?? getTeacherEmail(teacher.id) ?? 'Not set'}</span>
              </p>
              <p className="text-sm text-[var(--muted)] flex items-center gap-1.5 mt-1">
                <Phone size={13} className="shrink-0" />
                {teacher.phone ? formatPhone(teacher.phone) : 'Not set'}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Commission model badge — only when gross-profit is on */}
                {isGrossProfitEnabled() && teacher.commission_type && teacher.commission_value != null && (
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                      'bg-[var(--glass)] border border-[var(--glass-border)]',
                      'text-[var(--text)]',
                    )}
                  >
                    {commissionBadgeLabel(teacher.commission_type, teacher.commission_value)}
                  </span>
                )}

                {(teacher.subjects ?? []).length > 0 && (teacher.subjects ?? []).map((s: any) => (
                  <span
                    key={s.id ?? s.name}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] gap-1"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Assigned Classes */}
          <Section
            icon={<BookOpen size={14} />}
            title="Assigned Classes"
          >
            {(teacher.classes_assigned ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {teacher.classes_assigned.map((cls, i) => (
                  <span
                    key={i}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium',
                      'bg-[var(--glass)] border border-[var(--glass-border)]',
                      'text-[var(--text)]',
                    )}
                  >
                    {cls}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] italic mb-3">No classes assigned</p>
            )}

            {/* Create Class inline form */}
            {showCreateClass ? (
              <div
                className={cn(
                  'p-3 rounded-lg',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                )}
              >
                <p className="text-xs font-medium text-[var(--muted)] mb-2">New Class</p>
                {createClassError && (
                  <p className="text-[11px] text-[var(--red)] mb-2">{createClassError}</p>
                )}
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleCreateClass()
                    }
                    if (e.key === 'Escape') {
                      setShowCreateClass(false)
                      setNewClassName('')
                      setCreateClassError(null)
                    }
                  }}
                  placeholder="e.g. 1er Lycee"
                  autoFocus
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
                    'bg-[var(--glass)] border border-[var(--glass-border)]',
                    'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                    'placeholder:text-[var(--muted)]/50',
                    'transition-shadow duration-150',
                  )}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateClass}
                    disabled={!newClassName.trim() || createClassLoading}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium text-white',
                      'hover:opacity-90 active:scale-[0.98]',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                      'transition-all duration-150',
                    )}
                    style={{
                      background: 'linear-gradient(135deg, var(--gold), var(--emerald))',
                    }}
                  >
                    {createClassLoading ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateClass(false)
                      setNewClassName('')
                      setCreateClassError(null)
                    }}
                    disabled={createClassLoading}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium',
                      'text-[var(--muted)] hover:bg-[var(--glass)]',
                      'transition-colors duration-150',
                      'disabled:opacity-40',
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateClass(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  'text-[var(--gold)] hover:bg-[var(--gold-soft)]',
                  'border border-dashed border-[var(--gold)]/30',
                  'transition-all duration-150',
                  'active:scale-[0.98]',
                )}
              >
                <Plus size={13} />
                Create Class
              </button>
            )}
          </Section>

          {/* Weekly Schedule */}
          <Section
            icon={<Calendar size={14} />}
            title="Weekly Schedule"
          >
            {weeklySchedule.length > 0 ? (
              <div className="space-y-1">
                {DAYS.map((day) => {
                  const daySlots = weeklySchedule.filter((s) => s.day === day)
                  return (
                    <div key={day} className="flex items-start gap-2">
                      <span className="text-[11px] font-semibold text-[var(--muted)] w-8 shrink-0 mt-1">
                        {day}
                      </span>
                      <div className="flex-1 flex flex-wrap gap-1">
                        {daySlots.length > 0 ? (
                          daySlots.map((slot, i) => (
                            <div
                              key={i}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium',
                                'text-white',
                              )}
                              style={{ backgroundColor: slot.color }}
                              title={`${slot.time} — ${slot.className}`}
                            >
                              {slot.time} {slot.className}
                            </div>
                          ))
                        ) : (
                          <span className="text-[10px] text-[var(--muted)]/50 italic">—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] italic">No schedule data</p>
            )}
          </Section>

          {/* Gross-profit Summary — only when the toggle is ON */}
          {isGrossProfitEnabled() && (
          <Section
            icon={<CreditCard size={14} />}
            title="Gross Profit"
          >
            <div className="grid grid-cols-2 gap-3">
              <PayrollStat
                label="Students"
                value={`${teacher?.students_count ?? 0}`}
                icon={<Users size={12} />}
              />
              <PayrollStat
                label="Rate"
                value={
                  teacher.commission_type && teacher.commission_value != null
                    ? commissionRateLabel(teacher.commission_type, teacher.commission_value)
                    : '—'
                }
                icon={<TrendingUp size={12} />}
              />
            </div>
          </Section>
          )}

          {/* Payout Summary */}
          <Section
            icon={<Wallet size={14} />}
            title="Payout Summary"
          >
            {payoutsLoading ? (
              <p className="text-xs text-[var(--muted)] italic">Loading payouts…</p>
            ) : payoutsError ? (
              <p className="text-xs text-[var(--red)]">{payoutsError}</p>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <PayrollStat
                    label="Total Pending"
                    value={formatDa(totalPending)}
                    icon={<Clock size={12} />}
                  />
                  <PayrollStat
                    label="Total Paid"
                    value={formatDa(totalPaid)}
                    icon={<GraduationCap size={12} />}
                    highlight
                  />
                </div>

                {/* Payout rows */}
                {payouts.length > 0 ? (
                  <div className="space-y-1.5">
                    {payouts.map((payout) => (
                      <div
                        key={payout.id}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg',
                          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[var(--text)] truncate">
                            {payout.session_date
                              ? formatDateShort(payout.session_date)
                              : payout.created_at
                                ? formatDateShort(payout.created_at)
                                : '—'}
                          </p>
                          {isGrossProfitEnabled() && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[var(--muted)]">
                              Gross {formatDa(payout.gross_revenue_da)}
                            </span>
                            <span className="text-[10px] text-[var(--muted)]">
                              Cut {formatDa(payout.teacher_cut_da)}
                            </span>
                          </div>
                          )}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                            payout.status === 'Paid'
                              ? 'bg-[var(--emerald-soft)] text-[var(--emerald)]'
                              : 'bg-[var(--gold-soft)] text-[var(--gold)]',
                          )}
                        >
                          {payout.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)] italic">No payouts recorded yet.</p>
                )}
              </>
            )}
          </Section>

          {/* Notes */}
          {teacher.notes && (
            <Section icon={<BookOpen size={14} />} title="Notes">
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                {teacher.notes}
              </p>
            </Section>
          )}
          </>
          )}
        </div>

        {/* ── Footer Action ───────────────────────── */}
        <div className="px-5 py-4 border-t border-[var(--glass-border)]">
          <div className="flex gap-2">
            {!isEditing && teacher.phone && (
              <a
                href={`tel:${teacher.phone}`}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                  'text-sm font-medium',
                  'bg-[var(--emerald)]/10 text-[var(--emerald)]',
                  'hover:bg-[var(--emerald)]/20 active:scale-[0.98]',
                  'transition-all duration-150',
                )}
              >
                <Phone size={15} />
                Call Teacher
              </a>
            )}
            {!isEditing && (
              <button
                onClick={startEditing}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                  'text-sm font-medium',
                  'bg-[var(--gold-soft)] text-[var(--gold)]',
                  'hover:bg-[var(--gold)]/20 active:scale-[0.98]',
                  'transition-all duration-150',
                )}
              >
                <Pencil size={15} />
                Edit Teacher
              </button>
            )}
            {!isEditing && onDelete && (
              <button
                onClick={() => onDelete(teacher.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                  'text-sm font-medium',
                  'bg-[var(--red-soft)] text-[var(--red)]',
                  'hover:bg-[var(--red)]/20 active:scale-[0.98]',
                  'transition-all duration-150',
                )}
              >
                <Trash2 size={15} />
                Delete Teacher
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Commission rate label (for Payroll Summary)
// ============================================

function commissionRateLabel(commissionType: CommissionType, commissionValue: number): string {
  switch (commissionType) {
    case 'PERCENTAGE':
      return `${commissionValue}%/session`
    case 'FLAT_HOURLY':
      return `${formatDa(commissionValue)}/h`
    case 'FIXED_SESSION':
      return `${formatDa(commissionValue)}/session`
  }
}

// ============================================
// Section (internal)
// ============================================

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[var(--gold)]">{icon}</span>
        <h5 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
          {title}
        </h5>
      </div>
      {children}
    </div>
  )
}

// ============================================
// Payroll Stat (internal)
// ============================================

function PayrollStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'px-3 py-2.5 rounded-lg',
        'border',
        highlight
          ? 'bg-[var(--gold-soft)]/50 border-[var(--gold)]/20'
          : 'bg-[var(--input-bg)] border-[var(--glass-border)]',
      )}
    >
      <div className="flex items-center gap-1 mb-1">
        <span className={highlight ? 'text-[var(--gold)]' : 'text-[var(--muted)]'}>
          {icon}
        </span>
        <span className="text-[10px] text-[var(--muted)]">{label}</span>
      </div>
      <p
        className={cn(
          'text-sm font-bold',
          highlight ? 'text-[var(--gold)]' : 'text-[var(--text)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

// ============================================
// Edit Field wrapper (internal)
// ============================================

function EditField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs font-medium text-[var(--muted)] mb-1.5">
        {label}
        {required && <span className="text-[var(--red)]">*</span>}
      </label>
      {children}
    </div>
  )
}

// ============================================
// Edit Input class
// ============================================

const editInputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]',
  'transition-shadow duration-150',
)
