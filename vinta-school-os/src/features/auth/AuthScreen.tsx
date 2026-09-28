import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../../stores/uiStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Eye, EyeOff, Mail, Lock, Building2 } from 'lucide-react'

type AuthMode = 'login' | 'signup'

export default function AuthScreen() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { login, signup, isLoading: loading } = useAuthStore()
  const [mode, setMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Signup form
  const [signupAcademy, setSignupAcademy] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [signupPin, setSignupPin] = useState('')
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({})

  const validateSignup = (): boolean => {
    const errors: Record<string, string> = {}
    if (!signupAcademy.trim()) errors.academy = t('authScreen.validation.academyRequired')
    if (!signupEmail.trim()) errors.email = t('authScreen.validation.emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail)) errors.email = t('authScreen.validation.emailInvalid')
    if (!signupPassword) errors.password = t('authScreen.validation.passwordRequired')
    else if (signupPassword.length < 8) errors.password = t('authScreen.validation.passwordTooShort')
    if (signupPassword !== signupConfirm) errors.confirm = t('authScreen.validation.passwordMismatch')
    if (!signupPin || signupPin.length !== 4) errors.pin = t('authScreen.validation.pinLength')
    setSignupErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalLoading(true)
    try {
      await login(loginEmail, loginPassword)
      toast.success(t('authScreen.toast.welcomeBack'))
      navigate('/profile-picker')
    } catch (err: unknown) {
      // A server-sent message is already in the academy's own words — only the
      // fallback, when the request dies before it produced one, is ours.
      const message = err instanceof Error ? err.message : t('authScreen.toast.loginFailed')
      toast.error(message)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateSignup()) return
    setLocalLoading(true)
    try {
      await signup(signupAcademy, signupEmail, signupPassword, signupPin)
      toast.success(t('authScreen.toast.signupSuccess'))
      navigate('/profile-picker')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('authScreen.toast.signupFailed')
      toast.error(message)
    } finally {
      setLocalLoading(false)
    }
  }

  const isLoading = loading || localLoading

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      {/* Background gradient orbs */}
      <div className="absolute top-[-200px] start-[-100px] w-[500px] h-[500px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--gold), transparent)' }} />
      <div className="absolute bottom-[-200px] end-[-100px] w-[500px] h-[500px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--emerald), transparent)' }} />

      <div className="relative w-full max-w-[420px]">
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'linear-gradient(150deg, var(--gold), var(--emerald))',
              boxShadow: '0 12px 32px rgba(0,0,0,.2), 0 1px 0 rgba(255,255,255,.3) inset'
            }}
          >
            <span className="text-white text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>V</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk', color: 'var(--text)' }}>
            Vinta School OS
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {mode === 'login' ? t('authScreen.subtitle.login') : t('authScreen.subtitle.signup')}
          </p>
        </div>

        {/* Mode toggle pill */}
        <div className="flex justify-center mb-6">
          <div className="flex rounded-full p-1" style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}>
            {(['login', 'signup'] as AuthMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSignupErrors({}) }}
                className="px-6 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={mode === m ? {
                  background: 'var(--gold)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(179,135,42,.3)'
                } : { color: 'var(--muted)' }}
              >
                {m === 'login' ? t('authScreen.tab.login') : t('authScreen.tab.signup')}
              </button>
            ))}
          </div>
        </div>

        {/* Form card */}
        <div className="glass p-6 rounded-2xl" style={{ border: '1px solid var(--glass-border)' }}>
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label={t('authScreen.login.email')}
                type="email"
                placeholder={t('authScreen.login.emailPlaceholder')}
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
                required
              />
              <div className="relative">
                <Input
                  label={t('authScreen.login.password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  leftIcon={<Lock size={16} />}
                  rightIcon={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('authScreen.login.submitting') : t('authScreen.login.submit')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <Input
                label={t('authScreen.signup.academyName')}
                placeholder={t('authScreen.signup.academyPlaceholder')}
                value={signupAcademy}
                onChange={e => setSignupAcademy(e.target.value)}
                leftIcon={<Building2 size={16} />}
                error={signupErrors.academy}
                required
              />
              <Input
                label={t('authScreen.signup.email')}
                type="email"
                placeholder={t('authScreen.signup.emailPlaceholder')}
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
                error={signupErrors.email}
                required
              />
              <Input
                label={t('authScreen.signup.password')}
                type="password"
                placeholder={t('authScreen.signup.passwordPlaceholder')}
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                leftIcon={<Lock size={16} />}
                error={signupErrors.password}
                required
              />
              <Input
                label={t('authScreen.signup.confirmPassword')}
                type="password"
                placeholder="••••••••"
                value={signupConfirm}
                onChange={e => setSignupConfirm(e.target.value)}
                leftIcon={<Lock size={16} />}
                error={signupErrors.confirm}
                required
              />
              <Input
                label={t('authScreen.signup.pin')}
                type="password"
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
                value={signupPin}
                onChange={e => setSignupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                leftIcon={<Lock size={16} />}
                error={signupErrors.pin}
                required
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('authScreen.signup.submitting') : t('authScreen.signup.submit')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
