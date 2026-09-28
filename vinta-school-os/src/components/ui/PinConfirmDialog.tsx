/**
 * Vinta School OS — PIN confirm dialog
 *
 * "Delete" was one click. This is the two-step it should have been: the PIN
 * proves it is the signed-in person, and only then does the action run.
 *
 * Built on the house `Modal` so it matches every other dialog in the app, and
 * on `PinStep` so the PIN behaviour is identical wherever it is asked for.
 *
 * The three ways out are deliberate and all of them are safe:
 *   - Cancel, the ✕, the backdrop and Escape abort without acting.
 *   - A wrong PIN reports the failure and keeps the dialog open. It never
 *     closes a gate on failure — that would be the whole feature inverted.
 *   - Only an accepted PIN runs `onConfirm`.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'
import Modal from './Modal'
import PinStep from './PinStep'

export interface PinConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** What is about to happen, in the caller's own words. */
  message: ReactNode
  /** Runs only after the PIN is accepted. Async is awaited before closing. */
  onConfirm: () => void | Promise<void>
  /**
   * Label of the affirm button, once the PIN has been accepted.
   * Default: common:action.delete.
   */
  confirmLabel?: string
  /** Label of the affirm button while the PIN is being checked. */
  busyLabel?: string
}

export function PinConfirmDialog({
  open,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel,
  busyLabel,
}: PinConfirmDialogProps) {
  const { t } = useTranslation('common')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* The Modal keeps this component mounted while closed, so the leftover busy
     flag or error from the last time would be waiting on the next open. */
  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError(null)
  }, [open])

  const handleVerified = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      // The call sites toast their own failures; this is the belt-and-braces
      // path so a dialog can never close on an action that did not happen.
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('pinConfirm.failed'),
      )
    } finally {
      setBusy(false)
    }
  }, [onConfirm, onClose, t])

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div
          className={cn(
            'flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs',
            'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30',
          )}
        >
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>{t('pinConfirm.warning')}</span>
        </div>

        <div className="text-sm text-[var(--text)] leading-relaxed">{message}</div>

        {error && (
          <p className="text-xs text-[var(--red)] font-medium" role="alert">
            {error}
          </p>
        )}

        {busy ? (
          <div className="flex items-center justify-center py-8">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <>
            <PinStep
              hint={t('pinConfirm.hint')}
              submitLabel={confirmLabel ?? t('action.delete')}
              busyLabel={busyLabel ?? t('pinConfirm.busy')}
              onVerified={handleVerified}
            />
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'w-full py-2 rounded-xl text-xs font-medium',
                'bg-[var(--input-bg)] text-[var(--muted)]',
                'border border-[var(--glass-border)]',
                'hover:text-[var(--text)] transition-colors duration-150',
              )}
            >
              {t('pinConfirm.cancel')}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

export default PinConfirmDialog
