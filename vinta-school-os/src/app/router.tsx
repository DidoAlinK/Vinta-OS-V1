/**
 * Vinta School OS — Router
 * Central routing configuration with auth flow and protected app shell.
 *
 * Route structure:
 *   /                — Login / Signup
 *   /profile-picker  — Profile selection (requires auth)
 *   /profile/create  — Create new profile (requires auth)
 *   /profile/success — Post-profile success animation
 *   /app             — App shell (requires auth + profile selected)
 *     /app/dashboard
 *     /app/students
 *     /app/teachers
 *     /app/classes
 *     /app/calendar
 *     /app/billing
 *     /app/settings
 */

import { lazy, Suspense, type ReactNode } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useNavigate,
} from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'

// ============================================
// Lazy Page Imports
// ============================================

// Auth flow
const AuthScreen = lazy(() => import('../features/auth/AuthScreen'))
const ProfilePicker = lazy(() => import('../features/auth/ProfilePicker'))
const ProfileCreator = lazy(() => import('../features/auth/ProfileCreator'))
const SuccessScreen = lazy(() => import('../features/auth/SuccessScreen'))

// Layout
import { AppShell as LayoutAppShell } from '../components/layout/AppShell'

// App pages
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'))
const StudentsPage = lazy(() => import('../features/students/StudentsPage'))
const TeachersPage = lazy(() => import('../features/teachers/TeachersPage'))
const ClassesPage = lazy(() => import('../features/classes/ClassesPage'))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))
const BillingPage = lazy(() => import('../features/billing/BillingPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))

// ============================================
// Loading Indicator
// ============================================

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-8 h-8">
          <div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: 'var(--muted)' }}
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
          />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading...</span>
      </div>
    </div>
  )
}

function SuspenseWrapper({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

// ============================================
// Auth Guards
// ============================================

/**
 * Requires authentication (tokens present).
 * Redirects to login if not authenticated.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return <PageLoader />
  if (!isAuthenticated) return <Navigate to="/" replace />

  return <>{children}</>
}

/**
 * ProfileGuard: for profile-picker, profile/create, profile/success.
 * Requires authentication but NOT a selected profile.
 */
function ProfileGuard({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const selectedProfile = useAuthStore((s) => s.selectedProfile)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return <PageLoader />
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (selectedProfile) return <Navigate to="/app/dashboard" replace />

  return <>{children}</>
}

/**
 * Auth routes: if already authenticated, redirect to profile picker.
 * Login/signup pages should not be accessible when logged in.
 */
function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return <PageLoader />
  if (isAuthenticated) return <Navigate to="/profile-picker" replace />

  return (
    <SuspenseWrapper>
      <Outlet />
    </SuspenseWrapper>
  )
}

/**
 * App shell: requires auth AND profile selected.
 * Redirects to profile picker if no profile selected.
 */
function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const selectedProfile = useAuthStore((s) => s.selectedProfile)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return <PageLoader />
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (!selectedProfile) return <Navigate to="/profile-picker" replace />

  return (
    <RequireAuth>
      <LayoutAppShell />
    </RequireAuth>
  )
}

// ============================================
// Root Layout
// ============================================

function RootLayout() {
  return <Outlet />
}

// ============================================
// Route Definitions
// ============================================

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Auth Flow (login/signup)
      {
        element: <AuthGuard />,
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <AuthScreen />
              </SuspenseWrapper>
            ),
          },
        ],
      },

      // Profile Picker (requires auth, but NOT profile selected)
      {
        path: 'profile-picker',
        element: (
          <ProfileGuard>
            <SuspenseWrapper>
              <ProfilePicker />
            </SuspenseWrapper>
          </ProfileGuard>
        ),
      },

      // Profile Creator (requires auth, but NOT profile selected)
      {
        path: 'profile/create',
        element: (
          <ProfileGuard>
            <SuspenseWrapper>
              <ProfileCreatorPage />
            </SuspenseWrapper>
          </ProfileGuard>
        ),
      },

      // Success screen (requires auth, but NOT profile selected)
      {
        path: 'profile/success',
        element: (
          <ProfileGuard>
            <SuspenseWrapper>
              <SuccessScreen />
            </SuspenseWrapper>
          </ProfileGuard>
        ),
      },

      // App Shell (protected — requires auth + profile)
      {
        path: 'app',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'students', element: <StudentsPage /> },
          { path: 'teachers', element: <TeachersPage /> },
          { path: 'classes', element: <ClassesPage /> },
          // Alias: the "Classes" section is Classrooms — keep 'classes'
          // for route compat, add 'classrooms' rendering the same page.
          { path: 'classrooms', element: <ClassesPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },

      // Catch-all
      {
        path: '*',
        element: <RootRedirect />,
      },
    ],
  },
])

function RootRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const selectedProfile = useAuthStore((s) => s.selectedProfile)
  if (isAuthenticated && selectedProfile) return <Navigate to="/app/dashboard" replace />
  if (isAuthenticated && !selectedProfile) return <Navigate to="/profile-picker" replace />
  return <Navigate to="/" replace />
}

/**
 * Wrapper for ProfileCreator page that provides navigation back to profile-picker
 */
function ProfileCreatorPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <ProfileCreator
        onClose={() => navigate('/profile-picker')}
        onCreated={() => navigate('/profile-picker')}
      />
    </div>
  )
}

// ============================================
// Exported Router
// ============================================

export function AppRouter() {
  return <RouterProvider router={router} />
}

export { router }
export default AppRouter
