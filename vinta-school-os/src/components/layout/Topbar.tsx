import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { getInitials } from '../../lib/formatters'
import { Menu } from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'

export function Topbar() {
  const { t } = useTranslation('nav')
  const user = useAuthStore(s => s.user)
  const setMobileSidebarOpen = useUIStore(s => s.setMobileSidebarOpen)

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-4 h-[60px] glass"
      /* Logical margins: the 8px inset all round with none on the leading edge,
         which is the side the sidebar is anchored to — left in English, right
         in Arabic. Written physically it would sit 8px off in one direction. */
      style={{ borderRadius: 'var(--radius-lg)', marginBlock: 8, marginInlineStart: 0, marginInlineEnd: 8 }}
    >
      {/* Mobile hamburger. Icon-only, so the label is the only thing a screen
          reader gets — and it is the one control that opens the navigation. */}
      <button
        className="lg:hidden p-2 rounded-lg"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label={t('openMenu')}
        style={{ color: 'var(--text)' }}
      >
        <Menu size={20} />
      </button>

      {/* Search — owns its own state, and actually queries. It used to write
          `searchQuery` into the UI store, which nothing in the app read. */}
      <GlobalSearch />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Notifications. The dot inside is real — it tracks the server's unread
          count, so its absence is information too. It used to be an
          unconditional red `<span>`: always on, never clickable, and reading
          the same whether the academy had nine alerts or none. */}
      <NotificationBell />

      {/* User pill */}
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
          style={{
            background: user?.picture?.type === 'preset' && user.picture.colors
              ? `linear-gradient(150deg, ${user.picture.colors[0]}, ${user.picture.colors[1]})`
              : 'linear-gradient(150deg, var(--gold), var(--emerald))',
            fontFamily: 'Space Grotesk'
          }}
        >
          {getInitials(user?.name || '')}
        </div>
        <span className="text-[12px] font-medium hidden sm:inline" style={{ color: 'var(--text)' }}>
          {user?.name || t('topbar.userFallback')}
        </span>
      </button>
    </header>
  )
}

export default Topbar
