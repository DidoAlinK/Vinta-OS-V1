/**
 * Vinta School OS — Calendar Types
 */

import type { Session } from './class'

// ============================================
// Calendar View
// ============================================

export type CalendarViewMode = 'day' | 'week' | 'month'

export interface CalendarState {
  viewMode: CalendarViewMode
  selectedDate: Date
  sessions: Session[]
  isLoading: boolean
  error: string | null

  // Actions
  setViewMode: (mode: CalendarViewMode) => void
  setSelectedDate: (date: Date) => void
  fetchWeekSessions: (startDate: Date) => Promise<void>
  fetchDaySessions: (date: Date) => Promise<void>
  createSession: (data: CreateSessionData) => Promise<Session>
  updateSession: (id: string, data: UpdateSessionData) => Promise<void>
  moveSession: (id: string, newDate: string, newStartTime: string) => Promise<void>
  resizeSession: (id: string, newEndTime: string) => Promise<void>
  cancelSession: (id: string) => Promise<void>
}

// ============================================
// Calendar Session (Extended)
// ============================================

export interface CalendarSession extends Session {
  // Position data (computed)
  top: number
  height: number
  left: number
  width: number
  column: number
}

// ============================================
// Subject Palette
// ============================================

export interface Subject {
  id: string
  name: string
  color: string
}

export interface SubjectPaletteState {
  subjects: Subject[]
  isLoading: boolean

  // Actions
  fetchSubjects: () => Promise<void>
  addSubject: (name: string, color: string) => Promise<Subject>
  deleteSubject: (id: string) => Promise<void>
}

// ============================================
// Session Drag & Drop
// ============================================

export interface DragData {
  type: 'subject' | 'session'
  subject?: Subject
  session?: CalendarSession
  originalDate?: string
  originalStartTime?: string
}

export interface DropTarget {
  date: string
  startTime: string
  dayIndex: number
}

// ============================================
// Create Session Data
// ============================================

export interface CreateSessionData {
  class_id: string
  subject: string
  color: string
  teacher_id: string
  classroom_id?: string
  date: string
  start_time: string
  end_time: string
}

export interface UpdateSessionData {
  date?: string
  start_time?: string
  end_time?: string
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}
