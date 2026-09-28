import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/authStore'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { Academy } from '../../types/settings'
import { Save } from 'lucide-react'

/* ─── Props ─── */

export interface AcademyProfileProps {
  academy: Academy
  onUpdate: (data: Partial<Academy>) => void
}

/* ─── Working days (Sun–Sat) ─── */

// Key names, not sentences: the lookup happens in the component body so a
// language switch re-renders instead of freezing the import-time language.
const WORKING_DAYS = [
  { value: 0, labelKey: 'academy.day.sun' },
  { value: 1, labelKey: 'academy.day.mon' },
  { value: 2, labelKey: 'academy.day.tue' },
  { value: 3, labelKey: 'academy.day.wed' },
  { value: 4, labelKey: 'academy.day.thu' },
  { value: 5, labelKey: 'academy.day.fri' },
  { value: 6, labelKey: 'academy.day.sat' },
]

// The term *value* is what the server stores, so it stays English whatever the
// interface language is; only the label the desk reads is translated.
const TERM_OPTIONS = [
  { value: 'Term 1', labelKey: 'academy.term.term1' },
  { value: 'Term 2', labelKey: 'academy.term.term2' },
  { value: 'Full Year', labelKey: 'academy.term.fullYear' },
]

/* ─── Component ─── */

export function AcademyProfile({ academy, onUpdate }: AcademyProfileProps) {
  const { t } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)

  // Pull initial data from auth store user if academy data is empty
  const [form, setForm] = useState({
    name: academy.name || user?.name || '',
    phone: academy.phone || user?.phone || '',
    email: academy.email || user?.email || '',
    address: academy.address || '',
    weekend_day: academy.weekend_day, // kept for backend compatibility
    current_term: academy.current_term,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Academy Info */}
      <Card>
        <CardHeader title={t('academy.info.title')} />
        <CardBody>
          <div className="flex flex-col gap-4">
            <Input
              label={t('academy.info.name')}
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={t('academy.info.namePlaceholder')}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('common:label.phone')}
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+213 5## ## ## ##"
              />
              <Input
                label={t('academy.info.email')}
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="contact@academy.dz"
              />
            </div>

            <Input
              label={t('academy.info.address')}
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder={t('academy.info.addressPlaceholder')}
            />
          </div>
        </CardBody>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader title={t('academy.schedule.title')} />
        <CardBody>
          <div className="flex flex-col gap-4">
            {/* Working days — Sun to Sat, all selected by default */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text)] font-[family-name:var(--font-heading)]">
                {t('academy.schedule.workingDays')}
              </label>
              <p className="text-xs text-[var(--muted)] mb-1">
                {t('academy.schedule.hours')}
              </p>
              <div className="flex gap-1.5">
                {WORKING_DAYS.map((day) => (
                  <div
                    key={day.value}
                    className={cn(
                      'px-3 py-2 text-xs font-medium rounded-lg',
                      'bg-[var(--emerald-soft)] border border-[var(--emerald)]/20 text-[var(--emerald)]',
                    )}
                  >
                    {t(day.labelKey)}
                  </div>
                ))}
              </div>
            </div>

            {/* Current Term */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text)] font-[family-name:var(--font-heading)]">
                {t('academy.schedule.currentTerm')}
              </label>
              <div className="flex gap-2">
                {TERM_OPTIONS.map((term) => (
                  <button
                    key={term.value}
                    type="button"
                    onClick={() => handleChange('current_term', term.value)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
                      'border transition-all duration-200',
                      form.current_term === term.value
                        ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)]'
                        : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)]',
                    )}
                  >
                    {t(term.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          loading={isSaving}
          variant="primary"
        >
          <Save className="w-4 h-4" />
          {t('academy.action.save')}
        </Button>
        {saved && (
          <span className="text-sm text-[var(--emerald)] font-medium animate-fade-in">
            {t('academy.saved')}
          </span>
        )}
      </div>
    </div>
  )
}

export default AcademyProfile
