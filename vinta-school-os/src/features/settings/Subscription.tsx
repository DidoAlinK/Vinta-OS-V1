import { useState, useEffect } from 'react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Crown } from 'lucide-react'

/* ─── Tier features ─── */

const TIERS = [
  {
    key: 'starter',
    label: 'Starter',
    price: 'Free',
    features: ['Basic student/teacher management', 'Up to 3 staff profiles'],
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '2,500 DA/mo',
    features: ['Billing alerts', 'Calendar', 'Basic analytics', 'Up to 10 staff profiles'],
  },
  {
    key: 'scaler',
    label: 'Scaler',
    price: '5,000 DA/mo',
    features: ['Automations', 'Unlimited students', 'Advanced analytics', 'Unlimited staff'],
  },
] as const

/* ─── Component ─── */

export function Subscription() {
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
          title="Subscription"
          actions={
            <Badge variant="gold" size="sm">
              <Crown className="w-3 h-3 mr-1" />
              Starter
            </Badge>
          }
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-4">
            You are currently on the <span className="font-semibold text-[var(--text)]">Starter</span> plan (free).
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
                    {tier.label}
                  </span>
                  {tier.key === currentTier && (
                    <Badge variant="emerald" size="sm">Current</Badge>
                  )}
                </div>
                <span className="text-lg font-bold text-[var(--gold)] font-[family-name:var(--font-heading)]">
                  {tier.price}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                      <span className="text-[var(--emerald)] mt-0.5">✓</span>
                      {f}
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
