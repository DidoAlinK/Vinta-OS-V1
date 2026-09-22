/**
 * Vinta School OS — Subjects Settings
 * Manage custom subjects taught at the academy.
 * Subjects are used for teacher profiles and class creation.
 */

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, BookOpen } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'

// ============================================
// Types
// ============================================

interface Subject {
  id: string | null
  name: string
  color: string
}

// ============================================
// Constants
// ============================================

const COLOR_PRESETS = [
  '#b3872a', '#7c3aed', '#0ea5e9', '#0f6b4d',
  '#dc2626', '#ea580c', '#ec4899', '#14b8a6',
  '#6366f1', '#f59e0b', '#84cc16', '#06b6d4',
]

// ============================================
// Component
// ============================================

export default function SubjectsSettings() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0])
  const [creating, setCreating] = useState(false)

  /* ── Fetch subjects ── */
  const fetchSubjects = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/subjects')
      setSubjects(data.subjects ?? [])
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubjects()
  }, [fetchSubjects])

  /* ── Create subject ── */
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/subjects', {
        name: newName.trim(),
        color: newColor,
      })
      setSubjects(prev => [...prev, { id: data.id, name: data.name, color: data.color }])
      setNewName('')
      setNewColor(COLOR_PRESETS[0])
      toast.success('Subject created', `"${data.name}" has been added.`)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error'
      toast.error('Failed to create subject', msg)
    } finally {
      setCreating(false)
    }
  }, [newName, newColor])

  /* ── Delete subject ── */
  const handleDelete = useCallback(async (subject: Subject) => {
    if (!subject.id) {
      toast.error('Cannot delete', 'This subject is derived from a class and cannot be removed here.')
      return
    }
    try {
      await api.delete(`/subjects/${subject.id}`)
      setSubjects(prev => prev.filter(s => s.id !== subject.id))
      toast.success('Subject deleted', `"${subject.name}" has been removed.`)
    } catch {
      toast.error('Failed to delete', 'Could not remove the subject.')
    }
  }, [])

  /* ── Handle Enter key ── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
  }, [handleCreate])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3
          className="text-base font-bold text-[var(--text)] mb-1"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Subjects That We Teach
        </h3>
        <p className="text-xs text-[var(--muted)]">
          Create custom subjects for teacher profiles and class assignment.
        </p>
      </div>

      {/* Add new subject */}
      <div
        className={cn(
          'p-4 rounded-xl',
          'bg-[var(--glass)] border border-[var(--glass-border)]',
        )}
      >
        <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gold)] mb-3">
          Add New Subject
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Subject Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Physics, Arabic, Music..."
              className={cn(
                'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
                'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
              )}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98] disabled:opacity-40',
              'transition-all duration-150 shrink-0',
            )}
          >
            <Plus size={14} />
            {creating ? 'Adding...' : 'Add'}
          </button>
        </div>
        {/* Color picker */}
        <div className="mt-3">
          <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={cn(
                  'w-7 h-7 rounded-lg transition-all duration-150 hover:scale-110',
                  newColor === color ? 'ring-2 ring-offset-2 ring-[var(--text)]' : '',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Subject list */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gold)] mb-3">
          Current Subjects ({subjects.length})
        </p>
        {isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading subjects...</p>
        ) : subjects.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen size={24} className="text-[var(--muted)] mx-auto mb-2" style={{ opacity: 0.5 }} />
            <p className="text-sm text-[var(--muted)]">No subjects created yet</p>
            <p className="text-xs text-[var(--muted)]" style={{ opacity: 0.6 }}>
              Add your first subject above
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {subjects.map((subject) => (
              <div
                key={subject.name}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-xl',
                  'bg-[var(--glass)] border border-[var(--glass-border)]',
                  'hover:bg-[var(--glass-border)] transition-colors duration-150',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="text-sm font-medium text-[var(--text)]">
                    {subject.name}
                  </span>
                  {!subject.id && (
                    <span className="text-[10px] text-[var(--muted)] italic">(from class)</span>
                  )}
                </div>
                {subject.id && (
                  <button
                    onClick={() => handleDelete(subject)}
                    className={cn(
                      'p-1.5 rounded-lg',
                      'text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10',
                      'transition-colors duration-150',
                    )}
                    title="Delete subject"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
