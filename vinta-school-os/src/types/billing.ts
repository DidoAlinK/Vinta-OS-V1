/**
 * Vinta School OS — Billing Types
 * Plans, subscriptions (credit + time), payouts, multi-pay receipts.
 */

// ============================================
// Payment Plan
// ============================================

export interface PaymentPlan {
  id: string
  academy_id: string
  name: string
  duration_days: number
  amount_da: number
  created_at: string
}

// ============================================
// Payment method (multi-pay modal)
// ============================================

export type PaymentMethod = 'CASH' | 'CCP' | 'BARIDI_MOB'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CCP: 'CCP',
  BARIDI_MOB: 'Baridi Mob',
}

// ============================================
// Subscription — per-student per-group credit/time shape
// ============================================

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'DEPLETED'
  | 'EXPIRING_SOON'
  | 'RENEW_REQUIRED'
  | 'ATTENDANCE_WARNING'
  | 'SUSPENDED'

/**
 * A purchased subscription, as served by `GET /billing/subscriptions`.
 *
 * This is the record of money that actually changed hands — one row per
 * purchase, one group per row. A student's "plan" (what they are *on*) lives on
 * the group and is surfaced by `Student.plan`; do not read it from here.
 *
 * Note `group_name` here is the **class name** (`group.name`), whereas
 * `Student.group_name` is the short group label (`group.group_name`, e.g. "A").
 * Same words, different values — they are not interchangeable.
 */
export interface Subscription {
  id: string
  student_id: string
  student_name: string | null
  group_id: string
  group_name: string | null
  billing_model: 'CREDIT_BASED' | 'TIME_BASED'
  // Credit shape
  total_credits?: number | null
  remaining_credits?: number | null
  /** Credit window. Starts on purchase, ends at `cycle_deadline`. */
  cycle_start_date?: string | null
  /** ISO date the credit window closes. */
  cycle_deadline?: string | null
  // Time shape
  access_start_date?: string | null
  access_end_date?: string | null
  // Payment
  amount_paid_da?: number | null
  payment_method?: string | null
  status: SubscriptionStatus
  created_at: string | null
  updated_at?: string
}

// ============================================
// Student Billing
// ============================================

export interface StudentBilling {
  id: string
  student_id: string
  student_name: string
  payment_plan_id: string
  payment_plan_name: string
  amount_da: number
  status: 'paid' | 'due' | 'overdue'
  due_date: string
  paid_date?: string
  paid_amount?: number
  cycle_start: string
  cycle_end: string
  notes?: string
  created_at: string
  updated_at: string

  // Computed
  days_overdue: number
  aging_bucket: 'recent' | 'aging' | 'critical'
}

// ============================================
// Payment Log
// ============================================

export interface PaymentLog {
  id: string
  student_billing_id: string
  amount_da: number
  payment_method: string
  recorded_by: string
  recorded_by_name: string
  notes?: string
  created_at: string
}

// ============================================
// Revenue entry (analytics)
// ============================================

export interface RevenueEntry {
  id: string
  source: string
  amount_da: number
  recorded_at: string
  payment_method?: PaymentMethod
}

// ============================================
// Payout — per-teacher gross vs cut
// ============================================

export type PayoutStatus = 'PENDING' | 'PAID' | 'Pending' | 'Paid'

export interface PayoutRecord {
  id: string
  teacher_id: string
  teacher_name: string
  session_id?: string
  session_date?: string
  gross_revenue_da: number
  commission_type?: string
  commission_value?: number
  teacher_cut_da: number
  status: PayoutStatus
  paid_at?: string
  paid_by_staff_id?: string
  created_at: string
}

// ============================================
// Multi-pay receipt — one student, several groups
// ============================================

export interface GroupCharge {
  group_id: string
  group_name: string
  amount_da: number
}

export interface MultiPayReceipt {
  id: string
  student_id: string
  student_name: string
  charges: GroupCharge[]
  total_da: number
  payment_method: PaymentMethod
  recorded_by?: string
  created_at: string
}

/**
 * Body of `POST /billing/subscriptions/pay`.
 *
 * This is the **amount received** shape, not the receipt shape above: the
 * caller sends one item per group being paid for, plus the total actually
 * collected. The backend snapshots `total_received` across the items and
 * allocates credits oldest-debt-first.
 */
export interface MultiPayRequest {
  student_id: string
  items: { group_id: string; amount: number }[]
  total_received: number
  payment_method: PaymentMethod
  pin: string
}

// ============================================
// Billing Stats
// ============================================

export interface BillingStats {
  // Student tuition
  student_total: number
  student_paid: number
  student_due: number
  student_overdue: number

  // Teacher payroll
  teacher_total: number
  teacher_pending: number
  teacher_settled: number
  teacher_overdue: number

  // Revenue
  month_income: number
  total_enrolled: number
}

export interface BillingRingData {
  name: string
  value: number
  color: string
}

// ============================================
// Revenue Chart
// ============================================

export interface RevenueDataPoint {
  month: string
  income: number
  paid: number
  overdue: number
  enrollments: number
  withdrawals: number
  hours: number
  students_per_teacher: number
  avg_revenue: number
  overdue_count: number
}

export interface SubjectRevenue {
  subject: string
  amount: number
  color: string
}

// ============================================
// Billing Requests
// ============================================

export interface CreatePaymentPlanRequest {
  name: string
  duration_days: number
  amount_da: number
}

export interface RecordPaymentRequest {
  student_billing_id: string
  amount_da: number
  payment_method: string
  notes?: string
}

// ============================================
// Aging Bucket
// ============================================

export interface AgingBucket {
  range: string
  count: number
  total_amount: number
  students: {
    student_id: string
    student_name: string
    amount: number
    days_overdue: number
  }[]
}

// ============================================
// Billing State
// ============================================

export interface BillingState {
  plans: PaymentPlan[]
  stats: BillingStats
  overdueList: StudentBilling[]
  revenueData: RevenueDataPoint[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchPlans: () => Promise<void>
  createPlan: (data: CreatePaymentPlanRequest) => Promise<PaymentPlan>
  fetchStats: () => Promise<void>
  fetchOverdue: () => Promise<void>
  fetchRevenue: (property: string) => Promise<void>
  recordPayment: (data: RecordPaymentRequest) => Promise<PaymentLog>
  getStudentBilling: (studentId: string) => Promise<StudentBilling[]>
}
