/**
 * Vinta School OS — Subject Palette
 * Left sidebar with draggable subject cards for the calendar.
 * Includes an "Add Subject" modal with name input and color picker.
 */

import { useCallback, useState } from 'react'
import {
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import AddSubjectModal from './AddSubjectModal'
import type { Subject } from '../../types/calendar'

// ============================================
// Props
// ============================================

export interface SubjectPaletteProps {
  subjects: Subject[]
  onAddSubject: (name: string, color: string) => void
  onDeleteSubject: (id: string) => void
}

// ============================================
// Main Component
// ============================================

export default function SubjectPalette({
  subjects,
  onAddSubject,
  onDeleteSubject,
}: SubjectPaletteProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // ── Drag handler ──────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, subject: Subject) => {
      e.dataTransfer.setData(
        'application/vinta-subject',
        JSON.stringify(subject),
      )
      e.dataTransfer.effectAllowed = 'copy'

      // Create a small drag image
      const ghost = document.createElement('div')
      ghost.textContent = subject.name
      ghost.style.cssText = `
        position: absolute; top: -1000px; left: -1000px;
        padding: 6px 12px; border-radius: 8px; font-size: 12px;
        background: ${subject.color}; color: white; font-weight: 600;
        font-family: var(--font-heading);
      `
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 0, 0)
      requestAnimationFrame(() => ghost.remove())
    },
    [],
  )

  return (
    <>
      <aside
        className={cn(
          'flex flex-col h-full w-[180px] min-w-[180px]',
          'bg-[var(--glass)] border-r border-[var(--glass-border)]',
          'backdrop-blur-xl',
        )}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <h2
            className="text-sm font-bold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Subjects
          </h2>
        </div>

        {/* Subject list */}
        <div className="flex-1 overflow-y-auto px-2">
          <div className="space-y-1">
            {subjects.map((subject) => (
              <div
                key={subject.id}
                draggable
                onDragStart={(e) => handleDragStart(e, subject)}
                onMouseEnter={() => setHoveredId(subject.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing',
                  'hover:bg-[var(--input-bg)] transition-colors duration-150',
                )}
              >
                <GripVertical
                  size={14}
                  className="text-[var(--muted)]/50 shrink-0"
                />

                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: subject.color }}
                />

                <span className="flex-1 text-xs font-medium text-[var(--text)] truncate">
                  {subject.name}
                </span>

                {/* Delete button (visible on hover) */}
                {hoveredId === subject.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSubject(subject.id)
                    }}
                    className="p-0.5 rounded hover:bg-[var(--red-soft)] transition-colors"
                  >
                    <Trash2 size={12} className="text-[var(--red)]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add subject button */}
        <div className="px-2 pb-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className={cn(
              'w-full flex items-center justify-center gap-1.5',
              'px-3 py-2 rounded-lg text-xs font-medium',
              'border border-dashed border-[var(--muted)]/30',
              'text-[var(--muted)] hover:text-[var(--text)]',
              'hover:border-[var(--muted)]/60 hover:bg-[var(--input-bg)]',
              'transition-all duration-150',
            )}
          >
            <Plus size={14} />
            <span>Add subject</span>
          </button>
        </div>

        {/* Helper text */}
        <div className="px-4 pb-4">
          <p className="text-[10px] leading-relaxed text-[var(--muted)]/60 text-center">
            Drag a subject onto the grid to create a new session
          </p>
        </div>
      </aside>

      {/* Add Subject Modal */}
      <AddSubjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={onAddSubject}
      />
    </>
  )
}

