import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/* ─── Props ─── */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Glass panel with backdrop blur */
  glass?: boolean
  /** Rendered on hover (subtle lift) */
  hoverable?: boolean
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Card title text */
  title?: string
  /** Action area rendered on the right side of the header */
  actions?: ReactNode
}

/* ─── Card ─── */

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ glass = true, hoverable = false, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          /* base */
          'rounded-[var(--radius-lg)]',
          'border border-[var(--glass-border)]',
          'text-[var(--text)]',
          'transition-all duration-200 ease-out',
          /* glass */
          glass && [
            'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
            'shadow-[var(--glass-shadow)]',
          ],
          /* hover */
          hoverable && [
            'cursor-pointer',
            'hover:-translate-y-0.5',
            'hover:shadow-[0_12px_32px_rgba(0,0,0,.12)]',
            'active:translate-y-0',
          ],
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'

/* ─── CardHeader ─── */

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, actions, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between gap-4',
          'px-5 pt-5 pb-3',
          className,
        )}
        {...rest}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          {title && (
            <h3 className="text-base font-semibold text-[var(--text)] font-[family-name:var(--font-heading)] truncate">
              {title}
            </h3>
          )}
          {children}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    )
  },
)

CardHeader.displayName = 'CardHeader'

/* ─── CardBody ─── */

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('px-5 pb-5', className)}
        {...rest}
      />
    )
  },
)

CardBody.displayName = 'CardBody'

/* ─── CardFooter ─── */

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3 px-5 pb-5 pt-0',
          className,
        )}
        {...rest}
      />
    )
  },
)

CardFooter.displayName = 'CardFooter'

export default Card
