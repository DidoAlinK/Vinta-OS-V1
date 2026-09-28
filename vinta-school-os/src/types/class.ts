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

  /**
   * What the server says is happening in this group, as a colour:
   * red = Empty with somebody missing (the class is running with nobody in it,
   * or the group has students and no time at all), amber = Scheduled (students
   * and a time, class not started), green = Active (running, students present),
   * grey = Empty with nothing to teach.
   */
  status_color?: 'red' | 'amber' | 'green' | 'grey'

  /**
   * A session of this group is in progress right now, today. The server's own
   * fact about its own clock, sent so a screen never has to infer it.
   */
  is_running?: boolean

  /** Students marked present on that running session; 0 when none is running. */
  students_present?: number

  /**
   * Not sent by the API — nothing computes it. It was declared here as a
   * required field, which is what let the screens read it and render an
   * invisible dot and a blank label without TypeScript noticing. Read
   * `classStateOf(cls)` from `lib/classState` instead.
   */
  status?: 'full' | 'active' | 'empty'

  /**
   * Present on the detail payload, absent from the list payload — so it is
   * optional, and a reader that needs it has to say what it does when the field
   * is missing rather than trusting it to be there. Declaring it required is
   * how the grid ended up unable to tell "no time set" from "not asked".
   */
  schedules?: Schedule[]
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
  /**
   * `conducted` is what the server writes for a finished class; `completed`
   * is the legacy spelling. Both are terminal and get folded together by
   * normalizeBackendStatus — but this union has to list what actually arrives
   * on the wire, because a status→style lookup indexed with an unlisted value
   * returns undefined and renders a blank badge rather than failing loudly.
   */
  status: 'scheduled' | 'in_progress' | 'conducted' | 'completed' | 'cancelled'
  is_finalized?: boolean
  created_at: string

  // Lifecycle — the server owns these, since it is what decides who gets
  // charged. The client reads them; it does not keep its own copy.
  is_free_session?: boolean
  actual_start_time?: string | null
  actual_end_time?: string | null
  started_by_staff_id?: string | null
  ended_by_staff_id?: string | null
  cancelled_reason?: string | null

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
  /** PRESENT | ABSENT — mirrors is_present, owned by the server */
  status?: 'PRESENT' | 'ABSENT'
  /** True when this student is a guest swapped in from another group */
  is_group_swap?: boolean
  checked_in_at?: string
  checked_out_at?: string
  checked_in_by?: string
  /** When attendance was recorded; null until someone acts on the row */
  timestamp?: string | null
  created_at: string

  // ── Subscription signal ──────────────────────────────────────────────
  // Whether a student has paid is owned by their subscription, never by
  // this row. The server derives these per student; the UI only renders
  // them. There is deliberately no client-side payment status to mutate.
  remaining_credits?: number | null
  access_end?: string | null
  badges?: RosterBadge[]
}

/** Derived per-student warnings; read-only, computed by the server. */
export type RosterBadge = 'RENEW_REQUIRED' | 'ATTENDANCE_WARNING'

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
  /** Students enrolled and a time on the books, class not started — gold dot. */
  scheduled: number
  /** A class is running with somebody in it — emerald dot. */
  active: number
  /**
   * Both empty states at once: the grey one (nothing to teach) and the red one
   * (running with nobody in it, or students with no time). They share a word on
   * the card, so they share a tile.
   */
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
