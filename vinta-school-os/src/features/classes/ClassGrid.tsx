/**
 * Vinta School OS — Class Grid
 * Responsive grid of class cards with status indicators.
 * Each card shows subject color bar, class name, teacher, and enrollment.
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { SUBJECT_COLORS } from '../../lib/constants'
import { classFillPercent, classStateOf, type ClassState } from '../../lib/classState'
import type { Class } from '../../types/class'

// ============================================
// Props
// ============================================

export interface ClassGridProps {
  classes: Class[]
  onSelect: (cls: Class) => void
  isLoading?: boolean
  /**
   * Rendered in the card's top-right corner.
   *
   * A render prop rather than something the card builds itself, because what
   * belongs there is the session menu — and a session menu needs the group's
   * next session, which is a fetch the grid has no business making.
   *
   * Whatever it returns is mounted as a SIBLING of the card, not inside it.
   * That is not a style choice: the card is `overflow-hidden` and scales on
   * hover, so a `position: fixed` dropdown nested inside it would be clipped
   * by the first and re-anchored to the card by the second, which is exactly
   * how SessionMenu's coordinates stop meaning the viewport.
   */
  cardMenu?: (cls: Class) => ReactNode
}

// ============================================
// Helpers
// ============================================

/** Resolve the display color for a class card */
function resolveColor(cls: Class): string {
  if (cls.color) return cls.color
  return SUBJECT_COLORS[cls.subject] || '#75726a'
}

/** Status dot color */
function statusDotColor(state: ClassState): string {
  switch (state) {
    case 'scheduled':
      return 'bg-[var(--gold)]'
    case 'active':
      return 'bg-[var(--emerald)]'
    case 'empty':
      return 'bg-[var(--muted)]/40'
    case 'unattended':
      return 'bg-[var(--red)]'
  }
}

/**
 * Status label, held as a key rather than as text.
 *
 * The map is read inside the card so a language switch relabels the dot on the
 * next render — a module-level `t()` would have baked in whatever language was
 * active when this file was imported.
 */
const STATUS_KEYS: Record<ClassState, string> = {
  scheduled: 'grid.status.scheduled',
  active: 'grid.status.active',
  // One word for both empty states, on purpose: the word describes the room
  // and the dot describes whether it matters — grey when there is nothing to
  // teach, red when somebody was supposed to be in there (the class is
  // running with nobody in it, or the group has students and no time at all).
  empty: 'grid.status.empty',
  unattended: 'grid.status.empty',
}

// ============================================
// Skeleton Card
// ============================================

function SkeletonCard() {
  return (
    <div
      className={cn(
        'glass rounded-[var(--radius-md)] overflow-hidden',
        'animate-pulse',
      )}
    >
      <div className="h-1 bg-[var(--muted)]/10" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-[var(--muted)]/10 rounded w-3/4" />
        <div className="h-3 bg-[var(--muted)]/10 rounded w-1/2" />
        <div className="h-3 bg-[var(--muted)]/10 rounded w-2/3" />
        <div className="flex items-center gap-2 mt-2">
          <div className="h-3 bg-[var(--muted)]/10 rounded w-12" />
        </div>
      </div>
    </div>
  )
}

// ============================================
// Component
// ============================================

export default function ClassGrid({
  classes,
  onSelect,
  isLoading = false,
  cardMenu,
}: ClassGridProps) {
  const { t } = useTranslation('classes')

  // ── Loading state ─────────────────────────────

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  // ── Empty state ───────────────────────────────

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--glass)] border border-[var(--glass-border)] flex items-center justify-center mb-4">
          <span className="text-2xl">📚</span>
        </div>
        <h3
          className="text-lg font-semibold text-[var(--text)] mb-1"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {t('grid.emptyTitle')}
        </h3>
        <p className="text-sm text-[var(--muted)] max-w-xs">
          {t('grid.emptyBody')}
        </p>
      </div>
    )
  }

  // ── Grid ──────────────────────────────────────

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {classes.map((cls, index) => (
        <ClassCard
          key={cls.id}
          cls={cls}
          index={index}
          onClick={() => onSelect(cls)}
          menu={cardMenu?.(cls)}
        />
      ))}
    </div>
  )
}

// ============================================
// Class Card (internal)
// ============================================

interface ClassCardProps {
  cls: Class
  index: number
  onClick: () => void
  menu?: ReactNode
}

function ClassCard({ cls, index, onClick, menu }: ClassCardProps) {
  const { t } = useTranslation('classes')
  const color = resolveColor(cls)
  // One reading of the group's state, used by the dot, the label and the bar.
  // These were three separate reads of `cls.status`, a field the API has never
  // sent — so the dot rendered transparent, the label rendered nothing, and the
  // bar was never coloured for a full room.
  const state = classStateOf(cls)
  const isScheduled = state === 'scheduled'
  const isEmpty = state === 'empty'
  const isUnattended = state === 'unattended'

  // `relative flex` on the wrapper, not just `relative`: the card used to be
  // the grid item and stretched to the row height, and moving it inside a
  // wrapper would otherwise leave the cards at their natural heights and the
  // row ragged. As a flex item the card stretches again.
  //
  // No z-index here on purpose. `z-10` would make this wrapper a stacking
  // context, which would trap SessionMenu's `z-50` dropdown inside it —
  // leaving the menu painted under anything above z-10 on the page, the
  // drawer included. A positioned element already paints over the static
  // card without help.
  return (
    <div className="relative flex">
      <button
        onClick={onClick}
        className={cn(
          'glass rounded-[var(--radius-md)] overflow-hidden text-start w-full',
          'group hover:scale-[1.02] active:scale-[0.98]',
          'transition-transform duration-150',
          'focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
          'animate-fade-in',
        )}
        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
      >
        {/* Subject color bar */}
        <div
          className="h-1 transition-all duration-200 group-hover:h-1.5"
          style={{ backgroundColor: color }}
        />

        <div className="p-4">
          {/* Header: class name + status dot. The `pe-10` reserves the corner
              for the ☰ and its running lamp, which are mounted outside this
              button — the dot moves toward the start rather than sitting
              underneath them. 40px is their width plus the gap between:
              8px lamp + 4px ring, 6px gap, 20px ☰. */}
          <div className="flex items-start justify-between gap-2 mb-2 pe-10">
            <h3
              className="text-sm font-bold text-[var(--text)] leading-tight truncate"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {cls.name}
            </h3>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn('w-2 h-2 rounded-full', statusDotColor(state))}
              />
            </div>
          </div>

          {/* Subject badge */}
          <div className="mb-2">
            <span
              className={cn(
                'inline-block px-2 py-0.5 rounded-md text-[10px] font-medium',
              )}
              style={{
                backgroundColor: `${color}18`,
                color: color,
              }}
            >
              {cls.subject}
            </span>
          </div>

          {/* Teacher name */}
          {cls.teacher_name && (
            <p className="text-xs text-[var(--muted)] mb-2 truncate">
              {cls.teacher_name}
            </p>
          )}

          {/* Enrollment bar */}
          <div className="mt-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--muted)]">
                {t('grid.enrolled', { enrolled: cls.enrolled_count, capacity: cls.capacity })}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isUnattended
                    ? 'text-[var(--red)]'
                    : isEmpty
                      ? 'text-[var(--muted)]'
                      : isScheduled
                        ? 'text-[var(--gold)]'
                        : 'text-[var(--emerald)]',
                )}
              >
                {t(STATUS_KEYS[state])}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 rounded-full bg-[var(--divider)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${classFillPercent(cls)}%`,
                  backgroundColor: isUnattended
                    ? 'var(--red)'
                    : isEmpty
                      ? 'var(--muted)'
                      : color,
                  opacity: isEmpty ? 0.3 : 1,
                }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* The ☰ and its dropdown live here, outside the card's <button> — see
          the note on `cardMenu` in ClassGridProps. `top-5 end-4` is the
          card's own padding, so it lands in the corner the header just made
          room for — the inline-end corner, which follows the card into
          Arabic rather than staying on the right. */}
      {menu && <div className="absolute top-5 end-4">{menu}</div>}
    </div>
  )
}

