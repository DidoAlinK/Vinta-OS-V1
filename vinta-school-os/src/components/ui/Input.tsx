import { forwardRef, type InputHTMLAttributes, useId } from 'react'
import { cn } from '../../lib/cn'

/* ─── Props ─── */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Rendered above the input */
  label?: string
  /** Error text shown below the input */
  error?: string
  /** Helper text shown below the input (hidden when error is present) */
  helperText?: string
  /** Visual size */
  size?: 'sm' | 'md' | 'lg'
  /** Icon rendered on the left side */
  leftIcon?: React.ReactNode
  /** Icon rendered on the right side */
  rightIcon?: React.ReactNode
}

/* ─── Component ─── */

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, size = 'md', className, id, leftIcon, rightIcon, ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    const errorId = `${inputId}-error`
    const helperId = `${inputId}-helper`

    const sizeStyles = {
      sm: 'h-9 px-3 text-sm rounded-[var(--radius-xs)]',
      md: 'h-11 px-4 text-sm rounded-[var(--radius-sm)]',
      lg: 'h-13 px-5 text-base rounded-[var(--radius-md)]',
    } as const

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'text-sm font-medium text-[var(--text)]',
              'font-[family-name:var(--font-heading)]',
            )}
          >
            {label}
          </label>
        )}

        {/* Input */}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-[var(--muted)] pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error || undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              /* base */
              'w-full font-[family-name:var(--font-body)]',
              'bg-[var(--input-bg)] backdrop-blur-sm',
              'border border-[var(--glass-border)]',
              'text-[var(--text)] placeholder:text-[var(--muted)]',
              'transition-shadow duration-200 ease-out',
              'focus:outline-none focus:ring-2 focus:ring-[var(--gold-soft)] focus:border-[var(--gold)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              /* size */
              sizeStyles[size],
              /* icons */
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              /* error state */
              error &&
                'border-[var(--red)] focus:ring-[var(--red-soft)] focus:border-[var(--red)]',
              className,
            )}
            {...rest}
          />
          {rightIcon && (
            <span className="absolute right-3 text-[var(--muted)]">
              {rightIcon}
            </span>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-[var(--red)] font-medium"
          >
            {error}
          </p>
        )}

        {/* Helper text */}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-[var(--muted)]">
            {helperText}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export default Input
