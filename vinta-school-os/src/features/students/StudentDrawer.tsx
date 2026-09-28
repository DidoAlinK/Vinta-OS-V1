/**
 * Vinta School OS — Student Profile Drawer
 *
 * Two columns: who the student is and what's on their record on the left;
 * money on the right.
 *
 * The split mirrors the two questions this panel answers, which the previous
 * version conflated into a single dishonest badge:
 *
 *   Left  — "what is on this student's record?"  (identity, contacts, classes)
 *   Right — "what plan are they on, and what has actually been paid?"
 *
 * The right column is fed by `GET /students/<id>` (plan, status, cycle
 * calendar) and `GET /billing/subscriptions` (the purchase history). Payments
 * are recorded through `MultiPayModal`, the app's single writer for
 * `POST /billing/subscriptions/pay` — the legacy in-drawer `PaymentModal` that
 * posted to the rejected `/billing/record-payment` body is gone.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  X,
  Edit3,
  ChevronLeft,
  Phone,
  MessageCircle,
  Plus,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import MultiPayModal from '../billing/MultiPayModal'
import ProfileCard from './components/ProfileCard'
import StudentIdentity from './components/StudentIdentity'
import StudentClasses from './components/StudentClasses'
import StudentGuardians from './components/StudentGuardians'
import BillingSummaryCard, { formatDisplayDate } from './components/BillingSummaryCard'
import BillingCalendarCard from './components/BillingCalendarCard'
import PaymentHistoryList from './components/PaymentHistoryList'
import StudentAttendanceCalendar from './components/StudentAttendanceCalendar'
import { useStudentProfile } from './hooks/useStudentProfile'
import { useStudentBilling } from './hooks/useStudentBilling'
import type { Student } from '../../types/student'

// ============================================
// Props
// ============================================

export interface StudentDrawerProps {
  student: Student | null
  isOpen: boolean
  onClose: () => void
  onUpdated?: () => void
}

// ============================================
// Component
// ============================================

export default function StudentDrawer({
  student,
  isOpen,
  onClose,
  onUpdated,
}: StudentDrawerProps) {
  const { t } = useTranslation('students')
  const studentId = student?.id ?? null

  // ── Data ──
  // The row we were handed is a list summary (no enrollments, no guardians, no
  // calendar), so the detail route is fetched and seeded with it for an
  // instant first paint.
  const {
    profile,
    loading: profileLoading,
    refresh: refreshProfile,
  } = useStudentProfile(studentId, student)

  const {
    subscriptions,
    loading: billingLoading,
    error: billingError,
    refresh: refreshBilling,
  } = useStudentBilling(studentId)

  const detail: Student | null = profile ?? student

  // ── Edit state ──
  const [isEditing, setIsEditing] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editParentPhone, setEditParentPhone] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Payment ──
  const [payOpen, setPayOpen] = useState(false)

  // Reset transient UI whenever the panel is pointed at a different student,
  // so a half-finished edit or an open payment modal never follows you across.
  useEffect(() => {
    setIsEditing(false)
    setPayOpen(false)
  }, [studentId, isOpen])

  /* ── ESC closes the drawer — but not while the payment modal is up ── */
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // MultiPayModal portals over the drawer and listens on the same event.
      // Without this guard one Escape would dismiss both layers at once.
      if (payOpen) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, payOpen, onClose])

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  /* ── Edit handlers ── */
  const startEditing = useCallback(() => {
    if (!detail) return
    setEditFirstName(detail.first_name ?? '')
    setEditLastName(detail.last_name ?? '')
    setEditPhone(detail.phone ?? '')
    setEditParentPhone(detail.parent_phone ?? '')
    setEditNotes(detail.notes ?? '')
    setIsEditing(true)
  }, [detail])

  const saveEditing = useCallback(async () => {
    if (!studentId) return
    setSaving(true)
    try {
      await api.put(`/students/${studentId}`, {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim() || null,
        parent_phone: editParentPhone.trim() || null,
        notes: editNotes.trim() || null,
      })
      toast.success(t('drawer.toast.updated.title'), t('drawer.toast.updated.body'))
      setIsEditing(false)
      refreshProfile()
      onUpdated?.()
    } catch {
      toast.error(
        t('drawer.toast.updateFailed.title'),
        t('drawer.toast.updateFailed.body'),
      )
    } finally {
      setSaving(false)
    }
  }, [
    t,
    studentId,
    editFirstName,
    editLastName,
    editPhone,
    editParentPhone,
    editNotes,
    refreshProfile,
    onUpdated,
  ])

  /* ── After a payment lands ── */
  const handlePaymentRecorded = useCallback(() => {
    // Both halves moved: the purchase history gained a row, and the billing
    // status may have flipped out of `unpaid`.
    refreshBilling()
    refreshProfile()
    onUpdated?.()
  }, [refreshBilling, refreshProfile, onUpdated])

  if (!isOpen || !student || !detail) return null

  const telHref = detail.phone ? `tel:${detail.phone}` : null
  const waHref = detail.phone
    ? `https://wa.me/${detail.phone.replace(/[^0-9]/g, '')}`
    : null

  return (
    // z-40, not z-50: MultiPayModal portals to <body> at z-50, and the shared
    // Modal default must not have to change for this drawer to sit underneath it.
    <div className="fixed inset-0 z-40 flex justify-end" onClick={handleBackdropClick}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        className={cn(
          'relative h-full w-full sm:w-[560px] lg:w-[880px] max-w-full',
          'bg-[var(--glass)] border-s border-[var(--glass-border)]',
          'backdrop-blur-xl shadow-2xl overflow-hidden',
          'flex flex-col',
          'animate-slide-in-right',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label={t('drawer.backToProfile')}
                className="p-1.5 rounded-lg hover:bg-[var(--glass)] text-[var(--muted)] transition-colors duration-150"
              >
                {/* "Back" points left in a left-to-right reading order, so the
                    chevron mirrors in Arabic rather than pointing forward. */}
                <ChevronLeft size={16} className="rtl:-scale-x-100" />
              </button>
            )}
            <h3
              className="text-base font-bold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {isEditing ? t('drawer.editTitle') : t('drawer.title')}
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] hover:bg-[var(--glass)] transition-colors duration-150"
                >
                  {t('common:action.cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveEditing}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[var(--gold)] to-[var(--emerald)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all duration-150"
                >
                  {saving ? t('common:state.saving') : t('common:action.save')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label={t('drawer.editStudent')}
                  title={t('drawer.editStudent')}
                  className="p-1.5 rounded-lg hover:bg-[var(--glass)] text-[var(--gold)] transition-colors duration-150"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common:action.close')}
                  className="p-1.5 rounded-lg hover:bg-[var(--glass)] text-[var(--muted)] transition-colors duration-150"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col lg:flex-row gap-5">
            {/* ── Left: the record ── */}
            <div className="flex-1 min-w-0 space-y-5">
              <StudentIdentity student={detail} />

              {isEditing ? (
                <ProfileCard title={t('drawer.details')}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label={t('drawer.field.firstName')}
                        value={editFirstName}
                        onChange={setEditFirstName}
                      />
                      <Field
                        label={t('drawer.field.lastName')}
                        value={editLastName}
                        onChange={setEditLastName}
                      />
                    </div>
                    <Field
                      label={t('common:label.phone')}
                      value={editPhone}
                      onChange={setEditPhone}
                      placeholder={t('drawer.placeholder.phone')}
                      type="tel"
                    />
                    <Field
                      label={t('drawer.field.parentPhone')}
                      value={editParentPhone}
                      onChange={setEditParentPhone}
                      placeholder={t('drawer.placeholder.parentPhone')}
                      type="tel"
                    />
                    <div>
                      <label className="text-[11px] font-medium text-[var(--muted)] mb-1 block">
                        {t('common:label.notes')}
                      </label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={3}
                        placeholder={t('drawer.placeholder.notes')}
                        className={cn(
                          'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)] resize-none',
                          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                          'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
                        )}
                      />
                    </div>
                  </div>
                </ProfileCard>
              ) : (
                <ProfileCard title={t('drawer.details')}>
                  <dl className="space-y-2.5">
                    <InfoRow label={t('common:label.phone')} value={detail.phone} />
                    <InfoRow label={t('drawer.parentPhone')} value={detail.parent_phone} />
                    <InfoRow
                      label={t('drawer.enrolledSince')}
                      value={
                        detail.created_at
                          ? formatDisplayDate(new Date(detail.created_at))
                          : null
                      }
                    />
                    <InfoRow
                      label={t('drawer.enrollment')}
                      // The API sends the raw enum ("active", "not_enrolled").
                      // An unrecognised value falls through to itself rather
                      // than to a blank, so a new server-side state shows up
                      // here instead of silently disappearing.
                      value={
                        detail.enrollment_status
                          ? enrollmentLabel(t, detail.enrollment_status)
                          : null
                      }
                    />
                  </dl>
                </ProfileCard>
              )}

              <StudentClasses
                enrollments={detail.enrollments ?? []}
                classes={detail.classes}
              />

              <StudentGuardians
                guardians={detail.guardians ?? []}
                parentPhone={detail.parent_phone}
              />

              {!isEditing && (
                <ProfileCard title={t('common:label.notes')}>
                  {detail.notes ? (
                    <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
                      {detail.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--muted)] italic">
                      {t('drawer.noNotes')}
                    </p>
                  )}
                </ProfileCard>
              )}
            </div>

            {/* ── Right: the money ── */}
            <div className="w-full lg:w-[340px] shrink-0 space-y-5">
              <BillingSummaryCard student={detail} loading={profileLoading} />
              <BillingCalendarCard
                entries={detail.billing_calendar ?? []}
                loading={profileLoading}
              />
              <PaymentHistoryList
                subscriptions={subscriptions}
                loading={billingLoading}
                error={billingError}
                onRetry={refreshBilling}
              />
              {/* Under the money, not beside it: the register answers "did the
                  sessions they paid for actually happen", which only makes
                  sense once the payments are on screen above it. */}
              <StudentAttendanceCalendar
                calendar={detail.attendance_calendar}
                loading={profileLoading}
              />
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────── */}
        <div className="px-5 py-4 border-t border-[var(--glass-border)] shrink-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                'text-sm font-semibold text-white',
                'bg-gradient-to-r from-[var(--gold)] to-[var(--emerald)]',
                'hover:opacity-90 active:scale-[0.98]',
                'transition-all duration-150',
              )}
            >
              <Plus size={15} />
              {t('drawer.recordPayment')}
            </button>
            {telHref && (
              <a
                href={telHref}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[var(--emerald-soft)] text-[var(--emerald)] hover:bg-[var(--emerald)]/20 active:scale-[0.98] transition-all duration-150"
              >
                <Phone size={15} />
                {t('drawer.call')}
              </a>
            )}
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[var(--emerald-soft)] text-[var(--emerald)] hover:bg-[var(--emerald)]/20 active:scale-[0.98] transition-all duration-150"
              >
                <MessageCircle size={15} />
                {t('drawer.message')}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Payment ──
          The one legitimate writer. `presetStudent` pins it to this student so
          the operator never re-picks who they are charging. */}
      <MultiPayModal
        isOpen={payOpen}
        presetStudent={detail}
        onClose={() => setPayOpen(false)}
        onSuccess={handlePaymentRecorded}
      />
    </div>
  )
}

// ============================================
// InfoRow (internal) — a read-only label/value pair
// ============================================

/**
 * Enrollment.status is a lowercase enum on the wire; these are the same words
 * in sentence case for the drawer. `not_enrolled` in particular is a server
 * sentinel, not English, and it was being printed verbatim.
 *
 * Keys rather than sentences — see the note in `StudentTable` on why a
 * module-level map of rendered strings cannot work.
 */
const ENROLLMENT_LABEL_KEYS: Record<string, string> = {
  active: 'enrollment.active',
  withdrawn: 'enrollment.withdrawn',
  expired: 'enrollment.expired',
  overdue: 'enrollment.overdue',
  transferred: 'enrollment.transferred',
  not_enrolled: 'enrollment.notEnrolled',
}

/** Unknown values fall through as-is rather than to a blank. */
function enrollmentLabel(t: TFunction, status: string): string {
  const key = ENROLLMENT_LABEL_KEYS[status]
  return key ? t(key) : status
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[11px] font-medium text-[var(--muted)] shrink-0">{label}</dt>
      {/* An absent scalar is an em dash, never "0", "Not set", or "N/A" —
          those read as a value or a failure where there is simply nothing. */}
      <dd className="text-sm text-[var(--text)] text-end truncate">
        {value || '—'}
      </dd>
    </div>
  )
}

// ============================================
// Field (internal) — a labelled text input for edit mode
// ============================================

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-[var(--muted)] mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
          'bg-[var(--input-bg)] border border-[var(--glass-border)]',
          'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
        )}
      />
    </div>
  )
}
