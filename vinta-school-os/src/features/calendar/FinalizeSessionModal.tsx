/**
 * Vinta School OS — Finalize Session Modal
 * "Is the class done?" flow: owner confirms session completion,
 * triggers teacher payout computation.
 */

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  CheckCircle2,
  XCircle,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import type { Session } from '../../types/class'

// ============================================
// Props
// ============================================

export interface FinalizeSessionModalProps {
  isOpen: boolean
  onClose: () => void
  session: Session | null
  onSuccess?: () => void
}

// ============================================
// Component
// ============================================

export default function FinalizeSessionModal({
  isOpen,
  onClose,
  session,
  onSuccess,
}: FinalizeSessionModalProps) {
  const { t } = useTranslation('calendar')
  const [isDone, setIsDone] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleClose = useCallback(() => {
    setIsDone(null)
    setPin('')
    setIsSuccess(false)
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!session || isDone === null || pin.length !== 4) return
    setIsSubmitting(true)
    try {
      // T1 lifecycle lock: backend finalize expects `conducted` (new money-model).
      // Send both keys for back-compat; `conducted` is authoritative.
      await api.post(`/billing/sessions/${session.id}/finalize`, {
        conducted: isDone,
        is_done: isDone,
        pin: pin.trim(),
      })
      setIsSuccess(true)
      toast.success(
        isDone ? t('finalize.toastFinalizedTitle') : t('finalize.toastKeptOpenTitle'),
        isDone
          ? t('finalize.toastFinalizedBody')
          : t('finalize.toastKeptOpenBody'),
      )
      setTimeout(() => {
        onSuccess?.()
        handleClose()
      }, 1200)
    } catch {
      toast.error(t('finalize.toastFailedTitle'), t('finalize.toastFailedBody'))
    } finally {
      setIsSubmitting(false)
    }
  }, [session, isDone, pin, onSuccess, handleClose, t])

  if (!isOpen || !session) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={cn(
          'w-full max-w-sm mx-4 rounded-2xl',
          'bg-[var(--card-bg)] border border-[var(--glass-border)]',
          'shadow-2xl animate-fade-in',
        )}
      >
        {/* ── Header ──────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: isDone ? 'var(--emerald-soft)' : 'var(--gold-soft)' }}
            >
              {isSuccess ? (
                <CheckCircle2 size={16} style={{ color: 'var(--emerald)' }} />
              ) : (
                <AlertTriangle size={16} style={{ color: 'var(--gold)' }} />
              )}
            </div>
            <h2
              className="text-base font-bold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {isSuccess ? t('finalize.titleDone') : t('finalize.titleQuestion')}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--glass)] transition-colors"
            aria-label={t('common:action.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Content ─────────────────────────── */}
        <div className="px-5 py-5">
          {isSuccess ? (
            <div className="text-center py-4">
              <p className="text-sm text-[var(--muted)]">
                {isDone
                  ? t('finalize.payoutComputed')
                  : t('finalize.inProgress')}
              </p>
            </div>
          ) : (
            <>
              {/* Session info */}
              <p className="text-xs text-[var(--muted)] mb-4">
                {session.class_name} · {session.subject} ·{' '}
                {session.teacher_name}
              </p>

              {/* Yes / No toggle */}
              <div className="flex gap-3 mb-5">
                <button
                  onClick={() => setIsDone(true)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium',
                    'border transition-all duration-150',
                    isDone === true
                      ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                      : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:border-[var(--emerald)]/30',
                  )}
                >
                  <CheckCircle2 size={16} />
                  {t('finalize.yes')}
                </button>
                <button
                  onClick={() => setIsDone(false)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium',
                    'border transition-all duration-150',
                    isDone === false
                      ? 'bg-[var(--gold-soft)] border-[var(--gold)]/30 text-[var(--gold)]'
                      : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:border-[var(--gold)]/30',
                  )}
                >
                  <XCircle size={16} />
                  {t('finalize.no')}
                </button>
              </div>

              {/* PIN input */}
              {isDone !== null && (
                <div className="space-y-3 animate-fade-in">
                  <div className="relative">
                    <Lock size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder={t('finalize.pinPlaceholder')}
                      className={cn(
                        'w-full ps-9 pe-3 py-2.5 rounded-xl text-sm text-center tracking-[0.3em]',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'text-[var(--text)] outline-none',
                        'focus:ring-2 focus:ring-[var(--gold)]/30',
                        'placeholder:text-[var(--muted)]/50 placeholder:tracking-normal',
                      )}
                    />
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={pin.length !== 4 || isSubmitting}
                    className={cn(
                      'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
                      'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d]',
                      'hover:opacity-90 active:scale-[0.98]',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                      'transition-all duration-150',
                    )}
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : isDone ? (
                      t('finalize.finalize')
                    ) : (
                      t('finalize.keepOpen')
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
