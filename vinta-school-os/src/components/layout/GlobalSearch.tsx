/**
 * Vinta School OS — Global search
 *
 * What was here before was an input wired to nothing. It wrote `searchQuery`
 * into the UI store on every keystroke and no file in the app ever read it —
 * typing produced exactly zero requests and zero results, which is why it was
 * reported as broken rather than as missing.
 *
 * This one answers the question the top bar is asking: "where is this person or
 * this class?" It searches the three things the desk looks people up by —
 * students, teachers and course groups — and a click lands on the record with
 * its drawer or panel already open.
 *
 * Where each list comes from, and why they differ:
 *   - Students: asked of the server (`GET /students?q=`), because the roster is
 *     the one list that gets long enough for a client-side filter to be wrong.
 *     The route already searches name and phone.
 *   - Teachers and course groups: fetched whole and filtered here. Neither
 *     route accepts a `q`, and both lists are already fetched entire by their
 *     own pages, so this adds no new pagination problem. They are held for a
 *     minute so a fast typist does not re-pull them per keystroke.
 *
 * The debounce is what makes typing acceptable: a query per character races
 * itself, and the last response to land is not always the last one sent — so
 * every request is tagged and stale answers are dropped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, GraduationCap, Search, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { useUIStore } from '../../stores/uiStore'
import type { Class } from '../../types/class'
import type { Student } from '../../types/student'
import type { Teacher } from '../../types/teacher'

// ============================================
// Tunables
// ============================================

/** Long enough to skip the middle of a word, short enough to feel live. */
const DEBOUNCE_MS = 250
/** Rows shown per section before the list is cut. */
const GROUP_LIMIT = 6
/** How long a whole-list fetch of teachers / groups is reused. */
const CACHE_MS = 60_000

const STUDENT_STATUS_LABEL: Record<Student['status'], string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
  no_plan: 'No plan',
}

// ============================================
// Result rows
// ============================================

type Row = { key: string; title: string; subtitle: string; to: string } & (
  | { kind: 'student'; student: Student }
  | { kind: 'teacher'; teacher: Teacher }
  | { kind: 'class'; cls: Class }
)

const ROW_STYLE: Record<Row['kind'], { icon: typeof Users; chip: string }> = {
  student: { icon: Users, chip: 'bg-[var(--gold-soft)] text-[var(--gold)]' },
  teacher: { icon: GraduationCap, chip: 'bg-[var(--violet-soft)] text-[var(--violet)]' },
  class: { icon: BookOpen, chip: 'bg-[var(--emerald-soft)] text-[var(--emerald)]' },
}

const SECTION_ORDER: Array<{ kind: Row['kind']; label: string }> = [
  { kind: 'student', label: 'Students' },
  { kind: 'teacher', label: 'Teachers' },
  { kind: 'class', label: 'Classrooms' },
]

function studentRow(s: Student): Row {
  const parts = [STUDENT_STATUS_LABEL[s.status], s.phone].filter(Boolean)
  return {
    kind: 'student',
    key: `student-${s.id}`,
    title: s.full_name,
    subtitle: parts.join(' · ') || s.classes || 'No phone on file',
    to: '/app/students',
    student: s,
  }
}

function teacherRow(t: Teacher): Row {
  return {
    kind: 'teacher',
    key: `teacher-${t.id}`,
    title: t.full_name,
    subtitle: t.subject || 'No subject set',
    to: '/app/teachers',
    teacher: t,
  }
}

function classRow(c: Class): Row {
  const size =
    typeof c.capacity === 'number' && c.capacity > 0
      ? `${c.enrolled_count ?? 0}/${c.capacity}`
      : `${c.enrolled_count ?? 0} enrolled`
  return {
    kind: 'class',
    key: `class-${c.id}`,
    title: c.name,
    subtitle: [c.subject, size].filter(Boolean).join(' · '),
    to: '/app/classes',
    cls: c,
  }
}

/**
 * Name-or-subject matter for the two client-filtered lists.
 *
 * Deliberately narrow. A search that matched on every field would return the
 * whole roster for a query like "a", and a result list nobody can narrow is the
 * same as no result list.
 */
function teacherMatches(t: Teacher, needle: string): boolean {
  return (
    t.full_name.toLowerCase().includes(needle) ||
    (t.subject ?? '').toLowerCase().includes(needle) ||
    (t.email ?? '').toLowerCase().includes(needle)
  )
}

function classMatches(c: Class, needle: string): boolean {
  return (
    c.name.toLowerCase().includes(needle) ||
    (c.subject ?? '').toLowerCase().includes(needle) ||
    (c.group_name ?? '').toLowerCase().includes(needle) ||
    (c.academic_level ?? '').toLowerCase().includes(needle) ||
    (c.teacher_name ?? '').toLowerCase().includes(needle)
  )
}

// ============================================
// Component
// ============================================

export function GlobalSearch() {
  const navigate = useNavigate()
  const setFocusTarget = useUIStore((s) => s.setFocusTarget)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [isSearching, setIsSearching] = useState(false)
  /** True once a query has actually come back — separates "nothing yet" from "nothing found". */
  const [answered, setAnswered] = useState(false)
  const [active, setActive] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  /** Guards against a slow earlier request overwriting a newer one's results. */
  const requestId = useRef(0)
  const teachersCache = useRef<{ items: Teacher[]; at: number } | null>(null)
  const classesCache = useRef<{ items: Class[]; at: number } | null>(null)

  const loadTeachers = useCallback(async (): Promise<Teacher[]> => {
    const hit = teachersCache.current
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.items
    const { data } = await api.get('/teachers')
    const list = data?.teachers ?? data
    const items: Teacher[] = Array.isArray(list) ? list : []
    teachersCache.current = { items, at: Date.now() }
    return items
  }, [])

  const loadClasses = useCallback(async (): Promise<Class[]> => {
    const hit = classesCache.current
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.items
    const { data } = await api.get('/classes')
    const list = data?.classes ?? data
    const items: Class[] = Array.isArray(list) ? list : []
    classesCache.current = { items, at: Date.now() }
    return items
  }, [])

  /* ── The query ── */
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      requestId.current++
      setRows([])
      setAnswered(false)
      setIsSearching(false)
      return
    }

    const current = ++requestId.current
    setIsSearching(true)
    setAnswered(false)

    const handle = setTimeout(() => {
      void (async () => {
        const needle = q.toLowerCase()
        // One section failing must not empty the others — a teachers outage is
        // no reason to hide the student who was typed in.
        const [students, teachers, classes] = await Promise.all([
          api
            .get('/students', { params: { q, per_page: GROUP_LIMIT } })
            .then(({ data }) => (data?.students ?? (Array.isArray(data) ? data : [])) as Student[])
            .catch(() => [] as Student[]),
          loadTeachers().catch(() => [] as Teacher[]),
          loadClasses().catch(() => [] as Class[]),
        ])

        if (current !== requestId.current) return

        setRows([
          ...students.slice(0, GROUP_LIMIT).map(studentRow),
          ...teachers.filter((t) => teacherMatches(t, needle)).slice(0, GROUP_LIMIT).map(teacherRow),
          ...classes.filter((c) => classMatches(c, needle)).slice(0, GROUP_LIMIT).map(classRow),
        ])
        setAnswered(true)
        setIsSearching(false)
      })()
    }, DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [query, loadTeachers, loadClasses])

  /* ── Sections, with each row carrying its index in the flat list ── */
  const sections = useMemo(() => {
    let index = 0
    return SECTION_ORDER.map(({ kind, label }) => {
      const items = rows
        .filter((r) => r.kind === kind)
        .map((row) => ({ row, index: index++ }))
      return { kind, label, items }
    }).filter((s) => s.items.length > 0)
  }, [rows])

  const flat = useMemo(() => sections.flatMap((s) => s.items.map((i) => i.row)), [sections])

  /* A new result set starts the highlight at the top, so Enter is predictable. */
  useEffect(() => {
    setActive(0)
  }, [rows])

  /* ── Dismissal: outside click, or Escape. Same shape as NotificationBell. ── */
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /* ── Opening a result ── */
  const openRow = useCallback(
    (row: Row) => {
      // Clear first so the panel is never left showing a result that has just
      // been acted on, and so Escape cannot re-open a stale list.
      setOpen(false)
      setQuery('')
      setRows([])
      setAnswered(false)

      // Set the handoff BEFORE navigating: the target page reads it on mount,
      // and the store write is synchronous, so it is already there.
      if (row.kind === 'student') setFocusTarget({ kind: 'student', student: row.student })
      else if (row.kind === 'teacher') setFocusTarget({ kind: 'teacher', teacher: row.teacher })
      else setFocusTarget({ kind: 'class', cls: row.cls })

      navigate(row.to)
    },
    [navigate, setFocusTarget],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!open) return
        setActive((i) => (flat.length === 0 ? 0 : Math.min(flat.length - 1, i + 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const row = open ? flat[active] : undefined
        if (row) openRow(row)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        setQuery('')
        setRows([])
        setAnswered(false)
      }
    },
    [open, flat, active, openRow],
  )

  const showPanel = open && query.trim().length > 0
  const showEmpty = showPanel && answered && flat.length === 0

  return (
    <div ref={wrapRef} className="relative w-full max-w-[300px]">
      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl w-full"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
      >
        <Search size={16} className="shrink-0" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && flat[active] ? `global-search-option-${active}` : undefined
          }
          placeholder="Search students, teachers, classes…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none outline-none text-[13px] w-full"
          style={{ color: 'var(--text)' }}
        />
      </div>

      {/* Panel — styled as NotificationBell's, so the two top-bar dropdowns match */}
      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className={cn(
            'absolute left-0 top-full mt-2 z-50 w-[380px] max-w-[calc(100vw-2rem)]',
            'rounded-[var(--radius-lg)] overflow-hidden',
            'border border-[var(--glass-border)]',
            'bg-[var(--card-bg)]',
            'shadow-xl',
          )}
        >
          <div className="max-h-[420px] overflow-y-auto">
            {isSearching && flat.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--muted)]">Searching…</p>
            ) : showEmpty ? (
              <div className="px-4 py-8 text-center">
                <Search className="w-4 h-4 mx-auto mb-2 text-[var(--muted)]" />
                <p className="text-xs text-[var(--muted)]">
                  Nothing matches “{query.trim()}”
                </p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.kind}>
                  <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--muted)]">
                    {section.label}
                  </p>
                  {section.items.map(({ row, index }) => {
                    const { icon: Icon, chip } = ROW_STYLE[row.kind]
                    const highlighted = index === active
                    return (
                      <button
                        key={row.key}
                        id={`global-search-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={highlighted}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => openRow(row)}
                        className={cn(
                          'w-full text-left flex items-center gap-3 px-4 py-2.5',
                          'transition-colors duration-100',
                          highlighted ? 'bg-[var(--glass-strong)]' : 'hover:bg-[var(--glass)]',
                        )}
                      >
                        <span
                          className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                            chip,
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] font-semibold text-[var(--text)] truncate">
                            {row.title}
                          </span>
                          <span className="block text-[11px] text-[var(--muted)] truncate">
                            {row.subtitle}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {flat.length > 0 && (
            <p className="px-4 py-2 text-[10px] text-[var(--muted)] border-t border-[var(--glass-border)]">
              ↑↓ to move · Enter to open
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default GlobalSearch
