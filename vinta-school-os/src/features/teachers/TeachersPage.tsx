/**
 * Vinta School OS — Teachers Page
 * Main page for managing teachers with stats overview,
 * teacher table, and add teacher action.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  GraduationCap,
  Plus,
  Search,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { getTeacherEmail } from '../../lib/teacherEmails'
import TeacherTable from './TeacherTable'
import TeacherDrawer from './TeacherDrawer'
import AddTeacherModal from './AddTeacherModal'
import type { Teacher } from '../../types/teacher'

// ============================================
// Component
// ============================================

export default function TeachersPage() {
  /* ── State ── */
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  /* ── Derived stats (contract split removed with the hourly model) ── */
  const stats = {
    total: teachers.length,
  }

  /* ── Fetch teachers (T9: overlay registry emails; backend has no column) ── */
  const fetchTeachers = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/teachers')
      const list: Teacher[] = data.teachers ?? data
      setTeachers(
        (Array.isArray(list) ? list : []).map((t) => ({
          ...t,
          email: t.email ?? getTeacherEmail(t.id) ?? undefined,
        })),
      )
    } catch {
      // Error handled by empty state
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeachers()
  }, [fetchTeachers])

  /* ── Handlers ── */
  const handleSelectTeacher = useCallback((teacher: Teacher) => {
    setSelectedTeacher(teacher)
    setIsDrawerOpen(true)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    setTimeout(() => setSelectedTeacher(null), 200)
  }, [])

  const handleDeleteTeacher = useCallback(async (id: string) => {
    try {
      await api.delete(`/teachers/${id}`)
      setTeachers((prev) => prev.filter((t) => t.id !== id))
      handleCloseDrawer()
      toast.success('Teacher deleted successfully')
    } catch {
      toast.error('Failed to delete teacher', 'Please try again.')
    }
  }, [handleCloseDrawer])

  /* ── Filtered list ── */
  const filteredTeachers = search
    ? teachers.filter(
        (t) =>
          t.full_name.toLowerCase().includes(search.toLowerCase()) ||
          t.subject?.toLowerCase().includes(search.toLowerCase()),
      )
    : teachers

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* ── Page Header ──────────────────────────── */}
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--violet-soft)] flex items-center justify-center">
              <GraduationCap size={18} className="text-[var(--gold)]" />
            </div>
            <div>
              <h1
                className="text-xl font-bold text-[var(--text)]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Teachers
              </h1>
              <p className="text-xs text-[var(--muted)]">
                Manage teacher contracts, schedules, and payroll
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTeachers}
              className={cn(
                'p-2 rounded-xl text-[var(--muted)]',
                'hover:bg-[var(--glass)] hover:text-[var(--text)]',
                'transition-colors duration-150',
              )}
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white',
                'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                'hover:opacity-90 active:scale-[0.98]',
                'transition-all duration-150',
              )}
            >
              <Plus size={16} />
              Add Teacher
            </button>
          </div>
        </div>

        {/* ── Stats Rail ──────────────────────────── */}
        <div className="flex items-center gap-5 mb-4">
          <StatCard
            label="Total Teachers"
            value={stats.total}
            color="var(--text)"
            icon={<GraduationCap size={14} />}
          />
        </div>

        {/* ── Search Bar ──────────────────────────── */}
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or subject..."
            className={cn(
              'w-full pl-9 pr-4 py-2 rounded-xl text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
              'placeholder:text-[var(--muted)]/50',
              'transition-shadow duration-150',
            )}
          />
        </div>
      </div>

      {/* ── Teacher Table ────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <TeacherTable
          teachers={filteredTeachers}
          onSelect={handleSelectTeacher}
          isLoading={isLoading}
        />
      </div>

      {/* ── Teacher Drawer ───────────────────────── */}
      <TeacherDrawer
        teacher={selectedTeacher}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onDelete={handleDeleteTeacher}
        onUpdated={fetchTeachers}
      />

      {/* ── Add Teacher Modal ─────────────────────── */}
      <AddTeacherModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={fetchTeachers}
      />
    </div>
  )
}

// ============================================
// Stat Card (internal)
// ============================================

interface StatCardProps {
  label: string
  value: number
  color: string
  icon: React.ReactNode
}

function StatCard({ label, value, color, icon }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl',
        'bg-[var(--glass)] border border-[var(--glass-border)]',
      )}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-lg font-bold text-[var(--text)] leading-none">{value}</p>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export type { StatCardProps }
