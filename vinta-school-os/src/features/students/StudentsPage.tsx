/**
 * Vinta School OS — Students Page
 * Main page for managing students with stats overview,
 * student table, and add/edit student modal.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Users,
  Plus,
  Search,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import StudentTable from './StudentTable'
import StudentDrawer from './StudentDrawer'
import AddStudentModal from './AddStudentModal'
import type { Student, StudentStats, StudentStatus } from '../../types/student'

// ============================================
// Filter pills
// ============================================

type FilterKey = StudentStatus | 'all'

/** Shape of `GET /students`; the list route is paginated, not a bare array. */
interface StudentsListResponse {
  students: Student[]
  total: number
  page: number
  per_page: number
  pages: number
}

/**
 * Active-pill tint. Money that actually arrived keeps its colour; everything
 * else stays neutral. `unpaid` and `no_plan` both mean "nothing recorded", so
 * they never get — and must never look like — emerald.
 */
function activePillClass(key: FilterKey): string {
  switch (key) {
    case 'paid':
      return 'bg-[var(--emerald-soft)] text-[var(--emerald)] border-[var(--emerald)]/30'
    case 'overdue':
      return 'bg-[var(--red-soft)] text-[var(--red)] border-[var(--red)]/30'
    case 'due':
      return 'bg-[var(--gold-soft)] text-[var(--gold)] border-[var(--gold)]/30'
    case 'unpaid':
    case 'no_plan':
      return 'bg-[var(--glass-strong)] text-[var(--muted)] border-[var(--glass-border)]'
    case 'all':
    default:
      return 'bg-[var(--glass-strong)] text-[var(--text)] border-[var(--glass-border)]'
  }
}

// ============================================
// Component
// ============================================

export default function StudentsPage() {
  /* ── State ── */
  const [students, setStudents] = useState<Student[]>([])
  /* How many students matched on the server — the loaded page may be smaller,
     because `GET /students` caps at 50 rows. Only used to say so honestly. */
  const [totalMatching, setTotalMatching] = useState(0)
  /* Counts for the whole roster, straight from the API — never derived from
     the loaded page: `GET /students` is capped (50), so counting `students`
     would report "students on this page" and quietly understate the roster. */
  const [stats, setStats] = useState<StudentStats>({
    total: 0,
    paid: 0,
    due: 0,
    overdue: 0,
  })
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  /* ── Fetch students ──
     `q` is sent to the server rather than filtering the loaded array in the
     browser. `GET /students` is capped at 50 rows per page, so client-side
     filtering would silently miss every student past the first page — search
     would appear to work right up until the roster outgrew one page. */
  const fetchStudents = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const trimmed = query.trim()
      const { data } = await api.get<StudentsListResponse>('/students', {
        params: trimmed ? { q: trimmed } : undefined,
      })
      const rows = Array.isArray(data) ? data : data.students ?? []
      setStudents(rows)
      // `total` is every match on the server, not just the page returned, so the
      // table can admit when it is showing only part of the result.
      setTotalMatching(Array.isArray(data) ? rows.length : (data.total ?? rows.length))
    } catch {
      // Error handled by empty state
    } finally {
      setIsLoading(false)
    }
  }, [])

  /* ── Fetch stats ──
     `total` is the real roster size: a student who is `unpaid` or `no_plan`
     counts here and nowhere else, so `total !== paid + due + overdue`. */
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<StudentStats>('/students/stats')
      setStats(data)
    } catch {
      // Keep the last counts we trust rather than reporting a silent zero.
    }
  }, [])

  /* Every change that can move a student between buckets refreshes both the
     roster and the counts (refresh button, new student, drawer reports). */
  const refresh = useCallback(async () => {
    await Promise.all([fetchStudents(search), fetchStats()])
  }, [fetchStudents, fetchStats, search])

  /* Stats describe the whole roster and do not depend on the search, so they
     load once and on explicit refresh — not on every keystroke. */
  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  /* Typing re-queries the server. The debounce is what makes that acceptable:
     without it every keystroke is a request, and a fast typist races their own
     results. The first run skips the delay so the page paints immediately. */
  const isFirstLoad = useRef(true)
  useEffect(() => {
    const delay = isFirstLoad.current ? 0 : 300
    isFirstLoad.current = false
    const handle = setTimeout(() => {
      void fetchStudents(search)
    }, delay)
    return () => clearTimeout(handle)
  }, [search, fetchStudents])

  /* ── Handlers ── */
  const handleSelectStudent = useCallback((student: Student) => {
    setSelectedStudent(student)
    setIsDrawerOpen(true)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    setTimeout(() => setSelectedStudent(null), 200)
  }, [])

  /* ── Filtered list ──
     `students` is already the server's answer for the current search, so only
     the status pill is applied here. */
  const filteredStudents =
    filter === 'all' ? students : students.filter((s) => s.status === filter)

  /* Pill counts are page-local by construction — they count what the server
     returned, not the roster. The stats rail above is the authority on totals. */
  const countFor = (key: FilterKey) =>
    key === 'all' ? students.length : students.filter((s) => s.status === key).length

  /* The server matched more students than it returned, so the table is showing
     a slice. Saying so is the difference between "this is everyone" and "this is
     the first 50" — the table would otherwise imply the latter is the former. */
  const truncated = totalMatching > students.length

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* ── Page Header ──────────────────────────── */}
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--gold-soft)] flex items-center justify-center">
              <Users size={18} className="text-[var(--gold)]" />
            </div>
            <div>
              <h1
                className="text-xl font-bold text-[var(--text)]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Students
              </h1>
              <p className="text-xs text-[var(--muted)]">
                Manage student records and billing status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
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
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
                'text-white',
                'hover:opacity-90 active:scale-[0.98]',
                'transition-all duration-150',
                'shadow-sm',
              )}
              style={{
                background: 'linear-gradient(135deg, var(--gold), var(--emerald))',
                fontFamily: 'var(--font-heading)',
              }}
            >
              <Plus size={16} />
              Add Student
            </button>
          </div>
        </div>

        {/* ── Stats Rail ──
            Whole-roster counts from `GET /students/stats`, so the rail and the
            filter pills agree on what exists. The three buckets do NOT sum to
            the total: `unpaid` and `no_plan` students count toward the roster
            only, hence the hints below. */}
        <div className="flex items-center gap-5 mb-4">
          <StatCard
            label="Total Students"
            value={stats.total}
            color="var(--text)"
            icon={<Users size={14} />}
            hint="Whole roster — includes students who are unpaid or have no plan, so this is not the sum of the other three"
          />
          <StatCard
            label="Paid"
            value={stats.paid}
            color="var(--emerald)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)]" />}
            hint="Active plan, inside its cycle window"
          />
          <StatCard
            label="Due"
            value={stats.due}
            color="var(--gold)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]" />}
            hint="Money owed — cycle closed, expired or depleted"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            // Solid token, matching `--text`/`--emerald`/`--gold` on the siblings.
            // `--red-soft` is already a 14%-alpha wash, and `StatCard` derives the
            // icon tint from this value too — passing it here would fade the
            // number and double-fade the chip into near-invisibility.
            color="var(--red)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" />}
            hint="Plan suspended"
          />
        </div>

        {/* ── Search Bar ──────────────────────────── */}
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          {/* The placeholder matches what the server actually searches: name,
              phone and parent phone — NOT class. Advertising a field the query
              silently ignores is how "search is broken" reports are born. */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className={cn(
              'w-full pl-9 pr-4 py-2 rounded-xl text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
              'placeholder:text-[var(--muted)]/50',
              'transition-shadow duration-150',
            )}
          />
        </div>

        {/* ── Filter Pills ──
            One pill per status the backend emits. `unpaid` and `no_plan` are
            "nothing recorded yet" states, not money, so they stay neutral.
            The counts are of the loaded page — the rail carries the totals. */}
        <div
          className="flex items-center gap-2 mt-3"
          title="Counts cover the students loaded on this page, not the whole roster"
        >
          {([
            { key: 'all', label: 'All' },
            { key: 'paid', label: 'Paid' },
            { key: 'due', label: 'Due' },
            { key: 'overdue', label: 'Overdue' },
            { key: 'unpaid', label: 'Unpaid' },
            { key: 'no_plan', label: 'No plan' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150',
                'border',
                filter === key
                  ? activePillClass(key)
                  : 'bg-transparent text-[var(--muted)] border-[var(--glass-border)] hover:text-[var(--text)] hover:border-[var(--muted)]/30',
              )}
            >
              {label}
              <span className="ml-1.5 tabular-nums opacity-60">{countFor(key)}</span>
            </button>
          ))}
        </div>

        {/* Only when the server matched more than it returned. */}
        {truncated && (
          <p className="text-[11px] text-[var(--muted)] mt-2">
            Showing {students.length} of {totalMatching} matching students — refine
            your search to narrow this down.
          </p>
        )}
      </div>

      {/* ── Student Table ────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <StudentTable
          students={filteredStudents}
          onSelect={handleSelectStudent}
          isLoading={isLoading}
        />
      </div>

      {/* ── Student Drawer ───────────────────────── */}
      <StudentDrawer
        student={selectedStudent}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onUpdated={refresh}
      />

      {/* ── Add Student Modal ────────────────────── */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={refresh}
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
  /** What this bucket actually counts — shown on hover. */
  hint?: string
}

function StatCard({ label, value, color, icon, hint }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl',
        'bg-[var(--glass)] border border-[var(--glass-border)]',
      )}
      title={hint}
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
