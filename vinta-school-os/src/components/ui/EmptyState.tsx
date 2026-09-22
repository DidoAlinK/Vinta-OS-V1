import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

/* ─── Props ─── */

export interface EmptyStateProps {
  /** Icon displayed above the title (defaults to Inbox) */
  icon?: ReactNode
  /** Primary heading text */
  title: string
  /** Optional supporting description */
  description?: string
  /** Optional call-to-action button */
  action?: { label: string; onClick: () => void }
}

/* ─── Component ─── */

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Icon */}
      <div
        className={cn(
          'w-14 h-14 rounded-[var(--radius-lg)]',
          'bg-[var(--glass)] border border-[var(--glass-border)]',
          'flex items-center justify-center mb-4',
        )}
      >
        {icon ?? <Inbox size={24} className="text-[var(--muted)]" />}
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-[var(--text)] font-[family-name:var(--font-heading)]">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-[var(--muted)] mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <Button
          variant="primary"
          size="md"
          className="mt-5"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}

export default EmptyState
