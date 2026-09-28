import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { AlertTriangle, Trash2, LogOut } from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/uiStore'

/* ─── Component ─── */

export function DangerZone() {
  const { t } = useTranslation('settings')
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  // One input, two dialogs, and each names its own word.
  //
  // The word belongs to the dialog that is open rather than to the field, so
  // the box the desk is looking at and the rule that enables its button cannot
  // drift apart. Reset and Delete are different sizes of the same mistake —
  // one loses the academy's data, the other loses the academy — and typing the
  // sharper word for the smaller action would defeat the point of asking.
  const requiredWord = deleteOpen ? 'DELETE' : 'Reset'
  const canConfirm = confirmText === requiredWord

  const handleReset = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await api.post('/settings/reset-data')
      toast.success(t('danger.toast.resetDone'))
      setResetOpen(false)
      setConfirmText('')
      window.location.reload()
    } catch (err: unknown) {
      // Say what the server said. "Please try again" is all a 500 can offer,
      // but a refusal has a reason, and the desk cannot act on a shrug.
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t('danger.toast.resetFailedBody')
      toast.error(t('danger.toast.resetFailedTitle'), msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAcademy = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await api.put('/settings/academy', { confirm_delete: true })
      toast.success(t('danger.toast.deletedDone'))
      setDeleteOpen(false)
      setConfirmText('')
      logout()
      navigate('/')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t('danger.toast.deleteFailedBody')
      toast.error(t('danger.toast.deleteFailedTitle'), msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Reset data */}
      <Card>
        <CardHeader title={t('danger.reset.title')} />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            {t('danger.reset.description')}
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => { setResetOpen(true); setDeleteOpen(false); setConfirmText('') }}
          >
            <Trash2 className="w-4 h-4" />
            {t('danger.reset.action')}
          </Button>
        </CardBody>
      </Card>

      {/* Delete academy */}
      <Card>
        <CardHeader title={t('danger.delete.title')} />
        <CardBody>
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--red-soft)] border border-[var(--red)]/20 mb-3">
            <AlertTriangle className="w-5 h-5 text-[var(--red)] shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--red)]">{t('danger.delete.warning')}</span>
              <span className="text-xs text-[var(--muted)]">
                {t('danger.delete.description')}
              </span>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => { setDeleteOpen(true); setResetOpen(false); setConfirmText('') }}>
            <LogOut className="w-4 h-4" />
            {t('danger.delete.title')}
          </Button>
        </CardBody>
      </Card>

      {/* Confirm reset modal */}
      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setConfirmText('') }} title={t('danger.reset.action')} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            {t('danger.resetModal.bodyBefore')} <span className="font-mono font-semibold text-[var(--red)]">Reset</span> {t('danger.resetModal.bodyAfter')}
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('danger.resetModal.placeholder')}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--red)]/30',
              'placeholder:text-[var(--muted)]/50',
            )}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setResetOpen(false); setConfirmText('') }}>
              {t('common:action.cancel')}
            </Button>
            <Button variant="danger" disabled={!canConfirm || loading} onClick={handleReset}>
              {loading ? t('danger.resetModal.busy') : t('danger.resetModal.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete academy modal */}
      <Modal open={deleteOpen} onClose={() => { setDeleteOpen(false); setConfirmText('') }} title={t('danger.delete.title')} size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--red-soft)]">
            <AlertTriangle className="w-5 h-5 text-[var(--red)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--muted)]">
              {t('danger.deleteModal.warning')}
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {t('danger.deleteModal.bodyBefore')} <span className="font-mono font-semibold text-[var(--red)]">DELETE</span> {t('danger.deleteModal.bodyAfter')}
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('danger.deleteModal.placeholder')}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--red)]/30',
              'placeholder:text-[var(--muted)]/50',
            )}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDeleteOpen(false); setConfirmText('') }}>
              {t('common:action.cancel')}
            </Button>
            <Button variant="danger" disabled={!canConfirm || loading} onClick={handleDeleteAcademy}>
              {loading ? t('danger.deleteModal.busy') : t('danger.deleteModal.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DangerZone
