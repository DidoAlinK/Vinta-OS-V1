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
import { useUIStore } from '../../stores/uiStore'
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

/** Ask for the server's own ceiling. More than this is clamped, not honoured. */
const PAGE_SIZE = 100

/**
 * How many pages to walk before giving up.
 *
 * 60 pages is 6,000 students — far past any academy this is built for, and the
 * point of the number is that a bad `pages` value on the wire cannot turn this
 * into an unbounded loop of requests. If it is ever reached the table says it
 * is showing a slice, so the cap can never be mistaken for the whole roster.
 */
const MAX_PAGES = 60

export default function StudentsPage() {
  /* ── State ── */
  const [students, setStudents] = useState<Student[]>([])
  /* Every student the server matched. `students` now holds all of them unless
     the walk hit MAX_PAGES, so this is only larger when the table is a slice. */
  const [totalMatching, setTotalMatching] = useState(0)
  /* Counts for the whole roster, straight from the API. Not derived from
     `students` even though that is now the whole set: these are the server's
     own numbers, and keeping them independent is what lets the two disagree
     loudly if a walk ever comes back short. */
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
     `q` is still sent to the server rather than filtering a loaded array in the
     browser: the roster is the academy's, not this page's, and a search that
     only looked at what had already been fetched would miss students it had
     never asked for.

     What changed is that the page no longer stops at the first twenty. It used
     to render `GET /students` once and show whichever fifty came back, which
     meant a 437-student academy could only ever see its first fifty — the rail
     said 437, the table showed 50, and every filter below counted the fifty.
     Now the first response's `pages` is used to pull the rest, so `students` is
     the whole match set and the pills count the roster instead of the page.

     `per_page` asks for the server's own ceiling; asking for more is silently
     clamped, so the page count is read back rather than computed here. */
  const fetchStudents = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const trimmed = query.trim()
      const params = trimmed ? { q: trimmed } : {}
      const first = await api.get<StudentsListResponse>('/students', {
        params: { ...params, per_page: PAGE_SIZE },
      })
      const data = first.data

      // A bare array means a response that predates paging — one page, no more
      // to ask for.
      if (Array.isArray(data)) {
        setStudents(data)
        setTotalMatching(data.length)
        return
      }

      const head = data.students ?? []
      const pageCount = Math.min(data.pages ?? 1, MAX_PAGES)
      const rest =
        pageCount > 1
          ? await Promise.all(
              Array.from({ length: pageCount - 1 }, (_, i) =>
                api
                  .get<StudentsListResponse>('/students', {
                    params: { ...params, per_page: PAGE_SIZE, page: i + 2 },
                  })
                  // One page failing must not throw away the ones that landed:
                  // a partial roster the desk can see beats an empty table.
                  .then(r => (Array.isArray(r.data) ? r.data : (r.data.students ?? [])))
                  .catch(() => [] as Student[]),
              ),
            )
          : []

      const all = [head, ...rest].flat()
      setStudents(all)
      // `total` is every match on the server. If the two disagree the walk was
      // cut short, and the caller says so rather than implying this is all.
      setTotalMatching(data.total ?? all.length)
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

  /* ── Arriving from the global search ──
     The search already holds the same row this page's table would pass, so the
     drawer opens on the spot instead of the page re-fetching what it was just
     handed. Cleared synchronously — a React double-invoke in development must
     not open the same drawer twice. */
  const focusTarget = useUIStore((s) => s.focusTarget)
  const clearFocusTarget = useUIStore((s) => s.clearFocusTarget)

  useEffect(() => {
    if (focusTarget?.kind !== 'student') return
    clearFocusTarget()
    handleSelectStudent(focusTarget.student)
  }, [focusTarget, clearFocusTarget, handleSelectStudent])

  /* ── Filtered list ──
     `students` is already the server's answer for the current search, so only
     the status pill is applied here. */
  const filteredStudents =
    filter === 'all' ? students : students.filter((s) => s.status === filter)

  /* Pill counts describe the whole match set. They used to be page-local and
     the rail had to be pointed at instead; now that every page is fetched they
     count the same students the pills filter, which is what a pill is for. */
  const countFor = (key: FilterKey) =>
    key === 'all' ? students.length : students.filter((s) => s.status === key).length

  /* The server matched more students than were walked, so the table is showing
     a slice. Only reachable if the walk hit MAX_PAGES. Saying so is the
     difference between "this is everyone" and "this is the first 6,000" — the
     table would otherwise imply the latter is the former. */
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
            Each count is of the whole roster for the current search. */}
        <div className="flex items-center gap-2 mt-3">
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
