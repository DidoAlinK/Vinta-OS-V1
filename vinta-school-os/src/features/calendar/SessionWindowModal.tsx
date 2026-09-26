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
  const isEditing = !!editing
  // The backend only moves `scheduled` rows; anything else is a record of a
  // class that already ran, so the window shows it without offering changes.
  const isLocked = isEditing && editing!.status !== 'scheduled'

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
    if (isEditing && editing) return editing.teacher_name || 'Not set'
    if (selectedGroup?.teacher_id) {
      const t = teachers.find((x) => x.id === selectedGroup.teacher_id)
      return t?.name ?? selectedGroup.teacher_name ?? 'Not set'
    }
    return 'Not set'
  }, [isEditing, editing, selectedGroup, teachers])

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
    const kinds = [...new Set(conflicts.map((c) => c.kind))].join(' + ')
    return clash
      ? `Blocked: ${kinds} overlap with "${clash.class_name}" at ${timeRangeLabel(clash.start_time, clash.end_time)} that day.`
      : `Blocked: ${kinds} overlap on ${date}. Pick another time or room.`
  }, [conflicts, sessions, date])

  // ── Save ──────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (isLocked) return
    if (creatingClass) {
      setError('Finish creating the class, then save the session.')
      return
    }
    if (!isEditing && !groupId) {
      setError('Pick a group for this session.')
      return
    }
    if (!date || !start || !end) {
      setError('Pick a date, start time and end time.')
      return
    }
    if (timeToHours(end) <= timeToHours(start)) {
      setError('End time must be after the start time.')
      return
    }
    if (conflicts.length > 0) {
      setError(conflictMessage ?? 'That slot is already taken.')
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
        toast.success('Session moved', `${editing.class_name} — ${timeRangeLabel(start, end)}.`)
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
        toast.success('Session added', `${selectedGroup?.name ?? 'Session'} — ${timeRangeLabel(start, end)}.`)
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(errMsg(err, 'Could not save the session. Please try again.'))
    } finally {
      setSaving(false)
    }
  }, [
    isLocked, isEditing, editing, groupId, date, start, end, roomId, creatingClass,
    conflicts.length, conflictMessage, selectedGroup, onSaved, onClose,
  ])

  // ── Remove ────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    try {
      // The backend soft-cancels rather than deleting; the grid hides
      // cancelled rows by default, so the block does disappear.
      await api.delete(`/sessions/${editing.id}`)
      toast.success('Session removed', `${editing.class_name} on ${editing.date}.`)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(errMsg(err, 'Could not remove the session. Please try again.'))
    } finally {
      setSaving(false)
    }
  }, [editing, onSaved, onClose])

  const title = confirmRemove
    ? 'Remove this session?'
    : isEditing
      ? isLocked ? 'Session details' : 'Change session time'
      : 'Add session'

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {!confirmRemove && (
        <p className="text-xs text-[var(--muted)] -mt-1 mb-4">
          {isLocked
            ? 'This class has already been run — the calendar only arranges the plan.'
            : creatingClass
              ? 'A session belongs to a group, so the class comes first. It is selected the moment it is created.'
              : 'Pick the group this session belongs to — or create a new class from the list. No drag-and-drop.'}
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
            <strong className="font-semibold">{editing.class_name}</strong>
            {' '}is <strong className="font-semibold">{editing.status.replace('_', ' ')}</strong> and can no
            longer be moved or removed from the calendar. Run it from the Dashboard.
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
              <strong className="font-semibold">{editing.class_name}</strong> on{' '}
              {editing.date} at {timeRangeLabel(editing.start_time, editing.end_time)} will be
              cancelled. This cannot be undone from the calendar.
            </span>
          </div>

          <PinStep
            hint="Enter your 4-digit PIN to confirm."
            submitLabel="Remove session"
            busyLabel="Removing…"
            onVerified={handleDelete}
          />

          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmRemove(false)}
              disabled={saving}
            >
              Keep the session
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
            <label className={labelCls}>Group</label>
            <Select
              value={groupId}
              onChange={(v) => { setGroupId(v); setError(null) }}
              disabled={isEditing || isLocked || saving}
              placeholder="Select a group…"
              emptyText="No groups yet — use New class… below"
              options={allGroups.map((g) => ({
                value: g.id,
                label: g.subject ? `${g.name} (${g.subject})` : g.name,
              }))}
              action={
                !isEditing && !isLocked
                  ? {
                      label: 'New class…',
                      icon: <Plus size={14} className="shrink-0" />,
                      onClick: () => setCreatingClass(true),
                    }
                  : undefined
              }
              // Inherit this modal's field geometry so the trigger sits flush
              // with the date/time inputs beside it.
              className={cn(inputCls, 'h-auto')}
              aria-label="Group"
            />
          </div>

          {/* Teacher — always derived, never chosen here */}
          <div>
            <label className={labelCls}>Teacher</label>
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
              <span className="ml-auto text-[10px] uppercase tracking-wide shrink-0">auto</span>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>Date</label>
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
              aria-label="Date"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start time</label>
              {/* step={300} is gone: five minutes is TimePicker's default. */}
              <TimePicker
                value={start}
                onChange={(v) => { setStart(v); setError(null) }}
                disabled={isLocked || saving}
                className={inputCls}
                aria-label="Start time"
              />
            </div>
            <div>
              <label className={labelCls}>End time</label>
              {/* step={300} is gone: five minutes is TimePicker's default. */}
              <TimePicker
                value={end}
                onChange={(v) => { setEnd(v); setError(null) }}
                disabled={isLocked || saving}
                className={inputCls}
                aria-label="End time"
              />
            </div>
          </div>

          {/* Room */}
          <div>
            <label className={labelCls}>Room</label>
            <Select
              value={roomId}
              onChange={(v) => { setRoomId(v); setError(null) }}
              disabled={isEditing || isLocked || saving}
              placeholder="— No room —"
              emptyText="No rooms yet — add one in Classrooms"
              options={[
                { value: '', label: '— No room —' },
                ...rooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
              className={cn(inputCls, 'h-auto')}
              aria-label="Room"
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
              Remove
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
            {isLocked ? 'Close' : 'Cancel'}
          </Button>
          {!isLocked && (
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={conflicts.length > 0}
              onClick={() => void handleSave()}
            >
              {isEditing ? 'Save changes' : 'Add session'}
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}

export default SessionWindowModal
