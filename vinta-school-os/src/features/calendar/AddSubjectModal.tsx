/**
 * Vinta School OS — Add Subject Modal
 * Modal for creating a new subject with name input and color picker.
 */

import { useCallback, useRef, useState } from 'react'
import { X, Check, Hash } from 'lucide-react'
import { cn } from '../../lib/cn'

// ============================================
// Constants
// ============================================

export const COLOR_PRESETS = [
  '#b3872a', // Gold
  '#7c3aed', // Violet
  '#0ea5e9', // Sky
  '#0f6b4d', // Emerald
  '#dc2626', // Red
  '#ea580c', // Orange
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6d28d9', // Deep Purple
  '#4f46e5', // Indigo
  '#06b6d4', // Cyan
  '#65a30d', // Lime
  '#d97706', // Amber
  '#e11d48', // Rose
  '#64748b', // Slate
  '#1e3a5f', // Navy
] as const

// ============================================
// Props
// ============================================

export interface AddSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string, color: string) => void
}

// ============================================
// Component
// ============================================

export default function AddSubjectModal({
  isOpen,
  onClose,
  onAdd,
}: AddSubjectModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(COLOR_PRESETS[0])
  const [customColor, setCustomColor] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return

    const finalColor = customColor || color
    onAdd(trimmed, finalColor)
    setName('')
    setColor(COLOR_PRESETS[0])
    setCustomColor('')
    onClose()
  }, [name, color, customColor, onAdd, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit()
      if (e.key === 'Escape') onClose()
    },
    [handleSubmit, onClose],
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
          'glass relative z-10 w-full max-w-sm p-6 rounded-[var(--radius-md)]',
          'animate-fade-in-scale',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-lg font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Add Subject
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--glass)] transition-colors"
          >
            <X size={18} className="text-[var(--muted)]" />
          </button>
        </div>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            Subject Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Mathematics"
            autoFocus
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
              'placeholder:text-[var(--muted)]/50',
              'transition-shadow duration-150',
            )}
          />
        </div>

        {/* Color picker — all swatches */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--muted)] mb-2">
            Color
          </label>
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setColor(preset)
                  setCustomColor('')
                }}
                className={cn(
                  'w-8 h-8 rounded-full border-2 transition-all duration-150',
                  'flex items-center justify-center',
                  !customColor && color === preset
                    ? 'border-[var(--text)] scale-110 shadow-sm'
                    : 'border-transparent hover:scale-110',
                )}
                style={{ backgroundColor: preset }}
                aria-label={`Select color ${preset}`}
              >
                {!customColor && color === preset && (
                  <Check size={12} className="text-white drop-shadow-sm" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom hex input */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-2">
            Custom
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="#6d28d9"
                maxLength={7}
                className={cn(
                  'w-full pl-8 pr-3 py-2 rounded-lg text-sm font-mono text-[var(--text)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                  'placeholder:text-[var(--muted)]/50',
                  'transition-shadow duration-150',
                )}
              />
            </div>
            {customColor && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-8 h-8 rounded-lg border-2 shrink-0',
                    'border-[var(--text)] shadow-sm',
                  )}
                  style={{ backgroundColor: customColor }}
                />
                <Check size={14} className="text-[var(--gold)] shrink-0" />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium',
              'text-[var(--muted)] hover:bg-[var(--glass)]',
              'transition-colors duration-150',
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium',
              'bg-[var(--gold)] text-white',
              'hover:opacity-90 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            )}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
