import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'

const target = '/app/dashboard'

export default function SuccessScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate(target), 3000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      {/* Background orbs */}
      <div className="absolute top-[-200px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--emerald), transparent)' }} />

      <div className="text-center animate-fade-in">
        <div
          className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{
            background: 'var(--emerald)',
            boxShadow: '0 12px 32px rgba(15,107,77,.3)'
          }}
        >
          <Check size={36} color="white" strokeWidth={3} />
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk', color: 'var(--text)' }}>
          All set!
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Redirecting to your dashboard...
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)' }} />
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)', animationDelay: '0.2s' }} />
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)', animationDelay: '0.4s' }} />
        </div>
        <button
          onClick={() => navigate(target)}
          className="mt-6 px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'var(--emerald)' }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
