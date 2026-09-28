import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/*
  The crash screen is its own function component because a class has no way to
  call `useTranslation` — and a fallback left in English would be the one
  screen in the app that never changed language, which is precisely the screen
  a user is least able to work around.

  The wording stays deliberately plain. Whoever reads this is already having a
  bad moment; the message says what happened and offers one way forward, and
  the technical detail is whatever the error itself said.
*/
function CrashFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useTranslation('common')

  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-base font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>
          {t('state.error')}
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          {error?.message || t('errorBoundary.detail')}
        </p>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--gold)' }}
        >
          <RefreshCw size={14} />
          {t('errorBoundary.retry')}
        </button>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return <CrashFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}

export default ErrorBoundary
