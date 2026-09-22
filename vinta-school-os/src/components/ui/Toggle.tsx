import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/* ─── Props ─── */

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  /** Whether the toggle is active */
  checked?: boolean
  /** Called when the user taps the toggle */
  onCheckedChange?: (checked: boolean) => void
}

/* ─── Component ─── */

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked = false, onCheckedChange, className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'relative inline-flex shrink-0 items-center',
          'w-[44px] h-[24px] rounded-full p-[3px]',
          'transition-colors duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked
            ? 'bg-[var(--emerald)] border border-[var(--emerald)]'
            : 'bg-[var(--input-bg)] border border-[var(--glass-border)]',
          className,
        )}
        {...rest}
      >
        {/* Knob */}
        <span
          aria-hidden="true"
          className={cn(
            'block w-[18px] h-[18px] rounded-full',
            'bg-white shadow-sm',
            'transition-transform duration-200',
            checked ? 'translate-x-[20px]' : 'translate-x-0',
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
          }}
        />
      </button>
    )
  },
)

Toggle.displayName = 'Toggle'

export default Toggle
