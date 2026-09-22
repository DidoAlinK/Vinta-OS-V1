/**
 * Vinta School OS — Profile card primitive
 *
 * The shared chrome for every block in the rebuilt Student Profile drawer: a
 * titled glass panel with an optional tinted icon and an optional right-aligned
 * action (a Retry button, an in-flight spinner).
 *
 * The two helpers live here on purpose, so that every leaf card phrases its
 * honest states identically:
 *
 *   - `EmptyLine`     — one calm muted sentence for "there is genuinely nothing
 *                       recorded here". Never an error treatment, never a fake row.
 *   - `InlineSpinner` — the small gold spinner for a fetch that is actually still
 *                       running.
 *
 * Surfaces come from theme tokens only (`--glass`, `--glass-border`,
 * `--radius-md`), so both light and dark theme render correctly.
 */

import { cn } from '../../../lib/cn'

export interface ProfileCardProps {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ProfileCard({ title, icon, action, children, className }: ProfileCardProps) {
  return (
    <section
      className={cn('w-full px-4 py-3.5', className)}
      style={{
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon ? (
          <span
            className="flex items-center shrink-0"
            style={{ color: 'var(--gold)' }}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <h4
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          {title}
        </h4>
        {action ? <div className="ml-auto flex items-center shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * The single sentence used for "nothing recorded". Muted and calm by
 * construction — it cannot render an error or a success treatment.
 */
export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs italic leading-relaxed" style={{ color: 'var(--muted)' }}>
      {children}
    </p>
  )
}

/** Small header spinner, for a request that is genuinely in flight. */
export function InlineSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block w-3.5 h-3.5 rounded-full animate-spin"
      style={{ border: '2px solid var(--gold)', borderTopColor: 'transparent' }}
    />
  )
}

export default ProfileCard
