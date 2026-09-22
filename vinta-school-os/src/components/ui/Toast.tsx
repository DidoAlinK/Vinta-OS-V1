/**
 * Toast Notification System
 * Context-based toast provider with slide-in animations.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

/* ─── Types ─── */

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: Toast['type']) => void
}

/* ─── Context ─── */

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

/* ─── Provider ─── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-2), { id, message, type }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return
    const latest = toasts[toasts.length - 1]
    if (latest.duration === 0) return // permanent toast
    const timer = setTimeout(() => dismiss(latest.id), latest.duration || 4000)
    return () => clearTimeout(timer)
  }, [toasts, dismiss])

  const icons: Record<Toast['type'], React.ReactNode> = {
    success: <CheckCircle size={16} className="text-[var(--emerald)]" />,
    error: <AlertCircle size={16} className="text-[var(--red)]" />,
    info: <Info size={16} className="text-[var(--gold)]" />,
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl',
              'bg-[var(--glass)] backdrop-blur-xl border border-[var(--glass-border)]',
              'shadow-lg animate-slide-in-right',
              'max-w-sm',
            )}
          >
            {icons[t.type]}
            <span className="text-sm text-[var(--text)] flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="p-1 rounded-lg hover:bg-[var(--glass)] text-[var(--muted)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
