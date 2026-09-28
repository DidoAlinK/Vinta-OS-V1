/**
 * Vinta School OS — Formatters
 * Phone, currency, date, and time formatting utilities
 */

import { toLocalISO } from './sessionTime'
import i18n, { DEFAULT_LANGUAGE, isLanguage, localeTag } from '../i18n'

// ============================================
// Locale
// ============================================

/**
 * The BCP-47 tag every date and number below is rendered in.
 *
 * Read from the live i18n instance on each call rather than captured once at
 * module load, so switching language re-formats the next thing that renders
 * instead of leaving the tab on the old language until a reload. The guard is
 * for the window between `init` and the first `changeLanguage`, where
 * `i18n.language` can briefly be a tag i18next inferred rather than one of ours.
 *
 * These four formatters used to be pinned to `en-US`, which meant an Arabic
 * interface still printed "Monday, January 5, 2026" and "1,240" — English
 * month names, English day names, and thousands separators that belong to a
 * locale nobody in this app is reading.
 */
function activeLocale(): string {
  return localeTag(isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE)
}

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
 * Format date as YYYY-MM-DD — local time, never UTC.
 *
 * This used `Date#toISOString()`, which is UTC: the calendar day it reports
 * rolls over at midnight UTC, not midnight locally, so for part of every day
 * it named a different day than the one on screen. That string goes straight
 * out as the `date` query param in `DayView`/`WeekView` and is the grouping
 * key in `AgendaBoard`, so a session could be rendered under one day and
 * fetched/saved under another.
 *
 * `toLocalISO` in `lib/sessionTime.ts` is the same fix and is the canonical
 * helper; this stays as a thin alias because callers already import it here.
 */
export function formatDateISO(date: Date | string): string {
  if (typeof date === 'string') {
    // A date-only string is already the answer. Re-parsing it would read it as
    // UTC midnight and shift it back a day in any negative-offset timezone.
    const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(date)
    if (dateOnly) return dateOnly[1]
  }
  const d = typeof date === 'string' ? new Date(date) : date
  return toLocalISO(d)
}

/**
 * Format date as "Monday, January 5, 2026"
 * @param date - Date object or string
 * @returns Full date string
 */
export function formatDateFull(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(activeLocale(), {
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
  return d.toLocaleDateString(activeLocale(), {
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
  return d.toLocaleDateString(activeLocale(), {
    weekday: short ? 'short' : 'long',
  })
}

/**
 * Format an instant as a date and a time together — "14 Jan, 14:30".
 *
 * Separate from `formatDateShort` because a timestamp needs both halves and
 * there was nowhere to get them at once, which is how one caller ended up
 * calling `toLocaleString('en-GB', …)` inline and printing a British-ordered
 * date inside an otherwise localised list. Deliberately omits the year: the
 * activity lists that use it are all recent history, and the extra `2026` costs
 * a line break in a narrow column.
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(activeLocale(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
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
 * How long a class ran, from two "HH:MM" times — "1h 45m", « 1 h 45 min ».
 *
 * Written here rather than in a date library because the codebase has none by
 * design, and this is the only shape it needs: two times on one clock. Callers
 * that need to know the times are usable should check for '' — it is returned
 * for unparseable input and for a non-positive span, so a mistake never reads as
 * a zero-minute class.
 *
 * The units come from the dictionary rather than being concatenated here. The
 * shape it used to return, "${hours} h ${rest} min", is French — so an English
 * or Arabic interface was printing French units, and the apostrophe in "1 h
 * 45 min" was the only hint. Unit *abbreviations* are used rather than words
 * ("h"/"m", « h »/« min », « س »/« د ») because a spelled-out Arabic unit would
 * need the full six-form plural set for a string that renders inside a table
 * cell.
 *
 * Shared, not local: the group form and the teacher form both print it, and two
 * copies of this would eventually disagree about what "1h 45m" means.
 */
export function formatDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some(Number.isNaN)) return ''
  const minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return i18n.t('duration.minutes', { count: rest })
  if (rest === 0) return i18n.t('duration.hours', { count: hours })
  return i18n.t('duration.hoursMinutes', { hours, minutes: rest })
}

/**
 * The day-half marker for a 24-hour clock value — "AM"/"PM", « ص »/« م ».
 *
 * Latin AM/PM was printed in every language, so an Arabic calendar gutter read
 * "7 AM – 9 PM" and an Arabic session chip read "7:30AM". French keeps AM/PM,
 * which is what a 12-hour school timetable uses locally; Arabic takes the
 * standard ص/م markers. The hour is the only input, so this cannot drift out of
 * step with the number it is printed beside.
 */
function hourMarker(h24: number): string {
  return i18n.t(h24 >= 12 ? 'time.pm' : 'time.am')
}

/**
 * Format decimal hours to "12 PM" style
 * @param hours - Decimal hours
 * @returns Formatted time like "12 PM"
 */
export function formatHour12(hours: number): string {
  const h = Math.floor(hours)
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12} ${hourMarker(h)}`
}

/**
 * Format decimal hours to "1:30 PM" style
 * @param hours - Decimal hours
 * @returns Formatted time like "1:30 PM"
 */
export function formatTime12(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  const marker = hourMarker(h)
  return m > 0
    ? `${h12}:${m.toString().padStart(2, '0')} ${marker}`
    : `${h12} ${marker}`
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
  return new Intl.NumberFormat(activeLocale()).format(num)
}

/**
 * Format percentage
 * @param value - Decimal value (0.5 = 50%)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
