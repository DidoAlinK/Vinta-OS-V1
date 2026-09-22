/**
 * Vinta School OS — Class Grid
 * Responsive grid of class cards with status indicators.
 * Each card shows subject color bar, class name, teacher, and enrollment.
 */

import { useMemo } from 'react'
import { cn } from '../../lib/cn'
import { SUBJECT_COLORS } from '../../lib/constants'
import type { Class } from '../../types/class'

// ============================================
// Props
// ============================================

export interface ClassGridProps {
  classes: Class[]
  onSelect: (cls: Class) => void
  isLoading?: boolean
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
function statusDotColor(status: Class['status']): string {
  switch (status) {
    case 'full':
      return 'bg-[var(--red)]'
    case 'active':
      return 'bg-[var(--emerald)]'
    case 'empty':
      return 'bg-[var(--muted)]/40'
  }
}

/** Status label */
function statusLabel(status: Class['status']): string {
  switch (status) {
    case 'full':
      return 'Full'
    case 'active':
      return 'Active'
    case 'empty':
      return 'Empty'
  }
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
}: ClassGridProps) {
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
          No classes yet
        </h3>
        <p className="text-sm text-[var(--muted)] max-w-xs">
          Create your first class to start managing students and schedules.
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
}

function ClassCard({ cls, index, onClick }: ClassCardProps) {
  const color = resolveColor(cls)
  const isFull = cls.status === 'full'
  const isEmpty = cls.status === 'empty'

  return (
    <button
      onClick={onClick}
      className={cn(
        'glass rounded-[var(--radius-md)] overflow-hidden text-left w-full',
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
        {/* Header: class name + status dot */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className="text-sm font-bold text-[var(--text)] leading-tight truncate"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {cls.name}
          </h3>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn('w-2 h-2 rounded-full', statusDotColor(cls.status))}
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
              {cls.enrolled_count}/{cls.capacity} enrolled
            </span>
            <span
              className={cn(
                'text-[10px] font-medium',
                isFull
                  ? 'text-[var(--red)]'
                  : isEmpty
                    ? 'text-[var(--muted)]'
                    : 'text-[var(--emerald)]',
              )}
            >
              {statusLabel(cls.status)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 rounded-full bg-[var(--divider)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min((cls.enrolled_count / cls.capacity) * 100, 100)}%`,
                backgroundColor: isFull
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
  )
}

