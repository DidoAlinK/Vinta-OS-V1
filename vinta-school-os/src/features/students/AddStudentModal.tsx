/**
 * Vinta School OS — Add Student Modal
 * Modal form for creating new student records with
 * mandatory multi-group enrollment and searchable class selection.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, UserPlus, Search, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'

// ============================================
// Types
// ============================================

export interface AddStudentModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

interface ClassOption {
  id: string
  name: string
  subject: string
}

// ============================================
// Component
// ============================================

export default function AddStudentModal({ isOpen, onClose, onCreated }: AddStudentModalProps) {
  const { t } = useTranslation('students')

  /* ── Form state ── */
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [classSearch, setClassSearch] = useState('')
  const [classDropdownOpen, setClassDropdownOpen] = useState(false)

  /* ── Options ── */
  const [classOptions, setClassOptions] = useState<ClassOption[]>([])

  /* ── UI state ── */
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Refs ── */
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  /* ── Fetch class options when opened ── */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    async function loadOptions() {
      try {
        const classesRes = await api.get('/classes')
        if (cancelled) return

        const data = classesRes.data
        setClassOptions(data.classes ?? data ?? [])
      } catch {
        // Options unavailable — form still works without them
      }
    }

    loadOptions()
    return () => { cancelled = true }
  }, [isOpen])

  /* ── Reset form on open ── */
  useEffect(() => {
    if (isOpen) {
      setFirstName('')
      setLastName('')
      setPhone('')
      setParentPhone('')
      setNotes('')
      setSelectedClassIds([])
      setClassSearch('')
      setClassDropdownOpen(false)
      setError(null)
    }
  }, [isOpen])

  /* ── ESC handler ── */
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  /* ── Click outside to close dropdown ── */
  useEffect(() => {
    if (!classDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [classDropdownOpen])

  /* ── Focus search when dropdown opens ── */
  useEffect(() => {
    if (classDropdownOpen) searchInputRef.current?.focus()
  }, [classDropdownOpen])

  /* ── Toggle class selection ── */
  const toggleClass = useCallback((classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    )
  }, [])

  /* ── Remove class from selection ── */
  const removeClass = useCallback((classId: string) => {
    setSelectedClassIds(prev => prev.filter(id => id !== classId))
  }, [])

  /* ── Filtered class options ── */
  const filteredClasses = classOptions.filter((cls) => {
    const q = classSearch.toLowerCase()
    return (
      cls.name.toLowerCase().includes(q) ||
      (cls.subject || '').toLowerCase().includes(q)
    )
  })

  /* ── Color dot for class ── */
  const classColor = useCallback((id: string) => {
    let hash = 0
    for (const ch of id) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
    return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`
  }, [])

  /* ── Submit ── */
  const handleSubmit = useCallback(async () => {
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    if (!trimmedFirst || !trimmedLast) return
    if (selectedClassIds.length === 0) {
      setError(t('modal.error.noGroup'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await api.post('/students', {
        first_name: trimmedFirst,
        last_name: trimmedLast,
        phone: phone.trim() || undefined,
        parent_phone: parentPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        class_ids: selectedClassIds,
      })
      if (response.data?.error) {
        // A server message is data, not copy — it is shown as the server wrote it.
        setError(response.data.error)
        toast.error(t('modal.toast.notAdded'), response.data.error)
        return
      }
      const name = `${trimmedFirst} ${trimmedLast}`.trim()
      /* One toast key, two plural forms: the count of groups is the only thing
         that varies, so English, French and the six Arabic forms all agree with
         it rather than the branch being spelled out here. */
      toast.success(
        t('modal.toast.addedTitle'),
        t('modal.toast.enrolled', { name, count: selectedClassIds.length }),
      )
      onCreated?.()
      onClose()
    } catch (err: any) {
      // A refusal here is usually actionable — a full group, a duplicate —
      // and it was being written only to the banner above the fold, which the
      // desk reads as nothing having happened.
      const message =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        t('modal.error.createFailed')
      setError(message)
      toast.error(t('modal.toast.notAdded'), message)
    } finally {
      setIsSubmitting(false)
    }
  }, [t, firstName, lastName, phone, parentPhone, notes, selectedClassIds, onCreated, onClose])

  /* ── Keyboard submit ── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  if (!isOpen) return null

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && selectedClassIds.length > 0 && !isSubmitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'glass relative z-10 w-full max-w-lg max-h-[85vh]',
          'rounded-2xl shadow-2xl',
          'animate-fade-in-scale',
          'flex flex-col',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--gold-soft)] flex items-center justify-center">
              <UserPlus size={16} className="text-[var(--gold)]" />
            </div>
            <h3
              className="text-base font-bold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {t('modal.title')}
            </h3>
          </div>
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

        {/* ── Form ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Error banner */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[var(--red-soft)] text-[var(--red)] text-xs font-medium">
              {error}
            </div>
          )}

          {/* Student Info */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              {t('modal.section.studentInfo')}
            </h4>
            <div className="space-y-3">
              {/* First + Last Name row */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('modal.field.firstName')} required>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('modal.placeholder.firstName')}
                    autoFocus
                    className={inputClass}
                  />
                </FormField>
                <FormField label={t('modal.field.lastName')} required>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('modal.placeholder.lastName')}
                    className={inputClass}
                  />
                </FormField>
              </div>

              {/* Phone — the placeholder stays the Algerian `+213` shape in every
                  language: it is the format the field accepts, not a sentence. */}
              <FormField label={t('common:label.phone')}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="+213 5## ## ## ##"
                  className={inputClass}
                />
              </FormField>

              {/* Parent Phone */}
              <FormField label={t('modal.field.parentPhone')}>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="+213 5## ## ## ##"
                  className={inputClass}
                />
              </FormField>

              {/* Notes */}
              <FormField label={t('common:label.notes')}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('modal.placeholder.notes')}
                  rows={3}
                  className={cn(inputClass, 'resize-none')}
                />
              </FormField>
            </div>
          </div>

          {/* Class Enrollment — Mandatory Multi-Select */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
              {t('modal.section.groupEnrollment')}{' '}
              <span className="text-[var(--red)]">*</span>
            </h4>
            <p className="text-[10px] text-[var(--muted)] mb-3">
              {t('modal.groupEnrollmentHint')}
            </p>

            {/* Selected chips */}
            {selectedClassIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedClassIds.map(id => {
                  const cls = classOptions.find(c => c.id === id)
                  if (!cls) return null
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--glass)] border border-[var(--glass-border)]"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: classColor(id) }} />
                      <span className="text-[var(--text)]">{cls.name}</span>
                      <button
                        type="button"
                        onClick={() => removeClass(id)}
                        className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--red)] transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Search dropdown */}
            <div className="relative" ref={dropdownRef}>
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg',
                  'bg-[var(--input-bg)] border',
                  classDropdownOpen
                    ? 'border-[var(--gold)]/40 ring-2 ring-[var(--gold)]/20'
                    : 'border-[var(--glass-border)]',
                  'transition-all duration-150',
                )}
                onClick={() => { setClassDropdownOpen(true); searchInputRef.current?.focus() }}
              >
                <Search size={14} className="text-[var(--muted)] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={classSearch}
                  onChange={(e) => {
                    setClassSearch(e.target.value)
                    setClassDropdownOpen(true)
                  }}
                  onFocus={() => setClassDropdownOpen(true)}
                  placeholder={t('modal.searchGroups')}
                  className={cn(
                    'flex-1 bg-transparent outline-none text-sm text-[var(--text)]',
                    'placeholder:text-[var(--muted)]/50',
                  )}
                />
                <ChevronDown
                  size={14}
                  className={cn(
                    'text-[var(--muted)] transition-transform duration-150',
                    classDropdownOpen && 'rotate-180',
                  )}
                />
              </div>

              {/* Dropdown */}
              {classDropdownOpen && (
                <div
                  className={cn(
                    'absolute z-50 mt-1.5 w-full max-h-48 overflow-y-auto',
                    'rounded-lg border border-[var(--glass-border)]',
                    'bg-[var(--glass)] backdrop-blur-xl shadow-xl',
                  )}
                >
                  {filteredClasses.length > 0 ? (
                    filteredClasses.map((cls) => {
                      const isSelected = selectedClassIds.includes(cls.id)
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => toggleClass(cls.id)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2.5 text-start',
                            'text-sm transition-colors duration-100',
                            isSelected
                              ? 'bg-[var(--gold-soft)]'
                              : 'text-[var(--text)] hover:bg-[var(--glass)]',
                          )}
                        >
                          <div className={cn(
                            'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                            isSelected ? 'bg-[var(--gold)] border-[var(--gold)]' : 'border-[var(--glass-border)]',
                          )}>
                            {isSelected && <span className="text-white text-[10px]">✓</span>}
                          </div>
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: classColor(cls.id) }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text)] truncate">{cls.name}</p>
                            {cls.subject && (
                              <p className="text-[11px] text-[var(--muted)] truncate">
                                {cls.subject}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <p className="px-3 py-3 text-xs text-[var(--muted)] text-center">
                      {t('modal.noClasses')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {selectedClassIds.length === 0 && (
              <p className="text-[10px] text-[var(--red)] mt-1">
                {t('modal.groupRequired')}
              </p>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--glass-border)] shrink-0">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium',
              'text-[var(--muted)] hover:bg-[var(--glass)]',
              'transition-colors duration-150',
              'disabled:opacity-40',
            )}
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-medium text-white',
              'hover:opacity-90 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            )}
            style={{
              background: 'linear-gradient(135deg, var(--gold), var(--emerald))',
            }}
          >
            {isSubmitting ? t('modal.adding') : t('modal.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// FormField (internal)
// ============================================

function FormField({
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
      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
        {label}
        {required && <span className="text-[var(--gold)] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ============================================
// Shared input styles
// ============================================

const inputClass = cn(
  'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)
