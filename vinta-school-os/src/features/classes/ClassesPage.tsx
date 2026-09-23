/**
 * Vinta School OS — Classes Page
 * Main page for managing course groups and physical rooms with tabs.
 */

import { useCallback, useState, useEffect } from 'react'
import { Plus, GraduationCap, X, DoorOpen, Trash2, MapPin, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { DayPicker } from '../../components/ui/DayPicker'
import { formatDa } from '../../lib/formatters'
import { SUBJECT_COLORS } from '../../lib/constants'
import ClassGrid from './ClassGrid'
import ClassCardMenu from './ClassCardMenu'
import ClassDetail from './ClassDetail'
import type { Class, Classroom, BillingModel } from '../../types/class'

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
  const [dedicatedTime, setDedicatedTime] = useState('')
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
          api.get('/teachers'),
          api.get('/subjects').catch(() => ({ data: { subjects: [] } })),
        ])
        if (!cancelled) {
          const list = teacherRes.data.teachers ?? teacherRes.data ?? []
          setTeachers(list.map((t: any) => ({ id: t.id, name: t.name })))
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
    setDedicatedTime('')
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
    if (!name.trim()) return
    // Day selection feeds the payload: weekly derives day_of_week from the
    // anchor day; temporary passes the exact one-off date.
    const anchorDow = dayAnchor ? new Date(`${dayAnchor}T12:00:00`).getDay() : undefined
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
      dedicated_time: dedicatedTime.trim() || undefined,
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
    name, subject, teacherId, capacity, color, notes, classType, dedicatedTime,
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
                <select value={subject} onChange={e => setSubject(e.target.value)} className={inputCls}>
                  {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Teacher */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Teacher</label>
                <select value={teacherId} onChange={e => setTeacherId(e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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

              {/* Dedicated Time */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Dedicated Time</label>
                <input
                  type="text"
                  value={dedicatedTime}
                  onChange={e => setDedicatedTime(e.target.value)}
                  placeholder="e.g. Mon/Wed 10:00-12:00"
                  className={inputCls}
                />
              </div>

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
                    <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={allowRollover}
                        onChange={e => setAllowRollover(e.target.checked)}
                        className="accent-[var(--gold)]"
                      />
                      Allow Rollover
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={allowMakeups}
                        onChange={e => setAllowMakeups(e.target.checked)}
                        className="accent-[var(--gold)]"
                      />
                      Allow Makeups
                    </label>
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

              <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  checked={enforceAttendance}
                  onChange={e => setEnforceAttendance(e.target.checked)}
                  className="accent-[var(--gold)]"
                />
                Enforce Attendance
              </label>

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
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
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
  onDelete: (id: string) => void
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
            onClick={() => onDelete(room.id)}
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

  /* ── Classrooms ── */
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false)

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

  /* ── Stats (course groups) ── */
  const stats = {
    total: classes.length,
    active: classes.filter(c => (c.enrolled_count ?? 0) > 0).length,
    full: classes.filter(c => (c.enrolled_count ?? 0) >= (c.capacity ?? 0)).length,
    empty: classes.filter(c => (c.enrolled_count ?? 0) === 0).length,
  }

  /* ── Handlers: Course Groups ── */
  const handleSelectClass = useCallback((cls: Class) => {
    setSelectedClass(prev => prev?.id === cls.id ? null : cls)
  }, [])

  const handleAddClass = useCallback(async (payload: any) => {
    try {
      const { data: newClass } = await api.post('/classes', payload)
      setClasses(prev => [...prev, newClass])
    } catch {
      const temp: Class = {
        id: `temp-${Date.now()}`, academy_id: '1',
        name: payload.name, subject: payload.subject ?? '', color: payload.color,
        capacity: payload.capacity, enrolled_count: 0, teacher_name: '',
        status: 'empty', schedules: [],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      setClasses(prev => [...prev, temp])
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

  const handleDeleteRoom = useCallback(async (id: string) => {
    try {
      await api.delete(`/classrooms/${id}`)
    } catch { /* optimistic removal */ }
    setClassrooms(prev => prev.filter(r => r.id !== id))
  }, [])

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
              onDelete={handleDeleteRoom}
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
    </div>
  )
}

export default ClassesPage
