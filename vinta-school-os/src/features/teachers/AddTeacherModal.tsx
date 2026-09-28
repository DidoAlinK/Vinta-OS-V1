/**
 * Vinta School OS — Add Teacher Modal
 * Modal form for creating a new teacher with multi-subject selection,
 * contact info, optional gross-profit commission, and inline group creation.
 * (Hourly/contract model removed — nobody used it.)
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, UserPlus, Phone, BookOpen, ChevronDown, Search, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Toggle } from '../../components/ui/Toggle'
import { DayPicker } from '../../components/ui/DayPicker'
import { Select } from '../../components/ui/Select'
import { TimePicker } from '../../components/ui/TimePicker'
import { toast } from '../../stores/uiStore'
import { isValidEmail } from '../../lib/teacherEmails'
import { formatDuration } from '../../lib/formatters'
import type { CommissionType } from '../../types/teacher'

// ============================================
// Types
// ============================================

interface Subject {
  id: string | null
  name: string
  color: string
}

interface TeacherGroup {
  id: string
  name: string
  subject: string
  capacity: number
  price_da: number
  class_type: 'weekly' | 'temporary'
  /** Weekday anchor for a weekly group; the exact date for a one-off. */
  day: string
  start_time: string
  end_time: string
  notes: string
}

// ============================================
// Constants
// ============================================

const COMMISSION_TYPES: CommissionType[] = ['PERCENTAGE', 'FLAT_HOURLY', 'FIXED_SESSION']

/**
 * Commission wording travels as key names, never as words. A module-level map
 * of labels is resolved once, at import, in whatever language happened to be
 * loaded at the time, and would then ignore every later language switch.
 */
const COMMISSION_TYPE_KEYS: Record<CommissionType, string> = {
  PERCENTAGE: 'modal.commissionTypePercentage',
  FLAT_HOURLY: 'modal.commissionTypeHourly',
  FIXED_SESSION: 'modal.commissionTypeSession',
}

const COMMISSION_SUFFIX_KEYS: Record<CommissionType, string> = {
  PERCENTAGE: 'modal.suffixPercentage',
  FLAT_HOURLY: 'modal.suffixHourly',
  FIXED_SESSION: 'modal.suffixSession',
}

const COMMISSION_PLACEHOLDER: Record<CommissionType, string> = {
  PERCENTAGE: '30',
  FLAT_HOURLY: '1500',
  FIXED_SESSION: '800',
}

// ============================================
// Props
// ============================================

export interface AddTeacherModalProps {
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

// ============================================
// Component
// ============================================

export default function AddTeacherModal({ isOpen, onClose, onAdded }: AddTeacherModalProps) {
  const { t } = useTranslation('teachers')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Commission model state (OPTIONAL — only when gross-profit toggle is ON)
  const [grossOn, setGrossOn] = useState(false)
  const [commissionType, setCommissionType] = useState<CommissionType>('PERCENTAGE')
  const [commissionValue, setCommissionValue] = useState('')

  // Subjects from backend
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)

  // Multi-select dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

  // Groups state
  const [groups, setGroups] = useState<TeacherGroup[]>([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupSubject, setGroupSubject] = useState('')
  const [groupCapacity, setGroupCapacity] = useState(20)
  const [groupPrice, setGroupPrice] = useState(0)
  const [groupClassType, setGroupClassType] = useState<'weekly' | 'temporary'>('weekly')
  const [groupDay, setGroupDay] = useState('')
  const [groupStartTime, setGroupStartTime] = useState('')
  const [groupEndTime, setGroupEndTime] = useState('')
  const [groupNotes, setGroupNotes] = useState('')

  // Fetch subjects on mount
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const fetchSubjects = async () => {
      setSubjectsLoading(true)
      try {
        const res = await api.get<{ subjects: Subject[] }>('/subjects')
        if (!cancelled) setSubjects(res.data.subjects ?? [])
      } catch {
        if (!cancelled) setSubjects([])
      } finally {
        if (!cancelled) setSubjectsLoading(false)
      }
    }
    fetchSubjects()
    return () => { cancelled = true }
  }, [isOpen])

  // Position dropdown relative to trigger
  const updateDropdownPos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  // Open/close dropdown with position
  const toggleDropdown = useCallback(() => {
    setDropdownOpen(prev => {
      const next = !prev
      if (next) {
        // Position on next frame after render
        requestAnimationFrame(() => updateDropdownPos())
      }
      setSearchTerm('')
      return next
    })
  }, [updateDropdownPos])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return
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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [dropdownOpen])

  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const toggleSubject = useCallback((subjectId: string) => {
    setSelectedSubjectIds(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    )
  }, [])

  const removeSubject = useCallback((subjectId: string) => {
    setSelectedSubjectIds(prev => prev.filter(id => id !== subjectId))
  }, [])

  const validateEmailLive = useCallback((value: string): string | null => {
    const v = value.trim()
    // Email is optional: plenty of teachers here do not have one, and their
    // profile must still be creatable. Only a value that is present and
    // malformed blocks the save.
    if (!v) return null
    if (!isValidEmail(v)) return t('modal.emailInvalid')
    // Uniqueness is enforced by the server (academy-scoped, 409). Do NOT block
    // the button on the draft value.
    return null
  }, [t])

  const resetForm = useCallback(() => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setEmailError(null)
    setPhone('')
    setSelectedSubjectIds([])
    setNotes('')
    setGrossOn(false)
    setCommissionType('PERCENTAGE')
    setCommissionValue('')
    setGroups([])
    setShowGroupForm(false)
    resetGroupForm()
  }, [])

  const resetGroupForm = useCallback(() => {
    setGroupName('')
    setGroupSubject('')
    setGroupCapacity(20)
    setGroupPrice(0)
    setGroupClassType('weekly')
    setGroupDay('')
    setGroupStartTime('')
    setGroupEndTime('')
    setGroupNotes('')
  }, [])

  const handleClose = useCallback(() => {
    setDropdownOpen(false)
    resetForm()
    onClose()
  }, [onClose, resetForm])

  const handleAddGroup = useCallback(() => {
    if (!groupName.trim()) return
    // A group with no time is a group that can never produce a session. This
    // form used to accept a sentence about the time instead ("Mon/Wed
    // 10:00-12:00"), store it on the group, and leave the calendar empty — so
    // the desk created a group, enrolled nobody, and only found out later.
    if (!groupStartTime || !groupEndTime) {
      toast.error(t('toast.groupTimeTitle'), t('toast.groupTimeBody'))
      return
    }
    if (groupEndTime <= groupStartTime) {
      toast.error(t('toast.checkTimesTitle'), t('toast.checkTimesBody'))
      return
    }
    if (!groupDay) {
      toast.error(
        groupClassType === 'weekly' ? t('toast.pickDayTitle') : t('toast.pickDateTitle'),
        groupClassType === 'weekly'
          ? t('toast.pickDayBody')
          : t('toast.pickDateBody'),
      )
      return
    }
    const newGroup: TeacherGroup = {
      id: `group-${Date.now()}`,
      name: groupName.trim(),
      subject: groupSubject,
      capacity: groupCapacity,
      price_da: groupPrice,
      class_type: groupClassType,
      day: groupDay,
      start_time: groupStartTime,
      end_time: groupEndTime,
      notes: groupNotes.trim(),
    }
    setGroups(prev => [...prev, newGroup])
    resetGroupForm()
    setShowGroupForm(false)
  }, [t, groupName, groupSubject, groupCapacity, groupPrice, groupClassType, groupDay, groupStartTime, groupEndTime, groupNotes, resetGroupForm])

  const handleRemoveGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!firstName.trim()) { toast.error(t('toast.nameRequired')); return }
    // Email is optional and round-trips through the API now (it used to live
    // only in localStorage). Only a value that is present and malformed blocks
    // the save; uniqueness is the server's job and comes back as a 409.
    const mailErr = validateEmailLive(email)
    setEmailError(mailErr)
    if (mailErr) { toast.error(mailErr); return }
    if (!phone.trim()) { toast.error(t('toast.phoneRequired')); return }
    if (selectedSubjectIds.length === 0) { toast.error(t('toast.subjectRequired')); return }
    setIsSubmitting(true)
    try {
      // 1. Create teacher. No contract/rate fields: hourly model removed.
      // Commission only when the academy opted into gross-profit; otherwise the
      // backend defaults apply.
      const payload: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        // Optional — omitted entirely when blank. `undefined` is dropped by
        // JSON.stringify, so the server sees no email key at all.
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        subject_ids: selectedSubjectIds,
        notes: notes.trim() || undefined,
      }

      if (grossOn) {
        payload.commission_type = commissionType
        payload.commission_value = commissionValue ? Number(commissionValue) : 0
      }

      const { data: teacherData } = await api.post('/teachers', payload)

      // 2. Create each group, then give it its time.
      //
      // Two calls each, in this order, because creating a group and defining
      // when it meets are two different resources — `/classes/:id/schedules` is
      // what owns `generate_sessions_from_schedule`. Skipping the second call is
      // how every group made from here used to end up with a permanently empty
      // calendar; a third failure mode was worse than empty, because the catch
      // below swallowed it and the group looked created.
      const failed: string[] = []
      for (const group of groups) {
        let created: { id: string }
        try {
          const { data } = await api.post('/classes', {
            name: group.name,
            subject: group.subject || undefined,
            teacher_id: teacherData.id,
            capacity: group.capacity,
            price_da: group.price_da || undefined,
            class_type: group.class_type,
            notes: group.notes || undefined,
          })
          created = data
        } catch {
          failed.push(group.name)
          continue
        }

        const anchorDow =
          group.class_type === 'weekly'
            ? new Date(`${group.day}T12:00:00`).getDay()
            : undefined
        try {
          if (group.class_type === 'weekly') {
            await api.post(`/classes/${created.id}/schedules`, {
              day_of_week: anchorDow,
              start_time: group.start_time,
              end_time: group.end_time,
            })
          } else {
            await api.post('/sessions', {
              class_id: created.id,
              date: group.day,
              start_time: group.start_time,
              end_time: group.end_time,
            })
          }
        } catch (err) {
          // 409 means this group already meets at exactly these hours — a
          // re-save, not a failure.
          const status = (err as { response?: { status?: number } })?.response?.status
          if (status !== 409) failed.push(group.name)
        }
      }

      if (failed.length > 0) {
        // The teacher exists. Saying "created" over the top of a group that did
        // not make it is the same lie this handler was fixed for once already.
        toast.error(
          t('toast.groupsFailedTitle'),
          t('toast.groupsFailedBody', { names: failed.join(', ') }),
        )
      }

      resetForm()
      onAdded()
      onClose()
    } catch (err) {
      // This used to reset, refresh and close — so a refused create looked
      // exactly like a created one and the teacher silently never appeared.
      // Keep the form open and say what the server said.
      const message =
        (err as { response?: { data?: { error?: string; message?: string } } })
          ?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('modal.serverRefused')
      toast.error(t('toast.notCreated'), message)
    } finally {
      setIsSubmitting(false)
    }
  }, [t, firstName, lastName, email, validateEmailLive, phone, selectedSubjectIds, grossOn, notes, commissionType, commissionValue, groups, resetForm, onAdded, onClose])

  if (!isOpen) return null

  const selectedSubjects = selectedSubjectIds
    .map(id => subjects.find(s => s.id === id))
    .filter(Boolean) as Subject[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={cn(
          'w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
        )}
      >
        {/* ── Header ──────────────────────────── */}
        <div className="flex items-center justify-between mb-5 sticky top-0 bg-[var(--card-bg)] pb-2 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--gold-soft)] flex items-center justify-center">
              <UserPlus size={16} className="text-[var(--gold)]" />
            </div>
            <h2
              className="text-lg font-bold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {t('modal.title')}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className={cn(
              'p-1.5 rounded-lg text-[var(--muted)]',
              'hover:bg-[var(--glass)] hover:text-[var(--text)]',
              'transition-colors duration-150',
            )}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Form ────────────────────────────── */}
        <div className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('modal.fieldFirstName')} required>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('modal.firstNamePlaceholder')}
                className={inputCls}
              />
            </Field>
            <Field label={t('modal.fieldLastName')} required>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('modal.lastNamePlaceholder')}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Email — optional, and the only one that is: plenty of teachers
              here have no address, and the profile must still be creatable.
              Validated only when present; uniqueness is the server's call. */}
          <Field label={t('modal.fieldEmail')}>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(validateEmailLive(e.target.value)) }}
              placeholder={t('modal.emailPlaceholder')}
              className={cn(inputCls, emailError && 'border-[var(--red)]/50')}
            />
            {emailError && (
              <p className="text-[10px] text-[var(--red)] mt-1">{emailError}</p>
            )}
          </Field>

          {/* Phone — required, and the label says so. It was silently
              mandatory before: the button stayed enabled and the save bounced
              off a toast, which reads as the form being broken. */}
          <Field label={t('modal.fieldPhone')} required>
            <div className="relative">
              <Phone size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('modal.phonePlaceholder')}
                className={cn(inputCls, 'ps-9')}
              />
            </div>
          </Field>

          {/* Subjects — multi-select with portal dropdown */}
          <Field label={t('modal.fieldSubjects')} required>
            {/* Selected chips */}
            {selectedSubjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedSubjects.map(s => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--glass)] border border-[var(--glass-border)]"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[var(--text)]">{s.name}</span>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); removeSubject(s.id!) }}
                      className="ms-0.5 p-0.5 rounded text-[var(--muted)] hover:text-[var(--red)] transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Trigger */}
            <div ref={triggerRef} className="relative">
              <button
                type="button"
                onClick={toggleDropdown}
                className={cn(
                  inputCls,
                  'flex items-center gap-2 text-start min-h-[38px] cursor-pointer',
                  dropdownOpen && 'ring-2 ring-[var(--gold)]/30',
                )}
              >
                <BookOpen size={14} className="text-[var(--muted)] shrink-0" />
                <span className="flex-1 text-start truncate">
                  {selectedSubjects.length > 0
                    ? t('modal.subjectsSelected', { count: selectedSubjects.length })
                    : <span className="text-[var(--muted)]">{t('modal.selectSubjects')}</span>
                  }
                </span>
                <ChevronDown
                  size={14}
                  className={cn('text-[var(--muted)] shrink-0 transition-transform duration-150', dropdownOpen && 'rotate-180')}
                />
              </button>
            </div>

            {/* Portal dropdown — renders outside overflow containers */}
            {dropdownOpen && createPortal(
              <div
                ref={dropdownRef}
                className="fixed z-[9999]"
                style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
              >
                <div className="rounded-xl bg-[var(--card-bg)] border border-[var(--glass-border)] shadow-2xl overflow-hidden animate-fade-in">
                  {/* Search */}
                  <div className="relative border-b border-[var(--glass-border)]">
                    <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('modal.searchSubjects')}
                      className={cn(
                        'w-full ps-9 pe-3 py-2.5 text-sm text-[var(--text)]',
                        'bg-transparent outline-none',
                        'placeholder:text-[var(--muted)]',
                      )}
                    />
                  </div>
                  {/* Options */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {subjectsLoading ? (
                      <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                        {t('modal.subjectsLoading')}
                      </div>
                    ) : filteredSubjects.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                        {subjects.length === 0 ? t('modal.noSubjects') : t('modal.noSubjectMatch')}
                      </div>
                    ) : (
                      filteredSubjects.map((s) => {
                        if (!s.id) return null
                        const isSelected = selectedSubjectIds.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              toggleSubject(s.id!)
                            }}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-start cursor-pointer',
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

            {selectedSubjectIds.length === 0 && (
              <p className="text-[10px] text-[var(--red)] mt-1">
                {t('modal.subjectRequired')}
                {subjects.length === 0 && !subjectsLoading && t('modal.noSubjectsHint')}
              </p>
            )}
          </Field>

          {/* ── Gross-profit opt-in (commission model, OPTIONAL) ──────── */}
          <div className="pt-2 border-t border-[var(--glass-border)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                {t('modal.grossProfitToggle')}
              </p>
              <Toggle checked={grossOn} onCheckedChange={(v) => { setGrossOn(v); if (!v) setCommissionValue('') }} />
            </div>
            {!grossOn && (
              <p className="text-[11px] text-[var(--muted)] mb-1">
                {t('modal.grossOffNote')}
              </p>
            )}
            {grossOn && (
              <>
                <div className="flex gap-2 mb-3">
                  {COMMISSION_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setCommissionType(type); setCommissionValue('') }}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-[11px] font-medium transition-all duration-150 leading-tight',
                        commissionType === type
                          ? 'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/30'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:border-[var(--muted)]/30',
                      )}
                    >
                      <span className="block">{t(COMMISSION_TYPE_KEYS[type])}</span>
                    </button>
                  ))}
                </div>
                <Field label={t('modal.fieldCommissionValue')}>
                  <div className="relative">
                    <input
                      type="number"
                      value={commissionValue}
                      onChange={(e) => {
                        const val = e.target.value
                        if (commissionType === 'PERCENTAGE') {
                          const num = Number(val)
                          if (val === '' || (num >= 0 && num <= 100)) setCommissionValue(val)
                        } else {
                          setCommissionValue(val)
                        }
                      }}
                      placeholder={COMMISSION_PLACEHOLDER[commissionType]}
                      min={0}
                      max={commissionType === 'PERCENTAGE' ? 100 : undefined}
                      className={cn(inputCls, 'pe-20')}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">
                      {t(COMMISSION_SUFFIX_KEYS[commissionType])}
                    </span>
                  </div>
                </Field>
              </>
            )}
          </div>

          {/* Notes */}
          <Field label={t('modal.fieldNotes')}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('modal.notesPlaceholder')}
              rows={2}
              className={cn(inputCls, 'resize-none')}
            />
          </Field>

          {/* ── Groups Section ──────────────────── */}
          <div className="pt-2 border-t border-[var(--glass-border)]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                {t('modal.groupsSection')}
              </p>
              <button
                type="button"
                onClick={() => setShowGroupForm(true)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium',
                  'text-[var(--gold)] hover:bg-[var(--gold-soft)]',
                  'transition-colors duration-150',
                )}
              >
                <Plus size={12} />
                {t('modal.addGroup')}
              </button>
            </div>

            {/* Existing groups */}
            {groups.length > 0 && (
              <div className="space-y-2 mb-3">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg',
                      'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{group.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {group.subject && (
                          <span className="text-[10px] text-[var(--muted)]">{group.subject}</span>
                        )}
                        <span className="text-[10px] text-[var(--muted)]">{t('modal.groupCapacity', { count: group.capacity })}</span>
                        {group.price_da > 0 && (
                          <span className="text-[10px] text-[var(--muted)]">{group.price_da} DA</span>
                        )}
                        {/* The time is on the chip because it is the part that
                            used to go missing: a group could be added with a
                            sentence where this belongs and nothing said so. */}
                        <span className="text-[10px] text-[var(--muted)]">
                          {group.start_time}–{group.end_time}
                          {group.class_type === 'temporary' && group.day ? ` · ${group.day}` : ''}
                        </span>
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          group.class_type === 'weekly'
                            ? 'bg-[var(--emerald-soft)] text-[var(--emerald)]'
                            : 'bg-[var(--gold-soft)] text-[var(--gold)]',
                        )}>
                          {group.class_type === 'weekly' ? t('modal.groupTypeWeekly') : t('modal.groupTypeTemp')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(group.id)}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline group form */}
            {showGroupForm && (
              <div className={cn(
                'p-3 rounded-lg space-y-2',
                'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              )}>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t('modal.groupNamePlaceholder')}
                  className={inputCls}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={groupSubject}
                    onChange={setGroupSubject}
                    options={[
                      { value: '', label: t('modal.groupSubjectPlaceholder') },
                      ...subjects.map(s => ({ value: s.name, label: s.name })),
                    ]}
                    className={cn(inputCls, 'h-auto')}
                  />
                  <input
                    type="number"
                    value={groupCapacity}
                    onChange={(e) => setGroupCapacity(Number(e.target.value))}
                    placeholder={t('modal.groupCapacityPlaceholder')}
                    min={1}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={groupPrice || ''}
                    onChange={(e) => setGroupPrice(Number(e.target.value))}
                    placeholder={t('modal.groupPricePlaceholder')}
                    min={0}
                    className={inputCls}
                  />
                  <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
                    {/* The loop variable used to be `t`, which now shadows the
                        translator — one of the two had to be renamed. */}
                    {(['weekly', 'temporary'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGroupClassType(type)}
                        className={cn(
                          'flex-1 py-1.5 text-[11px] font-medium transition-all',
                          groupClassType === type
                            ? 'bg-[var(--gold)] text-white'
                            : 'bg-[var(--input-bg)] text-[var(--muted)]',
                        )}
                      >
                        {type === 'weekly' ? t('modal.groupTypeWeekly') : t('modal.groupTypeTemp')}
                      </button>
                    ))}
                  </div>
                </div>
                {/* The day the series runs on, then its two real times.
                    This replaced a free-text "Dedicated time" box asking for
                    prose like "Mon/Wed 10:00-12:00". The server stored the
                    sentence on the group and nothing could turn it into a
                    session, so the group's calendar stayed empty forever. */}
                <DayPicker
                  value={groupDay}
                  onChange={setGroupDay}
                  placeholder={groupClassType === 'weekly' ? t('modal.pickWeeklyDay') : t('modal.pickOneOffDate')}
                />
                <div className="grid grid-cols-2 gap-2">
                  <TimePicker
                    value={groupStartTime}
                    onChange={setGroupStartTime}
                    aria-label={t('modal.startAt')}
                    className={inputCls}
                  />
                  <TimePicker
                    value={groupEndTime}
                    onChange={setGroupEndTime}
                    aria-label={t('modal.endAt')}
                    className={inputCls}
                  />
                </div>
                <p className="text-[10px] text-[var(--muted)] -mt-1">
                  {groupStartTime && groupEndTime && groupEndTime > groupStartTime
                    ? t('modal.timeSummary', { duration: formatDuration(groupStartTime, groupEndTime) })
                    : t('modal.timeHint')}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowGroupForm(false); resetGroupForm() }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-[var(--glass)] text-[var(--muted)]"
                  >
                    {t('common:action.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddGroup}
                    disabled={!groupName.trim()}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] disabled:opacity-40"
                  >
                    {t('modal.addGroup')}
                  </button>
                </div>
              </div>
            )}

            {!showGroupForm && groups.length === 0 && (
              <p className="text-xs text-[var(--muted)] italic">
                {t('modal.noGroups')}
              </p>
            )}
          </div>
        </div>

        {/* ── Actions ──────────────────────────── */}
        <div className="flex gap-3 mt-6 sticky bottom-0 bg-[var(--card-bg)] pt-3">
          <button
            onClick={handleClose}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium',
              'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
              'hover:bg-[var(--glass)] transition-colors duration-150',
            )}
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!firstName.trim() || !lastName.trim() || !phone.trim() || !!validateEmailLive(email) || selectedSubjectIds.length === 0 || isSubmitting}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            )}
          >
            {isSubmitting ? t('modal.adding') : t('modal.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Field wrapper (internal)
// ============================================

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
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
// Input class
// ============================================

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)
