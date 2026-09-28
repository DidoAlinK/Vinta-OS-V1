import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Download, FileText } from 'lucide-react'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'

/* ─── Helpers ─── */

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Export items config ───
   Key names rather than sentences: the map is read at module scope, where the
   active language is not yet the one the desk is looking at. */

const EXPORT_ITEMS = [
  { labelKey: 'export.items.students', endpoint: '/settings/export/students', file: 'students.csv' },
  { labelKey: 'export.items.teachers', endpoint: '/settings/export/teachers', file: 'teachers.csv' },
  { labelKey: 'export.items.classes', endpoint: '/settings/export/classes', file: 'classes.csv' },
  { labelKey: 'export.items.billing', endpoint: '/settings/export/billing', file: 'billing.csv' },
  { labelKey: 'export.items.activityLog', endpoint: '/settings/export/activity-log', file: 'activity-log.csv' },
] as const

/* ─── Component ─── */

export function DataExport() {
  const { t } = useTranslation('settings')
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = useCallback(async (labelKey: string, endpoint: string, filename: string) => {
    setExporting(labelKey)
    const label = t(labelKey)
    try {
      const response = await api.get(endpoint, { responseType: 'blob' })
      const blob = response.data instanceof Blob ? response.data : new Blob([JSON.stringify(response.data)], { type: 'text/csv' })
      triggerDownload(blob, filename)
      toast.success(t('export.toast.success', { label }))
    } catch {
      toast.error(t('export.toast.failed', { label }))
    } finally {
      setExporting(null)
    }
  }, [t])

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Export options */}
      <Card>
        <CardHeader title={t('export.title')} actions={<Download className="w-4 h-4 text-[var(--muted)]" />} />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-4">
            {t('export.description')}
          </p>
          <div className="flex flex-col gap-3">
            {EXPORT_ITEMS.map((item) => (
              <div
                key={item.labelKey}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-[var(--radius-sm)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium text-[var(--text)]">{t(item.labelKey)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={exporting === item.labelKey}
                  onClick={() => handleExport(item.labelKey, item.endpoint, item.file)}
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('export.action')}
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

export default DataExport
