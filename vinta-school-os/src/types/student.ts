/**
 * Vinta School OS — Student Types
 *
 * The billing half of this file mirrors the contract served by
 * `GET /students` (list) and `GET /students/<id>` (detail). Two rules shape it:
 *
 *   1. `status` describes money that has ACTUALLY been recorded. It is never
 *      optimistic. A student with nothing on file reads `unpaid` or `no_plan`,
 *      never `paid`.
 *   2. `plan` / `plan_amount` / `sessions*` / `billing_model` / `group_name`
 *      describe the plan the student is ON. That is owned by the group they are
 *      enrolled in, so it is populated even before any payment exists.
 *
 * Keeping those two ideas apart is the whole point: the old shape conflated them
 * and reported a 9,000 DA "Term" plan, marked Paid, for students who had never
 * paid and were not on that plan.
 */

import type { BillingModel } from './class'

// ============================================
// Student
// ============================================

/**
 * Billing state of a student.
 *
 * - `paid`     — an ACTIVE subscription, inside its cycle window.
 * - `due`      — money is owed: window closed, or the subscription is
 *                EXPIRED / DEPLETED.
 * - `overdue`  — the subscription is SUSPENDED.
 * - `unpaid`   — enrolled in a group, but no subscription has ever been bought.
 * - `no_plan`  — not enrolled in anything.
 *
 * `unpaid` and `no_plan` both mean "nothing recorded"; they differ only in
 * whether a plan exists to pay for.
 */
export type StudentStatus = 'paid' | 'due' | 'overdue' | 'unpaid' | 'no_plan'

/** One cycle row in the student's billing calendar. */
export interface BillingCalendarEntry {
  id: string
  status: 'paid' | 'due' | 'overdue'
  amount_da: number
  paid_amount: number
  /** ISO date. Null when the row predates cycle tracking. */
  cycle_start: string | null
  cycle_end: string | null
}

export interface Student {
  id: string
  academy_id?: string
  first_name: string
  last_name: string
  full_name: string
  phone?: string | null
  parent_phone?: string | null
  notes?: string | null
  created_at: string
  updated_at?: string

  // ── Billing state (money actually recorded) ──
  status: StudentStatus

  // ── Plan (owned by the group; present before any payment) ──
  /** Display label, e.g. "Credit — 3,300 DA". Null when there is no plan. */
  plan: string | null
  plan_amount: number | null
  /** Display form of `sessions_per_month`, e.g. "4 / month". CREDIT_BASED only. */
  sessions: string | null
  /** `credits_per_cycle` of the governing group. CREDIT_BASED only. */
  sessions_per_month: number | null
  billing_model: BillingModel | null
  /** Short group label (e.g. "A"), not the class name. */
  group_name: string | null

  // ── Subscription (money actually recorded) ──
  subscription_id: string | null
  /** ISO date the cycle renews. Null when no cycle has started. */
  renews: string | null
  remaining_credits: number | null
  total_credits: number | null

  // ── Relations ──
  /** Comma-joined class names. Present on the list route. */
  classes: string
  enrollment_status?: string | null
  /** Only the detail route ships these three; both routes omit nothing else. */
  enrollments?: Enrollment[]
  guardians?: Guardian[]
  billing_calendar?: BillingCalendarEntry[]
}

// ============================================
// Guardian
// ============================================

export interface Guardian {
  id: string
  student_id?: string
  name: string
  relationship: string
  phone: string
  is_emergency: boolean
  created_at?: string
}

// ============================================
// Enrollment
// ============================================

export interface Enrollment {
  id: string
  student_id?: string
  class_id: string
  class_name: string
  enrolled_at: string
  status: 'active' | 'withdrawn'
}

// ============================================
// Student Requests
// ============================================

export interface CreateStudentRequest {
  first_name: string
  last_name: string
  phone?: string
  parent_phone?: string
  notes?: string
  guardian?: {
    name: string
    relationship: string
    phone: string
  }
}

export interface UpdateStudentRequest {
  first_name?: string
  last_name?: string
  phone?: string
  parent_phone?: string
  notes?: string
}

export interface CreateGuardianRequest {
  name: string
  relationship: string
  phone: string
  is_emergency?: boolean
}

// ============================================
// Student Stats
// ============================================

/**
 * Counts by billing state, from `GET /students/stats`.
 *
 * `unpaid` and `no_plan` are deliberately absent as their own buckets — they
 * are not states anyone acts on at a glance, and they roll into `total`. That
 * means `total` is not the sum of the other three; it is the real roster size.
 */
export interface StudentStats {
  total: number
  paid: number
  due: number
  overdue: number
}

// ============================================
// Student State
// ============================================

export interface StudentState {
  students: Student[]
  selectedStudent: Student | null
  stats: StudentStats
  isLoading: boolean
  error: string | null

  // Actions
  fetchStudents: () => Promise<void>
  fetchStudent: (id: string) => Promise<void>
  createStudent: (data: CreateStudentRequest) => Promise<Student>
  updateStudent: (id: string, data: UpdateStudentRequest) => Promise<void>
  deleteStudent: (id: string) => Promise<void>
  setSelectedStudent: (student: Student | null) => void
}
