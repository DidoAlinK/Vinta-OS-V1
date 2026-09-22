/**
 * Vinta School OS — Student identity block
 *
 * Who the student is: avatar, name, phone, and the two facts the drawer must
 * never conflate:
 *
 *   - `status`  — money that has ACTUALLY been recorded. `unpaid` / `no_plan`
 *                 paint muted, never green.
 *   - `plan`    — the plan the group puts them on. A fact about the group, shown
 *                 as plain muted text, never as a payment claim.
 *
 * Rendered without a card: it is the drawer's header block, not a titled panel.
 */

import { Phone } from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  formatPhone,
  getInitials,
  getStatusBg,
  getStatusColor,
} from '../../../lib/formatters'
import type { Student } from '../../../types/student'
import { STUDENT_STATUS_LABELS } from './BillingSummaryCard'

export interface StudentIdentityProps {
  student: Student
}

/**
 * `formatPhone('')` returns a bare `+213`, which would put a country code on a
 * student who has no number on file. Return null instead so the caller can omit
 * the line entirely.
 */
function safePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  return trimmed ? formatPhone(trimmed) : null
}

export function StudentIdentity({ student }: StudentIdentityProps) {
  const phone = safePhone(student.phone)

  return (
    <div className="flex items-start gap-4">
      <div
        className="w-14 h-14 shrink-0 flex items-center justify-center text-lg font-bold"
        style={{
          background: 'linear-gradient(135deg, var(--gold-soft), var(--emerald-soft))',
          color: 'var(--gold)',
          borderRadius: 'var(--radius-lg)',
        }}
        aria-hidden="true"
      >
        {getInitials(student.full_name)}
      </div>

      <div className="min-w-0 flex-1">
        <h4
          className="text-base font-bold truncate"
          style={{ color: 'var(--text)', fontFamily: 'var(--font-heading)' }}
          title={student.full_name}
        >
          {student.full_name}
        </h4>

        {/* No phone on file renders nothing at all — not a dash, not a blank icon. */}
        {phone ? (
          <p
            className="text-sm flex items-center gap-1.5 mt-1"
            style={{ color: 'var(--muted)' }}
          >
            <Phone size={13} aria-hidden="true" />
            {phone}
          </p>
        ) : null}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
              getStatusBg(student.status),
              getStatusColor(student.status),
            )}
          >
            {STUDENT_STATUS_LABELS[student.status]}
          </span>

          {/* The group's plan — a fact about the group, so it is shown muted and
              as plain text. It is not styled as a status and claims nothing. */}
          {student.plan ? (
            <span
              className="text-[11px] truncate"
              style={{ color: 'var(--muted)' }}
              title={student.plan}
            >
              {student.plan}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default StudentIdentity
