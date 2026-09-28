import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import {
  clearDebtFifo,
  getUnpaidDebtCount,
  previewDebtSettlement,
} from '../../lib/billingRules'
import { formatCurrency } from '../../lib/formatters'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import type { PaymentMethod, MultiPayRequest } from '../../types/billing'
import type { Student } from '../../types/student'
import type { Class } from '../../types/class'
import {
  Search,
  Plus,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  Check,
} from 'lucide-react'

/* ─── Props ─── */

interface MultiPayModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  /** When set, the student is fixed: skip the search step and preselect them. */
  presetStudent?: Student | null
}

/* ─── Line item ─── */

interface LineItem {
  id: string
  group_id: string
  group_name: string
  amount_da: number
}

/* ─── Payment method config ─── */

/* `key` is the API's `PaymentMethod` enum and must survive verbatim; only the
   label is text, and it is looked up in the render body — this array is built
   once at import, before a language has been chosen. */
const PAYMENT_METHODS: { key: PaymentMethod; labelKey: string; icon: React.ElementType }[] = [
  { key: 'CASH', labelKey: 'multiPay.method.cash', icon: Banknote },
  { key: 'CCP', labelKey: 'multiPay.method.ccp', icon: CreditCard },
  { key: 'BARIDI_MOB', labelKey: 'multiPay.method.baridiMob', icon: Smartphone },
]

/* ─── PIN input ─── */

function PinInput({
  value,
  onChange,
  error,
  errorText,
}: {
  value: string[]
  onChange: (pin: string[]) => void
  error: boolean
  /** Shown under the boxes. A shake alone does not tell the user what to do. */
  errorText?: string | null
}) {
  const { t } = useTranslation('billing')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // Focus the first empty input, or the last
    const firstEmpty = value.findIndex((d) => !d)
    const idx = firstEmpty >= 0 ? firstEmpty : 3
    inputRefs.current[idx]?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (index: number, char: string) => {
    if (char && !/^\d$/.test(char)) return
    const next = [...value]
    next[index] = char
    onChange(next)
    if (char && index < 3) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        const next = [...value]
        next[index - 1] = ''
        onChange(next)
        inputRefs.current[index - 1]?.focus()
      } else {
        const next = [...value]
        next[index] = ''
        onChange(next)
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn('flex gap-2.5 justify-center', error && 'animate-shake')}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-11 h-11 rounded-xl text-center text-lg font-bold outline-none transition-all duration-200"
          style={{
            background: 'var(--input-bg)',
            color: 'var(--text)',
            border: digit
              ? error ? '2px solid var(--red)' : '2px solid var(--gold)'
              : '2px solid var(--glass-border)',
            boxShadow: digit && !error ? '0 4px 16px rgba(179,135,42,.15)' : 'none',
          }}
          aria-label={t('multiPay.pin.digit', { index: i + 1 })}
        />
      ))}
      </div>
      {/* `role="alert"` so a screen reader announces the rejection too, rather
          than relying on a purely visual shake. */}
      {errorText ? (
        <p role="alert" className="text-xs font-medium text-[var(--red)]">
          {errorText}
        </p>
      ) : null}
    </div>
  )
}

/* ─── Main component ─── */

export function MultiPayModal({
  isOpen,
  onClose,
  onSuccess,
  presetStudent = null,
}: MultiPayModalProps) {
  const { t } = useTranslation('billing')

  /* ── State ── */
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentSearching, setStudentSearching] = useState(false)

  const [classes, setClasses] = useState<Class[]>([])
  const [classesLoading, setClassesLoading] = useState(false)

  const [items, setItems] = useState<LineItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [pinError, setPinError] = useState(false)
  /* Why the PIN was refused, in words. Set alongside `pinError` so the user is
     never left with an unexplained shake. */
  const [pinMessage, setPinMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /* Which student the preset seeding has already run for. */
  const seededRef = useRef<string | null>(null)

  /* ── Effective student ──
     A `presetStudent` outranks any local pick: the caller has already decided
     who is paying. Deriving it (rather than syncing it into state) means steps
     2–4 and the submit path agree on the very first render, with no gap where
     the modal looks like it has no student. Without a preset this is exactly
     the `selectedStudent` of the search flow. */
  const activeStudent = presetStudent ?? selectedStudent

  /* ── Fetch classes when modal opens ── */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function load() {
      setClassesLoading(true)
      try {
        const { data } = await api.get('/classes')
        if (!cancelled) setClasses(data.classes ?? data ?? [])
      } catch {
        if (!cancelled) setClasses([])
      } finally {
        if (!cancelled) setClassesLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen])

  /* ── Reset on close ── */
  useEffect(() => {
    if (!isOpen) {
      setStudentQuery('')
      setStudentResults([])
      setSelectedStudent(null)
      setItems([])
      setPaymentMethod('CASH')
      setPin(['', '', '', ''])
      setPinError(false)
      setPinMessage(null)
      setSubmitting(false)
      setSubmitError(null)
      // Let the next open seed again, for whatever student it is opened for.
      seededRef.current = null
    }
  }, [isOpen])

  /* ── Preset student: seed one line item ──
     With a fixed student the modal opens on a blank "Add" prompt the user has
     to guess at, so seed the group they are enrolled in. `classes` loads
     asynchronously and carries `price_da`, so wait for it before deciding
     anything, and seed a given student only once — never over the top of items
     already on screen. */
  useEffect(() => {
    if (!isOpen || !presetStudent) return
    // Wait for the class list — it carries `price_da`, and a line item seeded
    // before it lands would sit at 0 instead of the group's price. Leaving the
    // guard unset here lets the seed still happen once `classes` arrives.
    if (classes.length === 0) return
    if (seededRef.current === presetStudent.id) return

    const enrollment = presetStudent.enrollments?.[0]
    if (!enrollment?.class_id) return
    const cls = classes.find((c) => c.id === enrollment.class_id)
    const seeded: LineItem[] = [
      {
        id: crypto.randomUUID(),
        group_id: enrollment.class_id,
        // The group they are enrolled in; price comes from the class when the
        // list knows it, and is left at 0 for the user to fill when it does not.
        group_name: cls?.name ?? enrollment.class_name,
        amount_da: cls?.price_da ?? 0,
      },
    ]

    // A *different* student arriving while the modal is open re-seeds: the
    // previous student's line items must not be carried over to this one.
    if (seededRef.current !== null) {
      setItems(seeded)
    } else {
      setItems((prev) => (prev.length > 0 ? prev : seeded))
    }
    seededRef.current = presetStudent.id
  }, [isOpen, presetStudent, classes])

  /* ── Student search (debounced) ── */
  const handleStudentSearch = useCallback((query: string) => {
    setStudentQuery(query)
    if (searchTimer.current) clearTimeout(searchTimer.current)

    if (query.length < 2) {
      setStudentResults([])
      return
    }

    setStudentSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/students', { params: { q: query } })
        setStudentResults(data.students ?? data ?? [])
      } catch {
        setStudentResults([])
      } finally {
        setStudentSearching(false)
      }
    }, 300)
  }, [])

  /* ── Line items ── */
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), group_id: '', group_name: '', amount_da: 0 },
    ])
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        if (field === 'group_id') {
          const cls = classes.find((c) => c.id === value)
          return { ...it, group_id: value as string, group_name: cls?.name ?? '' }
        }
        return { ...it, [field]: value }
      }),
    )
  }

  const totalReceived = items.reduce((sum, it) => sum + (it.amount_da || 0), 0)

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!activeStudent) return
    if (items.length === 0) return
    if (items.some((it) => !it.group_id || it.amount_da <= 0)) return
    if (pin.some((d) => !d)) {
      setPinError(true)
      setPinMessage(t('multiPay.pin.incomplete'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setPinError(false)
    setPinMessage(null)

    try {
      // Typed against the contract: `items` (one entry per group paid for), not
      // the receipt shape's `charges`.
      const payload: MultiPayRequest = {
        student_id: activeStudent.id,
        items: items.map((it) => ({ group_id: it.group_id, amount: it.amount_da })),
        total_received: totalReceived,
        payment_method: paymentMethod,
        pin: pin.join(''),
      }
      const receipt = await api.post('/billing/subscriptions/pay', payload)
      // T5 debt-first: remaining = N − unpaidDebtCount (oldest first, per group).
      // Backend snapshots total=N on the new Subscription; clear the local ledger FIFO.
      try {
        const charges: Array<{ group_id: string }> =
          receipt.data?.charges ?? items.map((it) => ({ group_id: it.group_id }))
        const settled: string[] = []
        // Resolve N per group from the already-loaded class list.
        const nByGroup = new Map(classes.map((c) => [c.id, c.credits_per_cycle ?? 4]))
        for (const ch of charges) {
          if (!ch?.group_id) continue
          const debt = getUnpaidDebtCount(activeStudent.id, ch.group_id)
          if (debt === 0) continue
          const n = nByGroup.get(ch.group_id) ?? 4
          const preview = previewDebtSettlement(debt, n)
          const cleared = clearDebtFifo(activeStudent.id, ch.group_id, preview.cleared, receipt.data?.id ?? `pay-${Date.now()}`)
          settled.push(
            t('multiPay.toast.settled.line', {
              cleared: cleared.length,
              remaining: preview.remaining,
              n,
            }),
          )
        }
        if (settled.length > 0) {
          toast.success(t('multiPay.toast.settled.title'), settled.join(' · '), { duration: 8000 })
        }
      } catch {
        // Settlement preview is advisory — payment already landed.
        toast.warning(
          t('multiPay.toast.previewFailed.title'),
          t('multiPay.toast.previewFailed.body'),
        )
      }
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const res = (
        err as { response?: { status?: number; data?: { error?: string; message?: string } } }
      )?.response
      const status = res?.status
      const msg = res?.data?.error || res?.data?.message || t('multiPay.error.failed')

      /* Wrong PIN. The backend answers **403** with `{"error": "Invalid PIN"}`;
         older builds answered 401 with the same body, hence the message check
         alongside the status. Either way this is a PIN problem, not a session
         problem: shake, clear the four digits, stay put.

         This modal never clears tokens and never touches the auth store, and
         403 is not a status the api.ts interceptor acts on — so a wrong PIN
         cannot reach the sign-out path. See the note on 401 below. */
      const isPinError = status === 403 || msg.toLowerCase().includes('pin')
      if (isPinError) {
        setPinError(true)
        setPinMessage(t('multiPay.pin.incorrect'))
        setPin(['', '', '', ''])
      } else if (status === 401) {
        /* The request was rejected unauthenticated, so nothing was recorded —
           and the PIN was not the reason, so do not shake it. The interceptor
           in lib/api.ts owns the sign-out; this modal must not add a second,
           competing one. */
        setSubmitError(t('multiPay.error.sessionExpired'))
      } else {
        setSubmitError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Can submit? ── */
  const canSubmit =
    activeStudent &&
    items.length > 0 &&
    items.every((it) => it.group_id && it.amount_da > 0) &&
    pin.every((d) => d) &&
    !submitting

  /* ── Render ── */
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('multiPay.title')}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {/* ── Step 1: Select student ── */}
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
            {t('multiPay.step.student')}
          </label>
          {presetStudent ? (
            /* Preset by the caller: the student is fixed. No search input, no
               results dropdown, and no "Change" — the caller already decided. */
            <div className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--input-bg)] border border-[var(--glass-border)]">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--text)]">
                  {presetStudent.full_name}
                </span>
              </div>
            </div>
          ) : selectedStudent ? (
            <div className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--input-bg)] border border-[var(--glass-border)]">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--text)]">
                  {selectedStudent.full_name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent(null)
                  setStudentQuery('')
                  setStudentResults([])
                }}
                className="text-xs text-[var(--red)] hover:underline"
              >
                {t('multiPay.change')}
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                type="text"
                placeholder={t('multiPay.searchPlaceholder')}
                value={studentQuery}
                onChange={(e) => handleStudentSearch(e.target.value)}
                className={cn(
                  'w-full ps-9 pe-4 py-2.5 rounded-[var(--radius-sm)]',
                  'text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50',
                  'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                  'outline-none focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)]/30',
                  'transition-colors',
                )}
              />
              {studentSearching && (
                <div className="absolute end-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {/* Dropdown */}
              {studentResults.length > 0 && (
                <div
                  className={cn(
                    'absolute z-20 mt-1 w-full max-h-48 overflow-y-auto',
                    'rounded-[var(--radius-sm)]',
                    'bg-[var(--glass)] backdrop-blur-[22px]',
                    'border border-[var(--glass-border)]',
                    'shadow-lg',
                  )}
                >
                  {studentResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(s)
                        setStudentQuery('')
                        setStudentResults([])
                      }}
                      className={cn(
                        'w-full text-start px-3 py-2.5 text-sm',
                        'hover:bg-[var(--glass-strong)] transition-colors',
                        'border-b border-[var(--glass-border)]/30 last:border-b-0',
                      )}
                    >
                      <span className="text-[var(--text)]">{s.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Line items ── */}
        {activeStudent && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                {t('multiPay.step.items')}
              </label>
              <button
                type="button"
                onClick={addItem}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)]',
                  'text-xs font-medium',
                  'bg-[var(--gold-soft)] text-[var(--gold)]',
                  'hover:bg-[var(--gold)] hover:text-white',
                  'transition-colors duration-150',
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('common:action.add')}
              </button>
            </div>

            {items.length === 0 && (
              <p className="text-sm text-[var(--muted)]/60 py-4 text-center border border-dashed border-[var(--glass-border)] rounded-[var(--radius-sm)]">
                {t('multiPay.empty')}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {items.map((item) => {
                // T5 debt-first preview per line: remaining = N − unpaid (oldest first).
                const debt = activeStudent && item.group_id
                  ? getUnpaidDebtCount(activeStudent.id, item.group_id)
                  : 0
                const n = classes.find((c) => c.id === item.group_id)?.credits_per_cycle ?? null
                const preview = debt > 0 && n != null ? previewDebtSettlement(debt, n) : null
                return (
                <div
                  key={item.id}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">

                  {/* Group selector.
                      The `div` is what flexes, not the Select: `Select` wraps
                      its trigger in a `w-full` column that `className` cannot
                      reach, so as a direct child it would take a 100% basis,
                      shrink to fit the row, and drag the amount field
                      (deliberately `w-32`) in with it on every line. The
                      wrapper also keeps the trigger at this row's 38px instead
                      of `Select`'s default `h-11` (`h-auto` below).

                      No muted class for the empty case: `Select` already
                      renders an empty value muted, which is what the native
                      `<select>` was doing by hand here. */}
                  <div className="flex-1 min-w-0">
                    <Select
                      value={item.group_id}
                      onChange={(v) => updateItem(item.id, 'group_id', v)}
                      options={[
                        { value: '', label: t('multiPay.selectGroup') },
                        ...classes.map((cls) => ({
                          value: cls.id,
                          label: `${cls.name}${cls.subject ? ` (${cls.subject})` : ''}`,
                        })),
                      ]}
                      className={cn(
                        'px-3 py-2 h-auto rounded-[var(--radius-sm)] text-sm',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'text-[var(--text)] outline-none',
                        'focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)]/30',
                        'transition-colors',
                      )}
                    />
                  </div>

                  {/* Amount */}
                  <div className="relative w-32">
                    <input
                      type="number"
                      min={0}
                      placeholder={t('multiPay.amountPlaceholder')}
                      value={item.amount_da || ''}
                      onChange={(e) =>
                        updateItem(item.id, 'amount_da', Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className={cn(
                        'w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm tabular-nums',
                        'bg-[var(--input-bg)] border border-[var(--glass-border)]',
                        'text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50',
                        'focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)]/30',
                        'transition-colors',
                      )}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)] pointer-events-none">
                      DA
                    </span>
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className={cn(
                      'shrink-0 flex items-center justify-center',
                      'w-8 h-8 rounded-full',
                      'text-[var(--red)]/60 hover:text-[var(--red)] hover:bg-[var(--red-soft)]',
                      'transition-colors duration-150',
                    )}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
                  {preview && (
                    <p className="text-[11px] text-[var(--muted)] ps-1">
                      {t('multiPay.line.debtPreview', {
                        debt,
                        n,
                        remaining: preview.remaining,
                      })}
                    </p>
                  )}
                </div>
                )
              })}
            </div>

            {/* Total */}
            {items.length > 0 && (
              <div className="flex items-center justify-between mt-3 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--input-bg)] border border-[var(--glass-border)]">
                <span className="text-xs font-medium text-[var(--muted)] uppercase">{t('common:label.total')}</span>
                <span className="text-base font-bold text-[var(--gold)] tabular-nums font-[family-name:var(--font-heading)]">
                  {formatCurrency(totalReceived)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Payment method ── */}
        {activeStudent && items.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
              {t('multiPay.step.method')}
            </label>
            <div className="flex gap-2">
              {PAYMENT_METHODS.map(({ key, labelKey, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaymentMethod(key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-sm)]',
                    'text-sm font-medium border transition-all duration-150',
                    paymentMethod === key
                      ? 'bg-[var(--gold-soft)] border-[var(--gold)] text-[var(--gold)] shadow-sm'
                      : 'bg-[var(--input-bg)] border-[var(--glass-border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--glass-border)]',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 4: PIN ── */}
        {activeStudent && items.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-3">
              {t('multiPay.step.pin')}
            </label>
            <PinInput
              value={pin}
              onChange={(next) => {
                setPin(next)
                // Clear the rejection as soon as they start retyping, so a stale
                // "Incorrect PIN" never sits under a fresh attempt.
                if (pinMessage) {
                  setPinMessage(null)
                  setPinError(false)
                }
              }}
              error={pinError}
              errorText={pinMessage}
            />
          </div>
        )}

        {/* ── Submit error ── */}
        {submitError && (
          <p className="text-xs font-medium text-[var(--red)] text-center">{submitError}</p>
        )}

        {/* ── Footer submit ── */}
        {activeStudent && items.length > 0 && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-sm)]',
              'text-sm font-semibold',
              'transition-all duration-200',
              canSubmit
                ? 'bg-gradient-to-r from-[var(--gold)] to-[var(--gold-dark, #9a7520)] text-white shadow-[0_4px_20px_rgba(179,135,42,.35)] hover:shadow-[0_6px_28px_rgba(179,135,42,.5)]'
                : 'bg-[var(--input-bg)] text-[var(--muted)] border border-[var(--glass-border)] cursor-not-allowed',
            )}
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {submitting
              ? t('multiPay.submit.processing')
              : t('multiPay.submit.pay', { amount: formatCurrency(totalReceived) })}
          </button>
        )}
      </div>
    </Modal>
  )
}

export default MultiPayModal
