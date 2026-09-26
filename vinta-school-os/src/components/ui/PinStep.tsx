/**
 * Vinta School OS — PIN step
 *
 * The PIN half of a destructive confirmation, on its own so it can be dropped
 * into whichever dialog is asking: the shared `PinConfirmDialog`, or the
 * existing session dialogs that already have their own wording and reason
 * fields and must NOT grow a second stacked modal on top.
 *
 * This is not a new digit widget — it drives the existing `ui/PINInput`, which
 * already handles auto-advance, backspace, paste, arrow keys and the shake.
 *
 * Verification lives here, not in the caller: every consumer wants the same
 * four things (check the PIN, show why if it is wrong, clear the boxes, hand
 * control back), and three copies of that would eventually disagree.
 */

import { useCallback, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PIN_LENGTH } from '../../lib/constants'
import PINInput from './PINInput'
import { PinError, PIN_GATE_FALLBACK, verifyStaffPin } from '../../lib/pinGate'

export interface PinStepProps {
  /** Line above the boxes. Omit for a bare field. */
  hint?: ReactNode
  /** Idle label of the affirm button. */
  submitLabel?: string
  /** Label while the PIN is being checked. */
  busyLabel?: string
  /** Focus the first box as soon as this mounts. */
  autoFocus?: boolean
  /** Runs once the PIN is accepted. May be async; the button stays busy until it settles. */
  onVerified: () => void | Promise<void>
}

export function PinStep({
  hint,
  submitLabel = 'Verify PIN',
  busyLabel = 'Verifying…',
  autoFocus = true,
  onVerified,
}: PinStepProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  /**
   * Bumped on every failed attempt. `PINInput` keeps its digits in its own
   * state, so the only way to empty the boxes from out here is to remount it —
   * and a wrong PIN that leaves four filled boxes invites a re-press that
   * cannot do anything new.
   */
  const [attempt, setAttempt] = useState(0)

  const ready = pin.length === PIN_LENGTH && !working

  const submit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH || working) return
    setWorking(true)
    setError(null)

    try {
      await verifyStaffPin(pin)
    } catch (err) {
      // Only a rejected PIN lands here. The action that follows is a separate
      // try below, because a delete that failed must never be reported as a
      // wrong PIN and have the boxes wiped as if the user had mistyped.
      setError(err instanceof PinError ? err.message : PIN_GATE_FALLBACK)
      setPin('')
      setAttempt((n) => n + 1)
      setWorking(false)
      return
    }

    try {
      await onVerified()
    } catch {
      // Reporting belongs to the consumer: every caller already writes its own
      // toast or inline message, and letting the error out of here would only
      // produce an unhandled rejection on top of whatever it already said.
    } finally {
      setWorking(false)
    }
  }, [pin, working, onVerified])

  return (
    <div
      className="space-y-3"
      /* PINInput's boxes let Enter bubble; without this the key does nothing
         and the only way forward is the mouse. */
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      }}
    >
      {hint && <div className="text-xs text-[var(--muted)]">{hint}</div>}

      <div className="flex justify-center">
        <PINInput
          key={attempt}
          autoFocus={autoFocus}
          error={!!error}
          onChange={setPin}
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] text-center font-medium" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!ready}
        className={cn(
          'w-full py-2.5 rounded-xl text-sm font-semibold text-white',
          'bg-[var(--red)] hover:brightness-110 active:scale-[0.98]',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'transition-all duration-150',
        )}
      >
        {working ? busyLabel : submitLabel}
      </button>
    </div>
  )
}

export default PinStep
