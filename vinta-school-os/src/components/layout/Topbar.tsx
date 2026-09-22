import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { getInitials } from '../../lib/formatters'
import { Search, Bell, Menu } from 'lucide-react'

export function Topbar() {
  const user = useAuthStore(s => s.user)
  const { searchQuery, setSearchQuery, setMobileSidebarOpen } = useUIStore()

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-4 h-[60px] glass"
      style={{ borderRadius: 'var(--radius-lg)', margin: '8px 8px 8px 0' }}
    >
      {/* Mobile hamburger */}
      <button
        className="lg:hidden p-2 rounded-lg"
        onClick={() => setMobileSidebarOpen(true)}
        style={{ color: 'var(--text)' }}
      >
        <Menu size={20} />
      </button>

      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl w-full max-w-[300px]"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)' }}
      >
        <Search size={16} style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-[13px] w-full"
          style={{ color: 'var(--text)' }}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Notifications */}
      <button className="relative p-2 rounded-full" style={{ color: 'var(--muted)' }}>
        <Bell size={18} />
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full"
          style={{ background: 'var(--red)' }}
        />
      </button>

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
          {user?.name || 'User'}
        </span>
      </button>
    </header>
  )
}

export default Topbar
