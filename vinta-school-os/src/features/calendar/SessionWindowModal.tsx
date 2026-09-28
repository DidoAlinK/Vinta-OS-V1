/**
 * Vinta School OS — Session Window
 *
 * The calendar's single entry point for changing the schedule. Everything the
 * Calendar page can do to a session happens here: add it, remove it, or move
 * its date and times. There is deliberately no drag-to-move, no resize handle
 * and no drop target anywhere on the calendar — the admin arranges the
 * *plan* here, and the Dashboard is where the class itself is run.
 *
 * Reading the class's own lifecycle: once a session has been started the
 * backend refuses to move it (`PATCH` only touches `scheduled` rows), so the
 * window opens read-only and says why rather than offering a Save that would
 * fail. Acting on a running class is the Dashboard's job, not this one's.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Lock, Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import { DayPicker } from '../../components/ui/DayPicker'
import { TimePicker } from '../../components/ui/TimePicker'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { findConflicts } from '../../lib/scheduleDefs'
import { timeRangeLabel, toLocalISO, timeToHours } from '../../lib/sessionTime'
import { teacherColor } from '../../lib/teacherColors'
import ClassQuickCreate, { type CreatedGroup } from '../classes/ClassQuickCreate'
import PinStep from '../../components/ui/PinStep'
import type { Session } from '../../types/class'

// ============================================
// Types
// ============================================

export interface GroupOption {
  id: string
  name: string
  subject?: string
  color?: string
  teacher_id?: string
  teacher_name?: string
}

export interface TeacherOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  name: string
}

export interface SessionWindowModalProps {
  open: boolean
  onClose: () => void
  /** The loaded week — conflict detection runs against these. */
  sessions: Session[]
  groups: GroupOption[]
  teachers: TeacherOption[]
  rooms: RoomOption[]
  /** Pre-filled slot from an empty grid cell or the toolbar button. */
  prefillDate?: string | null
  prefillStart?: string | null
  prefillEnd?: string | null
  /** The session being changed; null means "add". */
  editing?: Session | null
  /** Fired after any successful change so the page can refetch. */
  onSaved: () => void
  /**
   * A class was created from this window's own group picker. The page can fold
   * it into its `groups` list; this window selects it either way, so a caller
   * that does not listen still gets a working picker.
   */
  onClassCreated?: (group: CreatedGroup) => void
}

// ============================================
// Shared field styles
// ============================================

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'text-[var(--text)] outline-none',
  'focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'disabled:opacity-60',
)

const labelCls = 'block text-xs font-medium text-[var(--muted)] mb-1.5'

/**
 * Lifecycle values are API enums (`in_progress` and friends); what the desk
 * reads in the locked notice is the translated label, never the enum itself.
 * Keys are held here, not sentences — `t()` at module scope would freeze.
 */
const STATUS_KEYS: Record<string, string> = {
  scheduled: 'status.scheduled',
  in_progress: 'status.inProgress',
  conducted: 'status.conducted',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
}

/** Which half of a clash `findConflicts` is reporting. */
const CONFLICT_KIND_KEYS: Record<string, string> = {
  room: 'conflict.room',
  teacher: 'conflict.teacher',
}

function errMsg(err: any, fallback: string): string {
  const backend = err?.response?.data?.error
  if (typeof backend === 'string' && backend) return backend
  return fallback
}

// ============================================
// Component
// ============================================

export function SessionWindowModal({
  open,
  onClose,
  sessions,
  groups,
  teachers,
  rooms,
  prefillDate,
  prefillStart,
  prefillEnd,
  editing,
  onSaved,
  onClassCreated,
}: SessionWindowModalProps) {
  const { t } = useTranslation('calendar')
  const isEditing = !!editing
  // The backend only moves `scheduled` rows; anything else is a record of a
  // class that already ran, so the window shows it without offering changes.
  const isLocked = isEditing && editing!.status !== 'scheduled'

  /* An unmapped lifecycle value falls back to the raw enum with its underscore
     opened up, so a state the backend adds later reads as odd rather than as a
     key path. */
  const statusLabel = (status: string): string =>
    STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status.replace('_', ' ')

  const [groupId, setGroupId] = useState('')
  const [date, setDate] = useState(toLocalISO(new Date()))
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('11:00')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Whether the inline "New class" panel has replaced the group picker. */
  const [creatingClass, setCreatingClass] = useState(false)
  /**
   * Whether the body has been swapped for the remove confirmation.
   *
   * The PIN step replaces the form rather than sitting under it: the footer row
   * is three buttons wide already, and a destructive confirmation crammed into
   * the corner of a form the desk is still looking at is exactly the shape of
   * the accident this is meant to stop.
   */
  const [confirmRemove, setConfirmRemove] = useState(false)

  /**
   * Groups created from this window, kept here so the picker works whether or
   * not the page folds them into its own list. Ids already in `groups` win, so
   * a page that does listen never shows the class twice.
   */
  const [createdGroups, setCreatedGroups] = useState<GroupOption[]>([])
  const allGroups = useMemo(() => {
    const known = new Set(groups.map((g) => g.id))
    return [...groups, ...createdGroups.filter((g) => !known.has(g.id))]
  }, [groups, createdGroups])

  const handleClassCreated = useCallback(
    (group: CreatedGroup) => {
      setCreatedGroups((prev) =>
        prev.some((g) => g.id === group.id) ? prev : [...prev, group],
      )
      // Select it immediately — creating a class in this window is always in
      // service of the session being placed, never a detour.
      setGroupId(group.id)
      setCreatingClass(false)
      setError(null)
      onClassCreated?.(group)
    },
    [onClassCreated],
  )

  // Reset the form each time the window opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setCreatingClass(false)
    setConfirmRemove(false)

    if (editing) {
      setGroupId(editing.class_id ?? '')
      setDate(editing.date)
      setStart(editing.start_time)
      setEnd(editing.end_time)
      setRoomId(editing.classroom_id ?? '')
      return
    }

    setGroupId(groups[0]?.id ?? '')
    setDate(prefillDate || toLocalISO(new Date()))
    setStart(prefillStart || '10:00')
    setEnd(prefillEnd || '11:00')
    setRoomId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, prefillDate, prefillStart, prefillEnd])

  // Teacher is denormalized from the group — the session has no teacher field
  // of its own in the form, because the backend derives it the same way.
  const selectedGroup = useMemo(
    () => allGroups.find((g) => g.id === groupId) ?? null,
    [allGroups, groupId],
  )

  const teacherName = useMemo(() => {
    if (isEditing && editing) return editing.teacher_name || t('window.notSet')
    if (selectedGroup?.teacher_id) {
      const found = teachers.find((x) => x.id === selectedGroup.teacher_id)
      return found?.name ?? selectedGroup.teacher_name ?? t('window.notSet')
    }
    return t('window.notSet')
  }, [isEditing, editing, selectedGroup, teachers, t])

  const teacherSwatch = isEditing
    ? teacherColor(editing?.teacher_id)
    : teacherColor(selectedGroup?.teacher_id)

  // ── Conflicts ─────────────────────────────────
  // Room OR teacher overlap on the same date, against anything not cancelled.

  const conflicts = useMemo(() => {
    // `confirmRemove` is in here so the form's own clash warning cannot appear
    // over the remove confirmation — the session being cancelled trivially
    // "overlaps" nothing itself, but a neighbouring slot may still be flagged,
    // and a red "Blocked:" banner above a PIN box reads as a reason not to.
    if (!date || !start || !end || isLocked || confirmRemove) return []
    const teacherId = isEditing
      ? editing?.teacher_id ?? ''
      : selectedGroup?.teacher_id ?? ''
    return findConflicts(sessions, {
      date,
      start,
      end,
      teacherId,
      roomId: roomId || null,
      ignoreId: editing?.id,
    })
  }, [sessions, date, start, end, roomId, isEditing, editing?.id, editing?.teacher_id, selectedGroup?.teacher_id, isLocked, confirmRemove])

  const conflictMessage = useMemo(() => {
    if (conflicts.length === 0) return null
    const clash = sessions.find((s) => s.id === conflicts[0].sessionId)
    const kinds = [...new Set(conflicts.map((c) => c.kind))]
      .map((kind) => (CONFLICT_KIND_KEYS[kind] ? t(CONFLICT_KIND_KEYS[kind]) : kind))
      .join(' + ')
    return clash
      ? t('window.conflictWith', {
          kinds,
          name: clash.class_name,
          time: timeRangeLabel(clash.start_time, clash.end_time),
        })
      : t('window.conflictOn', { kinds, date })
  }, [conflicts, sessions, date, t])

  // ── Save ──────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (isLocked) return
    if (creatingClass) {
      setError(t('window.errFinishClass'))
      return
    }
    if (!isEditing && !groupId) {
      setError(t('window.errPickGroup'))
      return
    }
    if (!date || !start || !end) {
      setError(t('window.errPickDateTime'))
      return
    }
    if (timeToHours(end) <= timeToHours(start)) {
      setError(t('window.errEndAfterStart'))
      return
    }
    if (conflicts.length > 0) {
      setError(conflictMessage ?? t('window.errSlotTaken'))
      return
    }

    setError(null)
    setSaving(true)
    try {
      if (isEditing && editing) {
        // Only the placement is mutable — group, teacher and room belong to
        // the session's origin, and the backend accepts nothing else here.
        await api.patch(`/sessions/${editing.id}`, {
          date,
          start_time: start,
          end_time: end,
        })
        toast.success(
          t('window.toastMovedTitle'),
          t('window.toastMovedBody', {
            name: editing.class_name,
            time: timeRangeLabel(start, end),
          }),
        )
      } else {
        await api.post('/sessions', {
          class_id: groupId,
          teacher_id: selectedGroup?.teacher_id || undefined,
          date,
          start_time: start,
          end_time: end,
          classroom_id: roomId || undefined,
          subject: selectedGroup?.subject,
        })
        toast.success(
          t('window.toastAddedTitle'),
          t('window.toastAddedBody', {
            name: selectedGroup?.name ?? t('window.session'),
            time: timeRangeLabel(start, end),
          }),
        )
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(errMsg(err, t('window.errSave')))
    } finally {
      setSaving(false)
    }
  }, [
    isLocked, isEditing, editing, groupId, date, start, end, roomId, creatingClass,
    conflicts.length, conflictMessage, selectedGroup, onSaved, onClose, t,
  ])

  // ── Remove ────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    try {
      // The backend soft-cancels rather than deleting; the grid hides
      // cancelled rows by default, so the block does disappear.
      await api.delete(`/sessions/${editing.id}`)
      toast.success(
        t('window.toastRemovedTitle'),
        t('window.toastRemovedBody', {
          name: editing.class_name,
          date: editing.date,
        }),
      )
      onSaved()
      onClose()
    } catch (err: any) {
      setError(errMsg(err, t('window.errRemove')))
    } finally {
      setSaving(false)
    }
  }, [editing, onSaved, onClose, t])

  const title = confirmRemove
    ? t('window.titleRemove')
    : isEditing
      ? isLocked ? t('window.titleDetails') : t('window.titleChange')
      : t('window.titleAdd')

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {!confirmRemove && (
        <p className="text-xs text-[var(--muted)] -mt-1 mb-4">
          {isLocked
            ? t('window.hintLocked')
            : creatingClass
              ? t('window.hintCreating')
              : t('window.hintPick')}
        </p>
      )}

      {/* Locked notice — the class is the Dashboard's to run */}
      {isLocked && editing && (
        <div
          className={cn(
            'flex items-start gap-2 px-3 py-2.5 rounded-xl mb-4 text-xs',
            'bg-[var(--muted-soft)] text-[var(--text)] border border-[var(--glass-border)]',
          )}
        >
          <Lock size={13} className="mt-px shrink-0 text-[var(--muted)]" />
          <span>
            {t('window.lockedNotice', {
              className: editing.class_name,
              status: statusLabel(editing.status),
            })}
          </span>
        </div>
      )}

      {/* Conflict / validation banner */}
      {(conflictMessage || error) && !isLocked && (
        <div
          className={cn(
            'flex items-start gap-2 px-3 py-2.5 rounded-xl mb-4 text-xs font-medium',
            'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30',
          )}
        >
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>{error ?? conflictMessage}</span>
        </div>
      )}

      {confirmRemove && editing ? (
        /*
         * Removing replaces the form rather than sitting beside it. The session
         * is cancelled the moment the PIN is accepted, so the only thing left
         * on screen should be the one question that matters — and the PIN is
         * that question, so there is no second "are you sure" behind it.
         */
        <div className="space-y-4">
          <div
            className={cn(
              'flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs',
              'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30',
            )}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>
              {t('window.removeNotice', {
                className: editing.class_name,
                date: editing.date,
                time: timeRangeLabel(editing.start_time, editing.end_time),
              })}
            </span>
          </div>

          <PinStep
            hint={t('window.pinHint')}
            submitLabel={t('window.pinSubmit')}
            busyLabel={t('window.pinBusy')}
            onVerified={handleDelete}
          />

          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmRemove(false)}
              disabled={saving}
            >
              {t('window.keepSession')}
            </Button>
          </div>
        </div>
      ) : creatingClass ? (
        /*
         * The class comes first: while it is being defined the session's own
         * fields are replaced rather than pushed below the panel — none of
         * them can be set until the class exists, and the panel is tall enough
         * on its own. Their values live in state, so nothing already entered
         * is lost when the panel closes.
         */
        <ClassQuickCreate
          onCreated={handleClassCreated}
          onCancel={() => setCreatingClass(false)}
        />
      ) : (
        <div className="space-y-3">
          {/* Group */}
          <div>
            <label className={labelCls}>{t('window.group')}</label>
            <Select
              value={groupId}
              onChange={(v) => { setGroupId(v); setError(null) }}
              disabled={isEditing || isLocked || saving}
              placeholder={t('window.groupPlaceholder')}
              emptyText={t('window.groupEmpty')}
              options={allGroups.map((g) => ({
                value: g.id,
                label: g.subject ? `${g.name} (${g.subject})` : g.name,
              }))}
              action={
                !isEditing && !isLocked
                  ? {
                      label: t('window.newClass'),
                      icon: <Plus size={14} className="shrink-0" />,
                      onClick: () => setCreatingClass(true),
                    }
                  : undefined
              }
              // Inherit this modal's field geometry so the trigger sits flush
              // with the date/time inputs beside it.
              className={cn(inputCls, 'h-auto')}
              aria-label={t('window.group')}
            />
          </div>

          {/* Teacher — always derived, never chosen here */}
          <div>
            <label className={labelCls}>{t('window.teacher')}</label>
            <div
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm',
                'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                'text-[var(--muted)]',
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: teacherSwatch }}
              />
              <span className="truncate">{teacherName}</span>
              <span className="ms-auto text-[10px] uppercase tracking-wide shrink-0">{t('window.auto')}</span>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>{t('window.date')}</label>
            <DayPicker
              value={date}
              onChange={(v) => { setDate(v); setError(null) }}
              disabled={isLocked || saving}
              // A session scheduled for a day that has already passed is
              // routinely moved, and this window opens on that existing date.
              // The field this replaces accepted any day, so this one does too
              // (DayPicker blocks past days unless told otherwise).
              allowPast
              className={inputCls}
              aria-label={t('window.date')}
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('window.startTime')}</label>
              {/* step={300} is gone: five minutes is TimePicker's default. */}
              <TimePicker
                value={start}
                onChange={(v) => { setStart(v); setError(null) }}
                disabled={isLocked || saving}
                className={inputCls}
                aria-label={t('window.startTime')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('window.endTime')}</label>
              {/* step={300} is gone: five minutes is TimePicker's default. */}
              <TimePicker
                value={end}
                onChange={(v) => { setEnd(v); setError(null) }}
                disabled={isLocked || saving}
                className={inputCls}
                aria-label={t('window.endTime')}
              />
            </div>
          </div>

          {/* Room */}
          <div>
            <label className={labelCls}>{t('window.room')}</label>
            <Select
              value={roomId}
              onChange={(v) => { setRoomId(v); setError(null) }}
              disabled={isEditing || isLocked || saving}
              placeholder={t('window.noRoom')}
              emptyText={t('window.noRooms')}
              options={[
                { value: '', label: t('window.noRoom') },
                ...rooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
              className={cn(inputCls, 'h-auto')}
              aria-label={t('window.room')}
            />
          </div>
        </div>
      )}

      {/* Footer — the inline creator carries its own Cancel/Create pair, so this
          row would only offer a disabled "Add session" to click at; the remove
          confirmation carries its own Keep the session / Remove pair. */}
      {!creatingClass && !confirmRemove && (
        <div className="flex items-center gap-3 mt-5">
          {isEditing && !isLocked && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => { setError(null); setConfirmRemove(true) }}
              disabled={saving}
            >
              <Trash2 size={13} />
              {t('window.remove')}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
            {isLocked ? t('common:action.close') : t('common:action.cancel')}
          </Button>
          {!isLocked && (
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={conflicts.length > 0}
              onClick={() => void handleSave()}
            >
              {isEditing ? t('window.saveChanges') : t('window.addSession')}
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}

export default SessionWindowModal
