import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { Toggle } from '../../components/ui/Toggle'
import { isGrossProfitEnabled, setGrossProfitEnabled } from '../../lib/grossProfit'
import { formatCurrency, formatNumber } from '../../lib/formatters'
import type { BillingStats, RevenueDataPoint, BillingRingData } from '../../types/billing'
import { Card, CardBody } from '../../components/ui/Card'
import DonutCards from './DonutCards'
import RevenueChart from './RevenueChart'
import FinanceBreakdown from './FinanceBreakdown'
import SubscriptionsPanel from './SubscriptionsPanel'
import PayoutDashboard from './PayoutDashboard'
import MultiPayModal from './MultiPayModal'
import {
  TrendingUp,
  Users,
  Receipt,
  Banknote,
  CreditCard,
  Wallet,
} from 'lucide-react'

/* ─── Tab config ─── */

type BillingTab = 'subscriptions' | 'payouts'

/* Keys, not sentences. This array is built once at import, in whatever language
   happened to be active then, so it holds the key and the render body looks it
   up — a translated label here would survive a language switch untouched. */
const TABS: { key: BillingTab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'subscriptions', labelKey: 'tabs.subscriptions', icon: CreditCard },
  { key: 'payouts', labelKey: 'tabs.payouts', icon: Wallet },
]

/* ─── Component ─── */

export function BillingPage() {
  const { t } = useTranslation('billing')
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([])
  const [revenueProperty, setRevenueProperty] = useState('income')
  const [isLoading, setIsLoading] = useState(true)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [breakdownType, setBreakdownType] = useState<'students' | 'teachers'>('students')

  /* ── New state ── */
  const [activeTab, setActiveTab] = useState<BillingTab>('subscriptions')
  const [multiPayOpen, setMultiPayOpen] = useState(false)
  /* ── Gross-profit opt-in (academy-level, frontend registry) ── */
  const [grossOn, setGrossOn] = useState(() => isGrossProfitEnabled())

  /* ── Fetch stats ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const [statsRes, revenueRes] = await Promise.all([
          api.get('/billing/stats'),
          api.get('/analytics/revenue-chart', { params: { months: 6 } }),
        ])
        if (!cancelled) {
          setStats(statsRes.data)
          setRevenueData(revenueRes.data.chart_data ?? revenueRes.data ?? [])
        }
      } catch {
        // Backend unavailable
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  /* ── Fetch revenue on property change ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { data } = await api.get('/analytics/revenue-chart', {
          params: { months: 6 },
        })
        if (!cancelled) setRevenueData(data.chart_data ?? data ?? [])
      } catch {
        // Backend unavailable
      }
    }

    load()
    return () => { cancelled = true }
  }, [revenueProperty])

  /* ── Derived data ── */
  const studentRing: BillingRingData[] = stats
    ? [
        { name: t('donut.paid'), value: stats.student_paid, color: 'var(--emerald)' },
        { name: t('donut.due'), value: stats.student_due, color: 'var(--gold)' },
        { name: t('donut.overdue'), value: stats.student_overdue, color: 'var(--red)' },
      ]
    : []

  const teacherRing: BillingRingData[] = stats
    ? [
        { name: t('donut.settled'), value: stats.teacher_settled, color: 'var(--emerald)' },
        { name: t('donut.pending'), value: stats.teacher_pending, color: 'var(--gold)' },
        { name: t('donut.overdue'), value: stats.teacher_overdue, color: 'var(--red)' },
      ]
    : []

  /* ── Handlers ── */
  const handleOpenBreakdown = (type: 'students' | 'teachers') => {
    setBreakdownType(type)
    setBreakdownOpen(true)
  }

  const handleMultiPaySuccess = () => {
    // Refresh subscriptions if we're on that tab
    // The panel re-fetches on mount, so toggling would work,
    // but we can also trigger a page-level refresh
  }

  /* ── Render ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
          <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{t('page.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      {/* ── Header with Multi-Pay button ──────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)] font-[family-name:var(--font-heading)]">
            {t('page.title')}
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {t('page.subtitle')}
          </p>
        </div>

        {/* Multi-Teacher Payment button */}
        <button
          type="button"
          onClick={() => setMultiPayOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
            'text-sm font-semibold',
            'bg-gradient-to-r from-[var(--gold)] to-[var(--gold-dark, #9a7520)]',
            'text-white',
            'shadow-[0_4px_20px_rgba(179,135,42,.3)]',
            'hover:shadow-[0_6px_28px_rgba(179,135,42,.5)]',
            'hover:scale-[1.02]',
            'active:scale-[0.98]',
            'transition-all duration-200',
          )}
        >
          <Banknote className="w-4 h-4" />
          {t('page.multiPay')}
        </button>
      </div>

      {/* ── Donut ring cards ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          className="cursor-pointer hover:scale-[1.01] transition-transform"
          onClick={() => handleOpenBreakdown('students')}
        >
          <DonutCards
            title={t('donut.studentTuition')}
            data={studentRing}
            centerLabel={t('common:label.total')}
            centerValue={formatNumber(stats?.student_total ?? 0)}
          />
        </div>
        <div
          className="cursor-pointer hover:scale-[1.01] transition-transform"
          onClick={() => handleOpenBreakdown('teachers')}
        >
          <DonutCards
            title={t('donut.teacherPayroll')}
            data={teacherRing}
            centerLabel={t('common:label.total')}
            centerValue={formatNumber(stats?.teacher_total ?? 0)}
          />
        </div>
      </div>

      {/* ── Revenue chart ─────────────────────── */}
      <RevenueChart
        data={revenueData}
        property={revenueProperty}
        onPropertyChange={setRevenueProperty}
      />

      {/* ── Stat buttons + breakdown ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* This month's income */}
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] shrink-0"
                style={{ backgroundColor: 'var(--emerald-soft)', color: 'var(--emerald)' }}
              >
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-[var(--muted)] font-medium">{t('kpi.monthIncome')}</span>
                <span className="text-lg font-bold text-[var(--text)] font-[family-name:var(--font-heading)] tabular-nums">
                  {formatCurrency(stats?.month_income ?? 0)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Total enrolled */}
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] shrink-0"
                style={{ backgroundColor: 'var(--gold-soft)', color: 'var(--gold)' }}
              >
                <Users className="w-5 h-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-[var(--muted)] font-medium">{t('kpi.totalEnrolled')}</span>
                <span className="text-lg font-bold text-[var(--text)] font-[family-name:var(--font-heading)] tabular-nums">
                  {formatNumber(stats?.total_enrolled ?? 0)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Finance breakdown button */}
        <button
          type="button"
          onClick={() => handleOpenBreakdown('students')}
          className={cn(
            'flex items-center gap-3 p-4 rounded-[var(--radius-md)] text-start',
            'bg-[var(--glass)] backdrop-blur-[22px]',
            'border border-[var(--glass-border)]',
            'hover:bg-[var(--glass-strong)] hover:scale-[1.01]',
            'transition-all duration-200',
          )}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] shrink-0"
            style={{ backgroundColor: 'var(--red-soft)', color: 'var(--red)' }}
          >
            <Receipt className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-[var(--muted)] font-medium">{t('kpi.financeBreakdown')}</span>
            <span className="text-sm font-semibold text-[var(--text)] font-[family-name:var(--font-heading)]">
              {t('kpi.viewDetails')}
            </span>
          </div>
        </button>
      </div>

      {/* ── Gross-profit opt-in ─── */}
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-[22px] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">{t('grossProfit.label')}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {grossOn ? t('grossProfit.on') : t('grossProfit.off')}
          </p>
        </div>
        <Toggle
          checked={grossOn}
          onCheckedChange={(v) => { setGrossProfitEnabled(v); setGrossOn(v) }}
        />
      </div>

      {/* ── Subscriptions / Payouts tabbed section ─── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass)] backdrop-blur-[22px] shadow-[var(--glass-shadow)] overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-[var(--glass-border)]">
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                'relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium',
                'transition-colors duration-150',
                activeTab === key
                  ? 'text-[var(--gold)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]',
              )}
            >
              <Icon className="w-4 h-4" />
              {t(labelKey)}
              {/* Gold underline for active tab */}
              {activeTab === key && (
                <span className="absolute bottom-0 start-0 end-0 h-[2px] bg-[var(--gold)] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'subscriptions' && <SubscriptionsPanel />}
          {activeTab === 'payouts' && <PayoutDashboard />}
        </div>
      </div>

      {/* ── Finance breakdown modal ────────────── */}
      <FinanceBreakdown
        isOpen={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        type={breakdownType}
      />

      {/* ── Multi-Teacher Payment modal ────────── */}
      <MultiPayModal
        isOpen={multiPayOpen}
        onClose={() => setMultiPayOpen(false)}
        onSuccess={handleMultiPaySuccess}
      />
    </div>
  )
}

export default BillingPage
