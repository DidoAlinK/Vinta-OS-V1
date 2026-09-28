import { useState, useEffect } from 'react'
import { useNavigate, useMatch } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { NAV_ITEMS, STAFF_HIDDEN_PAGES } from '../../lib/constants'
import {
  LayoutGrid, UserPlus, Users, BookOpen, Calendar,
  CreditCard, Settings, LogOut, X
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: LayoutGrid, students: UserPlus, teachers: Users,
  classes: BookOpen, calendar: Calendar, billing: CreditCard, settings: Settings
}

export function Sidebar() {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const match = useMatch('/app/:page')
  const activePage = match?.params.page ?? 'dashboard'
  const user = useAuthStore(s => s.user)
  const academyName = useAuthStore(s => s.academyName)
  const logout = useAuthStore(s => s.logout)
  const switchProfile = useAuthStore(s => s.switchProfile)
  const mobileOpen = useUIStore(s => s.mobileSidebarOpen)
  const setMobileOpen = useUIStore(s => s.setMobileSidebarOpen)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const visibleItems = NAV_ITEMS.filter(item => {
    if (user?.role === 'staff' && STAFF_HIDDEN_PAGES.includes(item.key)) return false
    return true
  })

  const handleNav = (key: string) => {
    navigate(`/app/${key}`)
    if (isMobile) setMobileOpen(false)
  }

  const sidebar = (
    <div className="flex flex-col h-full" style={{ width: isMobile ? 260 : 222 }}>
      {/* Brand */}
      <div className="flex flex-col items-center pt-6 pb-4 px-4">
        <div
          className="w-[52px] h-[52px] rounded-[16px] mb-3 flex items-center justify-center"
          style={{
            background: 'linear-gradient(150deg, var(--gold), var(--emerald))',
            boxShadow: '0 10px 26px rgba(0,0,0,.18), 0 1px 0 rgba(255,255,255,.3) inset'
          }}
        >
          <span className="text-white font-bold text-xl" style={{ fontFamily: 'Space Grotesk' }}>V</span>
        </div>
        <span className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--text)' }}>
          Vinta School OS
        </span>
        {/* Academy name comes from GET /settings/academy — never hardcoded.
            The row always renders (with reserved height) so the brand block
            does not jump when the name arrives. */}
        <span
          className="text-[11px] mt-0.5 min-h-[14px] max-w-full truncate px-2"
          style={{ color: 'var(--muted)' }}
          title={academyName ?? undefined}
        >
          {academyName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {visibleItems.map(item => {
          const Icon = ICON_MAP[item.icon]
          const active = activePage === item.key
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-[13px] font-medium transition-all duration-150',
                active ? 'border' : 'hover:bg-black/5 dark:hover:bg-white/5'
              )}
              style={active ? {
                background: 'var(--gold-soft)',
                color: 'var(--text)',
                borderColor: 'var(--glass-border)'
              } : { color: 'var(--muted)' }}
            >
              {Icon && <Icon size={18} />}
              <span>{t(item.key)}</span>
            </button>
          )
        })}
      </nav>

      {/* Account Actions */}
      <div className="px-3 pb-4 space-y-1">
        <button
          onClick={() => { switchProfile(); navigate('/profile-picker') }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-[13px] font-medium transition-colors"
          style={{ color: 'var(--muted)' }}
        >
          <Users size={18} />
          <span>{t('switchProfile')}</span>
        </button>
        <button
          onClick={() => { logout(); navigate('/') }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-[13px] font-medium transition-colors"
          style={{ color: 'var(--red)' }}
        >
          <LogOut size={18} />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  )

  if (!isMobile) {
    return (
      <aside
        className="fixed start-0 top-0 h-full z-50 glass overflow-y-auto rounded-e-[var(--radius-lg)]"
        style={{ width: 222 }}
      >
        {sidebar}
      </aside>
    )
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(10,10,10,.45)', backdropFilter: 'blur(6px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed top-0 start-0 h-full z-50 glass overflow-y-auto transition-transform duration-300',
          'rounded-e-[var(--radius-lg)]',
          // Positive X is still to the right in Arabic, so the closed position
          // has to mirror: off-screen left in English, off-screen right where
          // the panel is anchored to the right edge.
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
        style={{ width: 260 }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 end-4 p-1 rounded-full"
          style={{ color: 'var(--muted)' }}
        >
          <X size={18} />
        </button>
        {sidebar}
      </aside>
    </>
  )
}

export default Sidebar
