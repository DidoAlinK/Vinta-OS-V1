/**
 * Vinta School OS — T8 Scheduling Window (Weekly vs Temporary, frontend-only)
 * Calendar stays view-only. Entry: + New Class button (toolbar + AgendaBoard
 * empty-cell path) → modal asks first: [🔁 Weekly] [🕐 Temporary].
 * Restyle: gold/emerald + squircle + glass, current UI kept.
 *
 * - Weekly: Group, Teacher auto, Day, Start-End, Room, Starts from,
 *   Ends (Never / After N sessions / On date). Creates backend
 *   POST /classes/:id/schedules (ScheduleDefinition type=WEEKLY traced via
 *   schedule_id) + rolling 8 weeks display. Backend generates 12 weeks;
 *   the definition row records the 8-week window.
 * - Temporary: Link to Group (optional, billing only), Teacher, Date,
 *   Start-End, Room, Reason (Makeup/Trial/Extra/Reschedule). Creates exactly
 *   1 session via POST /sessions. Never spawns a series.
 * - Conflict (room OR teacher vs non-CANCELLED) BLOCKS submit inline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Repeat, Clock3, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import type { Session } from '../../types/class'
import {
  createScheduleDef,
  createTempRecord,
  findConflicts,
  weeklyOccurrences,
  DAY_OPTIONS,
  TEMP_REASONS,
  type ScheduleEndKind,
  type TempReason,
} from '../../lib/scheduleDefs'

// ============================================
// Props
// ============================================

export interface SchedulingModalProps {
  isOpen: boolean
  onClose: () => void
  sessions: Session[]
  prefillDate?: string | null
  onCreated?: () => void
}

type Mode = 'choose' | 'weekly' | 'temporary'

interface GroupOption {
  id: string
  name: string
  subject?: string
  teacher_id?: string
  teacher_name?: string
}

interface TeacherOption {
  id: string
  name: string
}

interface RoomOption {
  id: string
  name: string
}

// ============================================
// Shared bits
// ============================================

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'text-[var(--text)] outline-none',
  'focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'disabled:opacity-50',
)

const labelCls = 'block text-xs font-medium text-[var(--muted)] mb-1.5'

const primaryBtnCls = cn(
  'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
  'hover:opacity-90 active:scale-[0.98]',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-all duration-150',
)

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function errMsg(err: any, fallback: string): string {
  const backend = err?.response?.data?.error
  if (typeof backend === 'string' && backend) return backend
  return fallback
}

// ============================================
// Component
// ============================================

export function SchedulingModal({ isOpen, onClose, sessions, prefillDate, onCreated }: SchedulingModalProps) {
  const [mode, setMode] = useState<Mode>('choose')

  // Lookups
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Weekly form
  const [wGroup, setWGroup] = useState('')
  const [wDay, setWDay] = useState<number>(1)
  const [wStart, setWStart] = useState('10:00')
  const [wEnd, setWEnd] = useState('11:30')
  const [wRoom, setWRoom] = useState('')
  const [wFrom, setWFrom] = useState(todayISO())
  const [wEndKind, setWEndKind] = useState<ScheduleEndKind>('never')
  const [wEndN, setWEndN] = useState(8)
  const [wEndDate, setWEndDate] = useState('')
  const [wSaving, setWSaving] = useState(false)
  const [wError, setWError] = useState<string | null>(null)

  // Temporary form
  const [tGroup, setTGroup] = useState('')
  const [tTeacher, setTTeacher] = useState('')
  const [tDate, setTDate] = useState(prefillDate ?? todayISO())
  const [tStart, setTStart] = useState('10:00')
  const [tEnd, setTEnd] = useState('11:30')
  const [tRoom, setTRoom] = useState('')
  const [tReason, setTReason] = useState<TempReason>('Extra')
  const [tSaving, setTSaving] = useState(false)
  const [tError, setTError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setMode('choose')
    setWError(null)
    setTError(null)
    setLookupError(null)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // Load lookups on open (groups + teachers + rooms). Missing → Not set + Retry.
  const loadLookups = useCallback(async () => {
    setLookupError(null)
    try {
      const [gRes, tRes, rRes] = await Promise.all([
        api.get('/classes'),
        api.get('/teachers'),
        api.get('/classrooms'),
      ])
      const gList: GroupOption[] = (gRes.data.classes ?? gRes.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        teacher_id: c.teacher_id,
        teacher_name: c.teacher_name,
      }))
      const tList: TeacherOption[] = (tRes.data.teachers ?? tRes.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.full_name || t.name || `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
      }))
      const rList: RoomOption[] = (rRes.data.classrooms ?? rRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
      }))
      setGroups(gList)
      setTeachers(tList)
      setRooms(rList)
    } catch {
      setGroups([])
      setTeachers([])
      setRooms([])
      const msg = 'Lookups Not set (groups/teachers/rooms).'
      setLookupError(msg)
      toast.error('Scheduling unavailable', `${msg} Press Retry.`)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setTDate(prefillDate ?? todayISO())
    void loadLookups()
  }, [isOpen, prefillDate, loadLookups])

  // Weekly: teacher auto from group.
  const wTeacher = useMemo(() => {
    const g = groups.find((x) => x.id === wGroup)
    if (g?.teacher_id) {
      const t = teachers.find((x) => x.id === g.teacher_id)
      return { id: g.teacher_id, name: t?.name ?? g.teacher_name ?? 'Not set' }
    }
    return { id: '', name: 'Not set' }
  }, [groups, teachers, wGroup])

  const wOccurrences = useMemo(
    () => weeklyOccurrences({ dayOfWeek: wDay, startsFrom: wFrom, endKind: wEndKind, endN: wEndN, endDate: wEndDate }, 8),
    [wDay, wFrom, wEndKind, wEndN, wEndDate],
  )

  // Weekly conflicts: check the FIRST occurrence inline (room/teacher vs non-CANCELLED).
  const wConflicts = useMemo(() => {
    if (!wGroup || wOccurrences.length === 0) return []
    return findConflicts(sessions, {
      date: wOccurrences[0],
      start: wStart,
      end: wEnd,
      teacherId: wTeacher.id,
      roomId: wRoom || null,
    })
  }, [sessions, wGroup, wOccurrences, wStart, wEnd, wTeacher.id, wRoom])

  const tConflicts = useMemo(() => {
    if (!tDate) return []
    return findConflicts(sessions, {
      date: tDate,
      start: tStart,
      end: tEnd,
      teacherId: tTeacher,
      roomId: tRoom || null,
    })
  }, [sessions, tDate, tStart, tEnd, tTeacher, tRoom])

  // ── Weekly submit ──
  const handleWeekly = useCallback(async () => {
    if (!wGroup) { setWError('Pick a group.'); return }
    if (!wTeacher.id) { setWError('Group teacher Not set — assign a teacher in Classes first.'); return }
    if (!wFrom) { setWError('Starts from is required.'); return }
    if (wEnd <= wStart) { setWError('End time must be after start time.'); return }
    if (wEndKind === 'after_n' && (wEndN < 1 || wEndN > 52)) { setWError('After N sessions: 1–52.'); return }
    if (wEndKind === 'on_date' && !wEndDate) { setWError('Pick an end date.'); return }
    if (wConflicts.length > 0) {
      const kinds = [...new Set(wConflicts.map((c) => c.kind))].join(' + ')
      setWError(`Blocked: ${kinds} overlap on ${wOccurrences[0]}. Pick another room/time.`)
      return
    }
    setWError(null)
    setWSaving(true)
    try {
      const { data } = await api.post(`/classes/${wGroup}/schedules`, {
        day_of_week: wDay,
        start_time: wStart,
        end_time: wEnd,
        classroom_id: wRoom || undefined,
      })
      const g = groups.find((x) => x.id === wGroup)
      createScheduleDef({
        classId: wGroup,
        className: g?.name ?? wGroup,
        teacherId: wTeacher.id,
        dayOfWeek: wDay,
        startTime: wStart,
        endTime: wEnd,
        roomId: wRoom || null,
        startsFrom: wFrom,
        endKind: wEndKind,
        endN: wEndKind === 'after_n' ? wEndN : undefined,
        endDate: wEndKind === 'on_date' ? wEndDate : undefined,
        backendScheduleId: data?.id ?? null,
      })
      toast.success('Weekly series created', `🔁 ${wOccurrences.length} sessions rolling (8-week window).`)
      onCreated?.()
      handleClose()
    } catch (err: any) {
      const msg = errMsg(err, 'Could not create series. Press Retry.')
      setWError(msg)
      toast.error('Weekly failed', msg)
    } finally {
      setWSaving(false)
    }
  }, [wGroup, wTeacher.id, wFrom, wStart, wEnd, wEndKind, wEndN, wEndDate, wConflicts, wOccurrences, wDay, wRoom, groups, onCreated, handleClose])

  // ── Temporary submit: exactly 1 session, never a series ──
  const handleTemporary = useCallback(async () => {
    const group = tGroup ? groups.find((x) => x.id === tGroup) : null
    const teacherId = tTeacher || group?.teacher_id || ''
    if (!teacherId) { setTError('Pick a teacher (or a group with a teacher).'); return }
    if (!tDate) { setTError('Date is required.'); return }
    if (tEnd <= tStart) { setTError('End time must be after start time.'); return }
    if (tConflicts.length > 0) {
      const kinds = [...new Set(tConflicts.map((c) => c.kind))].join(' + ')
      setTError(`Blocked: ${kinds} overlap on ${tDate}. Pick another room/time.`)
      return
    }
    setTError(null)
    setTSaving(true)
    try {
      const { data } = await api.post('/sessions', {
        class_id: group?.id ?? tGroup ?? undefined,
        teacher_id: teacherId,
        date: tDate,
        start_time: tStart,
        end_time: tEnd,
        classroom_id: tRoom || undefined,
        subject: group?.subject,
      })
      if (data?.id) createTempRecord(data.id, tReason, group?.id ?? null)
      toast.success('Temporary session created', `🕐 ${tReason} — exactly 1 session, no series.`)
      onCreated?.()
      handleClose()
    } catch (err: any) {
      const msg = errMsg(err, 'Could not create session. Press Retry.')
      setTError(msg)
      toast.error('Temporary failed', msg)
    } finally {
      setTSaving(false)
    }
  }, [tGroup, groups, tTeacher, tDate, tStart, tEnd, tRoom, tReason, tConflicts, onCreated, handleClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={cn(
          'w-full max-w-lg mx-4 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
          'flex flex-col max-h-[85vh]',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <h2 className="text-base font-bold text-[var(--text)]" style={{ fontFamily: 'var(--font-heading)' }}>
            + New Class
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lookupError && (
            <div className="flex flex-col items-center gap-2 py-4 text-center mb-2">
              <p className="text-sm font-semibold text-[var(--red)]">{lookupError}</p>
              <button
                type="button"
                onClick={() => void loadLookups()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 transition-all"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </div>
          )}

          {mode === 'choose' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('weekly')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] px-4 py-6 hover:border-[var(--emerald)]/40 transition-all"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                  <Repeat size={18} />
                </span>
                <span className="text-sm font-bold text-[var(--text)]">🔁 Weekly</span>
                <span className="text-[11px] text-[var(--muted)] text-center">Recurring series · rolling 8 weeks</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('temporary')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] px-4 py-6 hover:border-[var(--gold)]/40 transition-all"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                  <Clock3 size={18} />
                </span>
                <span className="text-sm font-bold text-[var(--text)]">🕐 Temporary</span>
                <span className="text-[11px] text-[var(--muted)] text-center">One session · makeup / trial / extra</span>
              </button>
            </div>
          )}

          {mode === 'weekly' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Group</label>
                <select value={wGroup} onChange={(e) => setWGroup(e.target.value)} disabled={wSaving} className={inputCls}>
                  <option value="">Select group…</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.subject ? ` (${g.subject})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Teacher (auto)</label>
                <input value={wTeacher.name} disabled className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Day</label>
                  <select value={wDay} onChange={(e) => setWDay(Number(e.target.value))} disabled={wSaving} className={inputCls}>
                    {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Start</label>
                  <input type="time" value={wStart} onChange={(e) => setWStart(e.target.value)} disabled={wSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End</label>
                  <input type="time" value={wEnd} onChange={(e) => setWEnd(e.target.value)} disabled={wSaving} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Room</label>
                  <select value={wRoom} onChange={(e) => setWRoom(e.target.value)} disabled={wSaving} className={inputCls}>
                    <option value="">— No room —</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Starts from</label>
                  <input type="date" value={wFrom} onChange={(e) => setWFrom(e.target.value)} disabled={wSaving} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Ends</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)] mb-2">
                  {(['never', 'after_n', 'on_date'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setWEndKind(k)}
                      className={cn(
                        'flex-1 py-2 text-xs font-semibold transition-all',
                        wEndKind === k
                          ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                      )}
                    >
                      {k === 'never' ? 'Never' : k === 'after_n' ? 'After N' : 'On date'}
                    </button>
                  ))}
                </div>
                {wEndKind === 'after_n' && (
                  <input type="number" value={wEndN} onChange={(e) => setWEndN(Math.min(52, Math.max(1, Math.round(Number(e.target.value) || 8))))} min={1} max={52} disabled={wSaving} className={inputCls} />
                )}
                {wEndKind === 'on_date' && (
                  <input type="date" value={wEndDate} onChange={(e) => setWEndDate(e.target.value)} disabled={wSaving} className={inputCls} />
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                🔁 {wOccurrences.length} occurrence{wOccurrences.length === 1 ? '' : 's'} in the 8-week window
                {wOccurrences.length > 0 ? ` (first ${wOccurrences[0]})` : ''}.
              </p>
              {wConflicts.length > 0 && (
                <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
                  Blocked: {[...new Set(wConflicts.map((c) => c.kind))].join(' + ')} overlap on {wOccurrences[0]}. Submit disabled.
                </p>
              )}
              {wError && <p className="text-xs text-[var(--red)]">{wError}</p>}
              <button onClick={() => void handleWeekly()} disabled={wSaving || wConflicts.length > 0} className={primaryBtnCls}>
                {wSaving ? 'Creating…' : 'Create weekly series'}
              </button>
              <button onClick={() => setMode('choose')} disabled={wSaving} className="w-full py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                ← Back
              </button>
            </div>
          )}

          {mode === 'temporary' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Link to Group (optional, billing only)</label>
                <select value={tGroup} onChange={(e) => { setTGroup(e.target.value); setTError(null) }} disabled={tSaving} className={inputCls}>
                  <option value="">— No group —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.subject ? ` (${g.subject})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Teacher</label>
                  <select value={tTeacher} onChange={(e) => setTTeacher(e.target.value)} disabled={tSaving} className={inputCls}>
                    <option value="">Select…</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reason</label>
                  <select value={tReason} onChange={(e) => setTReason(e.target.value as TempReason)} disabled={tSaving} className={inputCls}>
                    {TEMP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} disabled={tSaving} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Start</label>
                  <input type="time" value={tStart} onChange={(e) => setTStart(e.target.value)} disabled={tSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End</label>
                  <input type="time" value={tEnd} onChange={(e) => setTEnd(e.target.value)} disabled={tSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Room</label>
                  <select value={tRoom} onChange={(e) => setTRoom(e.target.value)} disabled={tSaving} className={inputCls}>
                    <option value="">—</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted)]">🕐 Creates exactly 1 session — never a series.</p>
              {tConflicts.length > 0 && (
                <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
                  Blocked: {[...new Set(tConflicts.map((c) => c.kind))].join(' + ')} overlap on {tDate}. Submit disabled.
                </p>
              )}
              {tError && <p className="text-xs text-[var(--red)]">{tError}</p>}
              <button onClick={() => void handleTemporary()} disabled={tSaving || tConflicts.length > 0} className={primaryBtnCls}>
                {tSaving ? 'Creating…' : 'Create 1 session'}
              </button>
              <button onClick={() => setMode('choose')} disabled={tSaving} className="w-full py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SchedulingModal
