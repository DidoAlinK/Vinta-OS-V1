/**
 * Vinta School OS — Student Form
 * Modal form for creating or editing student records.
 * Includes student info fields and an optional guardian section.
 */

import { useCallback, useEffect, useState } from 'react'
import { X, UserPlus, ShieldPlus } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { Student } from '../../types/student'

// ============================================
// Props
// ============================================

export interface StudentFormProps {
  student?: Student | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    first_name: string
    last_name: string
    phone?: string
    parent_phone?: string
    notes?: string
    guardian?: { name: string; relationship: string; phone: string }
  }) => void
}

// ============================================
// Component
// ============================================

export default function StudentForm({
  student,
  isOpen,
  onClose,
  onSave,
}: StudentFormProps) {
  const isEditing = !!student

  /* ── Form state ── */
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [notes, setNotes] = useState('')

  /* ── Guardian state ── */
  const [showGuardian, setShowGuardian] = useState(false)
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')

  /* ── Populate form when editing ── */
  useEffect(() => {
    if (student) {
      setFirstName(student.first_name)
      setLastName(student.last_name)
      setPhone(student.phone || '')
      setParentPhone(student.parent_phone || '')
      setNotes(student.notes || '')
      // If parent phone exists, show guardian section
      if (student.parent_phone) {
        setShowGuardian(true)
      }
    } else {
      // Reset form
      setFirstName('')
      setLastName('')
      setPhone('')
      setParentPhone('')
      setNotes('')
      setShowGuardian(false)
      setGuardianName('')
      setGuardianRelationship('')
      setGuardianPhone('')
    }
  }, [student, isOpen])

  /* ── ESC handler ── */
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  /* ── Submit ── */
  const handleSubmit = useCallback(() => {
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    if (!trimmedFirst || !trimmedLast) return

    onSave({
      first_name: trimmedFirst,
      last_name: trimmedLast,
      phone: phone.trim() || undefined,
      parent_phone: parentPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      guardian:
        showGuardian && guardianName.trim()
          ? {
              name: guardianName.trim(),
              relationship: guardianRelationship.trim() || 'Parent',
              phone: guardianPhone.trim(),
            }
          : undefined,
    })
  }, [
    firstName,
    lastName,
    phone,
    parentPhone,
    notes,
    showGuardian,
    guardianName,
    guardianRelationship,
    guardianPhone,
    onSave,
  ])

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
              {isEditing ? 'Edit Student' : 'New Student'}
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
          {/* Student Info */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Student Information
            </h4>
            <div className="space-y-3">
              {/* First + Last Name row */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" required>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="First name"
                    autoFocus
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Last Name" required>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Last name"
                    className={inputClass}
                  />
                </FormField>
              </div>

              {/* Phone */}
              <FormField label="Phone">
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
              <FormField label="Parent Phone">
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
              <FormField label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes about the student..."
                  rows={3}
                  className={cn(inputClass, 'resize-none')}
                />
              </FormField>
            </div>
          </div>

          {/* Guardian Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                Guardian Details
              </h4>
              {!showGuardian && (
                <button
                  onClick={() => setShowGuardian(true)}
                  className={cn(
                    'flex items-center gap-1 text-[11px] font-medium',
                    'text-[var(--gold)] hover:underline',
                  )}
                >
                  <ShieldPlus size={12} />
                  Add Guardian
                </button>
              )}
            </div>

            {showGuardian && (
              <div className="space-y-3 animate-fade-in">
                <FormField label="Guardian Name">
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Full name"
                    className={inputClass}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Relationship">
                    <select
                      value={guardianRelationship}
                      onChange={(e) => setGuardianRelationship(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select...</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Brother">Brother</option>
                      <option value="Sister">Sister</option>
                      <option value="Guardian">Guardian</option>
                      <option value="Other">Other</option>
                    </select>
                  </FormField>
                  <FormField label="Phone">
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="+213 5##"
                      className={inputClass}
                    />
                  </FormField>
                </div>

                <button
                  onClick={() => {
                    setShowGuardian(false)
                    setGuardianName('')
                    setGuardianRelationship('')
                    setGuardianPhone('')
                  }}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  Remove guardian
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--glass-border)] shrink-0">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium',
              'text-[var(--muted)] hover:bg-[var(--glass)]',
              'transition-colors duration-150',
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!firstName.trim() || !lastName.trim()}
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
            {isEditing ? 'Save Changes' : 'Add Student'}
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
