import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/* ─── Variant styles ─── */

const variantStyles = {
  success: 'bg-[var(--emerald-soft)] text-[var(--emerald)]',
  warning: 'bg-[var(--gold-soft)] text-[var(--gold)]',
  danger: 'bg-[var(--red-soft)] text-[var(--red)]',
  info: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  default: 'bg-[var(--glass)] text-[var(--muted)] border border-[var(--glass-border)]',
} as const

/* Backward-compatible aliases */
const variantAliases: Record<string, keyof typeof variantStyles> = {
  gold: 'warning',
  emerald: 'success',
  violet: 'info',
  red: 'danger',
  grey: 'default',
  gray: 'default',
}

type SemanticVariant = keyof typeof variantStyles

const sizeStyles = {
  sm: 'h-5 px-2 text-[10px]',
  md: 'h-6 px-2.5 text-xs',
} as const

/* ─── Props ─── */

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: SemanticVariant | keyof typeof variantAliases
  size?: 'sm' | 'md'
  children: ReactNode
}

/* ─── Component ─── */

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'md', className, children, ...rest }, ref) => {
    /* Resolve aliases to semantic variants */
    const resolved = (variantAliases[variant] ?? variant) as SemanticVariant
    const styles = variantStyles[resolved] ?? variantStyles.default

    return (
      <span
        ref={ref}
        className={cn(
          /* base */
          'inline-flex items-center justify-center',
          'font-semibold font-[family-name:var(--font-heading)]',
          'leading-none whitespace-nowrap',
          'rounded-full /* pill 100px+ */',
          /* variant */
          styles,
          /* size */
          sizeStyles[size],
          className,
        )}
        style={{ borderRadius: 100 }}
        {...rest}
      >
        {children}
      </span>
    )
  },
)

Badge.displayName = 'Badge'

export default Badge
