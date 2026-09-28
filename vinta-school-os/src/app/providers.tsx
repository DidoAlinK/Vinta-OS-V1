/**
 * Vinta School OS — Root Providers
 * Wraps the entire app with theme initialization, auth loading, and toast rendering.
 */

import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { useUIStore, type Toast } from '../stores/uiStore'
import { ToastProvider } from '../components/ui/Toast'

// ============================================
// Toast Container
// ============================================

const TOAST_ICONS: Record<Toast['type'], string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

const TOAST_COLORS: Record<Toast['type'], string> = {
  success: 'border-emerald-400/30 bg-emerald-500/10',
  error: 'border-red-400/30 bg-red-500/10',
  warning: 'border-amber-400/30 bg-amber-500/10',
  info: 'border-sky-400/30 bg-sky-500/10',
}

function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const removeToast = useUIStore((s) => s.removeToast)
  const [exiting, setExiting] = useState<Set<string>>(new Set())
  // Named `tr`, not `t`: the map below is `toasts.map((t) => …)` and has already
  // taken `t` for the toast itself. A translator under the same name would be
  // shadowed by a plain object, which reads as a type error at best.
  const { t: tr } = useTranslation('common')

  const handleDismiss = useCallback(
    (id: string) => {
      setExiting((prev) => new Set(prev).add(id))
      setTimeout(() => removeToast(id), 200)
    },
    [removeToast],
  )

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`
            pointer-events-auto
            flex items-start gap-3
            px-4 py-3
            rounded-xl
            border
            backdrop-blur-md
            shadow-lg
            transition-all duration-200 ease-out
            ${TOAST_COLORS[t.type]}
            ${exiting.has(t.id) ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100 translate-x-0 scale-100'}
          `}
        >
          <span className="mt-0.5 text-base shrink-0">{TOAST_ICONS[t.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text)] leading-snug">{t.title}</p>
            {t.message && (
              <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{t.message}</p>
            )}
            {t.actions && t.actions.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {t.actions.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      try {
                        action.onClick()
                      } finally {
                        if (!action.keepOnClick) handleDismiss(t.id)
                      }
                    }}
                    className={
                      action.primary
                        ? 'px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#b3872a] to-[#0f6b4d] hover:opacity-90 active:scale-[0.98] transition-all'
                        : 'px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--muted)] bg-[var(--input-bg)] border border-[var(--glass-border)] hover:text-[var(--text)] transition-colors'
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => handleDismiss(t.id)}
            className="shrink-0 mt-0.5 text-[var(--muted)]/60 hover:text-[var(--text)] transition-colors"
            aria-label={tr('notify.dismiss')}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Loading Screen
// ============================================

function LoadingScreen() {
  const { t } = useTranslation('common')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--muted)]" />
          <div className="absolute inset-0 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-[var(--muted)] font-medium">{t('state.loadingApp')}</p>
      </div>
    </div>
  )
}

// ============================================
// Providers Component
// ============================================

export interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const initTheme = useThemeStore((s) => s.initTheme)
  const loadUser = useAuthStore((s) => s.loadUser)
  const isLoading = useAuthStore((s) => s.isLoading)

  // Initialize theme from localStorage / system preference on mount
  useEffect(() => {
    initTheme()
  }, [initTheme])

  // Load authenticated user session on mount
  useEffect(() => {
    loadUser()
  }, [loadUser])

  return (
    <ToastProvider>
      {isLoading ? <LoadingScreen /> : children}
      <ToastContainer />
    </ToastProvider>
  )
}

export default Providers
