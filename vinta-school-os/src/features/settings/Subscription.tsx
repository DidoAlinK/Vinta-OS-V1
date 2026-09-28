import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Crown } from 'lucide-react'

/* ─── Tier features ───
   `key` is the value the server sends (`starter` | `pro` | `scaler`); every
   other field is a key into the settings dictionary, because the active
   language has no meaning at module scope. Prices keep the `DA` currency code
   in all three languages — only the wording around it changes. */

const TIERS = [
  {
    key: 'starter',
    labelKey: 'subscription.tier.starter',
    priceKey: 'subscription.price.free',
    featureKeys: [
      'subscription.feature.basicManagement',
      'subscription.feature.upTo3Staff',
    ],
  },
  {
    key: 'pro',
    labelKey: 'subscription.tier.pro',
    priceKey: 'subscription.price.pro',
    featureKeys: [
      'subscription.feature.billingAlerts',
      'subscription.feature.calendar',
      'subscription.feature.basicAnalytics',
      'subscription.feature.upTo10Staff',
    ],
  },
  {
    key: 'scaler',
    labelKey: 'subscription.tier.scaler',
    priceKey: 'subscription.price.scaler',
    featureKeys: [
      'subscription.feature.automations',
      'subscription.feature.unlimitedStudents',
      'subscription.feature.advancedAnalytics',
      'subscription.feature.unlimitedStaff',
    ],
  },
] as const

/* ─── Component ─── */

export function Subscription() {
  const { t } = useTranslation('settings')
  const [currentTier, setCurrentTier] = useState('starter')
  useEffect(() => {
    api.get('/settings/subscription').then(res => {
      setCurrentTier(res.data.tier || 'starter')
    }).catch(() => {}) // ignore - default to starter
  }, [])

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Current plan */}
      <Card>
        <CardHeader
          title={t('subscription.title')}
          actions={
            <Badge variant="gold" size="sm">
              <Crown className="w-3 h-3 me-1" />
              {t('subscription.tier.starter')}
            </Badge>
          }
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-4">
            {t('subscription.currentPlanBefore')}{' '}
            <span className="font-semibold text-[var(--text)]">{t('subscription.tier.starter')}</span>{' '}
            {t('subscription.currentPlanAfter')}
          </p>
        </CardBody>
      </Card>

      {/* Tier comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TIERS.map((tier) => (
          <Card key={tier.key}>
            <CardBody>
              <div className={cn(
                'flex flex-col gap-3 p-1',
                tier.key === currentTier && 'opacity-60',
              )}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-bold text-[var(--text)]"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {t(tier.labelKey)}
                  </span>
                  {tier.key === currentTier && (
                    <Badge variant="emerald" size="sm">{t('subscription.current')}</Badge>
                  )}
                </div>
                <span className="text-lg font-bold text-[var(--gold)] font-[family-name:var(--font-heading)]">
                  {t(tier.priceKey)}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {tier.featureKeys.map((key) => (
                    <li key={key} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                      <span className="text-[var(--emerald)] mt-0.5">✓</span>
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Subscription
