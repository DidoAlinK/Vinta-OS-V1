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
import { useTranslation } from 'react-i18next'
import { X, Repeat, Clock3, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { addDays, toLocalISO } from '../../lib/sessionTime'
import { getDayName } from '../../lib/formatters'
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
import { Select } from '../../components/ui/Select'
import { DayPicker } from '../../components/ui/DayPicker'
import { TimePicker } from '../../components/ui/TimePicker'

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
  // Local, not UTC: toISOString() names yesterday's date for the first hour of
  // every day in Algeria (UTC+1), so a class created "today" was filed under
  // yesterday.
  return toLocalISO(new Date())
}

function errMsg(err: any, fallback: string): string {
  const backend = err?.response?.data?.error
  if (typeof backend === 'string' && backend) return backend
  return fallback
}

/**
 * A known Sunday (2024-01-07), used only to turn a weekday *number* into a
 * weekday *name*. `DAY_OPTIONS` carries English labels; the locale can name
 * all seven days itself, so nothing here holds a table of them. The ordering
 * the backend schedules on is untouched — only the label is localised.
 */
const WEEK_REFERENCE_SUNDAY = new Date(2024, 0, 7)

/** Temporary-session reasons, which arrive as enums from `TEMP_REASONS`. */
const REASON_KEYS: Record<string, string> = {
  Makeup: 'scheduling.reasonMakeup',
  Trial: 'scheduling.reasonTrial',
  Extra: 'scheduling.reasonExtra',
  Reschedule: 'scheduling.reasonReschedule',
}

/** Which half of a clash `findConflicts` is reporting. */
const CONFLICT_KIND_KEYS: Record<string, string> = {
  room: 'conflict.room',
  teacher: 'conflict.teacher',
}

/* "room + teacher" for the banner, each half named in the active language.
   Kinds are deduplicated: three clashing sessions of the same kind are still
   one kind of clash. Takes `t` as an argument rather than closing over it — a
   module-scope `t()` would freeze at import time. */
const conflictKinds = (t: (key: string) => string, conflicts: { kind: string }[]): string =>
  [...new Set(conflicts.map((c) => c.kind))]
    .map((kind) => (CONFLICT_KIND_KEYS[kind] ? t(CONFLICT_KIND_KEYS[kind]) : kind))
    .join(' + ')

// ============================================
// Component
// ============================================

export function SchedulingModal({ isOpen, onClose, sessions, prefillDate, onCreated }: SchedulingModalProps) {
  const { t } = useTranslation('calendar')
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
      const msg = t('scheduling.lookupsNotSet')
      setLookupError(msg)
      toast.error(
        t('scheduling.unavailableTitle'),
        t('scheduling.unavailableBody', { message: msg }),
      )
    }
  }, [t])

  useEffect(() => {
    if (!isOpen) return
    setTDate(prefillDate ?? todayISO())
    void loadLookups()
  }, [isOpen, prefillDate, loadLookups])

  // Weekly: teacher auto from group.
  const wTeacher = useMemo(() => {
    const g = groups.find((x) => x.id === wGroup)
    if (g?.teacher_id) {
      const found = teachers.find((x) => x.id === g.teacher_id)
      return {
        id: g.teacher_id,
        name: found?.name ?? g.teacher_name ?? t('scheduling.notSet'),
      }
    }
    return { id: '', name: t('scheduling.notSet') }
  }, [groups, teachers, wGroup, t])

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
    if (!wGroup) { setWError(t('scheduling.errPickGroup')); return }
    if (!wTeacher.id) { setWError(t('scheduling.errNoGroupTeacher')); return }
    if (!wFrom) { setWError(t('scheduling.errStartsFrom')); return }
    if (wEnd <= wStart) { setWError(t('scheduling.errEndAfterStart')); return }
    if (wEndKind === 'after_n' && (wEndN < 1 || wEndN > 52)) { setWError(t('scheduling.errAfterN')); return }
    if (wEndKind === 'on_date' && !wEndDate) { setWError(t('scheduling.errPickEndDate')); return }
    if (wConflicts.length > 0) {
      setWError(
        t('scheduling.errBlockedOn', {
          kinds: conflictKinds(t, wConflicts),
          date: wOccurrences[0],
        }),
      )
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
      toast.success(
        t('scheduling.toastWeeklyTitle'),
        t('scheduling.toastWeeklyBody', { count: wOccurrences.length }),
      )
      onCreated?.()
      handleClose()
    } catch (err: any) {
      const msg = errMsg(err, t('scheduling.errCreateSeries'))
      setWError(msg)
      toast.error(t('scheduling.toastWeeklyFailed'), msg)
    } finally {
      setWSaving(false)
    }
  }, [wGroup, wTeacher.id, wFrom, wStart, wEnd, wEndKind, wEndN, wEndDate, wConflicts, wOccurrences, wDay, wRoom, groups, onCreated, handleClose, t])

  // ── Temporary submit: exactly 1 session, never a series ──
  const handleTemporary = useCallback(async () => {
    const group = tGroup ? groups.find((x) => x.id === tGroup) : null
    const teacherId = tTeacher || group?.teacher_id || ''
    if (!teacherId) { setTError(t('scheduling.errPickTeacher')); return }
    if (!tDate) { setTError(t('scheduling.errDateRequired')); return }
    if (tEnd <= tStart) { setTError(t('scheduling.errEndAfterStart')); return }
    if (tConflicts.length > 0) {
      setTError(
        t('scheduling.errBlockedOn', {
          kinds: conflictKinds(t, tConflicts),
          date: tDate,
        }),
      )
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
      toast.success(
        t('scheduling.toastTemporaryTitle'),
        t('scheduling.toastTemporaryBody', {
          reason: t(REASON_KEYS[tReason] ?? 'scheduling.reasonExtra'),
        }),
      )
      onCreated?.()
      handleClose()
    } catch (err: any) {
      const msg = errMsg(err, t('scheduling.errCreateSession'))
      setTError(msg)
      toast.error(t('scheduling.toastTemporaryFailed'), msg)
    } finally {
      setTSaving(false)
    }
  }, [tGroup, groups, tTeacher, tDate, tStart, tEnd, tRoom, tReason, tConflicts, onCreated, handleClose, t])

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
            {t('scheduling.title')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] hover:text-[var(--text)] transition-colors"
            aria-label={t('common:action.close')}
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
                {t('scheduling.retry')}
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
                <span className="text-sm font-bold text-[var(--text)]">{t('scheduling.chooseWeekly')}</span>
                <span className="text-[11px] text-[var(--muted)] text-center">{t('scheduling.chooseWeeklyHint')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('temporary')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] px-4 py-6 hover:border-[var(--gold)]/40 transition-all"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                  <Clock3 size={18} />
                </span>
                <span className="text-sm font-bold text-[var(--text)]">{t('scheduling.chooseTemporary')}</span>
                <span className="text-[11px] text-[var(--muted)] text-center">{t('scheduling.chooseTemporaryHint')}</span>
              </button>
            </div>
          )}

          {mode === 'weekly' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('scheduling.group')}</label>
                <Select
                  value={wGroup}
                  onChange={setWGroup}
                  options={[
                    { value: '', label: t('scheduling.selectGroup') },
                    ...groups.map((g) => ({ value: g.id, label: `${g.name}${g.subject ? ` (${g.subject})` : ''}` })),
                  ]}
                  disabled={wSaving}
                  className={cn(inputCls, 'h-auto')}
                />
              </div>
              <div>
                <label className={labelCls}>{t('scheduling.teacherAuto')}</label>
                <input value={wTeacher.name} disabled className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{t('scheduling.day')}</label>
                  <Select
                    value={String(wDay)}
                    onChange={(v) => setWDay(Number(v))}
                    options={DAY_OPTIONS.map((d) => ({
                      value: String(d.value),
                      label: getDayName(addDays(WEEK_REFERENCE_SUNDAY, d.value), false),
                    }))}
                    disabled={wSaving}
                    className={cn(inputCls, 'h-auto')}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.start')}</label>
                  <TimePicker value={wStart} onChange={setWStart} disabled={wSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.end')}</label>
                  <TimePicker value={wEnd} onChange={setWEnd} disabled={wSaving} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('scheduling.room')}</label>
                  <Select
                    value={wRoom}
                    onChange={setWRoom}
                    options={[
                      { value: '', label: t('scheduling.noRoom') },
                      ...rooms.map((r) => ({ value: r.id, label: r.name })),
                    ]}
                    disabled={wSaving}
                    className={cn(inputCls, 'h-auto')}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.startsFrom')}</label>
                  <DayPicker value={wFrom} onChange={setWFrom} disabled={wSaving} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('scheduling.ends')}</label>
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
                      {k === 'never' ? t('scheduling.never') : k === 'after_n' ? t('scheduling.afterN') : t('scheduling.onDate')}
                    </button>
                  ))}
                </div>
                {wEndKind === 'after_n' && (
                  <input type="number" value={wEndN} onChange={(e) => setWEndN(Math.min(52, Math.max(1, Math.round(Number(e.target.value) || 8))))} min={1} max={52} disabled={wSaving} className={inputCls} />
                )}
                {wEndKind === 'on_date' && (
                  <DayPicker value={wEndDate} onChange={setWEndDate} disabled={wSaving} className={inputCls} />
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                {t('scheduling.occurrences', {
                  count: wOccurrences.length,
                  first:
                    wOccurrences.length > 0
                      ? t('scheduling.firstOccurrence', { date: wOccurrences[0] })
                      : '',
                })}
              </p>
              {wConflicts.length > 0 && (
                <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
                  {t('scheduling.blockedSubmit', {
                    kinds: conflictKinds(t, wConflicts),
                    date: wOccurrences[0],
                  })}
                </p>
              )}
              {wError && <p className="text-xs text-[var(--red)]">{wError}</p>}
              <button onClick={() => void handleWeekly()} disabled={wSaving || wConflicts.length > 0} className={primaryBtnCls}>
                {wSaving ? t('scheduling.creating') : t('scheduling.createWeekly')}
              </button>
              {/* Back in the reading direction: the arrow flips, the word does not. */}
              <button onClick={() => setMode('choose')} disabled={wSaving} className="w-full py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                <span className="inline-block rtl:rotate-180">←</span> {t('scheduling.back')}
              </button>
            </div>
          )}

          {mode === 'temporary' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('scheduling.linkToGroup')}</label>
                <Select
                  value={tGroup}
                  onChange={(v) => { setTGroup(v); setTError(null) }}
                  options={[
                    { value: '', label: t('scheduling.noGroup') },
                    ...groups.map((g) => ({ value: g.id, label: `${g.name}${g.subject ? ` (${g.subject})` : ''}` })),
                  ]}
                  disabled={tSaving}
                  className={cn(inputCls, 'h-auto')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('scheduling.teacher')}</label>
                  <Select
                    value={tTeacher}
                    onChange={setTTeacher}
                    options={[
                      { value: '', label: t('scheduling.select') },
                      ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
                    ]}
                    disabled={tSaving}
                    className={cn(inputCls, 'h-auto')}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.reason')}</label>
                  <Select
                    value={tReason}
                    onChange={(v) => setTReason(v as TempReason)}
                    options={TEMP_REASONS.map((r) => ({
                      value: r,
                      label: t(REASON_KEYS[r] ?? 'scheduling.reasonExtra'),
                    }))}
                    disabled={tSaving}
                    className={cn(inputCls, 'h-auto')}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('scheduling.date')}</label>
                <DayPicker value={tDate} onChange={setTDate} disabled={tSaving} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{t('scheduling.start')}</label>
                  <TimePicker value={tStart} onChange={setTStart} disabled={tSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.end')}</label>
                  <TimePicker value={tEnd} onChange={setTEnd} disabled={tSaving} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('scheduling.room')}</label>
                  <Select
                    value={tRoom}
                    onChange={setTRoom}
                    options={[
                      { value: '', label: t('common:dash') },
                      ...rooms.map((r) => ({ value: r.id, label: r.name })),
                    ]}
                    disabled={tSaving}
                    className={cn(inputCls, 'h-auto')}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted)]">{t('scheduling.temporaryHint')}</p>
              {tConflicts.length > 0 && (
                <p className="text-xs font-semibold text-[var(--red)] bg-[var(--red-soft)]/40 rounded-xl px-3 py-2">
                  {t('scheduling.blockedSubmit', {
                    kinds: conflictKinds(t, tConflicts),
                    date: tDate,
                  })}
                </p>
              )}
              {tError && <p className="text-xs text-[var(--red)]">{tError}</p>}
              <button onClick={() => void handleTemporary()} disabled={tSaving || tConflicts.length > 0} className={primaryBtnCls}>
                {tSaving ? t('scheduling.creating') : t('scheduling.createTemporary')}
              </button>
              {/* Back in the reading direction: the arrow flips, the word does not. */}
              <button onClick={() => setMode('choose')} disabled={tSaving} className="w-full py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                <span className="inline-block rtl:rotate-180">←</span> {t('scheduling.back')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SchedulingModal
