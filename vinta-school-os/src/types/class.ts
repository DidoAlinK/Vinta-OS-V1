/**
 * Vinta School OS — Class Types
 * Course groups + physical rooms (Classrooms) + sessions/attendance.
 */

// ============================================
// Billing model
// ============================================

export type BillingModel = 'CREDIT_BASED' | 'TIME_BASED'

export type AttendanceStatus = 'PRESENT' | 'ABSENT'

// ============================================
// Physical Room (Classroom) — front-desk managed
// ============================================

export interface Classroom {
  id: string
  academy_id: string
  name: string
  capacity: number
  created_at: string
  updated_at?: string
}

export interface CreateClassroomRequest {
  name: string
  capacity: number
}

export interface UpdateClassroomRequest {
  name?: string
  capacity?: number
}

// ============================================
// Class (Course Group)
// ============================================

export interface Class {
  id: string
  academy_id: string
  name: string
  subject: string
  color: string
  teacher_id?: string
  teacher_name?: string
  capacity: number
  enrolled_count: number
  notes?: string
  created_at: string
  updated_at: string

  // ── Class type & scheduling ──
  class_type?: 'weekly' | 'temporary'
  dedicated_time?: string // e.g. "Mon/Wed 10:00-12:00"

  // ── Course-group extensions (optional for backend back-compat) ──
  group_name?: string // A / B / C
  academic_level?: string
  billing_model?: BillingModel
  price_da?: number
  credits_per_cycle?: number
  cycle_week_limit?: number | null
  allow_rollover?: boolean
  allow_makeups?: boolean
  access_duration_weeks?: number | null
  max_groups_included?: number
  enforce_attendance?: boolean
  attendance_threshold?: number // 0-100 (%)

  // ── Per-view billing snapshot (filled by detail/subscription fetch) ──
  billing_info?: ClassBillingInfo | null

  // Computed
  status: 'full' | 'active' | 'empty'
  schedules: Schedule[]
}

/** Billing snapshot shown as a badge on the group detail */
export interface ClassBillingInfo {
  billing_model?: BillingModel
  price_da?: number
  credits_left?: number
  credits_total?: number
  access_start?: string
  access_end?: string
  status?: 'ACTIVE' | 'RENEW_REQUIRED' | 'ATTENDANCE_WARNING' | 'EXPIRED'
  attendance_rate?: number // 0-100
}

// ============================================
// Schedule
// ============================================

export interface Schedule {
  id: string
  class_id: string
  classroom_id?: string
  classroom_name?: string
  day_of_week: number // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string // "HH:MM"
  end_time: string // "HH:MM"
  created_at: string
}

// ============================================
// Session
// ============================================

export interface Session {
  id: string
  academy_id: string
  class_id: string
  class_name: string
  subject: string
  color: string
  schedule_id?: string
  teacher_id: string
  teacher_name: string
  classroom_id?: string
  classroom_name?: string
  date: string // "YYYY-MM-DD"
  start_time: string // "HH:MM"
  end_time: string // "HH:MM"
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  is_finalized?: boolean
  created_at: string

  // Computed
  start_hour: number
  end_hour: number
  duration: number
}

// ============================================
// Session Student (Attendance)
// ============================================

export interface SessionStudent {
  id: string
  session_id: string
  student_id: string
  student_name: string
  is_present: boolean
  /** New door check-in status */
  attendance_status?: AttendanceStatus
  /** True when this student is a guest swapped in from another group */
  is_group_swap?: boolean
  checked_in_at?: string
  checked_out_at?: string
  checked_in_by?: string
  payment_status: 'paid' | 'due' | 'overdue'
  created_at: string
}

// ============================================
// Class Requests
// ============================================

export interface CreateClassRequest {
  name: string
  subject: string
  color?: string
  teacher_id?: string
  capacity: number
  notes?: string
  class_type?: 'weekly' | 'temporary'
  dedicated_time?: string
  // Course-group fields
  group_name?: string
  academic_level?: string
  billing_model?: BillingModel
  price_da?: number
  credits_per_cycle?: number
  cycle_week_limit?: number | null
  allow_rollover?: boolean
  allow_makeups?: boolean
  access_duration_weeks?: number | null
  max_groups_included?: number
  enforce_attendance?: boolean
  attendance_threshold?: number
}

export interface UpdateClassRequest {
  name?: string
  subject?: string
  color?: string
  teacher_id?: string
  capacity?: number
  notes?: string
  class_type?: 'weekly' | 'temporary'
  dedicated_time?: string
  group_name?: string
  academic_level?: string
  billing_model?: BillingModel
  price_da?: number
  credits_per_cycle?: number
  cycle_week_limit?: number | null
  allow_rollover?: boolean
  allow_makeups?: boolean
  access_duration_weeks?: number | null
  max_groups_included?: number
  enforce_attendance?: boolean
  attendance_threshold?: number
}

export interface CreateClassroomRequest {
  name: string
  capacity: number
}

export interface CreateScheduleRequest {
  class_id: string
  classroom_id?: string
  day_of_week: number
  start_time: string
  end_time: string
}

// ============================================
// Session Requests
// ============================================

export interface CreateSessionRequest {
  class_id: string
  schedule_id?: string
  teacher_id: string
  classroom_id?: string
  date: string
  start_time: string
  end_time: string
}

export interface UpdateSessionRequest {
  date?: string
  start_time?: string
  end_time?: string
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}

export interface CheckInRequest {
  session_id: string
  student_id: string
  status: AttendanceStatus
  is_group_swap?: boolean
  pin: string
}

export interface FinalizeSessionRequest {
  session_id: string
  is_done: boolean
  pin: string
}

// ============================================
// Class Stats
// ============================================

export interface ClassStats {
  total: number
  full: number
  active: number
  empty: number
}

// ============================================
// Class State
// ============================================

export interface ClassState {
  classes: Class[]
  classrooms: Classroom[]
  selectedClass: Class | null
  stats: ClassStats
  isLoading: boolean
  error: string | null

  // Actions
  fetchClasses: () => Promise<void>
  fetchClassrooms: () => Promise<void>
  fetchClass: (id: string) => Promise<void>
  createClass: (data: CreateClassRequest) => Promise<Class>
  updateClass: (id: string, data: UpdateClassRequest) => Promise<void>
  deleteClass: (id: string) => Promise<void>
  setSelectedClass: (cls: Class | null) => void
}
