import { useState } from 'react'
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
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  const canConfirm = confirmText === 'DELETE'

  const handleReset = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await api.post('/settings/reset-data')
      toast.success('Academy data has been reset.')
      setResetOpen(false)
      setConfirmText('')
      window.location.reload()
    } catch {
      toast.error('Reset failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAcademy = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await api.put('/settings/academy', { confirm_delete: true })
      toast.success('Academy deleted. Redirecting...')
      setDeleteOpen(false)
      setConfirmText('')
      logout()
      navigate('/')
    } catch {
      toast.error('Delete failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Reset data */}
      <Card>
        <CardHeader title="Reset All Data" />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            Remove all students, teachers, classes, and billing records. This cannot be undone.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => { setResetOpen(true); setConfirmText('') }}
          >
            <Trash2 className="w-4 h-4" />
            Reset Academy Data
          </Button>
        </CardBody>
      </Card>

      {/* Delete academy */}
      <Card>
        <CardHeader title="Delete Academy" />
        <CardBody>
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--red-soft)] border border-[var(--red)]/20 mb-3">
            <AlertTriangle className="w-5 h-5 text-[var(--red)] shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--red)]">This action is irreversible</span>
              <span className="text-xs text-[var(--muted)]">
                Deleting your academy will permanently remove all data including student records, billing history, and staff accounts.
              </span>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => { setDeleteOpen(true); setConfirmText('') }}>
            <LogOut className="w-4 h-4" />
            Delete Academy
          </Button>
        </CardBody>
      </Card>

      {/* Confirm reset modal */}
      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setConfirmText('') }} title="Reset Academy Data" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            This will permanently delete all data. Type <span className="font-mono font-semibold text-[var(--red)]">DELETE</span> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--red)]/30',
              'placeholder:text-[var(--muted)]/50',
            )}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setResetOpen(false); setConfirmText('') }}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!canConfirm || loading} onClick={handleReset}>
              {loading ? 'Resetting...' : 'Reset Everything'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete academy modal */}
      <Modal open={deleteOpen} onClose={() => { setDeleteOpen(false); setConfirmText('') }} title="Delete Academy" size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--red-soft)]">
            <AlertTriangle className="w-5 h-5 text-[var(--red)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--muted)]">
              This will permanently delete your academy and ALL associated data. This cannot be undone.
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Type <span className="font-mono font-semibold text-[var(--red)]">DELETE</span> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm text-[var(--text)]',
              'bg-[var(--input-bg)] border border-[var(--glass-border)]',
              'outline-none focus:ring-2 focus:ring-[var(--red)]/30',
              'placeholder:text-[var(--muted)]/50',
            )}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDeleteOpen(false); setConfirmText('') }}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!canConfirm || loading} onClick={handleDeleteAcademy}>
              {loading ? 'Deleting...' : 'Delete Academy Forever'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DangerZone
