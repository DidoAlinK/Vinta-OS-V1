import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-grad)', backgroundColor: 'var(--bg)' }}>
      <Sidebar />
      {/* `ms-` rather than `ml-`: the sidebar is `fixed start-0`, so the gutter
          it needs is on the leading edge of the writing direction — left in
          English, right in Arabic. */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden lg:ms-[222px]">
        <Topbar />
        <main className="flex-1 min-w-0 overflow-y-auto p-2 sm:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
