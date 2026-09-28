/**
 * Vinta School OS — Students Page
 * Main page for managing students with stats overview,
 * student table, and add/edit student modal.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

/**
 * How many students one request asks for.
 *
 * Small enough that the first screen paints on one round trip, large enough
 * that scrolling a normal roster is a handful of requests rather than dozens.
 */
const PAGE_SIZE = 40

export default function StudentsPage() {
  const { t } = useTranslation('students')

  /* ── State ── */
  /* The students loaded SO FAR — one page at first, growing as the user
     scrolls. Not the whole roster, and nothing here should ever be read as if
     it were: `totalMatching` is what the server says exists. */
  const [students, setStudents] = useState<Student[]>([])
  /* How many students the server matched for the current search and filter.
     Larger than `students.length` until every page has been scrolled to, which
     is the normal state rather than an exceptional one. */
  const [totalMatching, setTotalMatching] = useState(0)
  /* Counts by status for the current search, straight from the API. These are
     what the pills print, and they count the whole matching set rather than
     the loaded slice — a pill that said "Overdue 2" because only two of the
     four pages had been scrolled to would be worse than no number at all. */
  const [stats, setStats] = useState<StudentStats>({
    total: 0,
    paid: 0,
    due: 0,
    overdue: 0,
    unpaid: 0,
    no_plan: 0,
  })
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  /* First page of a query: the table has nothing to show yet. */
  const [isLoading, setIsLoading] = useState(true)
  /* A later page, appended under rows that are already on screen. */
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  /* ── Refs ── */
  /* The element that actually scrolls. The infinite-scroll observer is rooted
     here rather than on the viewport, because the viewport is not what moves. */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  /* The page number of the last page that landed, so the next request knows
     what to ask for without waiting for a re-render. */
  const pageRef = useRef(1)
  /* Guards against a second page request starting while one is in flight. The
     observer can fire repeatedly as rows land and push the sentinel around. */
  const inFlightRef = useRef(false)

  /**
   * The generation counter — the thing that makes this correct.
   *
   * Every new query (mount, typing, a pill click, a manual refresh) increments
   * it, and every response checks it before touching state. Type "yac" then
   * "yacin" and two requests race; without this the first can land second and
   * repopulate the table with results for a query the user has already
   * abandoned. A response from an older generation is dropped on the floor.
   */
  const generation = useRef(0)

  /* ── Query params ──
     `q` and `status` are both sent to the server rather than applied to the
     loaded array. The roster is the academy's, not this page's: filtering a
     loaded slice would silently miss every student not yet scrolled into. */
  const buildParams = useCallback(
    (page: number) => {
      const params: Record<string, string | number> = {
        per_page: PAGE_SIZE,
        page,
      }
      const trimmed = search.trim()
      if (trimmed) params.q = trimmed
      if (filter !== 'all') params.status = filter
      return params
    },
    [search, filter],
  )

  /* ── Load the first page ──
     Runs on mount and on every search or filter change. Both start over from
     page one and replace the list, rather than appending: appending a new
     query's first page onto the previous query's rows would show a list
     matching neither query.

     The roster and the counts are fetched together under one generation, so
     they are discarded together too. If each bumped the counter itself, the
     slower of the two could survive a reset and leave the pills describing a
     search the table has already left. */
  const runQuery = useCallback(async () => {
    const myGeneration = ++generation.current
    setIsLoading(true)
    setIsLoadingMore(false)

    const trimmed = search.trim()

    const listPromise = api
      .get<StudentsListResponse | Student[]>('/students', { params: buildParams(1) })
      .then(({ data }) => {
        if (generation.current !== myGeneration) return

        // A bare array means a response that predates paging — one page, and
        // no further page to ask for.
        if (Array.isArray(data)) {
          setStudents(data)
          setTotalMatching(data.length)
          pageRef.current = 1
          setHasMore(false)
          return
        }

        setStudents(data.students ?? [])
        setTotalMatching(data.total ?? 0)
        pageRef.current = data.page ?? 1
        setHasMore((data.page ?? 1) < (data.pages ?? 0))
      })
      .catch(() => {
        if (generation.current !== myGeneration) return
        setStudents([])
        setTotalMatching(0)
        setHasMore(false)
      })
      .finally(() => {
        if (generation.current !== myGeneration) return
        setIsLoading(false)
      })

    /* Stats are not awaited against the list: the whole roster's status counts
       cannot come from an aggregate query (status is derived, not stored), so
       this walk can take longer than the page it sits above. Letting the table
       paint as soon as its own page lands keeps the slower number from holding
       up the rows. */
    const statsPromise = api
      .get<StudentStats>('/students/stats', {
        params: trimmed ? { q: trimmed } : {},
      })
      .then(({ data }) => {
        if (generation.current !== myGeneration) return
        setStats(data)
      })
      .catch(() => {
        // Keep the last counts we trust rather than reporting a silent zero.
      })

    await Promise.all([listPromise, statsPromise])
  }, [buildParams, search])

  /* ── Load the next page ──
     Appends. Deliberately does NOT bump the generation: this belongs to the
     query that is already on screen, so it must be invalidated by the same
     reset that invalidates it — not invalidate itself. */
  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMore) return

    const myGeneration = generation.current
    inFlightRef.current = true
    setIsLoadingMore(true)

    try {
      const { data } = await api.get<StudentsListResponse | Student[]>('/students', {
        params: buildParams(pageRef.current + 1),
      })

      /* The user searched or changed a pill while this was in flight. These
         rows belong to a query that is no longer on screen. */
      if (generation.current !== myGeneration) return

      const incoming = Array.isArray(data) ? [] : (data.students ?? [])
      const landedPage = Array.isArray(data)
        ? pageRef.current
        : (data.page ?? pageRef.current + 1)
      const pageCount = Array.isArray(data) ? landedPage : (data.pages ?? landedPage)

      pageRef.current = landedPage

      /* Dedupe by id. `page` is an offset query, so a student created or
         edited between two requests shifts the window underneath us and a row
         can arrive on two consecutive pages. A duplicate key would be a React
         warning; a duplicate row would be a visibly wrong roster. */
      setStudents((prev) => {
        const seen = new Set(prev.map((s) => s.id))
        return [...prev, ...incoming.filter((s) => !seen.has(s.id))]
      })
      setHasMore(landedPage < pageCount)
    } catch {
      // Leave the list as it stands. The sentinel is still there and the next
      // scroll will try again — better than blanking a table mid-read.
    } finally {
      inFlightRef.current = false
      if (generation.current === myGeneration) setIsLoadingMore(false)
    }
  }, [buildParams, hasMore])

  /* ── Infinite scroll ──
     Observe the tail row against the table's own scroller. `rootMargin` buys
     the next page a head start so the rows are usually in place by the time
     the user actually arrives at the bottom, rather than appearing into a
     viewport that has already stopped moving. */
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root) return
    if (!hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { root, rootMargin: '240px 0px', threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, loadMore])

  /* ── Search / filter ──
     Both re-query the server. Only typing is debounced: without it every
     keystroke is a request and a fast typist races their own results. A pill
     click is a single deliberate act, and 300ms of nothing after it reads as
     lag rather than as care. */
  const prevSearch = useRef(search)
  const isFirstLoad = useRef(true)
  useEffect(() => {
    const searchChanged = prevSearch.current !== search
    const delay = isFirstLoad.current || !searchChanged ? 0 : 300
    isFirstLoad.current = false
    prevSearch.current = search

    const handle = setTimeout(() => {
      void runQuery()
    }, delay)
    return () => clearTimeout(handle)
  }, [search, filter, runQuery])

  /* ── Handlers ── */
  /* Manual refresh, and the callback a create or an edit in the drawer reports
     back through — both re-run the current query from the top. */
  const refresh = useCallback(async () => {
    await runQuery()
  }, [runQuery])

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

  /* ── Pill counts ──
     From the server, for the whole matching set. `all` is every student the
     search matched, whatever their status; the rest are their own bucket. */
  const countFor = (key: FilterKey): number =>
    key === 'all' ? stats.total : stats[key]

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
                {t('page.title')}
              </h1>
              <p className="text-xs text-[var(--muted)]">
                {t('page.subtitle')}
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
              title={t('common:action.refresh')}
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
              {t('page.addStudent')}
            </button>
          </div>
        </div>

        {/* ── Stats Rail ──
            Counts for the students the current search matched, so the rail and
            the pills below it describe the same set. `Total` is every one of
            them — the five statuses partition the roster, so it includes the
            unpaid and no-plan students the other three cards here do not. */}
        <div className="flex items-center gap-5 mb-4">
          <StatCard
            label={t('stat.total')}
            value={stats.total}
            color="var(--text)"
            icon={<Users size={14} />}
            hint={t('stat.totalHint')}
          />
          <StatCard
            label={t('status.paid')}
            value={stats.paid}
            color="var(--emerald)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)]" />}
            hint={t('stat.paidHint')}
          />
          <StatCard
            label={t('status.due')}
            value={stats.due}
            color="var(--gold)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]" />}
            hint={t('stat.dueHint')}
          />
          <StatCard
            label={t('status.overdue')}
            value={stats.overdue}
            // Solid token, matching `--text`/`--emerald`/`--gold` on the siblings.
            // `--red-soft` is already a 14%-alpha wash, and `StatCard` derives the
            // icon tint from this value too — passing it here would fade the
            // number and double-fade the chip into near-invisibility.
            color="var(--red)"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" />}
            hint={t('stat.overdueHint')}
          />
        </div>

        {/* ── Search Bar ──────────────────────────── */}
        <div className="relative">
          <Search
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          {/* The placeholder matches what the server actually searches: name,
              phone and parent phone — NOT class. Advertising a field the query
              silently ignores is how "search is broken" reports are born. */}
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

        {/* ── Filter Pills ──
            One pill per status the backend emits. `unpaid` and `no_plan` are
            "nothing recorded yet" states, not money, so they stay neutral.
            Counts are the server's, for the whole match set. */}
        <div className="flex items-center gap-2 mt-3">
          {([
            { key: 'all', labelKey: 'common:label.all' },
            { key: 'paid', labelKey: 'status.paid' },
            { key: 'due', labelKey: 'status.due' },
            { key: 'overdue', labelKey: 'status.overdue' },
            { key: 'unpaid', labelKey: 'status.unpaid' },
            { key: 'no_plan', labelKey: 'status.noPlan' },
          ] as const).map(({ key, labelKey }) => (
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
              {/* Keys, translated here rather than at module scope: a map of
                  rendered strings would be evaluated once, at import, in
                  whatever language happened to be active. */}
              {t(labelKey)}
              <span className="ms-1.5 tabular-nums opacity-60">{countFor(key)}</span>
            </button>
          ))}
        </div>

        {/* How much of the matching set is actually on screen. The table stops
            at the bottom of what it has loaded, so without this the only honest
            reading of a short list would be "that is all of them". */}
        {!isLoading && students.length > 0 && (
          <p className="text-[11px] text-[var(--muted)] mt-2">
            {t('page.showing', {
              shown: students.length,
              total: totalMatching,
              // Drives the plural form, which agrees with `total` — the size of
              // the set being described. `shown` is always the smaller number.
              count: totalMatching,
            })}
            {hasMore ? ` ${t('page.scrollForMore')}` : ''}
          </p>
        )}
      </div>

      {/* ── Student Table ──
          The scroller the infinite-scroll observer is rooted on: this element
          is what moves when the user scrolls, not the window. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-6">
        <StudentTable
          students={students}
          onSelect={handleSelectStudent}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          sentinelRef={sentinelRef}
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
