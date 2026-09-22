import { useState, useEffect } from 'react'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { AcademySettings } from '../../types/settings'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/uiStore'
import api from '../../lib/api'
import {
  FINAL_TOGGLE_DEFAULTS,
  getAbsenceConsumesCredit,
  getFinalToggle,
  getLatestFinal,
  getLatestSwapWindow,
  getLatestToggle6,
  getLatestToggleVersion,
  getPendingFinal,
  getPendingSwapWindow,
  getPendingToggle6,
  getPendingToggleVersions,
  getSwapWindow,
  getToggle6,
  setAbsenceConsumesCredit,
  setFinalToggle,
  setSwapWindow,
  setToggle6,
  type FinalToggleKey,
  type SwapLinkWindow,
} from '../../lib/billingRules'
import { Toggle } from '../../components/ui/Toggle'
import { GROSS_PROFIT_LABEL } from '../../lib/constants'
import { isGrossProfitEnabled, setGrossProfitEnabled } from '../../lib/grossProfit'
import { Save, Plus, X, Trash2, Coins, Clock, Users, CalendarClock, Lock } from 'lucide-react'

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

  // T5 Toggle 1: absenceConsumesCredit (default true, effective next Monday)
  const [toggle1, setToggle1] = useState(() => getAbsenceConsumesCredit(new Date()))
  const [toggle1Version, setToggle1Version] = useState(() => getLatestToggleVersion())
  const [toggle1Pending, setToggle1Pending] = useState(() => getPendingToggleVersions(new Date()))

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

  const handleToggle1 = () => {
    if (!guardOwner()) return
    // Flip the LATEST staged value (or current effective when nothing staged).
    const current = toggle1Version?.value ?? toggle1
    const version = setAbsenceConsumesCredit(!current, new Date())
    setToggle1Version(version)
    setToggle1Pending(getPendingToggleVersions(new Date()))
    // Current week still runs the previous value — toggle takes effect Monday.
  }

  // T6 Toggle 6: freeSessionAutoPresent (default true, effective next Monday)
  const [toggle6, setToggle6Val] = useState(() => getToggle6(new Date()))
  const [toggle6Version, setToggle6Version] = useState(() => getLatestToggle6())
  const [toggle6Pending, setToggle6Pending] = useState(() => getPendingToggle6(new Date()))

  const handleToggle6 = () => {
    if (!guardOwner()) return
    const current = toggle6Version?.value ?? toggle6
    const version = setToggle6(!current, new Date())
    setToggle6Version(version)
    setToggle6Pending(getPendingToggle6(new Date()))
  }

  // ── T10 final list (Owner PIN only; staged → next Monday, never deleted) ──
  const userRole = useAuthStore((s) => s.user?.role ?? 'staff')
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinChecking, setPinChecking] = useState(false)
  const [pinOk, setPinOk] = useState(false)
  // Pending flip requested before PIN entry.
  const [pendingFlip, setPendingFlip] = useState<null | { kind: 'final'; key: FinalToggleKey } | { kind: 'swap'; value: SwapLinkWindow }>(null)

  const [finalState, setFinalState] = useState<Record<FinalToggleKey, { eff: boolean; staged: boolean | null; pending: boolean }>>(() => ({
    allowMakeups: { eff: getFinalToggle('allowMakeups'), staged: getLatestFinal('allowMakeups')?.value ?? null, pending: getPendingFinal('allowMakeups').length > 0 },
    shareCreditsAcrossGroups: { eff: getFinalToggle('shareCreditsAcrossGroups'), staged: getLatestFinal('shareCreditsAcrossGroups')?.value ?? null, pending: getPendingFinal('shareCreditsAcrossGroups').length > 0 },
    earlyPaymentOnExtraSessions: { eff: getFinalToggle('earlyPaymentOnExtraSessions'), staged: getLatestFinal('earlyPaymentOnExtraSessions')?.value ?? null, pending: getPendingFinal('earlyPaymentOnExtraSessions').length > 0 },
  }))
  const [swapState, setSwapState] = useState(() => ({
    eff: getSwapWindow(),
    staged: getLatestSwapWindow()?.value ?? null as SwapLinkWindow | null,
    pending: getPendingSwapWindow().length > 0,
    version: getLatestSwapWindow(),
  }))

  const refreshFinal = () => {
    setFinalState({
      allowMakeups: { eff: getFinalToggle('allowMakeups'), staged: getLatestFinal('allowMakeups')?.value ?? null, pending: getPendingFinal('allowMakeups').length > 0 },
      shareCreditsAcrossGroups: { eff: getFinalToggle('shareCreditsAcrossGroups'), staged: getLatestFinal('shareCreditsAcrossGroups')?.value ?? null, pending: getPendingFinal('shareCreditsAcrossGroups').length > 0 },
      earlyPaymentOnExtraSessions: { eff: getFinalToggle('earlyPaymentOnExtraSessions'), staged: getLatestFinal('earlyPaymentOnExtraSessions')?.value ?? null, pending: getPendingFinal('earlyPaymentOnExtraSessions').length > 0 },
    })
    setSwapState({
      eff: getSwapWindow(),
      staged: getLatestSwapWindow()?.value ?? null,
      pending: getPendingSwapWindow().length > 0,
      version: getLatestSwapWindow(),
    })
  }

  /** Owner gate: role must be owner, then PIN verified before any T10 flip. */
  const guardOwner = (): boolean => {
    if (userRole !== 'owner') {
      toast.error('Owner PIN only', 'Billing rules require the owner role.')
      return false
    }
    if (!pinOk) {
      toast.error('Owner PIN required', 'Verify the owner PIN first.')
      return false
    }
    return true
  }

  const requestFlip = (flip: NonNullable<typeof pendingFlip>) => {
    if (userRole !== 'owner') {
      toast.error('Owner PIN only', 'Billing rules require the owner role.')
      return
    }
    setPendingFlip(flip)
    setPin('')
    setPinError(null)
    if (pinOk) {
      // Already verified this session — apply immediately.
      applyFlip(flip)
      setPendingFlip(null)
    } else {
      setPinOpen(true)
    }
  }

  const applyFlip = (flip: NonNullable<typeof pendingFlip>) => {
    if (flip.kind === 'final') {
      const cur = getLatestFinal(flip.key)?.value ?? getFinalToggle(flip.key)
      setFinalToggle(flip.key, !cur, new Date())
    } else {
      setSwapWindow(flip.value, new Date())
    }
    refreshFinal()
    const label = flip.kind === 'final' ? flip.key : `swapLinkWindow → ${flip.value}`
    toast.success('Rule staged', `${label} takes effect next Monday — not retroactively.`)
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
      if (pendingFlip) {
        applyFlip(pendingFlip)
        setPendingFlip(null)
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
      {/* T5 Toggle 1 — Charge for missed sessions? (absenceConsumesCredit) */}
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">
                Charge for missed sessions?
              </p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                When ON, ABSENT consumes 1 credit at End Class finalization unless
                auto-linked in window. When OFF, ABSENT never consumes. Owner PIN only.
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1.5 flex items-center gap-1.5">
                <CalendarClock size={11} className="shrink-0" />
                {toggle1Pending.length > 0 && toggle1Version
                  ? `Takes effect Mon ${new Date(toggle1Version.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — this week keeps ${toggle1 ? 'ON' : 'OFF'}.`
                  : `Effective now: ${toggle1 ? 'ON' : 'OFF'} — changes apply next Monday, not retroactively.`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggle1}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0',
                'border transition-all duration-150',
                (toggle1Version?.value ?? toggle1)
                  ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                  : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
              )}
              title="absenceConsumesCredit — staged for next Monday"
            >
              <span className={cn(
                'w-8 h-4 rounded-full relative transition-colors duration-200',
                (toggle1Version?.value ?? toggle1) ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
              )}>
                <span className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                  (toggle1Version?.value ?? toggle1) ? 'left-4.5' : 'left-0.5',
                )} />
              </span>
              {(toggle1Version?.value ?? toggle1) ? 'On' : 'Off'}
            </button>
          </div>

          {/* T10 final toggles — Owner PIN only, staged → next Monday */}
          <div className="mt-4 pt-4 border-t border-[var(--glass-border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                Final toggles · owner only
              </p>
              {pinOk ? (
                <span className="text-[10px] font-semibold text-[var(--emerald)] bg-[var(--emerald-soft)] px-2 py-0.5 rounded-full">
                  Owner verified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setPendingFlip(null); setPin(''); setPinError(null); setPinOpen(true) }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--gold)] hover:underline"
                >
                  <Lock size={11} />
                  Verify owner PIN
                </button>
              )}
            </div>

            {([
              { key: 'allowMakeups', label: 'Allow makeups?', hint: 'ABSENT with Toggle 1 ON banks a makeup credit instead of burning the seat.' },
              { key: 'shareCreditsAcrossGroups', label: 'Share credits across groups?', hint: 'One credit pool spans groups of the same level (teacher + subject + level).' },
              { key: 'earlyPaymentOnExtraSessions', label: 'Early payment on extra sessions?', hint: 'Guest/extra visits prompt payment before check-in when no credit covers them.' },
            ] as Array<{ key: FinalToggleKey; label: string; hint: string }>).map((row) => {
              const st = finalState[row.key]
              const shown = st.staged ?? st.eff
              const def = FINAL_TOGGLE_DEFAULTS[row.key]
              return (
                <div key={row.key} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">{row.label}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{row.hint}</p>
                    <p className="text-[11px] text-[var(--muted)] mt-1">
                      {st.pending
                        ? `Staged → Mon (this week keeps ${st.eff ? 'ON' : 'OFF'}).`
                        : `Effective now: ${st.eff ? 'ON' : 'OFF'}${st.staged == null ? ` (default ${def ? 'ON' : 'OFF'})` : ''}.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => requestFlip({ kind: 'final', key: row.key })}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0',
                      'border transition-all duration-150',
                      shown
                        ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                        : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
                    )}
                    title={`${row.key} — staged for next Monday, owner PIN`}
                  >
                    <span className={cn(
                      'w-8 h-4 rounded-full relative transition-colors duration-200',
                      shown ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
                    )}>
                      <span className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                        shown ? 'left-4.5' : 'left-0.5',
                      )} />
                    </span>
                    {shown ? 'On' : 'Off'}
                  </button>
                </div>
              )
            })}

            {/* swapLinkWindow: SAME_DAY (default) vs OPEN */}
            <div className="flex items-start justify-between gap-3 pt-3 border-t border-[var(--glass-border)]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)]">Guest swap window?</p>
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
                  SAME_DAY: link within the same calendar day (Algiers). OPEN: 7-day rolling,
                  closes on payout PAID, hard cap 30d.
                </p>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  {swapState.pending && swapState.version
                    ? `Staged → Mon ${new Date(swapState.version.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (this week keeps ${swapState.eff}).`
                    : `Effective now: ${swapState.eff}.`}
                </p>
              </div>
            </div>
            <div className="flex rounded-xl overflow-hidden border border-[var(--glass-border)]">
              {(['SAME_DAY', 'OPEN'] as const).map((v) => {
                const shown = swapState.staged ?? swapState.eff
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { if (v !== shown) requestFlip({ kind: 'swap', value: v }) }}
                    className={cn(
                      'flex-1 py-2 text-xs font-semibold transition-all duration-150',
                      shown === v
                        ? 'bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] text-white'
                        : 'bg-[var(--input-bg)] text-[var(--muted)] hover:bg-[var(--glass)]',
                    )}
                    title={`swapLinkWindow → ${v} — staged for next Monday, owner PIN`}
                  >
                    {v === 'SAME_DAY' ? 'Same day' : 'Open 7d'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* T10 Owner PIN gate */}
          {pinOpen && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center"
              style={{ background: 'rgba(10,10,10,.6)', backdropFilter: 'blur(8px)' }}
              onClick={(e) => { if (e.target === e.currentTarget) { setPinOpen(false); setPendingFlip(null) } }}
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

          {/* T6 Toggle 6 — freeSessionAutoPresent (default true) */}
          <div className="flex items-start justify-between gap-3 mt-4 pt-4 border-t border-[var(--glass-border)]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">
                Free sessions auto-present?
              </p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                When ON, a FREE session auto-marks PRESENT and skips tracking.
                When OFF, rows track normally for records (billing stays 0).
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1.5 flex items-center gap-1.5">
                <CalendarClock size={11} className="shrink-0" />
                {toggle6Pending.length > 0 && toggle6Version
                  ? `Takes effect Mon ${new Date(toggle6Version.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — this week keeps ${toggle6 ? 'ON' : 'OFF'}.`
                  : `Effective now: ${toggle6 ? 'ON' : 'OFF'} — changes apply next Monday, not retroactively.`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggle6}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0',
                'border transition-all duration-150',
                (toggle6Version?.value ?? toggle6)
                  ? 'bg-[var(--emerald-soft)] border-[var(--emerald)]/30 text-[var(--emerald)]'
                  : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)]',
              )}
              title="freeSessionAutoPresent — staged for next Monday"
            >
              <span className={cn(
                'w-8 h-4 rounded-full relative transition-colors duration-200',
                (toggle6Version?.value ?? toggle6) ? 'bg-[var(--emerald)]' : 'bg-[var(--muted)]/30',
              )}>
                <span className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200',
                  (toggle6Version?.value ?? toggle6) ? 'left-4.5' : 'left-0.5',
                )} />
              </span>
              {(toggle6Version?.value ?? toggle6) ? 'On' : 'Off'}
            </button>
          </div>
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
