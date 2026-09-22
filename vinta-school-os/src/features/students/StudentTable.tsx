/**
 * Vinta School OS — Student Table
 * Tabular view of students with status badges,
 * plan info, and row-click selection.
 */

import { memo } from 'react'
import {
  Phone,
  Calendar,
  BookOpen,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  formatDateShort,
  getInitials,
  getStatusColor,
  getStatusBg,
} from '../../lib/formatters'
import type { Student, StudentStatus } from '../../types/student'

// ============================================
// Status labels
// ============================================

/**
 * Backend statuses are snake_case identifiers. Print words: `unpaid` and
 * `no_plan` must not reach the user as raw enum values.
 *
 * The styling helpers below still take the RAW status — only the text is
 * mapped here.
 */
const STATUS_LABELS: Record<StudentStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
  no_plan: 'No plan',
}

/** Unknown values fall through as-is rather than rendering an empty badge. */
function statusLabel(status: StudentStatus): string {
  return STATUS_LABELS[status] ?? status
}

// ============================================
// Props
// ============================================

export interface StudentTableProps {
  students: Student[]
  onSelect: (student: Student) => void
  isLoading?: boolean
}

// ============================================
// Component
// ============================================

function StudentTable({ students, onSelect, isLoading }: StudentTableProps) {
  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-[var(--gold)] animate-spin" />
      </div>
    )
  }

  /* ── Empty state ── */
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[var(--glass)] border border-[var(--glass-border)] flex items-center justify-center mb-3">
          <BookOpen size={20} className="text-[var(--muted)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text)]">No students found</p>
        <p className="text-xs text-[var(--muted)] mt-1">
          Add your first student to get started
        </p>
      </div>
    )
  }

  /* ── Table ── */
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--glass-border)]',
        'bg-[var(--glass)] overflow-hidden',
      )}
    >
      {/* Header */}
      <div className="grid grid-cols-[1.5fr_0.8fr_0.6fr_0.7fr_0.8fr_0.8fr_40px] gap-3 px-4 py-3 border-b border-[var(--glass-border)]">
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Student
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Class
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Sessions
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Status
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Plan
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Renewal
        </span>
        <span />
      </div>

      {/* Rows */}
      {students.map((student, idx) => (
        <button
          key={student.id}
          onClick={() => onSelect(student)}
          className={cn(
            'w-full grid grid-cols-[1.5fr_0.8fr_0.6fr_0.7fr_0.8fr_0.8fr_40px] gap-3 items-center',
            'px-4 py-3 text-left transition-colors duration-100',
            'hover:bg-[var(--glass)]',
            idx < students.length - 1 && 'border-b border-[var(--glass-border)]/50',
          )}
        >
          {/* Name + Avatar */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                'text-[11px] font-bold',
              )}
              style={{
                background: 'linear-gradient(135deg, var(--gold-soft), var(--emerald-soft))',
                color: 'var(--gold)',
              }}
            >
              {getInitials(student.full_name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">
                {student.full_name}
              </p>
              {student.phone && (
                <p className="text-[11px] text-[var(--muted)] flex items-center gap-1 mt-0.5">
                  <Phone size={10} />
                  {student.phone}
                </p>
              )}
            </div>
          </div>

          {/* Class */}
          <span className="text-sm text-[var(--text)] truncate">
            {student.classes || '—'}
          </span>

          {/* Sessions */}
          <span className="text-sm text-[var(--muted)]">
            {student.sessions || '—'}
          </span>

          {/* Status Badge */}
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium w-fit',
              getStatusBg(student.status),
              getStatusColor(student.status),
            )}
          >
            {statusLabel(student.status)}
          </span>

          {/* Plan */}
          <span className="text-sm text-[var(--text)]">
            {student.plan || '—'}
          </span>

          {/* Renewal — `renews` is an ISO `YYYY-MM-DD`, so it is formatted here.
              Printing the raw string put an unreadable `2026-10-20` in the column
              while the drawer showed the same date as "20 Oct 2026". */}
          <span className="text-sm text-[var(--muted)] flex items-center gap-1">
            <Calendar size={12} />
            {student.renews ? formatDateShort(student.renews) : '—'}
          </span>

          {/* Actions */}
          <div className="flex items-center justify-end">
            <ChevronRight size={16} className="text-[var(--muted)]/50" />
          </div>
        </button>
      ))}
    </div>
  )
}

export default memo(StudentTable)
