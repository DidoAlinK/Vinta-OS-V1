import { useState, useEffect, useCallback } from 'react'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { AcademySettings } from '../../types/settings'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/uiStore'
import api from '../../lib/api'
import {
  BILLING_RULE_DEFAULTS,
  BILLING_RULE_FIELDS,
  getSwapWindow,
  hydrateBillingRules,
  setBillingRule,
  setSwapWindow,
  snapshotBillingRules,
  type BillingRuleField,
  type SwapLinkWindow,
} from '../../lib/billingRules'
import { Toggle } from '../../components/ui/Toggle'
import { GROSS_PROFIT_LABEL } from '../../lib/constants'
import { isGrossProfitEnabled, setGrossProfitEnabled } from '../../lib/grossProfit'
import { Save, Plus, X, Trash2, Coins, Clock, Users, Lock, RefreshCw } from 'lucide-react'

/* ─── The Billing Rules, and the question each one answers ─── */

/**
 * Every rule the server stores, in the order the desk meets them.
 *
 * Data rather than seven hand-written blocks: they are identical in shape and
 * the only thing that varies is the sentence. The old markup repeated the
 * switch three times and the three copies had already drifted — one said its
 * change applied "next Monday" while the server had no such notion.
 */
const RULE_ROWS: Array<{ field: BillingRuleField; label: string; hint: string }> = [
  {
    field: 'absence_consumes_credit',
    label: 'Charge for missed sessions?',
    hint: 'ON: a student who did not turn up still spends a credit at End Class. OFF: only the students who came are charged, and an absence costs nothing.',
  },
  {
    field: 'allow_makeups_default',
    label: 'Allow makeups?',
    hint: 'ON: an absence banks a makeup credit instead of burning the seat. This is the default for new groups, and each group can be set differently.',
  },
  {
    field: 'count_gap_sessions',
    label: 'Charge sessions missed while overdue?',
    hint: 'ON: classes missed during a payment gap are charged against the next plan. OFF: a new payment always starts a clean cycle.',
  },
  {
    field: 'restore_credits_on_cancellation',
    label: 'Give a credit back when a class is cancelled?',
    hint: 'ON: cancelling a class that already charged returns the credit. OFF: the academy keeps it.',
  },
  {
    field: 'free_session_auto_present',
    label: 'Free sessions fill their own register?',
    hint: 'ON: a free session marks everyone present and skips tracking — there is no money on it, so the register earns nothing. OFF: you mark it yourself for the record. Billing is 0 either way.',
  },
  {
    field: 'share_credits_across_groups',
    label: 'Share credits across groups?',
    hint: 'ON: one credit pool covers every group of the same subject. OFF: each group needs its own subscription.',
  },
  {
    field: 'early_payment_on_extra_sessions',
    label: 'Ask for renewal early?',
    hint: 'ON: the desk is prompted as soon as extra sessions drain the credits, rather than waiting for the cycle to end.',
  },
]

/** The server's own words when it refuses a write. */
function serverMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })
    ?.response?.data
  return data?.error || data?.message || fallback
}

/* ─── Props ─── */

export interface BillingConfigProps {
  settings: AcademySettings
  onUpdate: (data: Partial<AcademySettings>) => void
}

/* ─── Types ─── */

interface BillingPreset {
  id: string
  label: string
  days: number
}

/* ─── Constants ─── */

const PRESETS_STORAGE_KEY = 'vinta_billing_presets'

const DEFAULT_PRESETS: BillingPreset[] = [
  { id: 'default-1m', label: '1 Month', days: 30 },
  { id: 'default-3m', label: '3 Months', days: 90 },
  { id: 'default-6m', label: '6 Months', days: 180 },
]

const CURRENCY_OPTIONS = [
  { value: 'DZD', label: 'DZD (د.ج)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
]

const REMINDER_PRESETS = [1, 2, 3, 5, 7]

/* ─── Helpers ─── */

function loadPresets(): BillingPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // corrupt storage
  }
  // First load → seed defaults
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(DEFAULT_PRESETS))
  return DEFAULT_PRESETS
}

function savePresets(presets: BillingPreset[]) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

/* ─── Component ─── */

export function BillingConfig({ settings, onUpdate }: BillingConfigProps) {
  const [form, setForm] = useState({
    currency: settings.currency,
    default_plan_duration: settings.default_plan_duration,
    billing_reminder_days_before: settings.billing_reminder_days_before,
    whatsapp_template: settings.whatsapp_template,
    // New money model defaults
    default_credits_per_cycle: (settings as any).default_credits_per_cycle ?? 4,
    allow_rollover_default: (settings as any).allow_rollover_default ?? false,
    allow_makeups_default: (settings as any).allow_makeups_default ?? true,
    default_access_weeks: (settings as any).default_access_weeks ?? null,
    default_max_groups: (settings as any).default_max_groups ?? 1,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Preset system
  const [presets, setPresets] = useState<BillingPreset[]>(loadPresets)
  const [showAddPreset, setShowAddPreset] = useState(false)
  const [newPresetLabel, setNewPresetLabel] = useState('')
  const [newPresetDays, setNewPresetDays] = useState('')

  // Academy gross-profit opt-in (frontend registry, OFF by default)
  const [grossAcademy, setGrossAcademy] = useState(() => isGrossProfitEnabled())

  /* ── The Billing Rules, read from and written to the server ──
   *
   * These were localStorage preferences with a Monday version log, which
   * meant the screen agreed with itself and disagreed with the columns that
   * actually decide who is charged. See lib/billingRules.ts. The values here
   * mirror the last answer the server gave; every change is a PUT.
   */
  const [rules, setRules] = useState(() => snapshotBillingRules())
  const [rulesLoaded, setRulesLoaded] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [savingRule, setSavingRule] = useState<BillingRuleField | null>(null)

  const loadRules = useCallback(async () => {
    setRulesError(null)
    try {
      setRules(await hydrateBillingRules())
      setRulesLoaded(true)
    } catch (err) {
      // 403 here means a staff login on an owner-only endpoint. Saying
      // "defaults" is honest; showing the defaults as if they were the
      // academy's own rules would not be.
      setRulesError(serverMessage(err, 'Could not read the rules from the server.'))
    }
  }, [])

  useEffect(() => { void loadRules() }, [loadRules])

  // Persist presets whenever they change (but not on first render)
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (initialized) {
      savePresets(presets)
    } else {
      setInitialized(true)
    }
  }, [presets, initialized])

  const handleChange = (field: string, value: string | number | boolean | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleAddPreset = () => {
    const days = parseInt(newPresetDays, 10)
    const label = newPresetLabel.trim()
    if (!days || days <= 0 || !label) return

    const newPreset: BillingPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      days,
    }

    setPresets((prev) => [...prev, newPreset])
    setForm((prev) => ({ ...prev, default_plan_duration: days }))
    setNewPresetLabel('')
    setNewPresetDays('')
    setShowAddPreset(false)
    setSaved(false)
  }

  const handleRemovePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id))
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

  // ── Owner PIN gate ──
  const userRole = useAuthStore((s) => s.user?.role ?? 'staff')
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinChecking, setPinChecking] = useState(false)
  const [pinOk, setPinOk] = useState(false)
  /** The rule whose flip is waiting on the PIN. */
  const [pendingField, setPendingField] = useState<BillingRuleField | null>(null)

  const [swapWindow, setSwapWindowState] = useState<SwapLinkWindow>(() => getSwapWindow())

  /**
   * Write one rule to the server.
   *
   * The server is owner-only on this endpoint as well, so a refusal is shown
   * rather than swallowed: a flip that silently did nothing would leave this
   * screen claiming a change the money paths never heard about — which is the
   * bug this replaced.
   *
   * This is the write, not the gate. The PIN is checked by the caller before it
   * gets here: `requestFlip` for a direct press, `handleVerifyPin` for the flip
   * that was waiting on the modal. Reading `pinOk` here instead would have been
   * a closure bug — the flip that follows a successful verify runs in the render
   * where the PIN was still unverified, so the gate would have refused the very
   * change it was opened to allow.
   */
  const flipRule = useCallback(async (field: BillingRuleField) => {
    if (userRole !== 'owner') {
      toast.error('Owner PIN only', 'Billing rules require the owner role.')
      return
    }
    setSavingRule(field)
    try {
      await setBillingRule(field, !snapshotBillingRules()[field])
      setRules(snapshotBillingRules())
      const label = RULE_ROWS.find((r) => r.field === field)?.label ?? field
      toast.success('Rule updated', `${label} — applies from the next class, not retroactively.`)
    } catch (err) {
      toast.error('Could not change the rule', serverMessage(err, 'The server refused the change.'))
    } finally {
      setSavingRule(null)
    }
  }, [userRole])

  const requestFlip = (field: BillingRuleField) => {
    if (userRole !== 'owner') {
      toast.error('Owner PIN only', 'Billing rules require the owner role.')
      return
    }
    if (pinOk) {
      // Already verified this session — apply immediately.
      void flipRule(field)
      return
    }
    // Held here until the PIN lands; handleVerifyPin reads it back.
    setPendingField(field)
    setPin('')
    setPinError(null)
    setPinOpen(true)
  }

  const handleVerifyPin = async () => {
    if (pin.length !== 4) return
    setPinError(null)
    setPinChecking(true)
    try {
      const staff = await api.get('/settings/staff')
      const owner = (staff.data.staff ?? []).find((u: any) => u.role === 'owner')
      if (!owner) {
        const msg = 'Owner profile Not set.'
        setPinError(msg)
        toast.error('PIN blocked', msg)
        return
      }
      await api.post('/auth/verify-pin', { user_id: owner.id, pin: pin.trim() })
      setPinOk(true)
      setPinOpen(false)
      if (pendingField) {
        void flipRule(pendingField)
        setPendingField(null)
      }
      setPin('')
      toast.success('Owner verified', 'Billing rules unlocked for this session.')
    } catch (err: any) {
      const msg = err?.response?.status === 401 ? 'Invalid PIN.' : 'Verification failed. Press Retry.'
      setPinError(msg)
      toast.error('PIN blocked', msg)
    } finally {
      setPinChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* The money rules, as the server holds them. Every one of these is a
          column on academy_settings that the money paths read live, so this
          card is a view onto that row and nothing else. */}
      <Card>
        <CardHeader title="Billing Rules" />
        <CardBody>
          {/* Academy gross-profit opt-in */}
          <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--glass-border)]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">
                {GROSS_PROFIT_LABEL}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                Off by default. When on, commission model shows per teacher and
                gross/cut math renders across payouts and session finances.
              </p>
            </div>
            <Toggle
              checked={grossAcademy}
              onCheckedChange={(v) => { setGrossProfitEnabled(v); setGrossAcademy(v) }}
            />
          </div>

          {/* Every rule the server stores, written straight to it. Owner PIN only. */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
              Academy rules · owner only
            </p>
            {pinOk ? (
              <span className="text-[10px] font-semibold text-[var(--emerald)] bg-[var(--emerald-soft)] px-2 py-0.5 rounded-full">
                Owner verified
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setPendingField(null); setPin(''); setPinError(null); setPinOpen(true) }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--gold)] hover:underline"
              >
                <Lock size={11} />
                Verify owner PIN
              </button>
            )}
          </div>

          {rulesError && (
            <div className="flex items-start gap-2 rounded-xl bg-[var(--red-soft)]/30 px-3 py-2.5 mb-3">
              <p className="text-[11px] text-[var(--red)] leading-relaxed flex-1">
                {rulesError} What you see below is the documented default, not necessarily this
                academy's rule.
              </p>
              <button
                type="button"
                onClick={() => void loadRules()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--gold)] hover:underline shrink-0"
              >
                <RefreshCw size={11} />
                Retry
              </button>
            </div>
          )}

          <div className="space-y-3">
            {RULE_ROWS.map((row) => {
              const on = rules[row.field]
              const busy = savingRule === row.field
              return (
                <div key={row.field} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">{row.label}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{row.hint}</p>
                    <p className="text-[11px] text-[var(--muted)] mt-1">
                      {busy
                        ? 'Saving…'
                        : rulesLoaded
                          ? `Currently ${on ? 'ON' : 'OFF'} — stored on the server.`
                          : `Showing the default (${on ? 'ON' : 'OFF'}) — not read from the server yet.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => requestFlip(row.field)}
                    disabled={busy}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0',
                      'border transition-all duration-150 disabled:opacity-50',
                      on
                        ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                        : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
                    )}
                    title={`${row.field} — stored on the server, owner PIN`}
                  >
                    <span className={cn(
                      'w-8 h-4 rounded-full relative transition-colors duration-200',
                      on ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
                    )}>
                      <span className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                        on ? 'left-4.5' : 'left-0.5',
                      )} />
                    </span>
                    {on ? 'On' : 'Off'}
                  </button>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">
            A rule is read at the moment a class is finalised, so a change applies from the next
            class and never rewrites one that has already been paid out.
          </p>

          {/* Guest swap window — the server has no column for this one. */}
          <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
            <p className="text-sm font-semibold text-[var(--text)]">Guest swap window?</p>
            <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
              SAME_DAY: a guest links only to a session on the same calendar day. OPEN: a 7-day
              rolling window. Saved in this browser — the server keeps no field for it, so it does
              not follow the academy onto another machine.
            </p>
            <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)] mt-2">
              {(['SAME_DAY', 'OPEN'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setSwapWindow(v); setSwapWindowState(v) }}
                  className={cn(
                    'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                    swapWindow === v
                      ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                      : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                  )}
                >
                  {v === 'SAME_DAY' ? 'Same day' : 'Open 7d'}
                </button>
              ))}
            </div>
          </div>

          {/* Owner PIN gate */}
          {pinOpen && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center"
              style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
              onClick={(e) => { if (e.target === e.currentTarget) { setPinOpen(false); setPendingField(null) } }}
            >
              <div className="w-full max-w-xs mx-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--glass-border)] shadow-2xl p-5">
                <p className="text-sm font-bold text-[var(--text)] mb-1">Owner PIN required</p>
                <p className="text-[11px] text-[var(--muted)] mb-3">Billing rules change only with owner verification.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className={cn(inputCls, 'text-center tracking-[0.3em]')}
                />
                {pinError && <p className="text-xs text-[var(--red)] mt-2">{pinError}</p>}
                <button
                  type="button"
                  onClick={() => void handleVerifyPin()}
                  disabled={pin.length !== 4 || pinChecking}
                  className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {pinChecking ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Currency */}
      <Card>
        <CardHeader title="Currency" />
        <CardBody>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text)] font-[family-name:var(--font-heading)]">
              Default Currency
            </label>
            <div className="flex gap-2 flex-wrap">
              {CURRENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange('currency', opt.value)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
                    'border transition-all duration-200',
                    form.currency === opt.value
                      ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)]'
                      : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Money Model Defaults */}
      <Card>
        <CardHeader title="Money Model Defaults" />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-4">
            Default values applied to new Course Groups. You can override per-group.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {/* Credits per cycle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--muted)] flex items-center gap-1.5">
                <Coins size={12} />
                Credits per Cycle
              </label>
              <input
                type="number"
                value={form.default_credits_per_cycle}
                onChange={(e) => handleChange('default_credits_per_cycle', Number(e.target.value))}
                min={1}
                className={cn(inputCls)}
              />
              <span className="text-[10px] text-[var(--muted)]">For CREDIT_BASED groups</span>
            </div>

            {/* Max groups included */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--muted)] flex items-center gap-1.5">
                <Users size={12} />
                Max Groups per Subscription
              </label>
              <input
                type="number"
                value={form.default_max_groups}
                onChange={(e) => handleChange('default_max_groups', Number(e.target.value))}
                min={1}
                max={10}
                className={cn(inputCls)}
              />
            </div>

            {/* Default access weeks */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--muted)] flex items-center gap-1.5">
                <Clock size={12} />
                Access Duration (weeks)
              </label>
              <input
                type="number"
                value={form.default_access_weeks ?? ''}
                onChange={(e) => handleChange('default_access_weeks', e.target.value ? Number(e.target.value) : null)}
                min={1}
                placeholder="Not set"
                className={cn(inputCls)}
              />
              <span className="text-[10px] text-[var(--muted)]">For TIME_BASED groups</span>
            </div>

            {/* Allow Rollover */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--muted)]">Credit Rollover</label>
              <button
                type="button"
                onClick={() => handleChange('allow_rollover_default', !form.allow_rollover_default)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
                  'border transition-all duration-150 text-left',
                  form.allow_rollover_default
                    ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                    : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
                )}
              >
                <span className={cn(
                  'w-8 h-4 rounded-full relative transition-colors duration-200',
                  form.allow_rollover_default ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
                )}>
                  <span className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                    form.allow_rollover_default ? 'left-4.5' : 'left-0.5',
                  )} />
                </span>
                {form.allow_rollover_default ? 'On' : 'Off'}
              </button>
            </div>

            {/* Allow Makeups */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--muted)]">Makeup Sessions</label>
              <button
                type="button"
                onClick={() => handleChange('allow_makeups_default', !form.allow_makeups_default)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
                  'border transition-all duration-150 text-left',
                  form.allow_makeups_default
                    ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                    : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
                )}
              >
                <span className={cn(
                  'w-8 h-4 rounded-full relative transition-colors duration-200',
                  form.allow_makeups_default ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
                )}>
                  <span className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                    form.allow_makeups_default ? 'left-4.5' : 'left-0.5',
                  )} />
                </span>
                {form.allow_makeups_default ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Plan Duration — Preset System */}
      <Card>
        <CardHeader title="Plan Duration" />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            Default billing cycle for new student enrollments.
          </p>

          {/* Preset grid */}
          <div className="flex gap-2 flex-wrap mb-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={cn(
                  'group relative flex items-center gap-1.5',
                  'px-4 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
                  'border transition-all duration-200',
                  form.default_plan_duration === preset.days
                    ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)]'
                    : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleChange('default_plan_duration', preset.days)}
                  className="flex-1 text-left"
                >
                  {preset.label} <span className="opacity-50 text-xs">({preset.days}d)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemovePreset(preset.id)}
                  className={cn(
                    'shrink-0 p-0.5 rounded',
                    'opacity-0 group-hover:opacity-100',
                    'hover:bg-[var(--red-soft)] text-[var(--muted)] hover:text-[var(--red)]',
                    'transition-all duration-150',
                  )}
                  aria-label={`Remove ${preset.label}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Create Preset */}
          {!showAddPreset ? (
            <button
              type="button"
              onClick={() => setShowAddPreset(true)}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
                'border border-dashed border-[var(--muted)]/30',
                'text-[var(--muted)] hover:text-[var(--text)]',
                'hover:border-[var(--muted)]/60 hover:bg-[var(--input-bg)]',
                'transition-all duration-200',
              )}
            >
              <Plus size={14} className="inline mr-1" />
              Create a Preset
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPresetLabel}
                onChange={(e) => setNewPresetLabel(e.target.value)}
                placeholder="Label (e.g. 4 Months)"
                className={cn(
                  'px-3 py-1.5 text-sm rounded-[var(--radius-xs)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'text-[var(--text)] placeholder:text-[var(--muted)]/50',
                  'outline-none focus:ring-1 focus:ring-[var(--gold)]/30',
                  'w-36',
                )}
              />
              <input
                type="number"
                value={newPresetDays}
                onChange={(e) => setNewPresetDays(e.target.value)}
                placeholder="Days"
                min={1}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-[var(--radius-xs)]',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'text-[var(--text)] placeholder:text-[var(--muted)]/50',
                  'outline-none focus:ring-1 focus:ring-[var(--gold)]/30',
                  'w-20',
                )}
              />
              <button
                type="button"
                onClick={handleAddPreset}
                disabled={!newPresetLabel.trim() || !newPresetDays}
                className={cn(
                  'px-2.5 py-1.5 text-sm font-medium rounded-[var(--radius-xs)]',
                  'bg-[var(--gold)] text-white',
                  'hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-all duration-200',
                )}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddPreset(false)
                  setNewPresetLabel('')
                  setNewPresetDays('')
                }}
                className="p-1.5 rounded-[var(--radius-xs)] hover:bg-[var(--input-bg)] text-[var(--muted)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Reminder Days */}
      <Card>
        <CardHeader title="Reminder Days" />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            Days before due date to send a payment reminder.
          </p>
          <div className="flex gap-2 flex-wrap">
            {REMINDER_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handleChange('billing_reminder_days_before', days)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-[var(--radius-xs)]',
                  'border transition-all duration-200',
                  form.billing_reminder_days_before === days
                    ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)]'
                    : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)]',
                )}
              >
                {days} {days === 1 ? 'day' : 'days'}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* WhatsApp Template */}
      <Card>
        <CardHeader title="WhatsApp Template" />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            Custom message template for payment reminders sent via WhatsApp.
            {'{{name}}'} = student name, {'{{amount}}'} = amount, {'{{date}}'} = due date.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <textarea
                value={form.whatsapp_template}
                onChange={(e) => handleChange('whatsapp_template', e.target.value)}
                rows={5}
                className={cn(
                  'w-full px-4 py-3 text-sm rounded-[var(--radius-sm)]',
                  'bg-[var(--input-bg)] backdrop-blur-sm',
                  'border border-[var(--glass-border)]',
                  'text-[var(--text)] placeholder:text-[var(--muted)]',
                  'font-[family-name:var(--font-body)]',
                  'resize-none',
                  'transition-shadow duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--gold-soft)] focus:border-[var(--gold)]',
                )}
                placeholder="Bonjour {{name}}, votre paiement de {{amount}} est dû le {{date}}. Merci de régulariser."
              />
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
          Save Changes
        </Button>
        {saved && (
          <span className="text-sm text-[var(--emerald)] font-medium animate-fade-in">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  )
}

const inputCls = cn(
  'w-full px-3 py-2 rounded-xl text-sm text-[var(--text)]',
  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
  'outline-none focus:ring-2 focus:ring-[var(--gold)]/30',
  'placeholder:text-[var(--muted)]/50',
  'transition-shadow duration-150',
)

export default BillingConfig
