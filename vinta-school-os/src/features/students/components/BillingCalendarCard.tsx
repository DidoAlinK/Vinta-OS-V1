/**
 * Vinta School OS — Billing calendar card
 *
 * A compact vertical timeline of the student's billing CYCLES.
 *
 * Deliberately not a month grid. Each row here is a cycle that can span weeks
 * (`cycle_start` → `cycle_end`), so a per-day grid would have to invent a day
 * granularity the data does not have — exactly the kind of fabrication this
 * rebuild removes.
 *
 * A cycle with only one end recorded says which end it is ("From …" / "Until …")
 * rather than printing a bare date that would read as a one-day cycle.
 */

import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatDa, getStatusBg, getStatusColor } from '../../../lib/formatters'
import type { BillingCalendarEntry } from '../../../types/student'
import { EmptyLine, InlineSpinner, ProfileCard } from './ProfileCard'
import { DASH, formatDateRange, parseISODate } from './BillingSummaryCard'

export interface BillingCalendarCardProps {
  entries: BillingCalendarEntry[]
  loading?: boolean
}

/**
 * A cycle is only ever one of these three. Note: no `unpaid`/`no_plan` here.
 *
 * Keys rather than sentences — a module-level map of rendered strings would be
 * frozen in the language that happened to be active at import.
 */
const CYCLE_STATUS_KEYS: Record<BillingCalendarEntry['status'], string> = {
  paid: 'status.paid',
  due: 'status.due',
  overdue: 'status.overdue',
}

/** The timeline dot colour, matching the pill the same row carries. */
function statusDot(status: BillingCalendarEntry['status']): string {
  switch (status) {
    case 'paid':
      return 'var(--emerald)'
    case 'due':
      return 'var(--gold)'
    case 'overdue':
      return 'var(--red)'
  }
}

export function BillingCalendarCard({ entries, loading = false }: BillingCalendarCardProps) {
  const { t } = useTranslation('students')
  const cycles = Array.isArray(entries) ? entries : []
  const isEmpty = cycles.length === 0

  return (
    <ProfileCard
      title={t('calendar.title')}
      icon={<Calendar size={13} />}
      action={loading ? <InlineSpinner label={t('calendar.loadingAria')} /> : undefined}
    >
      {isEmpty ? (
        loading ? (
          <EmptyLine>{t('common:state.loading')}</EmptyLine>
        ) : (
          <EmptyLine>
            {t('calendar.empty', { dash: DASH })}
          </EmptyLine>
        )
      ) : (
        <ol className="m-0 p-0 list-none space-y-3">
          {cycles.map((entry, i) => {
            const range = formatDateRange(
              t,
              parseISODate(entry.cycle_start),
              parseISODate(entry.cycle_end),
            )
            const isLast = i === cycles.length - 1
            const paid = entry.paid_amount ?? 0

            // The rail hangs off the row's leading edge, so the inset and the
            // rail's own offsets are logical: they move to the right in Arabic.
            return (
              <li key={entry.id} className="relative ps-5">
                {/* Timeline rail: a status-coloured dot, joined to the next one. */}
                <span
                  aria-hidden="true"
                  className="absolute start-[3px] top-[5px] w-2 h-2 rounded-full"
                  style={{ background: statusDot(entry.status) }}
                />
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="absolute start-[6px] top-[19px] bottom-[-12px] w-px"
                    style={{ background: 'var(--divider)' }}
                  />
                ) : null}

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text)' }}
                      title={range}
                    >
                      {range}
                    </p>
                    {/* A cycle's amount alone hides a partial payment: 3 300 DA
                        owed with 1 000 DA recorded would print "3 300 Da / Due"
                        and the 1 000 becomes invisible — the mirror image of the
                        original fabricated-"Paid" bug. When the two differ, show
                        both ends rather than picking one and implying the other. */}
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                      {paid > 0 && paid !== entry.amount_da
                        ? t('calendar.partialPaid', {
                            paid: formatDa(paid),
                            total: formatDa(entry.amount_da),
                          })
                        : formatDa(entry.amount_da)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full shrink-0',
                      'text-[10px] font-semibold',
                      getStatusBg(entry.status),
                      getStatusColor(entry.status),
                    )}
                    title={t(CYCLE_STATUS_KEYS[entry.status])}
                  >
                    {t(CYCLE_STATUS_KEYS[entry.status])}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </ProfileCard>
  )
}

export default BillingCalendarCard
