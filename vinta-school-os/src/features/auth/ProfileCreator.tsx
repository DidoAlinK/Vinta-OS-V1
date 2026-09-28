import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/uiStore'
import { AVATAR_PRESETS } from '../../lib/constants'
import { getInitials, formatPhone } from '../../lib/formatters'
import type { Profile } from '../../types/auth'
import { X, Crown, Shield } from 'lucide-react'

interface ProfileCreatorProps {
  onClose: () => void
  onCreated?: (profile?: Profile) => void
}

export function ProfileCreator({ onClose, onCreated }: ProfileCreatorProps) {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { createProfile, loadProfiles } = useAuthStore()
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [ownerPin, setOwnerPin] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('profileCreator.validation.nameRequired')
    if (!pin) e.pin = t('profileCreator.validation.pinRequired')
    else if (pin.length !== 4) e.pin = t('profileCreator.validation.pinLength')
    else if (!/^\d{4}$/.test(pin)) e.pin = t('profileCreator.validation.pinNumeric')
    if (pin !== confirmPin) e.confirmPin = t('profileCreator.validation.pinMismatch')
    if (!ownerPin || ownerPin.length !== 4) e.ownerPin = t('profileCreator.validation.ownerPinRequired')
    if (phone) {
      const cleaned = phone.replace(/[^\d]/g, '')
      if (cleaned.length < 9) e.phone = t('profileCreator.validation.phoneInvalid')
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      const colors = AVATAR_PRESETS[selectedPreset].colors
      const formattedPhone = phone ? formatPhone(phone) : undefined

      const profile = await createProfile({
        name: name.trim(),
        role,
        pin,
        phone: formattedPhone,
        avatar_color_1: colors[0],
        avatar_color_2: colors[1],
        owner_pin: ownerPin,
      })

      // Reload profiles list
      await loadProfiles()

      toast.success(t('profileCreator.toast.created'))
      onCreated?.(profile)
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profileCreator.toast.createFailed')
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const colors = AVATAR_PRESETS[selectedPreset].colors

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.7)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto p-6 rounded-2xl animate-fade-in"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-md)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('profileCreator.title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('common:action.close')}
            className="p-1 rounded-full transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Avatar preview */}
        <div className="flex justify-center mb-4">
          <div
            className="w-[80px] h-[80px] rounded-[22px] flex items-center justify-center text-white text-2xl font-bold"
            style={{
              background: `linear-gradient(150deg, ${colors[0]}, ${colors[1]})`,
              boxShadow: '0 10px 26px rgba(0,0,0,.18), 0 1px 0 rgba(255,255,255,.3) inset',
              fontFamily: 'Space Grotesk'
            }}
          >
            {getInitials(name || t('profileCreator.avatarFallback'))}
          </div>
        </div>

        {/* Avatar picker */}
        <div className="mb-5">
          <label className="block text-[12px] font-medium mb-2" style={{ color: 'var(--muted)' }}>{t('profileCreator.avatar')}</label>
          <div className="flex flex-wrap gap-2 justify-center">
            {AVATAR_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => setSelectedPreset(i)}
                className="w-9 h-9 rounded-xl transition-all duration-200"
                style={{
                  background: `linear-gradient(150deg, ${preset.colors[0]}, ${preset.colors[1]})`,
                  boxShadow: selectedPreset === i
                    ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${preset.colors[0]}`
                    : '0 2px 6px rgba(0,0,0,.15)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{t('profileCreator.name')}</label>
          <input
            type="text"
            placeholder={t('profileCreator.namePlaceholder')}
            value={name}
            onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })) }}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: errors.name ? '1px solid var(--red)' : '1px solid var(--glass-border)',
            }}
          />
          {errors.name && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{errors.name}</p>}
        </div>

        {/* Role toggle */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{t('profileCreator.role.label')}</label>
          <div className="flex gap-2">
            {/* The role *values* are the API's enum and stay as they are —
                only the display labels go through the dictionary. */}
            {([
              { value: 'owner' as const, labelKey: 'profileCreator.role.owner', icon: Crown, color: '#b3872a' },
              { value: 'staff' as const, labelKey: 'profileCreator.role.staff', icon: Shield, color: '#0f6b4d' },
            ]).map(r => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-medium transition-all"
                style={role === r.value ? {
                  background: r.color,
                  color: 'white',
                  boxShadow: `0 4px 12px ${r.color}40`,
                } : {
                  background: 'var(--input-bg)',
                  color: 'var(--muted)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <r.icon size={14} />
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{t('profileCreator.phone')}</label>
          <input
            type="tel"
            placeholder="+213 5XX XX XX XX"
            value={phone}
            onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: '' })) }}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: errors.phone ? '1px solid var(--red)' : '1px solid var(--glass-border)',
            }}
          />
          {errors.phone && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{errors.phone}</p>}
        </div>

        {/* Owner PIN (confirmation) */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
            <Crown size={12} className="inline me-1" />
            {t('profileCreator.ownerPin')}
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={ownerPin}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4)
              setOwnerPin(val)
              setErrors(prev => ({ ...prev, ownerPin: '' }))
            }}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all tracking-widest"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: errors.ownerPin ? '1px solid var(--red)' : '1px solid var(--glass-border)',
            }}
          />
          {errors.ownerPin && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{errors.ownerPin}</p>}
        </div>

        {/* PIN */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{t('profileCreator.pin')}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPin(val)
              setErrors(prev => ({ ...prev, pin: '', confirmPin: '' }))
            }}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all tracking-widest"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: errors.pin ? '1px solid var(--red)' : '1px solid var(--glass-border)',
            }}
          />
          {errors.pin && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{errors.pin}</p>}
        </div>

        {/* Confirm PIN */}
        <div className="mb-6">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{t('profileCreator.confirmPin')}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={confirmPin}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4)
              setConfirmPin(val)
              setErrors(prev => ({ ...prev, confirmPin: '' }))
            }}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none transition-all tracking-widest"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text)',
              border: errors.confirmPin ? '1px solid var(--red)' : '1px solid var(--glass-border)',
            }}
          />
          {errors.confirmPin && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{errors.confirmPin}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--input-bg)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim() || !pin || pin.length !== 4 || pin !== confirmPin || !ownerPin || ownerPin.length !== 4}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-white disabled:opacity-50 transition-all hover:opacity-90 disabled:hover:opacity-50"
            style={{ background: 'var(--gold)' }}
          >
            {loading ? t('profileCreator.submitting') : t('profileCreator.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProfileCreator
