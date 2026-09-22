/**
 * Vinta School OS — Constants
 * Design tokens, navigation items, filter options, and static data
 */

// ============================================
// Avatar Gradient Presets
// ============================================

export const AVATAR_PRESETS = [
  { colors: ['#b3872a', '#0f6b4d'] },  // Gold → Emerald
  { colors: ['#7c3aed', '#0ea5e9'] },  // Violet → Sky
  { colors: ['#dc2626', '#ea580c'] },  // Red → Orange
  { colors: ['#0d9488', '#10b981'] },  // Teal → Emerald
  { colors: ['#db2777', '#ec4899'] },  // Pink → Rose
  { colors: ['#6366f1', '#8b5cf6'] },  // Indigo → Violet
  { colors: ['#f59e0b', '#ef4444'] },  // Amber → Red
  { colors: ['#14b8a6', '#06b6d4'] },  // Teal → Cyan
] as const

export type AvatarPreset = typeof AVATAR_PRESETS[number]

// ============================================
// Navigation Items
// ============================================

export interface NavItem {
  key: string
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'students', label: 'Students', icon: 'students' },
  { key: 'teachers', label: 'Teachers', icon: 'teachers' },
  { key: 'classes', label: 'Classrooms', icon: 'classes' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'billing', label: 'Billing', icon: 'billing' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

/**
 * Pages hidden from staff users
 */
export const STAFF_HIDDEN_PAGES = ['billing', 'settings']

// ============================================
// Filter Options
// ============================================

export const ENTITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'payment', label: 'Payments' },
  { value: 'class', label: 'Classes' },
] as const

export const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
] as const

/**
 * Pages where entity filter is visible
 */
export const ENTITY_FILTER_PAGES = new Set(['students', 'teachers', 'classes', 'billing'])

/**
 * Pages where status filter is visible
 */
export const STATUS_FILTER_PAGES = new Set(['students', 'teachers', 'classes'])

// ============================================
// Session Status
// ============================================

export const SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: 'gold',
  in_progress: 'emerald',
  completed: 'grey',
  cancelled: 'red',
}

export const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// ============================================
// Payment Status
// ============================================

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'emerald',
  due: 'gold',
  overdue: 'red',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
}

// ============================================
// Calendar Constants
// ============================================

/**
 * Calendar grid hours (7AM - 9PM)
 */
export const CALENDAR_HOURS = Array.from({ length: 15 }, (_, i) => i + 7)

/**
 * Hour height in pixels
 */
export const HOUR_HEIGHT = 60

/**
 * Snap interval in minutes
 */
export const SNAP_MINUTES = 5

/**
 * Minimum session duration in minutes
 */
export const MIN_SESSION_DURATION = 5

/**
 * Default session duration in hours
 */
export const DEFAULT_SESSION_DURATION = 1

// ============================================
// Subject Colors
// ============================================

export const SUBJECT_COLORS: Record<string, string> = {
  Math: '#b3872a',
  French: '#7c3aed',
  English: '#0ea5e9',
  Science: '#0f6b4d',
}

// ============================================
// PIN Constants
// ============================================

/**
 * PIN length
 */
export const PIN_LENGTH = 4

/**
 * PIN keypad layout
 */
export const PIN_KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['backspace', '0', 'confirm'],
] as const

// ============================================
// Role Constants
// ============================================

export const ROLES = {
  owner: { label: 'Owner', color: 'gold' },
  staff: { label: 'Staff', color: 'emerald' },
} as const

// ============================================
// Gross-profit toggle (academy-level, frontend registry)
// OFF = commission UI hidden, no gross/cut math shown. ON = commission
// model visible per teacher + payout gross/cut shown.
// ============================================

export const GROSS_PROFIT_LABEL = 'Turn on calculating gross profit'

// ============================================
// Subscription Tiers
// ============================================

export const SUBSCRIPTION_TIERS = {
  starter: {
    label: 'Starter',
    maxProfiles: 3,
    features: ['Basic student/teacher management'],
  },
  pro: {
    label: 'Pro',
    maxProfiles: 10,
    features: ['Billing alerts', 'Calendar', 'Basic analytics'],
  },
  scaler: {
    label: 'Scaler',
    maxProfiles: Infinity,
    features: ['Automations', 'Unlimited students', 'Advanced analytics'],
  },
} as const

// ============================================
// Settings Sections
// ============================================

export interface SettingsSection {
  key: string
  label: string
  ownerOnly: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'appearance', label: 'Appearance', ownerOnly: false },
  { key: 'account', label: 'My Account', ownerOnly: false },
  { key: 'academy', label: 'Academy Profile', ownerOnly: true },
  { key: 'staff', label: 'Staff & Roles', ownerOnly: true },
  { key: 'billing', label: 'Billing Configuration', ownerOnly: true },
  { key: 'automations', label: 'Automations', ownerOnly: true },
  { key: 'export', label: 'Data & Export', ownerOnly: false },
  { key: 'subscription', label: 'Subscription', ownerOnly: true },
  { key: 'danger', label: 'Danger Zone', ownerOnly: true },
]

// ============================================
// Activity Log Types
// ============================================

export const ACTIVITY_TYPES = {
  payment: { label: 'Payment', color: 'emerald', icon: 'CreditCard' },
  checkin: { label: 'Check-in', color: 'gold', icon: 'UserCheck' },
  student: { label: 'Student', color: 'violet', icon: 'UserPlus' },
  alert: { label: 'Alert', color: 'red', icon: 'AlertCircle' },
} as const

// ============================================
// API Constants
// ============================================

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const TOKEN_KEY = 'vinta_access_token'
export const REFRESH_TOKEN_KEY = 'vinta_refresh_token'
export const ACADEMY_ID_KEY = 'vinta_academy_id'
export const THEME_KEY = 'vinta_theme'
export const FONT_SIZE_KEY = 'vinta_font_size'
export const LANGUAGE_KEY = 'vinta_language'

// ============================================
// Responsive Breakpoints
// ============================================

export const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 900,
  large: 1280,
} as const

// ============================================
// Chart Colors
// ============================================

export const CHART_COLORS = {
  gold: '#b3872a',
  emerald: '#0f6b4d',
  violet: '#7c3aed',
  red: '#dc2626',
  muted: '#75726a',
} as const

// ============================================
// Revenue Chart Properties
// ============================================

export const REVENUE_PROPERTIES = [
  { value: 'income', label: 'Total Income' },
  { value: 'paid_overdue', label: 'Paid vs. Overdue' },
  { value: 'enrollments', label: 'Enrollments' },
  { value: 'hours', label: 'Teacher Hours' },
  { value: 'ratio', label: 'Students per Teacher' },
  { value: 'average', label: 'Avg Revenue/Student' },
  { value: 'overdue_count', label: 'Overdue Count' },
  { value: 'by_subject', label: 'Income by Subject' },
] as const
