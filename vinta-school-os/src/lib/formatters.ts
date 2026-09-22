/**
 * Vinta School OS — Formatters
 * Phone, currency, date, and time formatting utilities
 */

// ============================================
// Phone Formatting
// ============================================

/**
 * Format phone number to +213 format
 * @param phone - Raw phone input
 * @returns Formatted phone with +213 prefix
 */
export function formatPhone(phone: string): string {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '')

  // If starts with 0, replace with +213
  if (cleaned.startsWith('0')) {
    return '+213' + cleaned.slice(1)
  }

  // If doesn't start with +213, add it
  if (!cleaned.startsWith('+213')) {
    return '+213' + cleaned
  }

  return cleaned
}

/**
 * Format phone for display: +213 5## ## ## ##
 * @param phone - Formatted phone string
 * @returns Display-formatted phone
 */
export function displayPhone(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/[^\d]/g, '')
  if (cleaned.length < 10) return phone

  // +213 5XX XXX XXX
  const carrier = cleaned.slice(3, 4)
  const part1 = cleaned.slice(4, 6)
  const part2 = cleaned.slice(6, 8)
  const part3 = cleaned.slice(8, 10)

  return `+213 ${carrier}${part1} ${part2} ${part3}`
}

// ============================================
// Currency Formatting
// ============================================

/**
 * Format amount in Algerian Dinar (DA)
 * @param amount - Amount in DA
 * @returns Formatted string like "3,500 DA"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' DA'
}

/**
 * Integer-only DZD helper — currency locked to DZD display.
 * Accepts floats but rounds to the nearest integer (no centimes).
 * @param amount - Amount in DZD (integer expected)
 * @returns Formatted string like "2000 Da"
 */
export function formatDa(amount: number): string {
  const int = Math.round(Number.isFinite(amount) ? amount : 0)
  return `${new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(int)} Da`
}

/**
 * Format amount without currency symbol
 * @param amount - Amount
 * @returns Formatted string like "3,500"
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format date as YYYY-MM-DD
 * @param date - Date object or string
 * @returns Formatted date string
 */
export function formatDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

/**
 * Format date as "Monday, January 5, 2026"
 * @param date - Date object or string
 * @returns Full date string
 */
export function formatDateFull(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format date as "Jan 5" or "5 Jan"
 * @param date - Date object or string
 * @param short - If true, use short month
 * @returns Short date string
 */
export function formatDateShort(date: Date | string, short = true): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    day: 'numeric',
  })
}

/**
 * Get day name (Sun, Mon, Tue, etc.)
 * @param date - Date object or string
 * @returns Day name
 */
export function getDayName(date: Date | string, short = true): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: short ? 'short' : 'long',
  })
}

/**
 * Get week dates (Sun-Sat)
 * @param startDate - Any date in the week
 * @returns Array of 7 Date objects
 */
export function getWeekDates(startDate: Date): Date[] {
  const dates: Date[] = []
  const start = new Date(startDate)
  // Get to Sunday (day 0)
  start.setDate(start.getDate() - start.getDay())

  for (let i = 0; i < 7; i++) {
    dates.push(new Date(start))
    start.setDate(start.getDate() + 1)
  }

  return dates
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  const dateA = typeof a === 'string' ? new Date(a) : a
  const dateB = typeof b === 'string' ? new Date(b) : b
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

/**
 * Check if date is today
 */
export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date())
}

// ============================================
// Time Formatting
// ============================================

/**
 * Format time string "HH:MM" to decimal hours
 * @param time - Time string like "08:30"
 * @returns Decimal hours like 8.5
 */
export function timeToDecimal(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours + minutes / 60
}

/**
 * Format decimal hours to "12 PM" style
 * @param hours - Decimal hours
 * @returns Formatted time like "12 PM"
 */
export function formatHour12(hours: number): string {
  const h = Math.floor(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12} ${ampm}`
}

/**
 * Format decimal hours to "1:30PM" style
 * @param hours - Decimal hours
 * @returns Formatted time like "1:30PM"
 */
export function formatTime12(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m > 0 ? `${h12}:${m.toString().padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

/**
 * Format time string "HH:MM" to "1:30 PM"
 * @param time - 24h time string
 * @returns 12h formatted time
 */
export function formatTime(time: string): string {
  const decimal = timeToDecimal(time)
  return formatTime12(decimal)
}

/**
 * Get current time as decimal hours
 */
export function getCurrentHour(): number {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}

// ============================================
// Initials
// ============================================

/**
 * Extract initials from name (max 2 chars)
 * @param name - Full name
 * @returns Initials like "AB"
 */
export function getInitials(name: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ============================================
// Days Overdue
// ============================================

/**
 * Calculate days overdue from due date
 * @param dueDate - Due date string
 * @returns Number of days overdue (0 if not overdue)
 */
export function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)

  const diff = today.getTime() - due.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Get aging bucket for overdue days
 * @param daysOverdue - Number of days overdue
 * @returns 'recent' | 'aging' | 'critical'
 */
export function getAgingBucket(daysOverdue: number): 'recent' | 'aging' | 'critical' {
  if (daysOverdue <= 7) return 'recent'
  if (daysOverdue <= 30) return 'aging'
  return 'critical'
}

// ============================================
// Status Helpers
// ============================================

/**
 * Get status color class
 * @param status - Payment/attendance status
 * @returns Tailwind color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'paid':
    case 'active':
    case 'present':
    case 'completed':
      return 'text-emerald'
    case 'due':
    case 'scheduled':
    case 'expired':
    case 'depleted':
      return 'text-gold'
    case 'overdue':
    case 'absent':
    case 'cancelled':
    case 'suspended':
      return 'text-red'
    // Honest "nothing recorded" states — deliberately neutral, never a colour
    // that implies money changed hands.
    case 'no_plan':
    case 'unpaid':
    case 'not_enrolled':
    default:
      return 'text-muted'
  }
}

/**
 * Get status background class
 * @param status - Payment/attendance status
 * @returns Tailwind background class
 */
export function getStatusBg(status: string): string {
  switch (status) {
    case 'paid':
    case 'active':
    case 'present':
    case 'completed':
      return 'bg-emerald-soft'
    case 'due':
    case 'scheduled':
    case 'expired':
    case 'depleted':
      return 'bg-gold-soft'
    case 'overdue':
    case 'absent':
    case 'cancelled':
    case 'suspended':
      return 'bg-red-soft'
    // Was `bg-gray-100` — a stock Tailwind light-only class, off-palette and
    // broken in dark mode. Neutral now uses the shared muted token.
    case 'no_plan':
    case 'unpaid':
    case 'not_enrolled':
    default:
      return 'bg-muted-soft'
  }
}

// ============================================
// Number Formatting
// ============================================

/**
 * Format number with locale-specific separators
 * @param num - Number to format
 * @returns Formatted number string
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format percentage
 * @param value - Decimal value (0.5 = 50%)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
