/**
 * Vinta School OS — create a class without leaving the session you are placing
 *
 * A session belongs to a group, and both session flows used to end there: with
 * a "Select group…" list, and no way to add a group that was not already in it.
 * The admin had to abandon the half-filled session, go to Classrooms, build the
 * group, come back, and re-enter the date and times. This closes that loop.
 *
 * It posts the same body the Classrooms form does — `buildClassPayload` is
 * shared — and hands the new group straight back to the caller, which selects
 * it in its own picker. Nothing else changes: the session is still created by
 * the flow that opened this panel, so a class made here does not also spawn
 * sessions of its own. The session being placed *is* its first session.
 *
 * The billing block is included because a group created in a hurry should not
 * be a group that bills differently from one created carefully. It is the same
 * `ClassBillingFields` the Classrooms modal renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import Select from '../../components/ui/Select'
import {
  ClassBillingFields,
  CLASS_COLOR_PRESETS,
  DEFAULT_SUBJECT_OPTIONS,
  buildClassPayload,
  classCancelBtnCls,
  classInputCls,
  classLabelCls,
  classSubmitBtnCls,
  emptyClassForm,
  type ClassFormValues,
} from './ClassForm'

/**
 * What this panel hands back. Structurally a superset of both
 * `SessionWindowModal`'s and `SchedulingModal`'s own `GroupOption`, so it can be
 * appended to either list without a cast.
 */
export interface CreatedGroup {
  id: string
  name: string
  subject?: string
  color?: string
  teacher_id?: string
  teacher_name?: string
}

export interface ClassQuickCreateProps {
  /** The new group, ready to be selected in the caller's picker. */
  onCreated: (group: CreatedGroup) => void
  onCancel: () => void
}

interface TeacherOption {
  id: string
  name: string
}

function errMsg(err: unknown, fallback: string): string {
  const backend = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return typeof backend === 'string' && backend ? backend : fallback
}

export function ClassQuickCreate({ onCreated, onCancel }: ClassQuickCreateProps) {
  const [values, setValues] = useState<ClassFormValues>(() => emptyClassForm())
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECT_OPTIONS)
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = useCallback((p: Partial<ClassFormValues>) => {
    setValues((v) => ({ ...v, ...p }))
    setError(null)
  }, [])

  // Its own lookups, so the panel works wherever it is dropped in. It is only
  // mounted once the admin asks to create, so this costs nothing until then.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingLookups(true)
      try {
        const [tRes, sRes] = await Promise.all([
          api.get('/teachers'),
          api.get('/subjects').catch(() => ({ data: { subjects: [] } })),
        ])
        if (cancelled) return
        const list = tRes.data.teachers ?? tRes.data ?? []
        setTeachers(
          list.map((t: any) => ({
            id: t.id,
            name:
              t.full_name ||
              t.name ||
              `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
          })),
        )
        const subs = (sRes.data.subjects ?? []).map((s: any) => s.name).filter(Boolean)
        if (subs.length > 0) {
          setSubjects(subs)
          // The seeded default ("Math") is not necessarily one of *this*
          // school's subjects. Left alone, the picker would show its
          // placeholder while `buildClassPayload` posted a subject the school
          // does not have — so re-point the field at one that exists. `Select`
          // matches on a strict `===` against its options, so a value outside
          // the list renders as nothing at all.
          setValues((v) => (subs.includes(v.subject) ? v : { ...v, subject: subs[0] }))
        }
      } catch {
        // Subjects and teachers both fall back to what is already on screen:
        // the default subject list, and no teacher. Neither blocks creation.
      } finally {
        if (!cancelled) setLoadingLookups(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ value: s, label: s })),
    [subjects],
  )

  const teacherOptions = useMemo(
    () => [
      { value: '', label: '— None —' },
      ...teachers.map((t) => ({ value: t.id, label: t.name })),
    ],
    [teachers],
  )

  /** Guards against a second POST before `saving` has re-rendered the button. */
  const inFlight = useRef(false)

  const handleCreate = useCallback(async () => {
    // `saving` alone is not enough here: the name field submits on Enter, and
    // held-down key repeat (or a fast double-tap) fires the next keydown before
    // React has re-rendered with the disabled button.
    if (inFlight.current) return
    const name = values.name.trim()
    if (!name) {
      setError('A class needs a name.')
      return
    }
    inFlight.current = true
    setError(null)
    setSaving(true)
    try {
      const { data } = await api.post('/classes', buildClassPayload(values))
      const teacher = teachers.find((t) => t.id === values.teacherId)
      const created: CreatedGroup = {
        id: data?.id ?? `temp-${Date.now()}`,
        name: data?.name ?? name,
        subject: data?.subject ?? values.subject,
        color: values.color,
        teacher_id: values.teacherId || undefined,
        teacher_name: teacher?.name,
      }
      toast.success('Class created', `${created.name} is ready — it is selected below.`)
      onCreated(created)
    } catch (err) {
      setError(errMsg(err, 'Could not create the class. Please try again.'))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }, [values, teachers, onCreated])

  return (
    <div
      className={cn(
        'rounded-2xl p-4 space-y-3',
        'bg-[var(--glass)] border border-[var(--gold)]/30',
        'animate-fade-in',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--gold-soft)' }}
        >
          <GraduationCap size={14} style={{ color: 'var(--gold)' }} />
        </div>
        <p
          className="text-sm font-bold text-[var(--text)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          New class
        </p>
        <span className="ml-auto text-[10px] text-[var(--muted)]">
          {loadingLookups ? 'Loading…' : 'Created and selected here'}
        </span>
      </div>

      {/* Name */}
      <div>
        <label className={classLabelCls} style={{ color: 'var(--muted)' }}>
          Name <span style={{ color: 'var(--red)' }}>*</span>
        </label>
        <input
          type="text"
          autoFocus
          value={values.name}
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate()
          }}
          placeholder="e.g. Math — CM2"
          className={classInputCls}
        />
      </div>

      {/* Subject + Teacher */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Subject</label>
          <Select
            value={values.subject}
            onChange={(v) => patch({ subject: v })}
            options={subjectOptions}
            searchPlaceholder="Search subjects…"
            className="h-[38px]"
            aria-label="Subject"
          />
        </div>
        <div>
          <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Teacher</label>
          <Select
            value={values.teacherId}
            onChange={(v) => patch({ teacherId: v })}
            options={teacherOptions}
            placeholder="— None —"
            searchPlaceholder="Search teachers…"
            className="h-[38px]"
            aria-label="Teacher"
          />
        </div>
      </div>

      {/* Capacity */}
      <div>
        <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Capacity</label>
        <input
          type="number"
          value={values.capacity}
          onChange={(e) => patch({ capacity: Number(e.target.value) })}
          min={1}
          className={classInputCls}
        />
      </div>

      {/* Colour */}
      <div>
        <label className={classLabelCls} style={{ color: 'var(--muted)' }}>Colour</label>
        <div className="flex gap-2 flex-wrap">
          {CLASS_COLOR_PRESETS.map((p) => (
            <button
              key={p.color}
              type="button"
              onClick={() => patch({ color: p.color })}
              title={p.label}
              aria-label={p.label}
              className={cn(
                'w-7 h-7 rounded-lg transition-all duration-150 hover:scale-110',
                values.color === p.color ? 'ring-2 ring-offset-2' : '',
              )}
              style={{
                backgroundColor: p.color,
                ...(values.color === p.color
                  ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${p.color}` }
                  : {}),
              }}
            />
          ))}
        </div>
      </div>

      {/* Billing — the same block the Classrooms form renders */}
      <div className="pt-1">
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-2"
          style={{ color: 'var(--gold)' }}
        >
          Billing
        </p>
        <ClassBillingFields values={values} onChange={patch} />
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] font-medium" role="alert">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={saving} className={classCancelBtnCls}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving || !values.name.trim()}
          className={classSubmitBtnCls}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Creating…
            </span>
          ) : (
            'Create class'
          )}
        </button>
      </div>
    </div>
  )
}

export default ClassQuickCreate
