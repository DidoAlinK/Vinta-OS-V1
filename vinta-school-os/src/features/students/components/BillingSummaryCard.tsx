/**
 * Vinta School OS — Billing summary card
 *
 * The four facts that describe what a student is ON and what has actually been
 * RECORDED. It replaces the old badge that read "Paid · Term — 9,000 DA" for a
 * student who had never paid and was not on that plan.
 *
 * The two ideas are kept visibly apart:
 *
 *   - Plan / Sessions per month  — owned by the group; a fact, present before
 *                                  any payment exists.
 *   - Renews on / Status         — money actually recorded. `unpaid` and
 *                                  `no_plan` paint muted through the shared
 *                                  `getStatusBg` / `getStatusColor` helpers.
 *
 * Anything unknown is an em dash in `var(--muted)`. Never "0", never "Not set".
 *
 * This file also owns the shared date and status-label exports the other money
 * cards import, so there is exactly one place where an ISO `YYYY-MM-DD` becomes
 * a local date.
 */

import { CreditCard } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatDa, getStatusBg, getStatusColor } from '../../../lib/formatters'
import type { StudentStatus } from '../../../types/student'
import type { Student } from '../../../types/student'
import { InlineSpinner, ProfileCard } from './ProfileCard'

// ============================================
// Shared exports
// ============================================

/** The only place a student status becomes words. */
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
  no_plan: 'No plan',
}

/** An absent scalar. One codepoint, so the UI can never disagree with itself. */
export const DASH = '—'

/**
 * Parse an ISO `YYYY-MM-DD` as a LOCAL date — `new Date(str)` would treat it as
 * UTC midnight and can render the previous day in negative-offset timezones.
 *
 * Returns null for null, empty, or malformed input, and rejects dates that
 * overflow their month (`2026-02-31`), so a bad value degrades to an em dash
 * instead of silently becoming the 3rd of March.
 */
export function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

/** "22 Sep 2026" — day-first, unambiguous, locale-pinned. */
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * A billing cycle spans `cycle_start` → `cycle_end`, so it renders as a range:
 * "22 Sep → 21 Dec 2026" (the start year is dropped when both ends share it).
 *
 * A cycle with only one end recorded prints which end it is — a lone date would
 * read as a one-day cycle, which is a different claim entirely. Neither end
 * recorded is an em dash.
 */
export function formatDateRange(start: Date | null, end: Date | null): string {
  if (start && end) {
    const startText =
      start.getFullYear() === end.getFullYear()
        ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : formatDisplayDate(start)
    return `${startText} → ${formatDisplayDate(end)}`
  }
  if (start) return `From ${formatDisplayDate(start)}`
  if (end) return `Until ${formatDisplayDate(end)}`
  return DASH
}

/** Whitespace-only or empty text is "nothing recorded", not a blank cell. */
function knownText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

// ============================================
// Props
// ============================================

export interface BillingSummaryCardProps {
  student: Student
  loading?: boolean
}

// ============================================
// Component
// ============================================

interface SummaryRow {
  label: string
  /** Secondary line under the label — the plan amount, when it is not already in the plan text. */
  hint: string | null
  value: React.ReactNode
  unknown: boolean
}

export function BillingSummaryCard({ student, loading = false }: BillingSummaryCardProps) {
  const plan = knownText(student.plan)
  const planAmount = student.plan_amount
  const sessions = student.sessions_per_month
  const renews = parseISODate(student.renews)

  // The backend's `plan` is already "Credit — 3,300 DA", so only add the amount
  // as a separate line when the plan text does not already carry it.
  //
  // Compare on DIGITS ONLY: the plan writes the amount with a thousands
  // separator ("3,300") while `String(3300)` has none, so a plain `includes`
  // never matches and the amount gets printed twice.
  const planAlreadyStatesAmount =
    planAmount != null && plan != null && plan.replace(/\D/g, '').includes(String(planAmount))
  const planHint =
    planAmount != null && !planAlreadyStatesAmount ? formatDa(planAmount) : null

  const rows: SummaryRow[] = [
    {
      label: 'Plan',
      hint: planHint,
      value: plan ?? DASH,
      unknown: plan === null,
    },
    {
      label: 'Sessions per month',
      hint: null,
      // 0 is a real value; only null/undefined is unknown.
      value: sessions != null ? String(sessions) : DASH,
      unknown: sessions == null,
    },
    {
      label: 'Renews on',
      hint: null,
      // Legitimately empty before a cycle starts. The group's duration is not
      // substituted here — that would be a different fact stated as this one.
      value: renews ? formatDisplayDate(renews) : DASH,
      unknown: renews === null,
    },
    {
      label: 'Status',
      hint: null,
      value: (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
            getStatusBg(student.status),
            getStatusColor(student.status),
          )}
        >
          {STUDENT_STATUS_LABELS[student.status]}
        </span>
      ),
      unknown: false,
    },
  ]

  return (
    <ProfileCard
      title="Billing summary"
      icon={<CreditCard size={13} />}
      // A refresh in flight shows here; the values that are already known stay
      // on screen rather than blanking out.
      action={loading ? <InlineSpinner label="Loading billing summary" /> : undefined}
    >
      <dl className="m-0">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-3 py-2"
            style={i > 0 ? { borderTop: '1px solid var(--divider)' } : undefined}
          >
            <dt className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>
              {row.label}
              {row.hint ? (
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                  {row.hint}
                </span>
              ) : null}
            </dt>
            <dd
              className="m-0 text-sm text-right min-w-0"
              style={{ color: row.unknown ? 'var(--muted)' : 'var(--text)' }}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </ProfileCard>
  )
}

export default BillingSummaryCard
