/**
 * Vinta School OS — Teacher Types
 */

// ============================================
// Commission model
// ============================================

export type CommissionType = 'FLAT_HOURLY' | 'PERCENTAGE' | 'FIXED_SESSION'

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  FLAT_HOURLY: 'Flat hourly',
  PERCENTAGE: 'Percentage',
  FIXED_SESSION: 'Fixed per session',
}

// ============================================
// Teacher
// ============================================

export interface Teacher {
  id: string
  academy_id: string
  first_name: string
  last_name: string
  /**
   * Optional. Some teachers have no address, and the profile is still
   * creatable — the server stores NULL and the (academy_id, email) unique
   * index treats NULLs as distinct, so any number of teachers may have none.
   */
  email?: string
  /** ACTIVE (default) or INACTIVE. Inactive teachers stay on the roster and on
   *  past sessions but are kept out of the class/session assignment pickers,
   *  which opt in with ?status=ACTIVE. */
  status?: 'ACTIVE' | 'INACTIVE'
  phone?: string
  subject?: string
  subjects?: { id: string; name: string; color: string }[]
  notes?: string
  // Commission is OPTIONAL and only used when the academy turns on
  // "Turn on calculating gross profit" (grossProfitEnabled registry).
  commission_type?: CommissionType
  commission_value?: number
  created_at: string
  updated_at: string

  // Computed fields
  full_name: string
  classes_assigned: string[]
  hours_this_week: number
  students_count: number
}

/** Payout summary shown in the teacher drawer */
export interface TeacherPayoutSummary {
  teacher_id: string
  gross_da: number
  cut_da: number
  net_da: number
  pending_da: number
  paid_da: number
}

// ============================================
// Teacher Payroll
// ============================================

export interface TeacherPayroll {
  id: string
  teacher_id: string
  period_start: string
  period_end: string
  total_hours: number
  total_students: number
  rate_applied: number
  calculated_amount: number
  status: 'pending' | 'settled' | 'overdue'
  paid_date?: string
  created_at: string
  updated_at: string
}

// ============================================
// Teacher Hours Log
// ============================================

export interface TeacherHoursLog {
  id: string
  teacher_id: string
  session_id: string
  hours: number
  logged_by: string
  created_at: string
}

// ============================================
// Teacher Requests
// ============================================

export interface CreateTeacherRequest {
  first_name: string
  last_name: string
  /** Optional. Format-checked when present, unique per academy when given. */
  email?: string
  phone?: string
  subject?: string
  notes?: string
  commission_type?: CommissionType
  commission_value?: number
}

export interface UpdateTeacherRequest {
  first_name?: string
  last_name?: string
  /** Optional. Send null or "" to clear it. */
  email?: string | null
  status?: 'ACTIVE' | 'INACTIVE'
  phone?: string
  subject?: string
  notes?: string
  commission_type?: CommissionType
  commission_value?: number
}

// ============================================
// Teacher Stats
// ============================================

export interface TeacherStats {
  total: number
}

// ============================================
// Teacher State
// ============================================

export interface TeacherState {
  teachers: Teacher[]
  selectedTeacher: Teacher | null
  stats: TeacherStats
  isLoading: boolean
  error: string | null

  // Actions
  fetchTeachers: () => Promise<void>
  fetchTeacher: (id: string) => Promise<void>
  createTeacher: (data: CreateTeacherRequest) => Promise<Teacher>
  updateTeacher: (id: string, data: UpdateTeacherRequest) => Promise<void>
  deleteTeacher: (id: string) => Promise<void>
  setSelectedTeacher: (teacher: Teacher | null) => void
}
