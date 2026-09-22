import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { getInitials } from '../../lib/formatters'
import { cn } from '../../lib/cn'
import { X } from 'lucide-react'
import type { Profile } from '../../types/auth'

interface PINModalProps {
  profile: Profile
  onClose: () => void
  onVerified: () => void
}

export function PINModal({ profile, onClose, onVerified }: PINModalProps) {
  const { verifyPin } = useAuthStore()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const getAvatarColors = (): [string, string] => {
    if (profile.avatar_color_1 && profile.avatar_color_2) {
      return [profile.avatar_color_1, profile.avatar_color_2]
    }
    if (profile.picture?.colors) {
      return profile.picture.colors
    }
    return ['#b3872a', '#0f6b4d']
  }
  const colors = getAvatarColors()

  const submitPin = useCallback(async (pinStr: string) => {
    setLoading(true)
    setError(false)
    try {
      const result = await verifyPin(profile.id, pinStr)
      if (result.success) {
        onVerified()
      } else {
        setError(true)
        setTimeout(() => {
          setPin(['', '', '', ''])
          setError(false)
          inputRefs.current[0]?.focus()
        }, 800)
      }
    } catch {
      setError(true)
      setTimeout(() => {
        setPin(['', '', '', ''])
        setError(false)
        inputRefs.current[0]?.focus()
      }, 800)
    } finally {
      setLoading(false)
    }
  }, [profile.id, verifyPin, onVerified])

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return

    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    setError(false)

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3) {
      const pinStr = newPin.join('')
      if (pinStr.length === 4) {
        submitPin(pinStr)
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        // Move back and clear previous
        const newPin = [...pin]
        newPin[index - 1] = ''
        setPin(newPin)
        inputRefs.current[index - 1]?.focus()
      } else {
        const newPin = [...pin]
        newPin[index] = ''
        setPin(newPin)
      }
      setError(false)
    } else if (e.key === 'Enter') {
      const pinStr = pin.join('')
      if (pinStr.length === 4) {
        submitPin(pinStr)
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (pasted.length === 0) return

    const newPin = ['', '', '', '']
    for (let i = 0; i < pasted.length; i++) {
      newPin[i] = pasted[i]
    }
    setPin(newPin)

    // Focus last filled or next empty
    const focusIndex = Math.min(pasted.length, 3)
    inputRefs.current[focusIndex]?.focus()

    // Auto-submit if 4 digits pasted
    if (pasted.length === 4) {
      submitPin(pasted)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,.7)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted)' }}
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center gap-6 animate-fade-in">
        {/* Profile avatar */}
        <div
          className="w-[90px] h-[90px] rounded-[24px] flex items-center justify-center text-white text-3xl font-bold"
          style={{
            background: `linear-gradient(150deg, ${colors[0]}, ${colors[1]})`,
            boxShadow: '0 12px 32px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.3) inset',
            fontFamily: 'Space Grotesk'
          }}
        >
          {getInitials(profile.name)}
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{profile.name}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Enter your 4-digit PIN</p>
        </div>

        {/* PIN boxes */}
        <div
          className={cn(
            'flex gap-3',
            error && 'animate-shake'
          )}
        >
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={loading}
              className="w-14 h-14 rounded-xl text-center text-xl font-bold outline-none transition-all duration-200"
              style={{
                background: 'var(--input-bg)',
                color: 'var(--text)',
                border: digit
                  ? error ? '2px solid var(--red)' : '2px solid var(--gold)'
                  : '2px solid var(--glass-border)',
                boxShadow: digit && !error ? '0 4px 16px rgba(179,135,42,.2)' : 'none',
              }}
              aria-label={`PIN digit ${i + 1}`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs font-medium" style={{ color: 'var(--red)' }}>
            Incorrect PIN. Try again.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Verifying...</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default PINModal
