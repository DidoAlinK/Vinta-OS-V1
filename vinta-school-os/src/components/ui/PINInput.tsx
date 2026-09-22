import { forwardRef, useRef, useState, useCallback, useEffect, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'

/* ─── Constants ─── */

const PIN_LENGTH = 4

/* ─── Props ─── */

export interface PINInputProps {
  /** Called with the complete 4-digit PIN string when all digits are entered */
  onComplete?: (pin: string) => void
  /** When true, the containers shake to signal an error */
  error?: boolean
  /** Auto-focus the first box on mount */
  autoFocus?: boolean
  /** Called with the current partial string as the user types */
  onChange?: (value: string) => void
}

/* ─── Component ─── */

export const PINInput = forwardRef<HTMLDivElement, PINInputProps>(
  ({ onComplete, error = false, autoFocus = true, onChange }, ref) => {
    const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    /* Auto-focus first input */
    useEffect(() => {
      if (autoFocus) {
        /* Small delay so the component has mounted into the DOM */
        const id = requestAnimationFrame(() => {
          inputRefs.current[0]?.focus()
        })
        return () => cancelAnimationFrame(id)
      }
    }, [autoFocus])

    /* Focus management helpers */
    const focusIndex = useCallback((index: number) => {
      const clamped = Math.max(0, Math.min(PIN_LENGTH - 1, index))
      inputRefs.current[clamped]?.focus()
      /* Select existing value so it's easy to overwrite */
      inputRefs.current[clamped]?.select()
    }, [])

    const handleChange = useCallback(
      (index: number, value: string) => {
        /* Only accept a single digit */
        const digit = value.replace(/\D/g, '').slice(-1)

        setDigits((prev) => {
          const next = [...prev]
          next[index] = digit
          return next
        })

        onChange?.(
          digits.slice(0, index).join('') + digit + digits.slice(index + 1).join(''),
        )

        if (digit) {
          /* Move focus forward */
          if (index < PIN_LENGTH - 1) {
            focusIndex(index + 1)
          }
        }
      },
      [digits, focusIndex, onChange],
    )

    /* Check completion after state update */
    useEffect(() => {
      const pin = digits.join('')
      if (pin.length === PIN_LENGTH && digits.every((d) => d !== '')) {
        onComplete?.(pin)
      }
    }, [digits, onComplete])

    const handleKeyDown = useCallback(
      (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
          e.preventDefault()
          if (digits[index]) {
            /* Clear current digit */
            setDigits((prev) => {
              const next = [...prev]
              next[index] = ''
              return next
            })
            onChange?.(
              digits.slice(0, index).join('') + '' + digits.slice(index + 1).join(''),
            )
          } else if (index > 0) {
            /* Move back and clear previous */
            const prevIndex = index - 1
            setDigits((prev) => {
              const next = [...prev]
              next[prevIndex] = ''
              return next
            })
            onChange?.(
              digits.slice(0, prevIndex).join('') + '' + digits.slice(prevIndex + 1).join(''),
            )
            focusIndex(prevIndex)
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          focusIndex(index - 1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          focusIndex(index + 1)
        }
      },
      [digits, focusIndex, onChange],
    )

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
        if (!pasted) return

        const next = [...digits]
        for (let i = 0; i < pasted.length && i < PIN_LENGTH; i++) {
          next[i] = pasted[i]
        }
        setDigits(next)
        onChange?.(next.join(''))

        /* Focus last filled or next empty */
        const nextFocus = Math.min(pasted.length, PIN_LENGTH - 1)
        focusIndex(nextFocus)
      },
      [digits, focusIndex, onChange],
    )

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center gap-3',
          error && 'animate-shake',
        )}
        role="group"
        aria-label="PIN input"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digits[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              /* base */
              'text-center',
              'bg-[var(--input-bg)] backdrop-blur-sm',
              'border border-[var(--glass-border)]',
              'text-[var(--text)]',
              'caret-transparent',
              'focus:outline-none focus:ring-2 focus:ring-[var(--gold-soft)] focus:border-[var(--gold)]',
              /* squircle shape */
              'rounded-[var(--radius-sm)]',
              /* error state */
              error && 'border-[var(--red)] focus:ring-[var(--red-soft)] focus:border-[var(--red)]',
            )}
            style={{
              width: 44,
              height: 52,
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
            aria-label={`Digit ${i + 1} of ${PIN_LENGTH}`}
          />
        ))}
      </div>
    )
  },
)

PINInput.displayName = 'PINInput'

export default PINInput
