/**
 * Vinta School OS — Teachers Page
 * Main page for managing teachers with stats overview,
 * teacher table, and add teacher action.
 */

import { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  GraduationCap,
  Plus,
  Search,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast, useUIStore } from '../../stores/uiStore'
import { PinConfirmDialog } from '../../components/ui/PinConfirmDialog'
import { getTeacherEmail } from '../../lib/teacherEmails'
import TeacherTable from './TeacherTable'
import TeacherDrawer from './TeacherDrawer'
import AddTeacherModal from './AddTeacherModal'
import type { Teacher } from '../../types/teacher'

// ============================================
// Component
// ============================================

export default function TeachersPage() {
  const { t } = useTranslation('teachers')

  /* ── State ── */
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  /** The teacher whose Delete was pressed — the PIN dialog is gated on them. */
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)

  /* ── Arriving from the global search ──
     Cleared synchronously so a React double-invoke in development cannot open
     the same drawer twice. */
  const focusTarget = useUIStore((s) => s.focusTarget)
  const clearFocusTarget = useUIStore((s) => s.clearFocusTarget)

  useEffect(() => {
    if (focusTarget?.kind !== 'teacher') return
    clearFocusTarget()
    setSelectedTeacher(focusTarget.teacher)
    setIsDrawerOpen(true)
  }, [focusTarget, clearFocusTarget])

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

  /**
   * Step one: the drawer's Delete asks for confirmation rather than deleting.
   *
   * The id is resolved against the loaded roster so the dialog can name the
   * person it is about to remove — a confirmation that cannot say who it means
   * is one the desk will click through.
   */
  const handleDeleteTeacher = useCallback((id: string) => {
    const target = teachers.find((t) => t.id === id) ?? null
    if (target) setTeacherToDelete(target)
  }, [teachers])

  /** Step two: runs only after the PIN is accepted. */
  const confirmDeleteTeacher = useCallback(async () => {
    const target = teacherToDelete
    if (!target) return
    try {
      await api.delete(`/teachers/${target.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('toast.tryAgain')
      toast.error(t('toast.deleteFailed'), msg)
      throw new Error(msg)
    }
    setTeachers((prev) => prev.filter((t) => t.id !== target.id))
    handleCloseDrawer()
    toast.success(t('toast.deleted'))
  }, [t, teacherToDelete, handleCloseDrawer])

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
                {t('page.title')}
              </h1>
              <p className="text-xs text-[var(--muted)]">
                {t('page.subtitle')}
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
              title={t('common:action.refresh')}
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
              {t('page.addTeacher')}
            </button>
          </div>
        </div>

        {/* ── Stats Rail ──────────────────────────── */}
        <div className="flex items-center gap-5 mb-4">
          <StatCard
            label={t('page.statTotal')}
            value={stats.total}
            color="var(--text)"
            icon={<GraduationCap size={14} />}
          />
        </div>

        {/* ── Search Bar ──────────────────────────── */}
        <div className="relative">
          <Search
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('page.searchPlaceholder')}
            className={cn(
              'w-full ps-9 pe-4 py-2 rounded-xl text-sm text-[var(--text)]',
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

      {/* ── Delete confirmation (PIN-gated) ────────── */}
      <PinConfirmDialog
        open={!!teacherToDelete}
        onClose={() => setTeacherToDelete(null)}
        title={t('confirm.deleteTitle')}
        confirmLabel={t('confirm.deleteConfirm')}
        message={
          teacherToDelete ? (
            /* One key rather than a bolded name glued to a sentence fragment:
               the name does not lead the clause in every language, and a
               translator who cannot move it writes a sentence nobody says. */
            <Trans
              ns="teachers"
              i18nKey="confirm.deleteMessage"
              values={{ name: teacherToDelete.full_name }}
              components={{ strong: <strong className="font-semibold" /> }}
            />
          ) : null
        }
        onConfirm={confirmDeleteTeacher}
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
