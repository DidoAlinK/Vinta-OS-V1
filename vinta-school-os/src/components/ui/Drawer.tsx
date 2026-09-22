import { forwardRef, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

/* ─── Props ─── */

export interface DrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Called when the user requests the drawer to close */
  onClose: () => void
  /** Drawer title — rendered in the header */
  title: string
  /** Body content */
  children: ReactNode
  /** Width in px (default 400) */
  width?: number
}

/* ─── Component ─── */

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  ({ open, onClose, title, children, width = 400 }, ref) => {
    const panelRef = useRef<HTMLDivElement>(null)

    /* Forward ref merge */
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
      /* Prevent body scroll while drawer is open */
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = prev
      }
    }, [open, handleKeyDown])

    /* Click outside (backdrop) to close */
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
          'flex justify-end',
          'md:items-stretch',
        )}
        style={{
          background: 'rgba(10,10,10,.35)',
          backdropFilter: 'blur(4px)',
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
            'relative h-full',
            'w-full max-w-[90vw]',
            'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
            'border-l border-[var(--glass-border)]',
            'shadow-2xl',
            'text-[var(--text)]',
            'flex flex-col',
            'animate-slide-in-right',
          )}
          style={{ maxWidth: width }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
            <h3 className="text-base font-bold font-[family-name:var(--font-heading)] text-[var(--text)] truncate">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'ml-auto shrink-0 p-1.5 rounded-lg',
                'hover:bg-[var(--glass)] text-[var(--muted)]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
              )}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
        </div>
      </div>,
      document.body,
    )
  },
)

Drawer.displayName = 'Drawer'

export default Drawer
