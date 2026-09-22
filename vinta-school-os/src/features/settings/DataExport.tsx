import { useState, useCallback } from 'react'
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

/* ─── Export items config ─── */

const EXPORT_ITEMS = [
  { label: 'Students', endpoint: '/settings/export/students', file: 'students.csv' },
  { label: 'Teachers', endpoint: '/settings/export/teachers', file: 'teachers.csv' },
  { label: 'Classes', endpoint: '/settings/export/classes', file: 'classes.csv' },
  { label: 'Billing Records', endpoint: '/settings/export/billing', file: 'billing.csv' },
  { label: 'Activity Log', endpoint: '/settings/export/activity-log', file: 'activity-log.csv' },
] as const

/* ─── Component ─── */

export function DataExport() {
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = useCallback(async (endpoint: string, filename: string, label: string) => {
    setExporting(label)
    try {
      const response = await api.get(endpoint, { responseType: 'blob' })
      const blob = response.data instanceof Blob ? response.data : new Blob([JSON.stringify(response.data)], { type: 'text/csv' })
      triggerDownload(blob, filename)
      toast.success(`${label} exported successfully`)
    } catch {
      toast.error(`Failed to export ${label}`)
    } finally {
      setExporting(null)
    }
  }, [])

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Export options */}
      <Card>
        <CardHeader title="Export Data" actions={<Download className="w-4 h-4 text-[var(--muted)]" />} />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-4">
            Download your academy data as CSV files for backup or analysis.
          </p>
          <div className="flex flex-col gap-3">
            {EXPORT_ITEMS.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-[var(--radius-sm)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium text-[var(--text)]">{item.label}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={exporting === item.label}
                  onClick={() => handleExport(item.endpoint, item.file, item.label)}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
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
