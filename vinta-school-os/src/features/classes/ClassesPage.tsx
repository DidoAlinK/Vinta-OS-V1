/**
 * Vinta School OS — Classes Page
 * Main page for managing course groups and physical rooms with tabs.
 */

import { useCallback, useState, useEffect } from 'react'
import { Plus, GraduationCap, X, DoorOpen, Trash2, MapPin, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { classStateOf } from '../../lib/classState'
import api from '../../lib/api'
import { DayPicker } from '../../components/ui/DayPicker'
import { PinConfirmDialog } from '../../components/ui/PinConfirmDialog'
import { Select } from '../../components/ui/Select'
import { TimePicker } from '../../components/ui/TimePicker'
import { Toggle } from '../../components/ui/Toggle'
import { formatDa, formatDuration } from '../../lib/formatters'
import { toast, useUIStore } from '../../stores/uiStore'
import { SUBJECT_COLORS } from '../../lib/constants'
import ClassGrid from './ClassGrid'
import ClassCardMenu from './ClassCardMenu'
import ClassDetail from './ClassDetail'
import SessionCheckInModal from '../calendar/SessionCheckInModal'
import type { Class, Classroom, BillingModel, Session } from '../../types/class'

/* ─── Stat chip ─── */
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

/* ─── Shared input classes ─── */
const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)

const labelCls = 'block text-xs font-medium mb-1.5'

const cancelBtnCls = cn(
  'flex-1 py-2.5 rounded-xl text-sm font-medium',
  'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
  'hover:bg-[var(--glass)] transition-colors duration-150',
)

const submitBtnCls = cn(
  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white',
  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
  'hover:opacity-90 active:scale-[0.98]',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-all duration-150',
)

/* ─── Color presets ─── */
const COLOR_PRESETS = [
  { color: '#b3872a', label: 'Math' },
  { color: '#7c3aed', label: 'French' },
  { color: '#0ea5e9', label: 'English' },
  { color: '#0f6b4d', label: 'Science' },
  { color: '#ea580c', label: 'History' },
  { color: '#10b981', label: 'PE' },
  { color: '#db2777', label: 'Art' },
  { color: '#6366f1', label: 'Music' },
]

const SUBJECT_OPTIONS = ['Math', 'French', 'English', 'Science', 'History', 'PE', 'Art', 'Music'] as const

/* ─── Tab type ─── */
type Tab = 'courses' | 'rooms'

/* ─── Teacher (lightweight) ─── */
interface TeacherOption {
  id: string
  name: string
}

/* ═══════════════════════════════════════════════════════
   Add Course Group Modal
   ═══════════════════════════════════════════════════════ */
function AddCourseGroupModal({
  isOpen, onClose, onAdd,
}: {
  isOpen: boolean; onClose: () => void
  onAdd: (data: any) => void
}) {
  // Basic fields
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<string>(SUBJECT_OPTIONS[0])
  const [teacherId, setTeacherId] = useState('')
  const [capacity, setCapacity] = useState(20)
  const [color, setColor] = useState(COLOR_PRESETS[0].color)
  const [notes, setNotes] = useState('')
  const [classType, setClassType] = useState<'weekly' | 'temporary'>('weekly')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Themed day selection (DayPicker popup): weekly = weekday anchor,
  // temporary = exact one-off date.
  const [dayAnchor, setDayAnchor] = useState('')
  const [tempDate, setTempDate] = useState('')

  // Billing fields
  const [academicLevel, setAcademicLevel] = useState('')
  const [groupName, setGroupName] = useState('A')
  const [billingModel, setBillingModel] = useState<BillingModel>('CREDIT_BASED')
  const [priceDa, setPriceDa] = useState(0)
  const [creditsPerCycle, setCreditsPerCycle] = useState(4)
  const [cycleWeekLimit, setCycleWeekLimit] = useState('')
  const [allowRollover, setAllowRollover] = useState(false)
  const [allowMakeups, setAllowMakeups] = useState(true)
  const [accessDurationWeeks, setAccessDurationWeeks] = useState('')
  const [maxGroupsIncluded, setMaxGroupsIncluded] = useState(1)
  const [enforceAttendance, setEnforceAttendance] = useState(false)
  const [attendanceThreshold, setAttendanceThreshold] = useState(75)

  // Teachers
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [subjectOptions, setSubjectOptions] = useState<string[]>([...SUBJECT_OPTIONS])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function load() {
      try {
        const [teacherRes, subjectRes] = await Promise.all([
          // ?status=ACTIVE: an INACTIVE teacher stays on the roster and on past
          // sessions, but must not be pickable for a class that has not run yet.
          api.get('/teachers', { params: { status: 'ACTIVE' } }),
          api.get('/subjects').catch(() => ({ data: { subjects: [] } })),
        ])
        if (!cancelled) {
          const list = teacherRes.data.teachers ?? teacherRes.data ?? []
          // The API sends `full_name`; reading `name` off it left every option
          // in this dropdown blank, so the desk was choosing between three
          // identical empty rows.
          setTeachers(list.map((t: any) => ({
            id: t.id,
            name: t.full_name || [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unnamed teacher',
          })))
          const subs = subjectRes.data.subjects ?? []
          if (subs.length > 0) {
            setSubjectOptions(subs.map((s: any) => s.name))
          }
        }
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen])

  const resetAll = useCallback(() => {
    setName('')
    setSubject(SUBJECT_OPTIONS[0])
    setTeacherId('')
    setCapacity(20)
    setColor(COLOR_PRESETS[0].color)
    setNotes('')
    setClassType('weekly')
    setStartTime('')
    setEndTime('')
    setError(null)
    setDayAnchor('')
    setTempDate('')
    setAcademicLevel('')
    setGroupName('A')
    setBillingModel('CREDIT_BASED')
    setPriceDa(0)
    setCreditsPerCycle(4)
    setCycleWeekLimit('')
    setAllowRollover(false)
    setAllowMakeups(true)
    setAccessDurationWeeks('')
    setMaxGroupsIncluded(1)
    setEnforceAttendance(false)
    setAttendanceThreshold(75)
  }, [])

  const resetAndClose = useCallback(() => {
    resetAll()
    onClose()
  }, [onClose, resetAll])

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setError('Give the group a name.')
      return
    }
    // A group with no time is a group that can never produce a session, which
    // is exactly the state every group created through this form used to end
    // up in. Refusing here is cheaper than a silent empty calendar.
    if (!startTime || !endTime) {
      setError('Set when the class starts and ends.')
      return
    }
    if (endTime <= startTime) {
      setError('End At must be after Start At.')
      return
    }
    if (classType === 'weekly' && !dayAnchor) {
      setError('Pick the day this group meets each week.')
      return
    }
    // Sessions carry a teacher (sessions.teacher_id is NOT NULL), so a weekly
    // group without one cannot have a calendar generated. Asking here keeps the
    // desk from filling in the whole form only to be refused at the last step.
    if (classType === 'weekly' && !teacherId) {
      setError('Pick a teacher — a weekly group needs one before its sessions can be created.')
      return
    }
    if (classType === 'temporary' && !tempDate) {
      setError('Pick the date for this one-off session.')
      return
    }

    // Day selection feeds the payload: weekly derives day_of_week from the
    // anchor day; temporary passes the exact one-off date.
    const anchorDow = dayAnchor ? new Date(`${dayAnchor}T12:00:00`).getDay() : undefined
    setError(null)
    onAdd({
      name: name.trim(),
      subject,
      teacher_id: teacherId || undefined,
      capacity,
      color,
      notes: notes.trim() || undefined,
      class_type: classType,
      day_of_week: classType === 'weekly' && anchorDow != null && !Number.isNaN(anchorDow) ? anchorDow : undefined,
      session_date: classType === 'temporary' && tempDate ? tempDate : undefined,
      // The real times. `dedicated_time` is gone from this payload: it was
      // never a time, only a sentence about one, and the server stored the
      // sentence.
      start_time: startTime,
      end_time: endTime,
      academic_level: academicLevel.trim() || undefined,
      group_name: groupName.trim() || 'A',
      billing_model: billingModel,
      price_da: priceDa || undefined,
      credits_per_cycle: billingModel === 'CREDIT_BASED' ? creditsPerCycle : undefined,
      cycle_week_limit: billingModel === 'CREDIT_BASED' && cycleWeekLimit ? Number(cycleWeekLimit) : undefined,
      allow_rollover: billingModel === 'CREDIT_BASED' ? allowRollover : undefined,
      allow_makeups: billingModel === 'CREDIT_BASED' ? allowMakeups : undefined,
      access_duration_weeks: billingModel === 'TIME_BASED' && accessDurationWeeks ? Number(accessDurationWeeks) : undefined,
      max_groups_included: maxGroupsIncluded,
      enforce_attendance: enforceAttendance,
      attendance_threshold: enforceAttendance ? attendanceThreshold : undefined,
    })
    resetAll()
    onClose()
  }, [
    name, subject, teacherId, capacity, color, notes, classType, startTime, endTime,
    dayAnchor, tempDate,
    academicLevel, groupName, billingModel, priceDa,
    creditsPerCycle, cycleWeekLimit, allowRollover, allowMakeups,
    accessDurationWeeks, maxGroupsIncluded, enforceAttendance, attendanceThreshold,
    onAdd, resetAll, onClose,
  ])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) resetAndClose() }}
    >
      <div
        className={cn(
          'w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 sticky top-0 bg-[var(--card-bg)] pb-2 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gold-soft)' }}>
              <GraduationCap size={16} style={{ color: 'var(--gold)' }} />
            </div>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>
              Add Course Group
            </h2>
          </div>
          <button
            onClick={resetAndClose}
            className={cn(
              'p-1.5 rounded-lg text-[var(--muted)]',
              'hover:bg-[var(--glass)] hover:text-[var(--text)]',
              'transition-colors duration-150',
            )}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Refusals sit above the fold. Every one of them used to be a
              silent no-op: the Create button did nothing and said nothing. */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[var(--red-soft)] text-[var(--red)] text-xs font-medium">
              {error}
            </div>
          )}
          {/* ── Basic Info ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>Basic Info</p>
            <div className="space-y-3">
              {/* Group Name */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Group Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Math — CM2" className={inputCls} />
              </div>

              {/* Subject */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Subject</label>
                <Select
                  value={subject}
                  onChange={setSubject}
                  options={subjectOptions.map(s => ({ value: s, label: s }))}
                  className={cn(inputCls, 'h-auto')}
                />
              </div>

              {/* Teacher */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Teacher
                  {/* Required only for a weekly group: a one-off session can be
                      created without one, but a series cannot. */}
                  {classType === 'weekly' && <span className="text-[var(--gold)] ml-0.5">*</span>}
                </label>
                <Select
                  value={teacherId}
                  onChange={setTeacherId}
                  options={[
                    { value: '', label: '— None —' },
                    ...teachers.map(t => ({ value: t.id, label: t.name })),
                  ]}
                  className={cn(inputCls, 'h-auto')}
                />
              </div>

              {/* Capacity */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Capacity</label>
                <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={1} className={inputCls} />
              </div>

              {/* Class Type */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Class Type</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
                  {(['weekly', 'temporary'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setClassType(t)}
                      className={cn(
                        'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                        classType === t
                          ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                      )}
                    >
                      {t === 'weekly' ? 'Weekly' : 'Temporary'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selection — themed calendar popup (NOT a generic input) */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  {classType === 'weekly' ? 'Meeting Day' : 'Session Date'}
                </label>
                {classType === 'weekly' ? (
                  <>
                    <DayPicker
                      value={dayAnchor}
                      onChange={setDayAnchor}
                      placeholder="Pick the weekly day…"
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      {dayAnchor
                        ? `Repeats every ${new Date(`${dayAnchor}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}`
                        : 'The weekday anchors the weekly series.'}
                    </p>
                  </>
                ) : (
                  <>
                    <DayPicker
                      value={tempDate}
                      onChange={setTempDate}
                      placeholder="Pick the one-off date…"
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      One session only — never spawns a series.
                    </p>
                  </>
                )}
              </div>

              {/* Start / End At — two real times, not one free-text field.
                  The old "Dedicated Time" box asked for prose like
                  "Mon/Wed 10:00-12:00" and the server stored it as a string on
                  the group, so nothing could ever turn it into a session. These
                  two values are what `POST /classes/:id/schedules` consumes. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>Start At</label>
                  <TimePicker
                    value={startTime}
                    onChange={setStartTime}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>End At</label>
                  <TimePicker
                    value={endTime}
                    onChange={setEndTime}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-[10px] -mt-2" style={{ color: 'var(--muted)' }}>
                {startTime && endTime && endTime > startTime
                  ? `A ${formatDuration(startTime, endTime)} session.`
                  : 'The class runs from Start At to End At.'}
              </p>

              {/* Color */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(p => (
                    <button
                      key={p.color}
                      type="button"
                      onClick={() => setColor(p.color)}
                      title={p.label}
                      className={cn(
                        'w-8 h-8 rounded-lg transition-all duration-150',
                        'hover:scale-110',
                        color === p.color ? 'ring-2 ring-offset-2' : '',
                      )}
                      style={{
                        backgroundColor: p.color,
                        ...(color === p.color ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${p.color}` } : {}),
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional notes…"
                  rows={2}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
            </div>
          </div>

          {/* ── Academic / Group Info ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>Academic</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>Academic Level</label>
                  <input type="text" value={academicLevel} onChange={e => setAcademicLevel(e.target.value)} placeholder="e.g. CM2" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>Group Name</label>
                  <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="A" className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Billing Section ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>Billing</p>
            <div className="space-y-3">
              {/* Billing model toggle */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Billing Model</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
                  {(['CREDIT_BASED', 'TIME_BASED'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBillingModel(m)}
                      className={cn(
                        'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                        billingModel === m
                          ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                      )}
                    >
                      {m === 'CREDIT_BASED' ? 'Credit-Based' : 'Time-Based'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Price (DA)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={priceDa || ''}
                    onChange={e => setPriceDa(Number(e.target.value))}
                    placeholder="0"
                    min={0}
                    className={cn(inputCls, 'pr-10')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--muted)]">DA</span>
                </div>
              </div>

              {/* Credit-based fields */}
              {billingModel === 'CREDIT_BASED' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>Credits / Cycle (N · 1–20)</label>
                      <input
                        type="number"
                        value={creditsPerCycle}
                        onChange={e => {
                          const v = Math.round(Number(e.target.value))
                          setCreditsPerCycle(Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 4)
                        }}
                        min={1}
                        max={20}
                        step={1}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>Cycle Week Limit</label>
                      <input
                        type="number"
                        value={cycleWeekLimit}
                        onChange={e => setCycleWeekLimit(e.target.value)}
                        placeholder="Optional"
                        min={0}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <Toggle
                        checked={allowRollover}
                        onCheckedChange={setAllowRollover}
                        aria-label="Allow Rollover"
                      />
                      Allow Rollover
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <Toggle
                        checked={allowMakeups}
                        onCheckedChange={setAllowMakeups}
                        aria-label="Allow Makeups"
                      />
                      Allow Makeups
                    </div>
                  </div>
                </>
              )}

              {/* Time-based fields */}
              {billingModel === 'TIME_BASED' && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>Access Duration (weeks)</label>
                  <input
                    type="number"
                    value={accessDurationWeeks}
                    onChange={e => setAccessDurationWeeks(e.target.value)}
                    placeholder="Optional"
                    min={1}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Attendance ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>Attendance</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>Max Groups Included</label>
                  <input type="number" value={maxGroupsIncluded} onChange={e => setMaxGroupsIncluded(Number(e.target.value))} min={1} className={inputCls} />
                </div>
                <div />
              </div>

              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                <Toggle
                  checked={enforceAttendance}
                  onCheckedChange={setEnforceAttendance}
                  aria-label="Enforce Attendance"
                />
                Enforce Attendance
              </div>

              {enforceAttendance && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Attendance Threshold: <span className="font-bold" style={{ color: 'var(--gold)' }}>{attendanceThreshold}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={attendanceThreshold}
                    onChange={e => setAttendanceThreshold(Number(e.target.value))}
                    className="w-full accent-[var(--gold)]"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 sticky bottom-0 bg-[var(--card-bg)] pt-3">
          <button onClick={resetAndClose} className={cancelBtnCls}>Cancel</button>
          {/* Deliberately not `disabled={!name.trim()}`: a dead button tells the
              desk nothing, and there are now five things this form needs. Every
              one of them is refused in the banner above with its own sentence. */}
          <button
            onClick={handleSubmit}
            className={submitBtnCls}
          >
            Add Course Group
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Add Classroom Modal
   ═══════════════════════════════════════════════════════ */
function AddClassroomModal({
  isOpen, onClose, onAdd,
}: {
  isOpen: boolean; onClose: () => void
  onAdd: (data: { name: string; capacity: number }) => void
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(20)

  const resetAndClose = useCallback(() => {
    setName('')
    setCapacity(20)
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return
    onAdd({ name: name.trim(), capacity })
    resetAndClose()
  }, [name, capacity, onAdd, resetAndClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) resetAndClose() }}
    >
      <div
        className={cn(
          'w-full max-w-sm mx-4 p-6 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gold-soft)' }}>
              <DoorOpen size={16} style={{ color: 'var(--gold)' }} />
            </div>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>Add Classroom</h2>
          </div>
          <button
            onClick={resetAndClose}
            className={cn(
              'p-1.5 rounded-lg text-[var(--muted)]',
              'hover:bg-[var(--glass)] hover:text-[var(--text)]',
              'transition-colors duration-150',
            )}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Room Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hall A" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Capacity</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={1} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={resetAndClose} className={cancelBtnCls}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={submitBtnCls}
          >
            Add Classroom
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Classroom List
   ═══════════════════════════════════════════════════════ */
function ClassroomList({
  classrooms,
  isLoading,
  onDelete,
}: {
  classrooms: Classroom[]
  isLoading: boolean
  onDelete: (room: Classroom) => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading rooms…</p>
      </div>
    )
  }

  if (classrooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--glass)' }}>
          <DoorOpen size={20} style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No physical rooms yet</p>
        <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>Add a classroom to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {classrooms.map(room => (
        <div
          key={room.id}
          className={cn(
            'flex items-center justify-between gap-4 px-4 py-3 rounded-xl',
            'bg-[var(--glass)] border border-[var(--glass-border)]',
            'hover:bg-[var(--glass-border)] transition-colors duration-150',
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--gold-soft)' }}
            >
              <MapPin size={16} style={{ color: 'var(--gold)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{room.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Users size={11} style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Cap. {room.capacity}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onDelete(room)}
            title="Delete room"
            className={cn(
              'p-2 rounded-lg shrink-0',
              'text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10',
              'transition-colors duration-150',
            )}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */
export function ClassesPage() {
  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<Tab>('courses')

  /* ── Course Groups ── */
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [isClassLoading, setIsClassLoading] = useState(true)
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false)
  /**
   * The live class whose attendance register is open, if any.
   *
   * Held here rather than on the card that opened it, and that is not a style
   * preference: `fetchClasses` below flips `isClassLoading`, and ClassGrid
   * answers that by rendering skeletons in place of every card. Whatever the
   * card was holding goes with it. Starting a class reloads the list by
   * design, so a register owned by the card was torn down in the same breath
   * as it was opened — the toast said "Register opened" and no register
   * appeared. The page outlives its own loading state; the card does not.
   */
  const [registerFor, setRegisterFor] = useState<Session | null>(null)

  /* ── Classrooms ── */
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false)
  /** The room whose trash icon was pressed — the PIN dialog is gated on it. */
  const [roomToDelete, setRoomToDelete] = useState<Classroom | null>(null)

  /* ── Arriving from the global search ──
     The search hands the record over and navigates; this is where it lands.
     Cleared synchronously, before anything else, so a React double-invoke in
     development cannot open the same group twice. */
  const focusTarget = useUIStore((s) => s.focusTarget)
  const clearFocusTarget = useUIStore((s) => s.clearFocusTarget)

  useEffect(() => {
    if (focusTarget?.kind !== 'class') return
    clearFocusTarget()
    // A group lives on the courses tab; landing on rooms and opening nothing
    // would look like the search had done nothing.
    setActiveTab('courses')
    setSelectedClass(focusTarget.cls)
  }, [focusTarget, clearFocusTarget])

  /* ── Fetch classes ── */
  const fetchClasses = useCallback(async () => {
    setIsClassLoading(true)
    try {
      const { data } = await api.get('/classes')
      setClasses(data.classes ?? data ?? [])
    } catch { /* backend unavailable */ }
    finally { setIsClassLoading(false) }
  }, [])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  /* ── Fetch classrooms ── */
  const fetchClassrooms = useCallback(async () => {
    setIsRoomLoading(true)
    try {
      const { data } = await api.get('/classrooms')
      setClassrooms(data.classrooms ?? data ?? [])
    } catch { /* backend unavailable */ }
    finally { setIsRoomLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === 'rooms') fetchClassrooms()
  }, [activeTab, fetchClassrooms])

  /* ── Stats (course groups) ──
     Counted by the same states the cards show, from `classStateOf`, so the tiles
     and the grid can never disagree. `full` used to be a bare
     `enrolled >= capacity`, which counts a group with no capacity set (0 >= 0)
     as a full room — the same reading of 0 that the enrollment check had.

     `unscheduled` is counted here for the same reason: it is now one of the
     states a card can wear, so leaving it out of the tiles would make the three
     numbers stop adding up to Total and hide the groups that need a time. */
  const stats = {
    total: classes.length,
    active: classes.filter(c => classStateOf(c) === 'active').length,
    full: classes.filter(c => classStateOf(c) === 'full').length,
    empty: classes.filter(c => classStateOf(c) === 'empty').length,
    unscheduled: classes.filter(c => classStateOf(c) === 'unscheduled').length,
  }

  /* ── Handlers: Course Groups ── */
  const handleSelectClass = useCallback((cls: Class) => {
    setSelectedClass(prev => prev?.id === cls.id ? null : cls)
  }, [])

  /**
   * Create the group, then give it its time.
   *
   * Two calls, in this order, because creating a group and defining when it
   * meets are two different resources — `/classes/:id/schedules` is what owns
   * `generate_sessions_from_schedule`, and duplicating that here would make
   * two places responsible for producing sessions.
   *
   * Without the second call the group exists but its calendar is permanently
   * empty, which is how every group made through this form used to end up:
   * `POST /classes` stores no schedule and ignores `day_of_week` entirely.
   */
  const handleAddClass = useCallback(async (payload: any) => {
    let newClass: Class
    try {
      const { data } = await api.post('/classes', payload)
      newClass = data
      setClasses(prev => [...prev, data])
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        'Could not create the group. Please try again.'
      toast.error('Group not created', message)
      return
    }

    const created = newClass
    const { class_type, day_of_week, session_date, start_time, end_time } = payload
    try {
      if (class_type === 'weekly') {
        const { data } = await api.post(`/classes/${created.id}/schedules`, {
          day_of_week,
          start_time,
          end_time,
        })
        const made = data?.sessions_created ?? 0
        toast.success(
          'Group created',
          made > 0
            ? `${payload.name} added, with ${made} sessions on the calendar.`
            : `${payload.name} added. No sessions were generated — check the times.`,
        )
      } else {
        await api.post('/sessions', {
          class_id: created.id,
          date: session_date,
          start_time,
          end_time,
        })
        toast.success('Group created', `${payload.name} added, with its one-off session.`)
      }
    } catch (err: any) {
      // 409 means this group already meets at exactly these hours — a re-save,
      // not a failure. The sessions are already on the calendar.
      if (err?.response?.status === 409) {
        toast.success('Group created', `${payload.name} added. Its times were already set.`)
        return
      }
      // Otherwise the group exists but has no calendar. Say so plainly rather
      // than reporting a clean success — the desk can add the time from the
      // group's detail panel, but only if they know it is missing.
      const message =
        err?.response?.data?.error ??
        'The group was created but its sessions were not. Set the times from the group panel.'
      toast.error('Sessions not generated', message)
    }
  }, [])

  const handleDeleteClass = useCallback((id: string) => {
    setClasses(prev => prev.filter(c => c.id !== id))
    setSelectedClass(null)
  }, [])

  /* ── Handlers: Classrooms ── */
  const handleAddRoom = useCallback(async (data: { name: string; capacity: number }) => {
    try {
      const { data: newRoom } = await api.post('/classrooms', data)
      setClassrooms(prev => [...prev, newRoom])
    } catch {
      const temp: Classroom = {
        id: `temp-${Date.now()}`, academy_id: '1',
        name: data.name, capacity: data.capacity,
        created_at: new Date().toISOString(),
      }
      setClassrooms(prev => [...prev, temp])
    }
  }, [])

  /**
   * Delete a room, after the PIN.
   *
   * The room is removed from the list only once the server has agreed. It used
   * to be dropped either way: the failed request was swallowed and the row was
   * filtered out anyway, so the room disappeared from the screen while still
   * existing, and came back on the next visit to the tab.
   */
  const handleDeleteRoom = useCallback(async () => {
    const room = roomToDelete
    if (!room) return
    try {
      await api.delete(`/classrooms/${room.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'The room was not deleted. Press Retry.'
      toast.error('Delete failed', msg)
      throw new Error(msg)
    }
    setClassrooms(prev => prev.filter(r => r.id !== room.id))
    toast.success('Room deleted', `"${room.name}" has been removed.`)
  }, [roomToDelete])

  const tabBtnCls = (active: boolean) => cn(
    'px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-150',
    active
      ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white shadow-lg'
      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)]',
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
              <GraduationCap size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>Classrooms</h1>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Manage course groups and physical rooms</p>
            </div>
          </div>
          <button
            onClick={() => activeTab === 'courses' ? setIsAddGroupModalOpen(true) : setIsAddRoomModalOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white',
              'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
              'hover:opacity-90 active:scale-[0.98]',
              'transition-all duration-150',
            )}
          >
            <Plus size={16} />
            {activeTab === 'courses' ? 'Add Course Group' : 'Add Room'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 pb-4 shrink-0">
          <button
            onClick={() => setActiveTab('courses')}
            className={tabBtnCls(activeTab === 'courses')}
          >
            Course Groups
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={tabBtnCls(activeTab === 'rooms')}
          >
            Physical Rooms
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'courses' && (
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-6 pb-4 shrink-0">
              <StatChip label="Total" value={stats.total} color="var(--text)" />
              <StatChip label="Active" value={stats.active} color="var(--emerald)" />
              <StatChip label="Full" value={stats.full} color="var(--red)" />
              {/* Only when there are any. A permanent "No schedule 0" tile would
                  be one more number the desk learns to stop reading — the chip
                  is here to say a group needs a time, and it has nothing to say
                  when none does. The card's amber dot carries the same fact
                  either way, so nothing is hidden by the chip's absence. */}
              {stats.unscheduled > 0 && (
                <StatChip label="No schedule" value={stats.unscheduled} color="var(--gold)" />
              )}
              <StatChip label="Empty" value={stats.empty} color="var(--muted)" />
            </div>

            {/* Class Grid */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <ClassGrid
                classes={classes}
                onSelect={handleSelectClass}
                isLoading={isClassLoading}
                // Each card's ☰ resolves its own group's next session and hosts
                // the session menu there — the Classrooms tab had no burger
                // because nothing in this tab is a session. "Open the group" is
                // the fallback when a group has nothing scheduled to act on.
                cardMenu={(cls) => (
                  <ClassCardMenu
                    cls={cls}
                    onChanged={fetchClasses}
                    onOpenGroup={() => handleSelectClass(cls)}
                    onOpenRegister={setRegisterFor}
                  />
                )}
              />
            </div>
          </>
        )}

        {activeTab === 'rooms' && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <ClassroomList
              classrooms={classrooms}
              isLoading={isRoomLoading}
              onDelete={setRoomToDelete}
            />
          </div>
        )}
      </div>

      {/* Class Detail sidebar */}
      <ClassDetail
        cls={selectedClass}
        isOpen={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        onDelete={handleDeleteClass}
        onUpdated={fetchClasses}
      />

      {/* Modals */}
      <AddCourseGroupModal isOpen={isAddGroupModalOpen} onClose={() => setIsAddGroupModalOpen(false)} onAdd={handleAddClass} />
      <AddClassroomModal isOpen={isAddRoomModalOpen} onClose={() => setIsAddRoomModalOpen(false)} onAdd={handleAddRoom} />

      {/* Deleting a room is the one action on this page with no undo, and the
          trash icon sits a few pixels from a row that is otherwise inert. */}
      <PinConfirmDialog
        open={!!roomToDelete}
        onClose={() => setRoomToDelete(null)}
        title="Delete this room?"
        confirmLabel="Delete room"
        message={
          roomToDelete ? (
            <>
              <strong className="font-semibold">{roomToDelete.name}</strong> will be removed
              from the list of physical rooms. Sessions already placed in it keep their
              history.
            </>
          ) : null
        }
        onConfirm={handleDeleteRoom}
      />

      {/* The attendance register — the false-until-true grid the Dashboard opens
          on Start. Same component, same session, one register with two doors:
          a group started from its card's ☰ now reaches the roll call from the
          card it was started on, and still reaches it later in the lesson from
          "Log Students Present" in that same menu. */}
      <SessionCheckInModal
        isOpen={!!registerFor}
        session={registerFor}
        onClose={() => setRegisterFor(null)}
        onSuccess={() => {
          setRegisterFor(null)
          void fetchClasses()
        }}
      />
    </div>
  )
}

export default ClassesPage
