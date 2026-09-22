import { forwardRef, useCallback, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { Button } from './Button'

/* ─── Props ─── */

export interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Called when the dialog should close (backdrop / X / cancel) */
  onClose: () => void
  /** Called when the user confirms the action */
  onConfirm: () => void
  /** Dialog heading */
  title: string
  /** Body message / warning text */
  message: string
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string
  /** danger = red confirm button, warning = amber/gold confirm button (default: danger) */
  variant?: 'danger' | 'warning'
}

/* ─── Component ─── */

export const ConfirmDialog = forwardRef<HTMLDivElement, ConfirmDialogProps>(
  (
    {
      open,
      onClose,
      onConfirm,
      title,
      message,
      confirmLabel = 'Confirm',
      variant = 'danger',
    },
    ref,
  ) => {
    /* Click outside to close */
    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
      },
      [onClose],
    )

    /* Confirm handler */
    const handleConfirm = useCallback(() => {
      onConfirm()
      onClose()
    }, [onConfirm, onClose])

    if (!open) return null

    return createPortal(
      /* Backdrop */
      <div
        className={cn(
          'fixed inset-0 z-50',
          'flex items-center justify-center',
          'p-4',
        )}
        style={{
          background: 'rgba(10,10,10,.45)',
          backdropFilter: 'blur(6px)',
        }}
        onMouseDown={handleBackdropClick}
      >
        {/* Panel */}
        <div
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'relative w-full max-w-[400px]',
            'rounded-[var(--radius-lg)]',
            'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
            'border border-[var(--glass-border)]',
            'shadow-[var(--glass-shadow)]',
            'text-[var(--text)]',
            'animate-fade-in-scale',
            'overflow-hidden',
          )}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-6 pt-5 pb-0">
            {/* Icon */}
            <div
              className={cn(
                'w-10 h-10 rounded-[var(--radius-sm)] shrink-0',
                'flex items-center justify-center',
                variant === 'danger'
                  ? 'bg-[var(--red-soft)] text-[var(--red)]'
                  : 'bg-[var(--gold-soft)] text-[var(--gold)]',
              )}
            >
              <AlertTriangle size={20} />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold font-[family-name:var(--font-heading)] text-[var(--text)]">
                {title}
              </h2>
              <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                {message}
              </p>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'shrink-0 p-1.5 rounded-full',
                'text-[var(--muted)]',
                'hover:text-[var(--text)] hover:bg-[var(--glass)]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
              )}
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  },
)

ConfirmDialog.displayName = 'ConfirmDialog'

export default ConfirmDialog
