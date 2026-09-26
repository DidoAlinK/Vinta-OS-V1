/**
 * Vinta School OS — Class (Course Group) form primitives
 *
 * The course-group form now exists in two places: the "Add Course Group" modal
 * on the Classrooms page, and the inline creator the session flows open from
 * their group picker. Both must post the *same* body — a class created from the
 * Calendar with a field missing would bill differently from one created in
 * Classrooms, and nothing downstream would say so.
 *
 * So the money fields, the colour palette, the defaults and the payload shape
 * live here, once. `buildClassPayload` is the single definition of what a class
 * creation request looks like; `ClassBillingFields` is the single rendering of
 * the billing model, so the two forms cannot drift apart.
 */

import { Toggle } from '../../components/ui/Toggle'
import { cn } from '../../lib/cn'
import type { BillingModel } from '../../types/class'

/* ─── Shared field styling ─── */

export const classInputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'text-[var(--text)] outline-none',
  'focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)

export const classLabelCls = 'block text-xs font-medium mb-1.5'

export const classCancelBtnCls = cn(
  'flex-1 py-2.5 rounded-xl text-sm font-medium',
  'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)]',
  'hover:bg-[var(--glass)] transition-colors duration-150',
)

export const classSubmitBtnCls = cn(
  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white',
  'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
  'hover:opacity-90 active:scale-[0.98]',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-all duration-150',
)

/* ─── Palette + subjects ─── */

export const CLASS_COLOR_PRESETS = [
  { color: '#b3872a', label: 'Math' },
  { color: '#7c3aed', label: 'French' },
  { color: '#0ea5e9', label: 'English' },
  { color: '#0f6b4d', label: 'Science' },
  { color: '#ea580c', label: 'History' },
  { color: '#10b981', label: 'PE' },
  { color: '#db2777', label: 'Art' },
  { color: '#6366f1', label: 'Music' },
] as const

/** Fallback subject list, used until Settings → Subjects answers. */
export const DEFAULT_SUBJECT_OPTIONS = [
  'Math', 'French', 'English', 'Science', 'History', 'PE', 'Art', 'Music',
]

/* ─── Form values ─── */

export type ClassType = 'weekly' | 'temporary'

export interface ClassFormValues {
  name: string
  subject: string
  teacherId: string
  capacity: number
  color: string
  notes: string
  classType: ClassType
  dedicatedTime: string
  /** Weekly anchor day, "YYYY-MM-DD" — only the weekday is used. */
  dayAnchor: string
  /** One-off date, "YYYY-MM-DD" — temporary classes only. */
  tempDate: string
  academicLevel: string
  groupName: string
  billingModel: BillingModel
  priceDa: number
  creditsPerCycle: number
  cycleWeekLimit: string
  allowRollover: boolean
  allowMakeups: boolean
  accessDurationWeeks: string
  maxGroupsIncluded: number
  enforceAttendance: boolean
  attendanceThreshold: number
}

export function emptyClassForm(): ClassFormValues {
  return {
    name: '',
    subject: DEFAULT_SUBJECT_OPTIONS[0],
    teacherId: '',
    capacity: 20,
    color: CLASS_COLOR_PRESETS[0].color,
    notes: '',
    classType: 'weekly',
    dedicatedTime: '',
    dayAnchor: '',
    tempDate: '',
    academicLevel: '',
    groupName: 'A',
    billingModel: 'CREDIT_BASED',
    priceDa: 0,
    creditsPerCycle: 4,
    cycleWeekLimit: '',
    allowRollover: false,
    allowMakeups: true,
    accessDurationWeeks: '',
    maxGroupsIncluded: 1,
    enforceAttendance: false,
    attendanceThreshold: 75,
  }
}

/* ─── Payload ─── */

/**
 * The POST /classes body.
 *
 * Two rules, both load-bearing:
 *
 *  - A day anchor only means something for a weekly class, and a one-off date
 *    only for a temporary one. Sending the wrong one tells the calendar to
 *    place sessions on a day the class does not meet.
 *  - Billing fields are only sent for the model they belong to. A credit
 *    count attached to a time-based class is a number the billing rules would
 *    read and act on.
 */
export function buildClassPayload(values: ClassFormValues): Record<string, unknown> {
  const anchorDow = values.dayAnchor
    ? new Date(`${values.dayAnchor}T12:00:00`).getDay()
    : undefined
  const weekly = values.classType === 'weekly'
  const credit = values.billingModel === 'CREDIT_BASED'

  return {
    name: values.name.trim(),
    subject: values.subject,
    teacher_id: values.teacherId || undefined,
    // Clearing the Capacity field makes `Number('')` 0, and 0 is a real value
    // the backend accepts — it would file a 0-seat class that renders "0/0" and
    // refuses every enrollment. Send nothing instead and let the server's own
    // default apply.
    capacity: values.capacity > 0 ? values.capacity : undefined,
    color: values.color,
    notes: values.notes.trim() || undefined,
    class_type: values.classType,
    day_of_week:
      weekly && anchorDow != null && !Number.isNaN(anchorDow) ? anchorDow : undefined,
    session_date: !weekly && values.tempDate ? values.tempDate : undefined,
    dedicated_time: values.dedicatedTime.trim() || undefined,
    academic_level: values.academicLevel.trim() || undefined,
    group_name: values.groupName.trim() || 'A',
    billing_model: values.billingModel,
    price_da: values.priceDa || undefined,
    credits_per_cycle: credit ? values.creditsPerCycle : undefined,
    cycle_week_limit:
      credit && values.cycleWeekLimit ? Number(values.cycleWeekLimit) : undefined,
    allow_rollover: credit ? values.allowRollover : undefined,
    allow_makeups: credit ? values.allowMakeups : undefined,
    access_duration_weeks:
      !credit && values.accessDurationWeeks
        ? Number(values.accessDurationWeeks)
        : undefined,
    max_groups_included: values.maxGroupsIncluded,
    enforce_attendance: values.enforceAttendance,
    attendance_threshold: values.enforceAttendance ? values.attendanceThreshold : undefined,
  }
}

/* ─── Billing fields ─── */

/**
 * The billing block, rendered identically wherever a class is created.
 *
 * Renders only the fields; the caller owns the section heading and wrapper, so
 * the same block can sit inside a full-page modal or a cramped inline panel.
 */
export function ClassBillingFields({
  values,
  onChange,
}: {
  values: ClassFormValues
  onChange: (patch: Partial<ClassFormValues>) => void
}) {
  const credit = values.billingModel === 'CREDIT_BASED'

  return (
    <div className="space-y-3">
      {/* Model */}
      <div>
        <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Billing Model</label>
        <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
          {(['CREDIT_BASED', 'TIME_BASED'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ billingModel: m })}
              className={cn(
                'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                values.billingModel === m
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
        <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Price (DA)</label>
        <div className="relative">
          <input
            type="number"
            value={values.priceDa || ''}
            onChange={(e) => onChange({ priceDa: Number(e.target.value) })}
            placeholder="0"
            min={0}
            className={cn(classInputCls, 'pr-10')}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--muted)]">
            DA
          </span>
        </div>
      </div>

      {credit ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={classLabelCls} style={{ color: 'var(--muted)' }}>
                Credits / Cycle (N · 1–20)
              </label>
              <input
                type="number"
                value={values.creditsPerCycle}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value))
                  onChange({ creditsPerCycle: Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 4 })
                }}
                min={1}
                max={20}
                step={1}
                className={classInputCls}
              />
            </div>
            <div>
              <label className={classLabelCls} style={{ color: 'var(--muted)' }}>
                Cycle Week Limit
              </label>
              <input
                type="number"
                value={values.cycleWeekLimit}
                onChange={(e) => onChange({ cycleWeekLimit: e.target.value })}
                placeholder="Optional"
                min={0}
                className={classInputCls}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <Toggle
                checked={values.allowRollover}
                onCheckedChange={(v) => onChange({ allowRollover: v })}
                aria-label="Allow Rollover"
              />
              Allow Rollover
            </div>
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <Toggle
                checked={values.allowMakeups}
                onCheckedChange={(v) => onChange({ allowMakeups: v })}
                aria-label="Allow Makeups"
              />
              Allow Makeups
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className={classLabelCls} style={{ color: 'var(--muted)' }}>
            Access Duration (weeks)
          </label>
          <input
            type="number"
            value={values.accessDurationWeeks}
            onChange={(e) => onChange({ accessDurationWeeks: e.target.value })}
            placeholder="Optional"
            min={1}
            className={classInputCls}
          />
        </div>
      )}
    </div>
  )
}
