/**
 * Vinta School OS — Student Table
 * Tabular view of students with status badges,
 * plan info, and row-click selection.
 */

import { memo, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
 * The map holds translation KEYS, not sentences: a module-level map of rendered
 * strings would be evaluated once, at import, in whatever language happened to
 * be active and would never follow a language switch.
 *
 * The styling helpers below still take the RAW status — only the text is
 * mapped here.
 */
const STATUS_LABEL_KEYS: Record<StudentStatus, string> = {
  paid: 'status.paid',
  due: 'status.due',
  overdue: 'status.overdue',
  unpaid: 'status.unpaid',
  no_plan: 'status.noPlan',
}

/** Unknown values fall through as-is rather than rendering an empty badge. */
function statusLabel(t: TFunction, status: StudentStatus): string {
  const key = STATUS_LABEL_KEYS[status]
  return key ? t(key) : status
}

// ============================================
// Props
// ============================================

export interface StudentTableProps {
  students: Student[]
  onSelect: (student: Student) => void
  isLoading?: boolean
  /**
   * A further page is in flight. Draws a spinner under the last row so the
   * wait has somewhere to be visible — the alternative is rows appearing out
   * of nowhere with no sign anything was happening.
   */
  isLoadingMore?: boolean
  /**
   * More pages remain. When false, and there are rows, the table says the list
   * ends here rather than leaving the reader to guess whether it stalled.
   */
  hasMore?: boolean
  /**
   * Attached to the tail row, which the page observes to decide when to ask
   * for the next page. Owned by the caller because the scroller it is measured
   * against lives there.
   */
  sentinelRef?: Ref<HTMLDivElement>
}

// ============================================
// Component
// ============================================

function StudentTable({
  students,
  onSelect,
  isLoading,
  isLoadingMore,
  hasMore,
  sentinelRef,
}: StudentTableProps) {
  const { t } = useTranslation('students')

  /* ── Loading state ──
     First page only. Once there are rows, later pages are appended underneath
     them instead — blanking a table the user is reading to show a spinner is a
     step backwards for something that should feel like more of the same. */
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
        <p className="text-sm font-medium text-[var(--text)]">{t('table.empty.title')}</p>
        <p className="text-xs text-[var(--muted)] mt-1">
          {t('table.empty.body')}
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
          {t('table.column.student')}
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          {t('table.column.class')}
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          {t('table.column.sessions')}
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          {t('table.column.status')}
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          {t('table.column.plan')}
        </span>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          {t('table.column.renewal')}
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
            'px-4 py-3 text-start transition-colors duration-100',
            'hover:bg-[var(--glass)]',
            // Every row keeps its bottom border now, including the last: the
            // tail below is a sibling row inside the same container, so the
            // line it used to drop is the one separating it from the footer.
            'border-b border-[var(--glass-border)]/50',
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
            {statusLabel(t, student.status)}
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

          {/* Actions — the chevron means "opens to the right" in a left-to-right
              reading order, so it mirrors in Arabic rather than pointing back
              at the row it belongs to. */}
          <div className="flex items-center justify-end">
            <ChevronRight size={16} className="text-[var(--muted)]/50 rtl:-scale-x-100" />
          </div>
        </button>
      ))}

      {/* ── Tail ──
          Two jobs at once: it is the element the page observes to know the user
          has reached the end of what is loaded, and it is where the state of
          that loading is printed. It keeps a minimum height even when idle so
          the observer always has something to intersect with — a zero-height
          sentinel at the very bottom of a scroller is not reliably reported. */}
      <div
        ref={sentinelRef}
        className="flex items-center justify-center gap-2 px-4 py-3 min-h-[40px]"
      >
        {isLoadingMore ? (
          <>
            <Loader2 size={14} className="text-[var(--gold)] animate-spin" />
            <span className="text-[11px] text-[var(--muted)]">{t('table.loadingMore')}</span>
          </>
        ) : !hasMore ? (
          <span className="text-[11px] text-[var(--muted)]/70">{t('table.endOfList')}</span>
        ) : null}
      </div>
    </div>
  )
}

export default memo(StudentTable)
