import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Save, User, Check, X } from 'lucide-react'

/* ─── Component ─── */

export function MyAccount() {
  const { t } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [isChangingPin, setIsChangingPin] = useState(false)
  const [pinResult, setPinResult] = useState<'success' | 'error' | null>(null)
  const [pinMessage, setPinMessage] = useState('')

  const handleSaveProfile = async () => {
    setProfileError('')
    setIsSavingProfile(true)
    try {
      await api.put('/settings/profile', { name, phone: phone || undefined })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setProfileError(e.response?.data?.error || t('account.error.saveProfile'))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePin = async () => {
    setPinResult(null)
    setPinMessage('')

    if (!currentPin || currentPin.length !== 4) {
      setPinResult('error')
      setPinMessage(t('account.error.currentPinRequired'))
      return
    }
    if (!newPin || newPin.length !== 4) {
      setPinResult('error')
      setPinMessage(t('account.error.newPinLength'))
      return
    }
    if (newPin !== confirmPin) {
      setPinResult('error')
      setPinMessage(t('account.error.pinMismatch'))
      return
    }
    if (newPin === currentPin) {
      setPinResult('error')
      setPinMessage(t('account.error.pinReused'))
      return
    }

    setIsChangingPin(true)
    try {
      // Verify current PIN first
      await api.post('/auth/verify-pin', {
        user_id: user?.id,
        pin: currentPin,
      })
      // If that succeeded, update PIN via settings
      await api.put('/settings/profile', { pin: newPin })
      setPinResult('success')
      setPinMessage(t('account.pinChanged'))
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setTimeout(() => setPinResult(null), 3000)
    } catch (err: unknown) {
      setPinResult('error')
      const e = err as { response?: { data?: { error?: string } } }
      setPinMessage(e.response?.data?.error || t('account.error.currentPinWrong'))
    } finally {
      setIsChangingPin(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      {/* Profile card */}
      <Card>
        <CardHeader
          title={t('account.title')}
          actions={<User className="w-4 h-4 text-[var(--muted)]" />}
        />
        <CardBody>
          <div className="flex flex-col gap-4">
            <Input
              label={t('account.fullName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('account.namePlaceholder')}
            />
            <Input
              label={t('common:label.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+213 5## ## ## ##"
            />
          </div>
        </CardBody>
      </Card>

      {/* Change PIN */}
      <Card>
        <CardHeader title={t('account.changePin.title')} />
        <CardBody>
          <p className="text-sm text-[var(--muted)] mb-3">
            {t('account.changePin.hint')}
          </p>
          <div className="flex flex-col gap-3">
            <Input
              label={t('account.changePin.current')}
              type="password"
              placeholder="••••"
              maxLength={4}
              value={currentPin}
              onChange={(e) => {
                setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                setPinResult(null)
              }}
            />
            <div className="flex gap-3">
              <Input
                label={t('account.changePin.new')}
                type="password"
                placeholder="••••"
                maxLength={4}
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  setPinResult(null)
                }}
              />
              <Input
                label={t('account.changePin.confirm')}
                type="password"
                placeholder="••••"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  setPinResult(null)
                }}
              />
            </div>
          </div>

          {/* PIN change result */}
          {pinResult && (
            <div
              className={cn(
                'flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm font-medium animate-fade-in',
                pinResult === 'success'
                  ? 'bg-[var(--emerald)]/10 text-[var(--emerald)]'
                  : 'bg-red-500/10 text-red-500',
              )}
            >
              {pinResult === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {pinMessage}
            </div>
          )}

          <Button
            onClick={handleChangePin}
            loading={isChangingPin}
            variant="primary"
            className="mt-3"
          >
            {t('account.changePin.submit')}
          </Button>
        </CardBody>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSaveProfile} loading={isSavingProfile} variant="primary">
          <Save className="w-4 h-4" />
          {t('account.action.save')}
        </Button>
        {profileSaved && (
          <span className="text-sm text-[var(--emerald)] font-medium animate-fade-in">
            {t('account.saved')}
          </span>
        )}
        {profileError && (
          <span className="text-sm text-red-500 font-medium animate-fade-in">
            {profileError}
          </span>
        )}
      </div>
    </div>
  )
}

export default MyAccount
