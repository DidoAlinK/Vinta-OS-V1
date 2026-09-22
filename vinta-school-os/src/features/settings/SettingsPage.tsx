import { useState, useEffect } from 'react'
import { cn } from '../../lib/cn'
import api from '../../lib/api'
import { toast } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import type { Academy, AcademySettings, StaffMember } from '../../types/settings'
import Appearance from './Appearance'
import MyAccount from './MyAccount'
import AcademyProfile from './AcademyProfile'
import StaffRoles from './StaffRoles'
import AddStaffModal from './AddStaffModal'
import BillingConfig from './BillingConfig'
import Automations from './Automations'
import DataExport from './DataExport'
import DangerZone from './DangerZone'
import SubjectsSettings from './SubjectsSettings'
import {
  Palette,
  User,
  Building2,
  Users,
  CreditCard,
  Zap,
  Download,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'

/* ─── Section definitions ─── */

interface SettingsSection {
  id: string
  label: string
  icon: React.ReactNode
  roles: ('owner' | 'staff')[]
}

const SECTIONS: SettingsSection[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" />, roles: ['owner', 'staff'] },
  { id: 'account', label: 'My Account', icon: <User className="w-4 h-4" />, roles: ['owner', 'staff'] },
  { id: 'academy', label: 'Academy Profile', icon: <Building2 className="w-4 h-4" />, roles: ['owner'] },
  { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" />, roles: ['owner'] },
  { id: 'staff', label: 'Staff & Roles', icon: <Users className="w-4 h-4" />, roles: ['owner'] },
  { id: 'billing', label: 'Billing Config', icon: <CreditCard className="w-4 h-4" />, roles: ['owner'] },
  { id: 'automations', label: 'Automations', icon: <Zap className="w-4 h-4" />, roles: ['owner'] },
  { id: 'export', label: 'Data & Export', icon: <Download className="w-4 h-4" />, roles: ['owner', 'staff'] },
  { id: 'danger', label: 'Danger Zone', icon: <AlertTriangle className="w-4 h-4" />, roles: ['owner'] },
]

/* ─── Component ─── */

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('appearance')
  const [academy, setAcademy] = useState<Academy | null>(null)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showAddStaff, setShowAddStaff] = useState(false)

  // User role from auth store
  const userRole = useAuthStore(s => s.user?.role ?? 'staff') as 'owner' | 'staff'

  const visibleSections = SECTIONS.filter((s) => s.roles.includes(userRole))

  /* ── Fetch all settings data ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const [academyRes, settingsRes, staffRes] = await Promise.all([
          api.get('/settings/academy'),
          api.get('/settings/appearance'),
          api.get('/settings/staff'),
        ])
        if (!cancelled) {
          setAcademy(academyRes.data)
          setSettings(settingsRes.data)
          setStaff(staffRes.data.staff ?? staffRes.data ?? [])
        }
      } catch {
        // Backend unavailable
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  /* ── Handlers ── */
  const handleUpdateAcademy = async (data: Partial<Academy>) => {
    try {
      await api.put('/settings/academy', data)
      // Backend returns {message} only — merge updates into local state
      setAcademy(prev => prev ? { ...prev, ...data } : prev)
      toast.success('Academy profile updated')
    } catch {
      toast.error('Failed to save. Please try again.')
    }
  }

  const handleUpdateSettings = async (data: Partial<AcademySettings>) => {
    try {
      await api.put('/settings/appearance', data)
      // Backend returns {message} only — merge updates into local state
      setSettings(prev => prev ? { ...prev, ...data } : prev)
      toast.success('Settings updated')
    } catch {
      toast.error('Failed to save. Please try again.')
    }
  }

  const handleAddStaff = () => {
    setShowAddStaff(true)
  }

  const handleStaffAdded = async () => {
    // Refresh staff list
    try {
      const { data } = await api.get('/settings/staff')
      setStaff(data.staff ?? data ?? [])
    } catch {
      // Backend unavailable
    }
  }

  const handleDeactivateStaff = async (id: string) => {
    try {
      await api.post(`/settings/staff/${id}/deactivate`)
      setStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: false } : s)),
      )
      toast.success('Staff member deactivated')
    } catch {
      toast.error('Failed to deactivate staff', 'Please try again.')
    }
  }

  const handleReactivateStaff = async (id: string) => {
    try {
      await api.post(`/settings/staff/${id}/reactivate`)
      setStaff((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: true } : s)),
      )
      toast.success('Staff member reactivated')
    } catch {
      toast.error('Failed to reactivate staff', 'Please try again.')
    }
  }

  const handleSectionSelect = (id: string) => {
    setActiveSection(id)
    setMobileNavOpen(false)
  }

  /* ── Default data when backend is unavailable ── */
  const defaultSettings: AcademySettings = {
    id: '1',
    academy_id: '1',
    currency: 'DZD',
    default_plan_duration: 30,
    billing_reminder_days_before: 3,
    due_date_reminder_timing: 'same_day',
    whatsapp_template: '',
    auto_checkout_enabled: false,
    end_class_popup_enabled: false,
    default_theme: 'dark',
    default_font_size: 'normal',
    default_language: 'fr',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const defaultAcademy: Academy = {
    id: '1',
    name: '',
    address: '',
    phone: '',
    email: '',
    weekend_day: 6,
    current_term: 'Term 1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const effectiveSettings = settings ?? defaultSettings
  const effectiveAcademy = academy ?? defaultAcademy

  /* ── Render ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
          <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading settings…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden p-4 gap-4">
      {/* ── Left rail navigation (desktop) ─────── */}
      <nav
        className={cn(
          'hidden md:flex w-[220px] shrink-0 flex-col gap-0.5',
          'rounded-[var(--radius-lg)]',
          'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
          'border border-[var(--glass-border)]',
          'shadow-[var(--glass-shadow)]',
          'p-2 h-fit',
        )}
      >
        <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider px-3 pb-2 pt-1">
          Settings
        </span>
        {visibleSections.map((section) => {
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => handleSectionSelect(section.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium text-left transition-all duration-200',
                isActive
                  ? 'bg-[var(--gold-soft)] text-[var(--gold)] border-l-2 border-[var(--gold)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)] border-l-2 border-transparent',
              )}
            >
              {section.icon}
              <span className="flex-1 truncate">{section.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Mobile nav toggle ──────────────────── */}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className={cn(
          'md:hidden fixed bottom-4 left-4 z-40',
          'w-12 h-12 rounded-full',
          'bg-[var(--gold)] text-white',
          'shadow-lg',
          'flex items-center justify-center',
          'hover:opacity-90 active:scale-95',
          'transition-all duration-150',
        )}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile nav overlay ─────────────────── */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav
            className={cn(
              'absolute left-0 top-0 bottom-0 w-[280px]',
              'bg-[var(--bg)] border-r border-[var(--glass-border)]',
              'flex flex-col gap-0.5 p-4',
              'animate-slide-in-left',
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                Settings
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--glass)]"
              >
                <X className="w-4 h-4 text-[var(--muted)]" />
              </button>
            </div>
            {visibleSections.map((section) => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSectionSelect(section.id)}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[var(--radius-sm)]',
                    'text-sm font-medium text-left transition-all duration-200',
                    isActive
                      ? 'bg-[var(--gold-soft)] text-[var(--gold)] border-l-2 border-[var(--gold)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--glass)] border-l-2 border-transparent',
                  )}
                >
                  {section.icon}
                  <span className="flex-1 truncate">{section.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      )}

      {/* ── Content area ──────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="animate-fade-in">
          {activeSection === 'appearance' && (
            <Appearance settings={effectiveSettings} onUpdate={handleUpdateSettings} />
          )}
          {activeSection === 'account' && (
            <MyAccount />
          )}
          {activeSection === 'academy' && (
            <AcademyProfile academy={effectiveAcademy} onUpdate={handleUpdateAcademy} />
          )}
          {activeSection === 'subjects' && (
            <SubjectsSettings />
          )}
          {activeSection === 'staff' && (
            <StaffRoles
              staff={staff}
              onAdd={handleAddStaff}
              onDeactivate={handleDeactivateStaff}
              onReactivate={handleReactivateStaff}
            />
          )}
          {activeSection === 'billing' && (
            <BillingConfig settings={effectiveSettings} onUpdate={handleUpdateSettings} />
          )}
          {activeSection === 'automations' && (
            <Automations />
          )}
          {activeSection === 'export' && (
            <DataExport />
          )}
          {activeSection === 'danger' && (
            <DangerZone />
          )}
        </div>
      </div>

      {/* Add Staff Modal */}
      <AddStaffModal
        isOpen={showAddStaff}
        onClose={() => setShowAddStaff(false)}
        onAdded={handleStaffAdded}
      />
    </div>
  )
}

export default SettingsPage
