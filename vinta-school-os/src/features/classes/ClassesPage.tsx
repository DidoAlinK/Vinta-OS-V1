/**
 * Vinta School OS — Classes Page
 * Main page for managing course groups and physical rooms with tabs.
 */

import { useCallback, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, GraduationCap, X, DoorOpen, Trash2, MapPin, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { classStateOf } from '../../lib/classState'
import api from '../../lib/api'
import { DayPicker } from '../../components/ui/DayPicker'
import { PinConfirmDialog } from '../../components/ui/PinConfirmDialog'
import { Select } from '../../components/ui/Select'
import { TimePicker } from '../../components/ui/TimePicker'
import { Toggle } from '../../components/ui/Toggle'
import { formatDa, formatDuration, getDayName } from '../../lib/formatters'
import { teacherSubjectOf } from '../../lib/teacherSubject'
import { toast, useUIStore } from '../../stores/uiStore'
import { SUBJECT_COLORS } from '../../lib/constants'
import ClassGrid from './ClassGrid'
import ClassCardMenu from './ClassCardMenu'
import ClassDetail from './ClassDetail'
import {
  type WeeklySlot,
  type WeeklyScheduleInput,
  WEEKLY_SLOT_LIMIT,
  blankSlot,
  slotFingerprint,
  toScheduleInput,
} from './classSlots'
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

/* ─── Color presets ───
   The eight labels are subject names — the same strings the school configures
   in Settings → Subjects and the same ones posted as `subject` — so they stay
   as they are. Only the surrounding chrome is translated. */
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
  /** The subject this teacher is registered for, when the profile names one. */
  subject?: string
}

/* ─── Weekly blocks ───
   One block of the weekly timetable: the weekday a group meets, and the hours.
   A group holds one or more of them — a class that meets twice a week has two —
   and each becomes its own Schedule row and therefore its own series of
   sessions. They are kept in a list rather than as "the first one plus extras"
   so that a mistake on the third block is refused exactly the way a mistake on
   the first one is. */
/* A weekly timetable is a list of blocks — see `classSlots.ts` for the shape,
   the weekday maths and the duplicate guard both forms share. */

/* ═══════════════════════════════════════════════════════
   Add Course Group Modal
   ═══════════════════════════════════════════════════════ */
function AddCourseGroupModal({
  isOpen, onClose, onAdd,
}: {
  isOpen: boolean; onClose: () => void
  onAdd: (data: any) => void
}) {
  const { t } = useTranslation('classes')
  // Basic fields
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<string>(SUBJECT_OPTIONS[0])
  const [teacherId, setTeacherId] = useState('')
  const [capacity, setCapacity] = useState(20)
  const [color, setColor] = useState(COLOR_PRESETS[0].color)
  const [notes, setNotes] = useState('')
  const [classType, setClassType] = useState<'weekly' | 'temporary'>('weekly')
  // The weekly timetable: one block to begin with, more when the group meets
  // more than once a week.
  const [slots, setSlots] = useState<WeeklySlot[]>(() => [blankSlot()])
  /** A key of this namespace plus its interpolation, not a sentence: the banner
      is read at render, so a refusal written in English mid-form follows a
      language switch — and `n` names which block is at fault once there are
      several of them. */
  const [error, setError] = useState<{ key: string; n?: number } | null>(null)
  // The one-off branch: the exact date, and the hours that session runs. A
  // temporary class has no weekly series, so its time lives here and not in
  // `slots`.
  const [tempDate, setTempDate] = useState('')
  const [tempStartTime, setTempStartTime] = useState('')
  const [tempEndTime, setTempEndTime] = useState('')

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
          setTeachers(list.map((tc: any) => ({
            id: tc.id,
            name: tc.full_name || [tc.first_name, tc.last_name].filter(Boolean).join(' ') || t('addGroup.unnamedTeacher'),
            subject: teacherSubjectOf(tc),
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
  }, [isOpen, t])

  const resetAll = useCallback(() => {
    setName('')
    setSubject(SUBJECT_OPTIONS[0])
    setTeacherId('')
    setCapacity(20)
    setColor(COLOR_PRESETS[0].color)
    setNotes('')
    setClassType('weekly')
    setSlots([blankSlot()])
    setError(null)
    setTempDate('')
    setTempStartTime('')
    setTempEndTime('')
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

  /**
   * Choosing a teacher also chooses the subject: a teacher teaches one subject,
   * and this group is a group of it. Only a subject the picker actually offers
   * is applied — `Select` matches its options strictly, so a value outside the
   * list would leave the field blank while the payload carried it.
   */
  const handleTeacherChange = useCallback((id: string) => {
    setTeacherId(id)
    const picked = teachers.find(t => t.id === id)
    if (picked?.subject && subjectOptions.includes(picked.subject)) {
      setSubject(picked.subject)
    }
  }, [teachers, subjectOptions])

  /** Update one weekly block in place. */
  const patchSlot = useCallback((id: string, patch: Partial<WeeklySlot>) => {
    setSlots(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const addSlot = useCallback(() => {
    setSlots(prev => (prev.length >= WEEKLY_SLOT_LIMIT ? prev : [...prev, blankSlot()]))
  }, [])

  /** Never empties the list: a weekly group with no block has no timetable. */
  const removeSlot = useCallback((id: string) => {
    setSlots(prev => (prev.length <= 1 ? prev : prev.filter(s => s.id !== id)))
  }, [])

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setError({ key: 'addGroup.error.name' })
      return
    }

    const weekly = classType === 'weekly'
    // A group with no time is a group that can never produce a session, which is
    // exactly the state every group created through this form used to end up in.
    // Refusing here is cheaper than a silent empty calendar — and now that a
    // group can hold several blocks, every one of them is checked *before* any
    // of them is sent, because the group itself is created first and cannot be
    // rolled back.
    if (weekly) {
      // A block is only worth naming when there is more than one to tell apart.
      const many = slots.length > 1
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]
        const n = i + 1
        if (!slot.startTime || !slot.endTime) {
          setError(many ? { key: 'addGroup.error.slotTimes', n } : { key: 'addGroup.error.times' })
          return
        }
        if (slot.endTime <= slot.startTime) {
          setError(many ? { key: 'addGroup.error.slotTimeOrder', n } : { key: 'addGroup.error.timeOrder' })
          return
        }
        if (!slot.dayAnchor) {
          setError(many ? { key: 'addGroup.error.slotDay', n } : { key: 'addGroup.error.day' })
          return
        }
      }
      // Two blocks on the same weekday at the same hours are one block written
      // twice. The server refuses the duplicate with a 409, but by then the group
      // already exists — so it is caught here, where nothing has been created yet.
      const seen = new Set<string>()
      for (const slot of slots) {
        const fingerprint = slotFingerprint(slot.dayAnchor, slot.startTime, slot.endTime)
        if (seen.has(fingerprint)) {
          setError({ key: 'addGroup.error.slotDuplicate' })
          return
        }
        seen.add(fingerprint)
      }
    } else {
      if (!tempStartTime || !tempEndTime) {
        setError({ key: 'addGroup.error.times' })
        return
      }
      if (tempEndTime <= tempStartTime) {
        setError({ key: 'addGroup.error.timeOrder' })
        return
      }
    }

    // Sessions carry a teacher (sessions.teacher_id is NOT NULL), so a weekly
    // group without one cannot have a calendar generated. Asking here keeps the
    // desk from filling in the whole form only to be refused at the last step.
    if (weekly && !teacherId) {
      setError({ key: 'addGroup.error.teacher' })
      return
    }
    if (!weekly && !tempDate) {
      setError({ key: 'addGroup.error.date' })
      return
    }

    setError(null)
    onAdd({
      payload: {
        name: name.trim(),
        subject,
        teacher_id: teacherId || undefined,
        capacity,
        color,
        notes: notes.trim() || undefined,
        class_type: classType,
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
      },
      // The timetable travels *beside* the group rather than inside it. `POST
      // /classes` ignores every scheduling key — carrying them in the body only
      // ever worked because there happened to be exactly one of them. The real
      // times are what `POST /classes/:id/schedules` consumes, one call per block.
      slots: weekly
        ? slots.map((slot): WeeklyScheduleInput => toScheduleInput(slot))
        : [],
      oneOff: weekly
        ? null
        : { date: tempDate, start_time: tempStartTime, end_time: tempEndTime },
    })
    resetAll()
    onClose()
  }, [
    name, subject, teacherId, capacity, color, notes, classType, slots,
    tempDate, tempStartTime, tempEndTime,
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
              {t('addGroup.title')}
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
              {t(error.key, { n: error.n })}
            </div>
          )}
          {/* ── Basic Info ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>{t('addGroup.section.basic')}</p>
            <div className="space-y-3">
              {/* Group Name */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.name')} <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('addGroup.namePlaceholder')} className={inputCls} />
              </div>

              {/* Subject */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.subject')}</label>
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
                  {t('addGroup.teacher')}
                  {/* Required only for a weekly group: a one-off session can be
                      created without one, but a series cannot. The mark sits at
                      the inline end of the label so it trails the word in
                      Arabic as well as in English. */}
                  {classType === 'weekly' && <span className="text-[var(--gold)] ms-0.5">*</span>}
                </label>
                <Select
                  value={teacherId}
                  onChange={handleTeacherChange}
                  options={[
                    { value: '', label: t('addGroup.teacherNone') },
                    ...teachers.map(tc => ({ value: tc.id, label: tc.name })),
                  ]}
                  className={cn(inputCls, 'h-auto')}
                />
              </div>

              {/* Capacity */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.capacity')}</label>
                <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={1} className={inputCls} />
              </div>

              {/* Class Type */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.classType')}</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
                  {(['weekly', 'temporary'] as const).map(ct => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setClassType(ct)}
                      className={cn(
                        'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                        classType === ct
                          ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                          : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                      )}
                    >
                      {ct === 'weekly' ? t('addGroup.classTypeWeekly') : t('addGroup.classTypeTemporary')}
                    </button>
                  ))}
                </div>
              </div>

              {/* The weekly blocks, or the one-off date.
                  Each weekly block is its own Schedule row and therefore its own
                  series of sessions, which is why a group meeting Monday and
                  Wednesday ends up with two independent calendars — exactly what
                  two separate POSTs to /classes/:id/schedules would produce. */}
              {classType === 'weekly' ? (
                <div className="space-y-4">
                  {slots.map((slot, index) => (
                    <div
                      key={slot.id}
                      className={cn(
                        'space-y-3',
                        // The frame only earns its place once there is more than
                        // one block, so the common single-session case looks
                        // exactly as it always did.
                        slots.length > 1
                          ? 'p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass)]'
                          : '',
                      )}
                    >
                      {slots.length > 1 && (
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--gold)' }}>
                            {t('addGroup.sessionBlock', { n: index + 1 })}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeSlot(slot.id)}
                            title={t('addGroup.removeSession')}
                            aria-label={t('addGroup.removeSession')}
                            className={cn(
                              'p-1 rounded-lg text-[var(--muted)]',
                              'hover:bg-[var(--red-soft)] hover:text-[var(--red)]',
                              'transition-colors duration-150',
                            )}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}

                      {/* Day selection — themed calendar popup (NOT a generic input) */}
                      <div>
                        <label className={labelCls} style={{ color: 'var(--muted)' }}>
                          {t('addGroup.meetingDay')}
                        </label>
                        <DayPicker
                          value={slot.dayAnchor}
                          onChange={v => patchSlot(slot.id, { dayAnchor: v })}
                          placeholder={t('addGroup.dayPlaceholder')}
                        />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                          {slot.dayAnchor
                            ? t('addGroup.repeatsEvery', { day: getDayName(new Date(`${slot.dayAnchor}T12:00:00`), false) })
                            : t('addGroup.dayHint')}
                        </p>
                      </div>

                      {/* Start / End At — two real times, not one free-text field.
                          The old "Dedicated Time" box asked for prose like
                          "Mon/Wed 10:00-12:00" and the server stored it as a
                          string on the group, so nothing could ever turn it into
                          a session. These two values are what
                          `POST /classes/:id/schedules` consumes. */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.startAt')}</label>
                          <TimePicker
                            value={slot.startTime}
                            onChange={v => patchSlot(slot.id, { startTime: v })}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.endAt')}</label>
                          <TimePicker
                            value={slot.endTime}
                            onChange={v => patchSlot(slot.id, { endTime: v })}
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                        {slot.startTime && slot.endTime && slot.endTime > slot.startTime
                          ? t('addGroup.durationSession', { duration: formatDuration(slot.startTime, slot.endTime) })
                          : t('addGroup.timeHint')}
                      </p>
                    </div>
                  ))}

                  {/* One block per weekday is the most a weekly timetable can
                      mean, and the button is what says so. */}
                  <div>
                    <button
                      type="button"
                      onClick={addSlot}
                      disabled={slots.length >= WEEKLY_SLOT_LIMIT}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold',
                        'bg-[var(--input-bg)] text-[var(--gold)] border border-[var(--glass-border)]',
                        'hover:bg-[var(--glass)] transition-colors duration-150',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      <Plus size={14} />
                      {t('addGroup.addSession')}
                    </button>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      {t('addGroup.addSessionHint')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={labelCls} style={{ color: 'var(--muted)' }}>
                      {t('addGroup.sessionDate')}
                    </label>
                    <DayPicker
                      value={tempDate}
                      onChange={setTempDate}
                      placeholder={t('addGroup.datePlaceholder')}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      {t('addGroup.oneOffHint')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.startAt')}</label>
                      <TimePicker
                        value={tempStartTime}
                        onChange={setTempStartTime}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.endAt')}</label>
                      <TimePicker
                        value={tempEndTime}
                        onChange={setTempEndTime}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    {tempStartTime && tempEndTime && tempEndTime > tempStartTime
                      ? t('addGroup.durationSession', { duration: formatDuration(tempStartTime, tempEndTime) })
                      : t('addGroup.timeHint')}
                  </p>
                </div>
              )}

              {/* Color */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.color')}</label>
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
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.notes')}</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t('addGroup.notesPlaceholder')}
                  rows={2}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
            </div>
          </div>

          {/* ── Academic / Group Info ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>{t('addGroup.section.academic')}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.level')}</label>
                  <input type="text" value={academicLevel} onChange={e => setAcademicLevel(e.target.value)} placeholder={t('addGroup.levelPlaceholder')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.groupName')}</label>
                  {/* "A" is the group's own letter, stored as `group_name` —
                      an example value, not a word of ours to translate. */}
                  <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="A" className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Billing Section ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>{t('addGroup.section.billing')}</p>
            <div className="space-y-3">
              {/* Billing model toggle. The two buttons are labelled from the
                  API's own enum — `CREDIT_BASED` never reaches the screen. */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.billing.model')}</label>
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
                      {m === 'CREDIT_BASED' ? t('addGroup.billing.creditBased') : t('addGroup.billing.timeBased')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.billing.price')}</label>
                <div className="relative">
                  <input
                    type="number"
                    value={priceDa || ''}
                    onChange={e => setPriceDa(Number(e.target.value))}
                    placeholder="0"
                    min={0}
                    className={cn(inputCls, 'pe-10')}
                  />
                  {/* Currency code, identical in every language — anchored to
                      the inline end so it stays beside the field in Arabic. */}
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--muted)]">DA</span>
                </div>
              </div>

              {/* Credit-based fields */}
              {billingModel === 'CREDIT_BASED' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.billing.creditsPerCycle')}</label>
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
                      <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.billing.cycleWeekLimit')}</label>
                      <input
                        type="number"
                        value={cycleWeekLimit}
                        onChange={e => setCycleWeekLimit(e.target.value)}
                        placeholder={t('addGroup.billing.optional')}
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
                        aria-label={t('addGroup.billing.allowRollover')}
                      />
                      {t('addGroup.billing.allowRollover')}
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <Toggle
                        checked={allowMakeups}
                        onCheckedChange={setAllowMakeups}
                        aria-label={t('addGroup.billing.allowMakeups')}
                      />
                      {t('addGroup.billing.allowMakeups')}
                    </div>
                  </div>
                </>
              )}

              {/* Time-based fields */}
              {billingModel === 'TIME_BASED' && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.billing.accessDuration')}</label>
                  <input
                    type="number"
                    value={accessDurationWeeks}
                    onChange={e => setAccessDurationWeeks(e.target.value)}
                    placeholder={t('addGroup.billing.optional')}
                    min={1}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Attendance ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--gold)' }}>{t('addGroup.section.attendance')}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addGroup.maxGroups')}</label>
                  <input type="number" value={maxGroupsIncluded} onChange={e => setMaxGroupsIncluded(Number(e.target.value))} min={1} className={inputCls} />
                </div>
                <div />
              </div>

              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                <Toggle
                  checked={enforceAttendance}
                  onCheckedChange={setEnforceAttendance}
                  aria-label={t('addGroup.enforceAttendance')}
                />
                {t('addGroup.enforceAttendance')}
              </div>

              {enforceAttendance && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    {t('addGroup.attendanceThreshold')} <span className="font-bold" style={{ color: 'var(--gold)' }}>{attendanceThreshold}%</span>
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
          <button onClick={resetAndClose} className={cancelBtnCls}>{t('common:action.cancel')}</button>
          {/* Deliberately not `disabled={!name.trim()}`: a dead button tells the
              desk nothing, and there are now five things this form needs. Every
              one of them is refused in the banner above with its own sentence. */}
          <button
            onClick={handleSubmit}
            className={submitBtnCls}
          >
            {t('addGroup.submit')}
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
  const { t } = useTranslation('classes')
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
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>{t('addRoom.title')}</h2>
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
            <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addRoom.name')} <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('addRoom.namePlaceholder')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>{t('addRoom.capacity')}</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={1} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={resetAndClose} className={cancelBtnCls}>{t('common:action.cancel')}</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={submitBtnCls}
          >
            {t('addRoom.submit')}
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
  const { t } = useTranslation('classes')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('rooms.loading')}</p>
      </div>
    )
  }

  if (classrooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--glass)' }}>
          <DoorOpen size={20} style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('rooms.emptyTitle')}</p>
        <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>{t('rooms.emptyBody')}</p>
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
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t('rooms.capacity', { capacity: room.capacity })}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onDelete(room)}
            title={t('rooms.deleteConfirm')}
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
  const { t } = useTranslation('classes')

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
     and the grid can never disagree.

     `empty` counts both empty states — the grey "nothing to teach" card and the
     red one, which is a class running with nobody in it or a group with
     students and no time at all. They share a word on the card, so they share a
     tile; the dots are what tell the two apart.

     "Full" is gone along with the state. A room at capacity is a number rather
     than a status, and counting it here is what used to make the tiles disagree
     with the cards: it was computed from `enrolled >= capacity`, which reads a
     group with no capacity set (0 >= 0) as a full room. */
  const stats = {
    total: classes.length,
    scheduled: classes.filter(c => classStateOf(c) === 'scheduled').length,
    active: classes.filter(c => classStateOf(c) === 'active').length,
    empty: classes.filter(c => {
      const state = classStateOf(c)
      return state === 'empty' || state === 'unattended'
    }).length,
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
   *
   * A group meeting more than once a week is the same call repeated — see the
   * loop below for why one block is worded exactly as it always was.
   */
  const handleAddClass = useCallback(async ({ payload, slots, oneOff }: {
    payload: any
    slots: WeeklyScheduleInput[]
    oneOff: { date: string; start_time: string; end_time: string } | null
  }) => {
    let newClass: Class
    try {
      const { data } = await api.post('/classes', payload)
      newClass = data
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        t('page.toast.createFallback')
      toast.error(t('page.toast.notCreated'), message)
      return
    }

    const created = newClass
    try {
      if (oneOff) {
        await api.post('/sessions', {
          class_id: created.id,
          date: oneOff.date,
          start_time: oneOff.start_time,
          end_time: oneOff.end_time,
        })
        toast.success(t('page.toast.created'), t('page.toast.createdOneOff', { name: payload.name }))
        return
      }

      // A group meeting twice a week is this same call, twice: the endpoint is
      // append-only and takes one slot per request, so N blocks become N rows in
      // `schedules` and N independent session series. The group itself was
      // created by the call above and cannot be rolled back, so a run that half
      // succeeds has to be reported as the count it is.
      const total = slots.length
      let placed = 0         // slots the server now holds, including ones it already had
      let made = 0           // sessions actually generated across those slots
      let duplicate = false  // a lone block still words 409 the way it always has
      let failure: string | null = null

      for (const slot of slots) {
        try {
          const { data } = await api.post(`/classes/${created.id}/schedules`, slot)
          made += data?.sessions_created ?? 0
          placed += 1
        } catch (err: any) {
          // 409 means this group already meets at exactly these hours — a
          // re-save, not a failure. The sessions are already on the calendar.
          if (err?.response?.status === 409) {
            placed += 1
            duplicate = true
            continue
          }
          failure = failure ?? (
            err?.response?.data?.error ?? t('page.toast.sessionsFailedFallback')
          )
        }
      }

      if (placed === total) {
        if (total === 1 && duplicate) {
          toast.success(t('page.toast.created'), t('page.toast.createdTimesExist', { name: payload.name }))
        } else {
          toast.success(
            t('page.toast.created'),
            made > 0
              ? t('page.toast.createdWithSessions', { name: payload.name, count: made })
              : t('page.toast.createdNoSessions', { name: payload.name }),
          )
        }
        return
      }

      // The group exists but only part of its timetable does. Say how much of it
      // landed rather than reporting a clean success or a blanket failure — the
      // desk can finish the job from the group's detail panel, but only if they
      // know there is a job left.
      if (placed === 0) {
        toast.error(t('page.toast.sessionsFailedTitle'), failure ?? t('page.toast.sessionsFailedFallback'))
      } else {
        toast.error(
          t('page.toast.sessionsPartial', { name: payload.name, done: placed, total }),
          failure ?? t('page.toast.sessionsFailedFallback'),
        )
      }
    } finally {
      // `POST /classes` answers with `{id, name, subject}` and nothing else — no
      // capacity, no enrolled_count, no status_color. Pushing that straight into
      // the grid put a card on the Classrooms tab that could not name its own
      // state: it printed "/ enrolled" and fell back to a guessed dot and label.
      // Ask the list again instead — it is the only shape that carries the
      // counts and the server's own dot, so the new group lands with its real
      // status — "Empty" in red when no time was set for it, since a group with
      // no slot can never run.
      await fetchClasses()
    }
  }, [fetchClasses, t])

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
      const msg = err?.response?.data?.error ?? t('page.toast.roomDeleteFailed')
      toast.error(t('page.toast.deleteFailed'), msg)
      throw new Error(msg)
    }
    setClassrooms(prev => prev.filter(r => r.id !== room.id))
    toast.success(t('page.toast.roomDeleted'), t('page.toast.roomDeletedBody', { name: room.name }))
  }, [roomToDelete, t])

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
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>{t('page.title')}</h1>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('page.subtitle')}</p>
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
            {activeTab === 'courses' ? t('page.addCourseGroup') : t('page.addRoom')}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 pb-4 shrink-0">
          <button
            onClick={() => setActiveTab('courses')}
            className={tabBtnCls(activeTab === 'courses')}
          >
            {t('page.tab.courses')}
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={tabBtnCls(activeTab === 'rooms')}
          >
            {t('page.tab.rooms')}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'courses' && (
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-6 pb-4 shrink-0">
              <StatChip label={t('common:label.total')} value={stats.total} color="var(--text)" />
              <StatChip label={t('page.stats.scheduled')} value={stats.scheduled} color="var(--gold)" />
              <StatChip label={t('page.stats.active')} value={stats.active} color="var(--emerald)" />
              <StatChip label={t('page.stats.empty')} value={stats.empty} color="var(--muted)" />
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
        title={t('rooms.deleteTitle')}
        confirmLabel={t('rooms.deleteConfirm')}
        // The room's name is the subject of the sentence in every language, so
        // it stays outside the translated tail rather than inside a string
        // that would have to be re-ordered for Arabic.
        message={
          roomToDelete ? (
            <>
              <strong className="font-semibold">{roomToDelete.name}</strong>{' '}
              {t('rooms.deleteBody')}
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
