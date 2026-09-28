import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Toggle } from '../../components/ui/Toggle'
import { Zap } from 'lucide-react'

/* ─── Component ─── */

export function Automations() {
  const { t } = useTranslation('settings')
  const [autoCheckout, setAutoCheckout] = useState(false)
  const [endClassPopup, setEndClassPopup] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load current settings
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await api.get('/settings/automations')
        if (!cancelled) {
          setAutoCheckout(data.auto_checkout_enabled ?? false)
          setEndClassPopup(data.end_class_popup_enabled ?? false)
        }
      } catch {
        // Use defaults
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const updateSetting = async (key: string, value: boolean) => {
    setIsSaving(true)
    try {
      await api.put('/settings/automations', { [key]: value })
    } catch {
      // Revert on failure
    } finally {
      setIsSaving(false)
    }
  }

  const handleAutoCheckout = (checked: boolean) => {
    setAutoCheckout(checked)
    updateSetting('auto_checkout_enabled', checked)
  }

  const handleEndClassPopup = (checked: boolean) => {
    setEndClassPopup(checked)
    updateSetting('end_class_popup_enabled', checked)
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Auto checkout */}
      <Card>
        <CardHeader
          title={t('automations.autoCheckout.title')}
          actions={<Zap className="w-4 h-4 text-[var(--muted)]" />}
        />
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">
                {t('automations.autoCheckout.label')}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {t('automations.autoCheckout.hint')}
              </span>
            </div>
            <Toggle
              checked={autoCheckout}
              onCheckedChange={handleAutoCheckout}
              disabled={isSaving}
            />
          </div>
        </CardBody>
      </Card>

      {/* End class popup */}
      <Card>
        <CardHeader title={t('automations.endClassPopup.title')} />
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">
                {t('automations.endClassPopup.label')}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {t('automations.endClassPopup.hint')}
              </span>
            </div>
            <Toggle
              checked={endClassPopup}
              onCheckedChange={handleEndClassPopup}
              disabled={isSaving}
            />
          </div>
        </CardBody>
      </Card>

      {/* Pro features hint */}
      <Card>
        <CardBody>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--gold-soft)] flex items-center justify-center">
              <Zap className="w-6 h-6 text-[var(--gold)]" />
            </div>
            {/* Split either side of the highlighted plan name. Only the space
                before the label lives in the markup: what follows it is the
                sentence's own space, and French and Arabic end on "Pro." with
                nothing between the plan name and its full stop. */}
            <p className="text-sm text-[var(--muted)]">
              {t('automations.proHintBefore')} <span className="font-semibold text-[var(--gold)]">Pro</span>{t('automations.proHintAfter')}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

export default Automations
