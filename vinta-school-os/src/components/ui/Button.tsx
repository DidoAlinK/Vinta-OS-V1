import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/* ─── Variants ─── */

const variantStyles = {
  primary: [
    'text-white font-semibold',
    'bg-gradient-to-r from-[var(--gold)] to-[var(--emerald)]',
    'shadow-[0_8px_20px_rgba(0,0,0,.18),0_1px_0_rgba(255,255,255,.25)_inset]',
    'hover:shadow-[0_10px_28px_rgba(0,0,0,.24),0_1px_0_rgba(255,255,255,.25)_inset]',
    'active:shadow-[0_4px_12px_rgba(0,0,0,.18),0_1px_0_rgba(255,255,255,.25)_inset]',
  ],
  secondary: [
    'font-medium',
    'bg-[var(--glass)] backdrop-blur-md',
    'border border-[var(--glass-border)]',
    'text-[var(--text)]',
    'shadow-[var(--glass-shadow)]',
    'hover:bg-[var(--glass-strong)]',
    'active:bg-[var(--glass)]',
  ],
  ghost: [
    'font-medium',
    'bg-transparent',
    'text-[var(--text)]',
    'hover:bg-[var(--glass)]',
    'active:bg-[var(--glass-strong)]',
  ],
  danger: [
    'text-white font-semibold',
    'bg-[var(--red)]',
    'shadow-[0_8px_20px_rgba(220,38,38,.25)]',
    'hover:bg-[color:var(--red-dark)]',
    'hover:shadow-[0_10px_28px_rgba(220,38,38,.32)]',
    'active:bg-[var(--red)]',
    'active:shadow-[0_4px_12px_rgba(220,38,38,.25)]',
  ],
} as const

const sizeStyles = {
  sm: 'h-8 px-3 text-sm rounded-[var(--radius-xs)]',
  md: 'h-10 px-5 text-sm rounded-[var(--radius-md)]',
  lg: 'h-12 px-7 text-base rounded-[var(--radius-md)]',
} as const

/* ─── Spinner ─── */

function Spinner({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 14 : size === 'md' ? 16 : 20
  return (
    <svg
      className="animate-spin shrink-0"
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

/* ─── Props ─── */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

/* ─── Component ─── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          /* base */
          'relative inline-flex items-center justify-center gap-2',
          'font-[family-name:var(--font-heading)]',
          'select-none whitespace-nowrap',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2',
          /* variant */
          ...variantStyles[variant],
          /* size */
          sizeStyles[size],
          /* modifiers */
          fullWidth && 'w-full',
          /* disabled / loading */
          isDisabled && 'pointer-events-none opacity-50 saturate-50',
          className,
        )}
        {...rest}
      >
        {loading && <Spinner size={size} />}
        <span className={cn(loading && 'opacity-70')}>{children}</span>
      </button>
    )
  },
)

Button.displayName = 'Button'

export default Button
