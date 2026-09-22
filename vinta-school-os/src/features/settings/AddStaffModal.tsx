/**
 * Vinta School OS — Add Staff Modal
 * Modal form for creating a new staff profile with name, role, and PIN.
 */

import { useCallback, useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/authStore'

// ============================================
// Props
// ============================================

export interface AddStaffModalProps {
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

// ============================================
// Component
// ============================================

export default function AddStaffModal({ isOpen, onClose, onAdded }: AddStaffModalProps) {
  const createProfile = useAuthStore((s) => s.createProfile)

  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [phone, setPhone] = useState('')
  const [ownerPin, setOwnerPin] = useState('')
  const [role, setRole] = useState<'owner' | 'staff'>('staff')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const resetForm = useCallback(() => {
    setName('')
    setPin('')
    setConfirmPin('')
    setPhone('')
    setOwnerPin('')
    setRole('staff')
    setError('')
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [onClose, resetForm])

  const handleSubmit = useCallback(async () => {
    setError('')

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (pin.length !== 4) {
      setError('PIN must be 4 digits')
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    if (!ownerPin || ownerPin.length !== 4) {
      setError('Owner PIN is required to create a staff profile')
      return
    }

    setIsSubmitting(true)
    try {
      await createProfile({
        name: name.trim(),
        role,
        pin,
        phone: phone.trim() || undefined,
        avatar_color_1: '#b3872a',
        avatar_color_2: '#0f6b4d',
        owner_pin: ownerPin,
      })
      resetForm()
      onAdded()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || e.message || 'Failed to create staff profile')
    } finally {
      setIsSubmitting(false)
    }
  }, [name, pin, confirmPin, phone, ownerPin, createProfile, resetForm, onAdded, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={cn(
          'w-full max-w-md mx-4 p-6 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--emerald-soft)] flex items-center justify-center">
              <UserPlus size={16} className="text-[var(--emerald)]" />
            </div>
            <h2
              className="text-lg font-bold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Add Staff Profile
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

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-sm font-medium animate-fade-in">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          {/* Name */}
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="Staff member name"
              className={inputCls}
            />
          </Field>

          {/* Phone */}
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+213 5## ## ## ##"
              className={inputCls}
            />
          </Field>

          {/* Role */}
          <Field label="Role" required>
            <div className="flex gap-2">
              {(['staff', 'owner'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                    role === r
                      ? r === 'owner'
                        ? 'bg-[var(--gold-soft)] text-[var(--gold)] border border-[var(--gold)]/30'
                        : 'bg-[var(--emerald-soft)] text-[var(--emerald)] border border-[var(--emerald)]/30'
                      : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:border-[var(--muted)]/30',
                  )}
                >
                  {r === 'owner' ? '👑 Owner' : '👤 Staff'}
                </button>
              ))}
            </div>
          </Field>

          {/* PIN */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="PIN" required>
              <input
                type="password"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                placeholder="••••"
                maxLength={4}
                className={inputCls}
              />
            </Field>
            <Field label="Confirm PIN" required>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                placeholder="••••"
                maxLength={4}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Owner PIN */}
          <Field label="Your Owner PIN" required>
            <input
              type="password"
              value={ownerPin}
              onChange={(e) => { setOwnerPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
              placeholder="Enter your PIN to authorize"
              maxLength={4}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium',
              'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
              'hover:bg-[var(--glass)] transition-colors duration-150',
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || pin.length !== 4 || pin !== confirmPin || ownerPin.length !== 4 || isSubmitting}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            )}
          >
            {isSubmitting ? 'Adding…' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Field wrapper
// ============================================

function Field({
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
// Input class
// ============================================

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)
