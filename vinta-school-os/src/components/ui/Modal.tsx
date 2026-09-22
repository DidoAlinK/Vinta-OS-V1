import { forwardRef, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

/* ─── Max-width map ─── */

const maxWidthMap = {
  sm: 400,
  md: 500,
  lg: 600,
} as const

/* ─── Props ─── */

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Called when the user requests the modal to close */
  onClose: () => void
  /** Modal title — rendered in the header */
  title?: string
  /** sm (300px), md (440px), lg (600px) */
  size?: 'sm' | 'md' | 'lg'
  /** Hide the X close button */
  hideCloseButton?: boolean
  /** Rendered at the bottom of the modal */
  footer?: ReactNode
  /** Body content */
  children?: ReactNode
}

/* ─── Component ─── */

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      open,
      onClose,
      title,
      size = 'md',
      hideCloseButton = false,
      footer,
      children,
    },
    ref,
  ) => {
    const panelRef = useRef<HTMLDivElement>(null)
    const mergedRef = useCallback(
      (node: HTMLDivElement | null) => {
        ;(panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      },
      [ref],
    )

    /* ESC to close */
    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      },
      [onClose],
    )

    useEffect(() => {
      if (!open) return
      document.addEventListener('keydown', handleKeyDown)
      /* Prevent body scroll while modal is open */
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = prev
      }
    }, [open, handleKeyDown])

    /* Click outside to close */
    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
      },
      [onClose],
    )

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
          ref={mergedRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            /* base */
            'relative w-full',
            'rounded-[var(--radius-lg)]',
            'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
            'border border-[var(--glass-border)]',
            'shadow-[var(--glass-shadow)]',
            'text-[var(--text)]',
            'animate-fade-in-scale',
            'overflow-hidden',
          )}
          style={{ maxWidth: maxWidthMap[size] }}
        >
          {/* Header */}
          {(title || !hideCloseButton) && (
            <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-2">
              {title && (
                <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-[var(--text)] truncate">
                  {title}
                </h2>
              )}
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'ml-auto shrink-0',
                    'flex items-center justify-center',
                    'w-8 h-8 rounded-full',
                    'bg-[var(--glass)] border border-[var(--glass-border)]',
                    'text-[var(--muted)]',
                    'hover:text-[var(--text)] hover:bg-[var(--glass-strong)]',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
                  )}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-4 text-sm text-[var(--text)] leading-relaxed">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-6 pb-5 pt-0">
              {footer}
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
  },
)

Modal.displayName = 'Modal'

export default Modal
