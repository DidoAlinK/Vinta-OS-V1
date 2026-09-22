# Vinta School OS — Database Architecture Blueprint

> **Purpose:** This document maps out the complete data architecture for Vinta School OS — a school management SaaS for private academies in Algeria. It defines every entity, every relationship, every data flow across all tabs and functions.
>
> **Constraint:** This is strictly a documentation/blueprint document. No schemas, migrations, or backend code are generated here.

> **Version:** v1.1 — Updated 2026-08-28
> - Added `color` field to Class entity for calendar palette styling
> - Added Subject as an extensible palette concept (not hardcoded strings)
> - Updated Calendar & Scheduling section: Dashboard = read-only, Calendar page = full drag-and-drop editor with sidebar palette, 5-min snap, edge-resize, Day/Week/Month views
> - Added subject palette drag-to-create flow

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tenant Model](#2-tenant-model)
3. [Core Entities](#3-core-entities)
4. [Entity Relationship Map](#4-entity-relationship-map)
5. [Tab-by-Tab Data Flows](#5-tab-by-tab-data-flows)
6. [Auth & Profile System](#6-auth--profile-system)
7. [Attendance & Check-in/out Flow](#7-attendance--check-inout-flow)
8. [Billing & Payment Architecture](#8-billing--payment-architecture)
9. [Teacher Payroll Architecture](#9-teacher-payroll-architecture)
10. [Calendar & Scheduling System](#10-calendar--scheduling-system)
11. [Activity Log & Audit Trail](#11-activity-log--audit-trail)
12. [Settings & Configuration](#12-settings--configuration)
13. [Notification System](#13-notification-system)
14. [Data Export & Reporting](#14-data-export--reporting)
15. [Cross-Tab Relationship Matrix](#15-cross-tab-relationship-matrix)

---

## 1. System Overview

Vinta School OS is a **multi-tenant SaaS** where each academy is an isolated tenant. All data (students, teachers, classes, billing, logs) is scoped to a single academy. The system has two user roles: **Owner** (full control) and **Staff/Front Desk** (operational access with PIN-based accountability).

### What the system manages:

| Domain | Core function |
|---|---|
| Student Management | Profiles, guardians, enrollment, attendance, billing |
| Teacher Management | Profiles, contracts, hours tracking, payroll |
| Class/Room Tracking | Class definitions, room assignments, capacity, schedules |
| Weekly Calendar | Recurring session scheduling, drag-to-resize, session instances |
| Check-in/Check-out | Manual attendance per session, auto check-out at scheduled end |
| Billing | Per-student tuition, payment tracking, renewal cycles, overdue alerts |
| Activity Log | Every action attributed to the staff member via PIN |
| Settings | Academy config, staff roles, billing defaults, automations |

---

## 2. Tenant Model

```
Academy (tenant)
  └── All other entities are scoped to this academy via academy_id FK
```

**Academy** is the root entity. Every student, teacher, class, billing record, and log entry belongs to exactly one academy. There is no cross-academy data sharing.

---

## 3. Core Entities

### 3.1 Academy

The top-level tenant. One academy = one private school/academy.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | Unique academy identifier |
| name | string | "École Al Amal" |
| phone | string | Academy contact number |
| email | string | Contact email |
| address | string | Physical address |
| weekend_day | integer | Day-of-week considered weekend (5=Friday for Algeria) |
| current_term | string | e.g., "2025 — Fall term" |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### 3.2 User (Staff & Owner profiles)

Every person who logs into the system. The owner is the academy creator; staff are front-desk operators.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| name | string | Full name |
| email | string | Login email |
| phone | string | Contact number (optional) |
| role | enum | `owner` \| `staff` |
| pin_hash | string | 4-digit PIN hash — required for ALL roles (owner PIN = login, staff PIN = action attribution) |
| picture | JSON (nullable) | `{ type: 'preset', colors: [hex1, hex2] }` or `{ type: 'upload', dataUrl: '...' }` |
| avatar_color_1 | string | Gradient start color for avatar (legacy, prefer `picture` field) |
| avatar_color_2 | string | Gradient end color for avatar (legacy, prefer `picture` field) |
| is_active | boolean | Soft-delete / deactivation flag |
| created_at | timestamp | |
| updated_at | timestamp | |

**Key behavior:** The PIN is the core differentiator. Every logged action (check-in, billing, etc.) is attributed to the user who entered their PIN, making the activity log a real accountability guarantee.

---

### 3.3 Student

A child enrolled in the academy.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| first_name | string | |
| last_name | string | |
| phone | string | Student's own phone (if applicable) |
| parent_phone | string | Primary parent/guardian emergency number |
| notes | text | Free-form (e.g., "Mild peanut allergy") |
| created_at | timestamp | |
| updated_at | timestamp | |

**Computed / derived fields (not stored, calculated at query time):**
- `status` — derived from latest billing cycle: `paid` | `due` | `overdue`
- `cls` — concatenated from enrolled classes + subjects
- `sessions` — e.g., "8/10" — attendance count / total sessions in cycle
- `renews` — days until next billing renewal (or "overdue Xd")
- `plan` — current active billing plan name + amount

---

### 3.4 Guardian

Students can have multiple guardians (Mother, Father, Uncle, Grandmother, etc.).

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| student_id | FK → Student | |
| name | string | "Mother", "Father", "Uncle (Rachid)" |
| relationship | string | Free-form relationship label |
| phone | string | Guardian phone number |
| is_emergency | boolean | Primary emergency contact flag |
| created_at | timestamp | |

**Relationship:** One Student → Many Guardians (1:N).

---

### 3.5 Teacher

An instructor employed by the academy.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| first_name | string | e.g., "Ali" |
| last_name | string | e.g., "Bensalem" |
| phone | string | |
| subject | string | Primary subject (Math, French, English, Science) |
| notes | text | Free-form |
| contract_type | enum | `hourly` \| `per_student` |
| hourly_rate | integer (nullable) | DA per hour — for hourly contracts |
| per_student_rate | integer (nullable) | DA per student — for per-student contracts |
| created_at | timestamp | |
| updated_at | timestamp | |

**Computed fields:**
- `classes_assigned` — list of class names this teacher teaches
- `hours_this_week` — sum of logged session hours this week
- `students_count` — number of active students (for per-student contracts)

---

### 3.6 Classroom

A physical room in the academy.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| name | string | e.g., "Room 3", "CM2 — Room 3" |
| capacity | integer | Max students the room holds |
| created_at | timestamp | |

---

### 3.7 Class

A subject offering (e.g., "Math — CM2", "French — 6ème A"). This is the **enrollment target** — students enroll in classes, not directly in sessions.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| name | string | Display name: "Math — CM2" |
| subject | string | Math, French, English, Science (extensible — see Subject palette below) |
| color | string | Hex color for calendar palette styling, e.g., "#b3872a" |
| teacher_id | FK → Teacher (nullable) | Assigned teacher — nullable if unassigned |
| capacity | integer | Max enrolled students |
| notes | text | e.g., "Uses Room 4 projector for the geometry unit" |
| created_at | timestamp | |
| updated_at | timestamp | |

**Status dot logic (from Classes tab):**
- 🔴 Red = enrolled ≥ capacity (full)
- 🟢 Green = enrolled > 0 but not full
- ⚪ Grey = enrolled = 0 (empty, not teaching)

---

### 3.8 Enrollment

The many-to-many relationship between Students and Classes.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| student_id | FK → Student | |
| class_id | FK → Class | |
| enrolled_at | timestamp | When the student joined this class |
| status | enum | `active` \| `withdrawn` |
| created_at | timestamp | |

**Relationship:** Student ↔ Class is **many-to-many** through Enrollment. A student can be in multiple classes (e.g., CM2 Math + CM2 French). A class has many students.

---

### 3.9 Schedule (Recurring Weekly Slot)

Defines when a class meets each week. Each class can have multiple schedule entries (e.g., Math CM2 meets Mon 8:00 and Thu 8:00).

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| class_id | FK → Class | |
| classroom_id | FK → Classroom (nullable) | Which room — can differ per slot |
| day_of_week | integer | 0=Sun, 1=Mon, ..., 6=Sat |
| start_time | time | e.g., 08:00 |
| end_time | time | e.g., 09:00 |
| created_at | timestamp | |

**Relationship:** Class → Many Schedules (1:N). Each Schedule entry generates Session instances.

---

### 3.10 Session (Specific Instance)

A concrete class session on a specific date. Created from Schedule entries (either pre-generated for the term or on-the-fly).

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | Tenant scope |
| class_id | FK → Class | |
| schedule_id | FK → Schedule (nullable) | Link back to recurring slot — null for custom sessions |
| teacher_id | FK → Teacher | Denormalized from Class at creation time |
| classroom_id | FK → Classroom (nullable) | Denormalized from Schedule at creation time |
| date | date | The specific calendar date |
| start_time | time | |
| end_time | time | |
| subject | string | Denormalized from Class |
| status | enum | `scheduled` \| `in_progress` \| `completed` \| `cancelled` |
| created_at | timestamp | |

**Key distinction:** Schedule = "what happens every week." Session = "what happened on this specific date." Sessions are the units for attendance tracking.

---

### 3.11 SessionStudent (Attendance Record)

Tracks which students are enrolled in a specific session and their attendance status.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| session_id | FK → Session | |
| student_id | FK → Student | |
| is_present | boolean | Whether the student checked in |
| checked_in_at | timestamp (nullable) | When they checked in |
| checked_out_at | timestamp (nullable) | When they checked out (auto at end or manual) |
| checked_in_by | FK → User (nullable) | Which staff member logged the check-in |
| payment_status | enum | `paid` \| `due` \| `overdue` | Denormalized snapshot for this session |
| created_at | timestamp | |

**Relationship:** Session ↔ Student is **many-to-many** through SessionStudent. This is where attendance and per-session payment status live.

---

### 3.12 PaymentPlan (Billing Plan Templates)

Reusable billing plans that can be assigned to students.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | |
| name | string | e.g., "Monthly", "Term" |
| duration_days | integer | 30 for monthly, 90 for term |
| amount_da | integer | Price in Algerian Dinars |
| created_at | timestamp | |

**Example plans (from mockups):**
- Monthly — 3,500 DA (30 days)
- Monthly — 3,000 DA (30 days)
- Term — 9,000 DA (90 days)
- Term — 8,000 DA (90 days)

---

### 3.13 StudentBilling (Billing Cycle Record)

One record per billing cycle per student. This is the core billing entity.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| student_id | FK → Student | |
| payment_plan_id | FK → PaymentPlan | Which plan they're on |
| amount_da | integer | Amount due for this cycle |
| status | enum | `paid` \| `due` \| `overdue` |
| due_date | date | When payment is due |
| paid_date | date (nullable) | When payment was actually made |
| paid_amount | integer (nullable) | Actual amount paid (may differ if partial) |
| cycle_start | date | Start of this billing cycle |
| cycle_end | date | End of this billing cycle |
| notes | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

**Status logic:**
- `paid` — paid_date is set and paid_amount ≥ amount_da
- `due` — due_date is today or in the future, not yet paid
- `overdue` — due_date has passed, not yet paid

---

### 3.14 PaymentLog (Transaction Record)

Individual payment transactions against a billing record.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| student_billing_id | FK → StudentBilling | |
| amount_da | integer | Amount paid in this transaction |
| payment_method | string | Cash, bank transfer, etc. |
| recorded_by | FK → User | Which staff member logged the payment |
| notes | text | |
| created_at | timestamp | |

**Relationship:** StudentBilling → Many PaymentLogs (1:N). A student might pay in installments.

---

### 3.15 TeacherPayroll

Monthly payroll record for each teacher.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| teacher_id | FK → Teacher | |
| period_start | date | Start of payroll period |
| period_end | date | End of payroll period |
| total_hours | decimal | Sum of logged hours (hourly contracts) |
| total_students | integer | Active student count (per-student contracts) |
| rate_applied | integer | Rate used for calculation |
| calculated_amount | integer | total_hours × rate OR total_students × rate |
| status | enum | `pending` \| `settled` \| `overdue` |
| paid_date | date (nullable) | |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### 3.16 TeacherHoursLog

Records when a teacher's hours are logged (per session).

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| teacher_id | FK → Teacher | |
| session_id | FK → Session | Which session the hours are from |
| hours | decimal | Duration of the session |
| logged_by | FK → User | Staff member who logged it |
| created_at | timestamp | |

**Relationship:** Teacher → Many TeacherHoursLogs (1:N). Session → One TeacherHoursLog (1:1, optional).

---

### 3.17 ActivityLog (Audit Trail)

Every significant action in the system is logged with the user who performed it.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | |
| user_id | FK → User | Who performed the action |
| entity_type | string | `student` \| `teacher` \| `class` \| `session` \| `billing` \| `payment` |
| entity_id | UUID | ID of the affected entity |
| action | string | `created` \| `updated` \| `deleted` \| `checked_in` \| `checked_out` \| `payment_received` \| `payment_overdue` \| `enrolled` \| `withdrawn` |
| description | text | Human-readable: "Payment received — Karim M." |
| metadata | JSON | Contextual data: amount, session info, etc. |
| created_at | timestamp | |

**Log types shown in the UI:**
- `payment` — Payment received (emerald, CreditCard icon)
- `checkin` — Student check-in/check-out (gold, UserCheck icon)
- `student` — New enrollment / profile created (violet, UserPlus icon)
- `alert` — Overdue payment / removal (red, AlertCircle icon)

---

### 3.18 AcademySettings

Per-academy configuration (singleton per academy).

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy (unique) | One settings record per academy |
| currency | string | Default: "DZD" (Algerian Dinar) |
| default_plan_duration | integer | Default billing cycle length in days |
| billing_reminder_days_before | integer | Days before due date to send reminder |
| due_date_reminder_timing | enum | `same_day` \| `custom` |
| whatsapp_template | text | Message template with {student_name}, {amount}, {due_date} placeholders |
| auto_checkout_enabled | boolean | Auto check-out at scheduled class end |
| end_class_popup_enabled | boolean | "Is the class done?" popup at end time |
| default_theme | enum | `light` \| `dark` |
| default_font_size | enum | `normal` \| `large` |
| default_language | enum | `fr` \| `ar` |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### 3.19 Subscription

The academy's SaaS subscription tier.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy (unique) | |
| tier | enum | `starter` \| `pro` \| `scaler` |
| status | enum | `active` \| `inactive` \| `trialing` |
| invoicing_method | string | "Manual" (no card on file) |
| started_at | timestamp | |
| expires_at | timestamp (nullable) | |
| created_at | timestamp | |

**Tier features:**
- Starter: Basic student/teacher management
- Pro: Billing alerts, calendar
- Scaler: Automations (auto check-out, class-end popup), unlimited students

---

### 3.20 Notification

In-app toast notifications and alerts.

| Field | Type | Notes |
|---|---|---|
| id | UUID / PK | |
| academy_id | FK → Academy | |
| user_id | FK → User (nullable) | null = broadcast to all academy users |
| type | enum | `payment_reminder` \| `class_ending` \| `enrollment_request` \| `overdue_alert` \| `general` |
| title | string | |
| message | string | |
| detail | text | Extended detail text |
| actions | JSON | Array of {label, variant} for action buttons |
| is_read | boolean | |
| created_at | timestamp | |

---

## 4. Entity Relationship Map

```
Academy (1) ─────────────────────────────────────────────────┐
  │                                                           │
  ├── (N) User                                                │
  │     └── role: owner | staff                               │
  │     └── pin_hash (staff only)                             │
  │                                                           │
  ├── (N) Student ──────────────────────────┐                 │
  │     ├── (N) Guardian                    │                 │
  │     │                                   │                 │
  │     ├── (N) Enrollment ──► Class        │                 │
  │     │                                   │                 │
  │     ├── (N) SessionStudent ──► Session  │                 │
  │     │     └── is_present, payment_status│                 │
  │     │                                   │                 │
  │     └── (N) StudentBilling ──► PaymentPlan                │
  │           └── (N) PaymentLog                              │
  │                                                           │
  ├── (N) Teacher ────────────────────────┐                   │
  │     ├── (N) Class (as teacher_id)     │                   │
  │     ├── (N) TeacherPayroll            │                   │
  │     └── (N) TeacherHoursLog ──► Session                   │
  │                                                           │
  ├── (N) Classroom                                            │
  │     └── (N) Class (as classroom_id)                       │
  │     └── (N) Schedule (as classroom_id)                    │
  │                                                           │
  ├── (N) Class ──────────────────────────────────────────────┤
  │     ├── teacher_id → Teacher                              │
  │     ├── (N) Schedule (recurring weekly slots)             │
  │     ├── (N) Enrollment → Student                          │
  │     └── (N) Session (specific instances)                  │
  │                                                           │
  ├── (N) Session ────────────────────────────────────────────┤
  │     ├── class_id → Class                                  │
  │     ├── teacher_id → Teacher                              │
  │     ├── schedule_id → Schedule                            │
  │     ├── (N) SessionStudent → Student                      │
  │     └── (N) TeacherHoursLog → Teacher                     │
  │                                                           │
  ├── (1) AcademySettings                                     │
  ├── (1) Subscription                                        │
  ├── (N) ActivityLog                                         │
  └── (N) Notification                                        │
```

### Key Relationship Summary

| From | To | Cardinality | Through | Description |
|---|---|---|---|---|
| Academy | User | 1:N | — | Staff members |
| Academy | Student | 1:N | — | Enrolled students |
| Academy | Teacher | 1:N | — | Employed teachers |
| Academy | Classroom | 1:N | — | Physical rooms |
| Academy | Class | 1:N | — | Subject offerings |
| Student | Guardian | 1:N | — | Emergency contacts |
| Student | Class | M:N | **Enrollment** | Which classes a student is in |
| Student | Session | M:N | **SessionStudent** | Attendance per session |
| Student | PaymentPlan | M:N | **StudentBilling** | Active billing plans |
| StudentBilling | Payment | 1:N | **PaymentLog** | Payment transactions |
| Teacher | Class | 1:N | class.teacher_id | Teacher assignment |
| Teacher | Session | 1:N | session.teacher_id | Sessions taught |
| Teacher | Payroll | 1:N | **TeacherPayroll** | Monthly pay records |
| Teacher | HoursLog | 1:N | **TeacherHoursLog** | Session hours logged |
| Class | Classroom | N:1 | Schedule.classroom_id | Room per schedule slot |
| Class | Schedule | 1:N | **Schedule** | Recurring weekly slots |
| Class | Session | 1:N | **Session** | Concrete instances |
| Schedule | Session | 1:N | session.schedule_id | Generates sessions |
| User | ActivityLog | 1:N | activity.user_id | Actions performed |
| User | SessionStudent | 1:N | checked_in_by | Who logged attendance |
| User | PaymentLog | 1:N | recorded_by | Who recorded payment |

---

## 5. Tab-by-Tab Data Flows

### 5.1 Dashboard Tab

**What it shows:**
- Weekly agenda (Google Calendar-style block grid)
- Session detail with student roster
- Activity log sidebar

**Data dependencies:**
```
Sessions ──► Class ──► Teacher, Classroom
     │
     └──► SessionStudent ──► Student
                │
                └──► payment_status (snapshot)

ActivityLog ──► User (who performed action)
```

**Data flows:**
1. **Load agenda:** Query all Sessions for the current week, grouped by day. Each session carries its class, teacher, and room info.
2. **Open session detail:** Query SessionStudents for that session, joined with Student data for names/phones.
3. **Toggle presence:** Update SessionStudent.is_present, record checked_in_at/checked_out_at, create ActivityLog entry.
4. **Cycle payment:** Update SessionStudent.payment_status, create ActivityLog entry.
5. **Drag to reschedule:** Update Session.start_time, end_time, date. Creates ActivityLog entry.
6. **Add custom session:** Create a new Session with schedule_id=null. Creates ActivityLog entry.
7. **Add student to session:** Create SessionStudent record. If student doesn't exist, create Student first. Creates ActivityLog entry.
8. **Class ending toast:** At scheduled end time, check if session exists and status is in_progress → trigger notification.
9. **Auto check-out:** If auto_checkout_enabled in AcademySettings, automatically set checked_out_at for all SessionStudents when session end_time is reached.

---

### 5.2 Students Tab

**What it shows:**
- Student directory with stats rail
- Student profile drawer with billing calendar

**Data dependencies:**
```
Student ──► Guardian (1:N)
Student ──► Enrollment ──► Class (M:N)
Student ──► StudentBilling ──► PaymentPlan
Student ──► SessionStudent (attendance history)
```

**Data flows:**
1. **List students:** Query all Students for academy, compute status from latest StudentBilling, compute sessions count from SessionStudent.
2. **Stats rail:** Aggregate counts: total, paid (status=paid), overdue (status=overdue).
3. **Filter:** Client-side filter on computed status field.
4. **Open drawer:** Load Student + Guardians + latest StudentBilling + enrollment list.
5. **Billing calendar:** Query StudentBilling records for last 4 weeks, render as mini-grid (paid=green, missed=red, upcoming=grey).
6. **Call/Message:** Use student.phone / parent_phone from Guardian.
7. **Delete student:** Soft-delete Student, cascade withdraw all Enrollments, mark SessionStudents as withdrawn.
8. **Add student:** Create Student + default Guardian + default StudentBilling (status=paid, 0 sessions).

---

### 5.3 Teachers Tab

**What it shows:**
- Teacher directory with stats rail
- Teacher profile drawer with schedule + payroll summary

**Data dependencies:**
```
Teacher ──► Class (1:N, as teacher_id)
Teacher ──► TeacherPayroll (1:N)
Teacher ──► TeacherHoursLog ──► Session
Teacher ──► Session (1:N, as session.teacher_id)
```

**Data flows:**
1. **List teachers:** Query all Teachers for academy, compute contract badge, hours/sudents count.
2. **Stats rail:** Total, hourly count, per-student count.
3. **Open drawer:** Load Teacher + assigned Classes + TeacherPayroll for current period + TeacherHoursLog this week.
4. **Schedule view:** Query Sessions where teacher_id matches, grouped by day/time.
5. **Payroll summary:** For hourly: total_hours × hourly_rate. For per-student: active_students × per_student_rate.
6. **Add teacher:** Create Teacher with default contract_type=hourly, rate=0.

---

### 5.4 Classes Tab

**What it shows:**
- Grid of class cards
- Class detail with editable header + block calendar

**Data dependencies:**
```
Class ──► Teacher (FK, nullable)
Class ──► Schedule (1:N) ──► Classroom
Class ──► Enrollment ──► Student (M:N)
Class ──► Session (1:N)
```

**Data flows:**
1. **Grid view:** Query all Classes, compute enrolled count from Enrollment, compute status dot color.
2. **Status dot logic:**
   - Red: enrolled ≥ capacity
   - Green: enrolled > 0 and < capacity
   - Grey: enrolled = 0
3. **Open class detail:** Load Class + Teacher + Schedules + Enrollment count.
4. **Block calendar:** Render Schedule entries as blocks on a Mon-Fri grid.
5. **Add/edit schedule block:** Create or update Schedule record. Optionally link classroom.
6. **Delete class:** Cascade delete Schedules, withdraw all Enrollments, cancel future Sessions.
7. **Add class:** Create Class with enrolled=0, teacher="Unassigned", empty schedule.

---

### 5.5 Calendar Tab (Week Calendar)

**What it shows:**
- Full-week view with all sessions (same as Dashboard agenda but standalone)
- Drag-to-move, edge-to-resize, add custom session

**Data dependencies:**
```
Session ──► Class ──► Teacher, Subject
Session ──► Classroom
Session ──► SessionStudent (for attendance count)
```

**Data flows:**
1. **Load week:** Query all Sessions for the visible week date range.
2. **Render blocks:** Position each session by day and time. Color by subject.
3. **Drag to move:** Update Session.date, start_time, end_time.
4. **Resize:** Update Session.end_time (or start_time for top edge).
5. **Add session:** Create Session with user-specified time/day/subject/teacher/room.

---

### 5.6 Billing Tab

**What it shows:**
- Donut ring cards (student tuition status, teacher payroll status)
- Revenue chart with switchable properties
- Stat buttons with expandable breakdowns
- Finance breakdown modal

**Data dependencies:**
```
StudentBilling ──► Student, PaymentPlan
TeacherPayroll ──► Teacher
PaymentLog ──► StudentBilling
```

**Data flows:**
1. **Ring cards:** Aggregate StudentBilling by status (paid/due/overdue) → student ring. Aggregate TeacherPayroll by status → teacher ring.
2. **Stat buttons:**
   - "This month's income": Sum of StudentBilling.amount_da where status=paid AND cycle_end is this month.
   - "Total enrolled": count(Students) + count(Teachers).
3. **Revenue chart:** Time-series data computed from StudentBilling records grouped by month.
   - Income: sum of paid amounts per month
   - Paid vs Overdue: parallel series
   - Enrollments: count of new Enrollments vs Withdrawals per month
   - Teacher hours: sum of TeacherHoursLog.hours per month
   - Students per teacher: ratio
   - Average revenue per student: income / student count per month
   - Overdue count: count of StudentBilling with status=overdue per month
   - Income by subject: sum of StudentBilling joined through SessionStudent → Session → Class.subject
4. **Breakdown modal:** Detailed per-entity view with aging buckets (1-7d, 8-30d, 30d+) for overdue accounts.
5. **Export CSV:** Generate from query results.

---

### 5.7 Settings Tab

**What it shows:**
- Multi-section flyout with left rail navigation
- Role-based visibility (owner-only sections hidden from staff)

**Data dependencies:**
```
AcademySettings ──► Academy (1:1)
Subscription ──► Academy (1:1)
User ──► Academy (1:N, staff list)
```

**Data flows:**
1. **Appearance:** Read/write AcademySettings (theme, font_size, language).
2. **My Account:** Read current User, update name/phone/email. Change PIN (staff) or password (owner).
3. **Academy Profile:** Read/write Academy fields (name, phone, email, address, weekend_day, current_term).
4. **Staff & Roles:** List Users where academy_id matches. Add/remove staff. Reset PIN.
5. **Billing Config:** Read/write AcademySettings (currency, default_plan_duration, billing alerts, WhatsApp template).
6. **Automations:** Read/write AcademySettings (auto_checkout, end_class_popup). Gated by Scaler tier.
7. **Data & Export:** Generate CSV for Students, Billing History, Teacher Hours.
8. **Subscription:** Read Subscription record. Display current tier and features.
9. **Danger Zone:** Deactivate staff (set User.is_active=false). Delete academy (cascade delete all data).

---

## 6. Auth & Profile System

### Flow:
```
Auth Screen ──► Profile Picker ──► PIN Modal ──► Dashboard
     │                                  │
     │                   Both owner and staff use PIN
     │                                  │
     └──── Login / Signup ──────────────┘
```

### Academy Setup Flow:
```
Signup ──► Profile Picker (empty) ──► Create Owner Profile (locked role) ──► Success ──► Dashboard
                                   │
                                   └── Owner sets: name, picture, 4-digit PIN
                                       Role toggle is HIDDEN (always owner)
```

### Data:
- **Login:** Email + password → authenticate User record → load academy's profiles
- **Signup:** Create Academy + AcademySettings + Subscription (starter tier) → redirect to profiles (empty) → force owner profile creation
- **Profile picker:** List all active Users for the academy, showing role badges. Empty state shows "Create your first profile" CTA.
- **PIN verification:** 4-digit PIN for ALL roles (owner + staff) → hash and compare with User.pin_hash → on success, set current session user
- **Profile creation:** Owner-only — requires owner PIN to authorize. Owner creates profiles from Settings flyout.

### Profile Picture:
- Stored as: `{ type: 'preset', colors: [hex1, hex2] }` or `{ type: 'upload', dataUrl: 'data:image/...' }`
- Preset: 8 color gradient pairs rendered as circular avatar with initials
- Upload: Custom image, max 2MB, stored as base64 data URL (or S3 URL in production)

### Security:
- Owner PIN is required for login (not password-only bypass)
- Staff PINs are hashed, never stored in plaintext
- Every action after PIN entry is attributed to that specific staff member
- Profile creation requires owner PIN — staff cannot create profiles

---

## 7. Attendance & Check-in/out Flow

### Check-in (Manual):
```
Staff selects profile → enters PIN → opens session → clicks student → marks present
    │
    ├── Update SessionStudent.is_present = true
    ├── Set SessionStudent.checked_in_at = now()
    ├── Set SessionStudent.checked_in_by = current_user.id
    └── Create ActivityLog entry: type=checkin, action=checked_in
```

### Check-out (Auto at scheduled end):
```
Session end_time reached
    │
    ├── IF auto_checkout_enabled:
    │     For each SessionStudent where is_present=true AND checked_out_at is null:
    │       Set checked_out_at = session.end_time
    │
    ├── IF end_class_popup_enabled:
    │     Show "Is the class done?" toast → Yes/No
    │       Yes → mark session status=completed
    │       No → keep status=in_progress, extend visually
    │
    └── Create ActivityLog entry: type=checkin, action=checked_out
```

### Manual check-out (early):
```
Staff clicks check-out on student
    │
    ├── Set SessionStudent.checked_out_at = now()
    └── Create ActivityLog entry
```

---

## 8. Billing & Payment Architecture

### Billing Lifecycle:
```
PaymentPlan created
    │
    ├── Student enrolled in class
    │     │
    │     └── StudentBilling created
    │           │
    │           ├── status = "due" (not yet paid)
    │           │     │
    │           │     ├── paid → status = "paid", paid_date set
    │           │     │     └── PaymentLog created
    │           │     │
    │           │     └── due_date passes → status = "overdue"
    │           │           │
    │           │           ├── Notification sent (overdue alert)
    │           │           └── ActivityLog entry: payment_overdue
    │           │
    │           └── cycle_end reached → new StudentBilling created for next cycle
    │
    └── Payment recorded
          ├── PaymentLog created (amount, method, recorded_by)
          ├── StudentBilling.paid_amount updated
          └── If paid_amount >= amount_da → status = "paid"
```

### Status Derivation:
```
Student.status = LATEST StudentBilling.status
    │
    ├── If no billing records → "paid" (default)
    ├── If latest billing status = "paid" → "paid"
    ├── If latest billing status = "due" → "due"
    └── If latest billing status = "overdue" → "overdue"
```

### Renewal:
```
cycle_end reached
    │
    ├── Create new StudentBilling record:
    │     payment_plan_id = current plan
    │     amount_da = plan.amount_da
    │     status = "due"
    │     cycle_start = old cycle_end
    │     cycle_end = cycle_start + plan.duration_days
    │     due_date = cycle_start + plan.duration_days
    │
    └── Notification: "Renewal due for {student_name}"
```

### Aging Buckets (for overdue display):
```
Overdue accounts bucketed by days overdue:
    ├── 1–7 days overdue   → "recent"
    ├── 8–30 days overdue  → "aging"
    └── 30+ days overdue   → "critical"
```

---

## 9. Teacher Payroll Architecture

### Hourly Contract:
```
TeacherHoursLog records:
    ├── session_id → Session
    ├── hours = session.end_time - session.start_time
    └── logged_by = staff who confirmed the session

Monthly payroll:
    total_hours = SUM(TeacherHoursLog.hours) WHERE date in period
    calculated_amount = total_hours × teacher.hourly_rate
```

### Per-Student Contract:
```
Active students = COUNT(Student) WHERE:
    ├── student is enrolled in a class taught by this teacher
    └── enrollment.status = 'active'

Monthly payroll:
    total_students = active student count
    calculated_amount = total_students × teacher.per_student_rate
```

### Payroll Lifecycle:
```
Month starts
    │
    ├── Payroll record created (status=pending)
    │
    ├── Hours/Students accumulated throughout month
    │
    ├── Month ends → calculated_amount finalized
    │     │
    │     ├── Owner marks as settled → status=settled, paid_date set
    │     │
    │     └── If not settled by threshold → status=overdue
    │
    └── ActivityLog entry: payment_received / payment_overdue
```

---

## 10. Calendar & Scheduling System

### Dashboard Calendar (Read-Only)
The Dashboard tab includes a **read-only** calendar view for quick schedule overview:
- **Day/Week toggle** — switch between single-day and full-week view
- **No editing** — blocks are click-only (opens session detail panel)
- **No drag/resize** — purely informational
- **Now-line** — thin red horizontal line at current time
- **Subject color coding** — blocks colored by class.color

### Calendar Page (Full Editor)
The Calendar tab is the **primary scheduling interface** with full drag-and-drop:

#### Sidebar Subject Palette
```
Left sidebar (180px):
    ├── Subject cards (draggable from palette)
    │     Each card shows: grip icon + colored chip with subject name
    │     Color comes from class.color field
    │
    ├── "Add subject" dashed card → opens AddSubjectModal
    │     (name + color picker with 8 presets + custom)
    │
    └── Instructions hint text

Default palette subjects (seeded from Class records):
    Math (#b3872a), French (#7c3aed), English (#0ea5e9), Science (#0f6b4d)
    + any custom subjects added by user
```

#### Drag-to-Create Flow
```
1. User drags a subject card from sidebar onto the grid
2. Grid highlights drop target (green tint)
3. On drop:
   ├── Calculate time from drop Y position (snapped to 5-min grid)
   ├── Open CreateSessionModal with:
   │     subject = dragged subject name
   │     color = subject color
   │     date = target day column
   │     startTime = snapped drop time
   │     endTime = startTime + 1hr (default)
   └── User fills in teacher, room, adjusts times if needed
4. On submit: POST /sessions → new session appears on grid
```

#### Edge-Resize on Blocks
```
Existing blocks have invisible resize handles at top/bottom edges:
    .resize-handle.top (cursor: ns-resize)
    .resize-handle.bottom (cursor: ns-resize)

On mousedown on handle:
    ├── Track mouse delta from start position
    ├── Snap to 5-minute grid (SNAP_MIN = 5)
    ├── Top edge: adjust start_time, maintain end_time
    ├── Bottom edge: adjust end_time, maintain start_time
    ├── Enforce minimum 5-minute duration
    └── On mouseup: PATCH /sessions/:id → update times
```

#### Drag-to-Move Blocks
```
Existing blocks are draggable:
    ├── On dragstart: store session ID + original position
    ├── On drop on different day/time column:
    │     Calculate new day + time from drop position
    │     Snap to 5-minute grid
    │     PATCH /sessions/:id → update date + start_time
    └── End time adjusts to maintain duration
```

#### View Modes
```
Day:   Single column for today, full height
Week:  7 columns (Sun-Sat), standard view
Month: Simple grid overview with event chips
```

### Calendar Grid Rendering:
```
Grid: 7 columns (Sun-Sat) × 13 rows (8AM-9PM)
Hour height: 60px (1px = 1 minute)
Snap: 5 minutes (5px) — 5-minute granularity
Min session duration: 5 minutes (5px)

Block positioning:
    top = ((start_minutes - 480) / 60) × 60px
    height = ((end_minutes - start_minutes) / 60) × 60px
    left = day_column_index × column_width
```

### Recurring vs. One-time:
```
Schedule (recurring):
    class_id + day_of_week + start_time + end_time
    │
    └── Generates Sessions each week:
          For each active week in term:
            Create Session with:
              date = next occurrence of day_of_week
              start_time = schedule.start_time
              end_time = schedule.end_time
              teacher_id = class.teacher_id
              classroom_id = schedule.classroom_id

Custom Session (one-time):
    Created directly via drag-to-create on Calendar page
    schedule_id = null
    All fields specified manually via CreateSessionModal
```

### Subject Palette (Extensible)
```
Subjects are NOT hardcoded strings. They are an extensible palette:

1. Default subjects seeded from Class records:
   Each unique class.subject value becomes a palette card
   Color comes from class.color

2. Custom subjects added via AddSubjectModal:
   name + color → stored in Subject entity
   Appears in sidebar palette for drag-to-create

3. Subject entity (optional, for persistence):
   id, academy_id, name, color, created_at
   If not persisted, palette is derived from Class records + session subjects

Benefits:
   - Visual consistency (same color for same subject across calendar)
   - Drag-to-create is fast (one drag + drop)
   - New subjects can be added without touching class definitions
   - Color wheel picker allows custom branding per subject
```

---

## 11. Activity Log & Audit Trail

### What gets logged:

| Action | Entity | Log Type | Example Text |
|---|---|---|---|
| Student check-in | SessionStudent | checkin | "Student check-in — Yasmine B." |
| Student check-out | SessionStudent | checkin | "Student check-out — Anes K." |
| Payment received | StudentBilling | payment | "Payment received — Karim M." |
| New student enrolled | Student | student | "New student enrolled — Sofia L." |
| Payment overdue | StudentBilling | alert | "Payment overdue — Sarah A." |
| Session scheduled | Session | session | "New session scheduled — Math" |
| Student removed | Student | alert | "Student profile removed — Amine F." |
| Attendance confirmed | Session | checkin | "Attendance confirmed — Math session" |

### Attribution:
Every ActivityLog entry carries `user_id` — the staff member who performed the action. This is the core accountability feature: since staff must enter their PIN before any action, the log proves who did what.

### Retention:
- Activity logs are kept for the lifetime of the academy
- Old logs can be exported as CSV from Settings → Data & Export
- Logs are ordered by created_at descending (newest first)
- UI shows last 30 entries, with "load more" pagination

---

## 12. Settings & Configuration

### Settings Hierarchy:
```
Academy (root)
  ├── AcademySettings (singleton)
  │     ├── Display: theme, font_size, language
  │     ├── Billing: currency, plan defaults, alerts, WhatsApp template
  │     └── Automations: auto_checkout, end_class_popup
  │
  ├── Subscription (singleton)
  │     ├── tier: starter | pro | scaler
  │     └── Feature gating
  │
  └── Users (collection)
        └── Per-user: name, email, phone, PIN, role
```

### Role-based Access:

| Section | Owner | Staff |
|---|---|---|
| Appearance | ✅ | ✅ |
| My Account | ✅ | ✅ |
| Academy Profile | ✅ | ❌ (hidden) |
| Staff & Roles | ✅ | ❌ (hidden) |
| Billing Configuration | ✅ | ❌ (hidden) |
| Automations | ✅ (Scaler only) | ❌ (hidden) |
| Data & Export | ✅ | ✅ |
| Subscription | ✅ | ❌ (hidden) |
| Danger Zone | ✅ | ❌ (hidden) |

---

## 13. Notification System

### Trigger Events:

| Event | Type | Recipients | When |
|---|---|---|---|
| Payment due in 3 days | payment_reminder | Staff | billing_reminder_days_before before due_date |
| Payment due today | payment_reminder | Staff | On due_date |
| Payment overdue | overdue_alert | Staff, Owner | When due_date passes without payment |
| Class ending in 10 min | class_ending | Current staff | 10 minutes before session.end_time |
| Enrollment request | enrollment_request | Staff | When a parent messages about joining |
| New enrollment | general | Staff | When a student is added |

### Toast Behavior:
- Toasts appear at bottom-right of the screen
- Click to expand: shows detail text and action buttons
- Action buttons trigger specific workflows (e.g., "Open session" navigates to the session)
- Auto-dismiss after user interacts or manually closes
- Bell icon shows unread count (red dot)

---

## 14. Data Export & Reporting

### Exportable Datasets:

| Dataset | Source | Format | Columns |
|---|---|---|---|
| Student roster | Student + Guardian + Enrollment | CSV | Name, Phone, Parent, Classes, Status, Plan |
| Billing history | StudentBilling + PaymentLog | CSV | Student, Status, Amount, Paid, Date, Days Overdue |
| Teacher hours | TeacherHoursLog + Session | CSV | Teacher, Session, Date, Hours, Subject |
| Chart data | Various (computed) | CSV | Month, Metric1, Metric2, ... |
| Finance breakdown | StudentBilling or TeacherPayroll | CSV | Name, Status, Amount, Days Overdue |

### Chart Properties (Revenue & Activity):

| Property | Data Source | Unit |
|---|---|---|
| Total income | StudentBilling.amount_da WHERE status=paid, grouped by month | DA |
| Paid vs. overdue | Parallel series from StudentBilling | DA |
| New enrollments vs. cancellations | Enrollment.created_at vs Enrollment.status=withdrawn | Count |
| Teacher hours logged | TeacherHoursLog.hours, grouped by month | Hours |
| Students per teacher ratio | count(Students) / count(Teachers) | Ratio |
| Average revenue per student | Total income / student count | DA |
| Overdue accounts over time | Count of StudentBilling WHERE status=overdue | Count |
| Income by subject | StudentBilling joined through SessionStudent → Session → Class.subject | DA |

---

## 15. Cross-Tab Relationship Matrix

This matrix shows which entities are accessed or modified by each tab:

| Entity | Dashboard | Students | Teachers | Classes | Calendar | Billing | Settings |
|---|---|---|---|---|---|---|---|
| Academy | — | — | — | — | — | — | R/W |
| User | R | — | — | — | — | — | R/W |
| Student | R | R/W | — | — | — | R | — |
| Guardian | — | R/W | — | — | — | — | — |
| Teacher | R | — | R/W | R | — | R | — |
| Classroom | R | — | — | R | R | — | — |
| Class | R | R | R | R/W | R | — | — |
| Enrollment | — | R/W | — | R/W | — | R | — |
| Schedule | R | R | R | R/W | R/W | — | — |
| Session | R/W | R | R | R | R/W | — | — |
| SessionStudent | R/W | R | — | — | R | — | — |
| PaymentPlan | — | R | — | — | — | R | R |
| StudentBilling | — | R | — | — | — | R/W | — |
| PaymentLog | — | — | — | — | — | R/W | — |
| TeacherPayroll | — | — | R | — | — | R/W | — |
| TeacherHoursLog | — | — | R/W | — | — | R | — |
| ActivityLog | R/W | R/W | R/W | R/W | R/W | R/W | — |
| AcademySettings | — | — | — | — | — | — | R/W |
| Subscription | — | — | — | — | — | — | R |
| Notification | R/W | — | — | — | — | — | — |

**R** = Read, **W** = Write/Create/Update/Delete, **R/W** = both

---

## Appendix A: Data Initialization Defaults

When a new academy is created, the following default data is seeded:

| Entity | Default |
|---|---|
| AcademySettings | currency=DZD, plan_duration=30, language=fr, theme=light, auto_checkout=true, end_popup=true |
| Subscription | tier=starter, status=active, invoicing=manual |
| PaymentPlan | Monthly — 3,500 DA (30 days) |
| PaymentPlan | Monthly — 3,000 DA (30 days) |
| PaymentPlan | Term — 9,000 DA (90 days) |
| PaymentPlan | Term — 8,000 DA (90 days) |

No students, teachers, classes, or sessions are pre-created — the academy starts empty.

---

## Appendix B: Currency & Locale

- **Currency:** Algerian Dinar (DZD / DA)
- **Phone format:** +213 followed by carrier code and number
- **Weekend:** Friday (day 5)
- **Week start:** Sunday (day 0)
- **Term structure:** Academic terms (Fall, Spring, Summer)
- **Languages:** French (default), Arabic
- **Time format:** 24-hour (08:00–21:00)

---

*Document version: 1.1 — August 2026*
*Source: Vinta School OS mockups and design notes*

---

## P.S. — Profile Creation & Academy Setup Flow

> **Only the owner can create profiles.** Profile creation is gated behind owner authentication (PIN verification).

### First-Time Academy Setup

When a new academy is created via signup, the flow is:

```
1. User signs up with academy name, email, password
2. System creates Academy record → authScene = 'profiles'
3. ProfilePicker shows empty state: "Welcome to Vinta School OS"
4. User clicks "Create your first profile"
5. CreateProfileModal opens with lockedRole = 'owner' (role toggle hidden)
6. Owner fills in: name, profile picture, PIN (required)
7. On submit → Owner enters dashboard via success screen
8. Owner is the ONLY profile — no staff profiles exist yet
```

### Creating Additional Profiles (From Settings)

After the initial owner setup, new profiles are created from the **Settings** panel:

```
1. Owner opens Settings flyout → "Manage profiles"
2. Clicks "Add profile" → CreateProfileModal opens (role toggle visible)
3. Owner enters their OWN PIN to authorize profile creation
4. Fills in: name, picture, role (owner/staff), phone, PIN (4-digit)
5. Staff PIN is used for action attribution in the system
6. Owner PIN is used for login authentication
```

### Key Rules

| Rule | Detail |
|---|---|
| Owner PIN | Required — used to log in to the owner account |
| Staff PIN | Required — used to attribute actions (check-ins, payments, etc.) |
| Profile creation | Owner-only — requires owner PIN to authorize |
| First profile | Always owner — role is locked during academy setup |
| Profile picture | Optional — preset color avatars or custom image upload |
| Max profiles | Determined by subscription tier (Starter: 3, Pro: 10, Scale: unlimited) |

### Auth Flow Summary

```
Academy Signup → Profile Picker (empty) → Create Owner Profile (PIN) → Success → Dashboard
                                                                              ↓
Staff Login → Profile Picker → Select Profile → Enter PIN → Dashboard
Owner Login → Profile Picker → Select Profile → Enter PIN → Dashboard
Settings → Add Profile → Enter Owner PIN → Create Profile → Done
```
