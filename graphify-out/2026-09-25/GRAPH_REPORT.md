# Graph Report - vinta-os-app-essembled-main  (2026-09-25)

## Corpus Check
- 255 files · ~209,998 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 5, .ini 2, .db 1)

## Summary
- 2516 nodes · 6299 edges · 124 communities (89 shown, 35 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 378 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8bec1894`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- extensions.py
- jwt_required
- react
- billing_service.py
- Session
- schemas/students.py
- schemas/attendance.py
- schemas/billing.py
- .hash_pin
- ClassesPage.tsx
- tenant_required
- vinta-school-os/package.json
- billing.ts
- WeekView.tsx
- AcademySettings
- Student
- ClassQuickCreate.tsx
- BillingPage.tsx
- StudentBilling
- User
- sessionLifecycle.ts
- SchedulingModal.tsx
- SessionMenu.tsx
- BillingConfig.tsx
- schemas/settings.py
- routes/settings.py
- SettingsPage.tsx
- SessionCheckInModal.tsx
- routes/auth.py
- schemas/notifications.py
- env.py
- schemas/teachers.py
- TestCheckOutFlow
- TestSessionCRUD
- compilerOptions
- test_cron_jobs.py
- Academy Root Entity
- constants.ts
- routes/classes.py
- routes/teachers.py
- schemas/classes.py
- CalendarPage.tsx
- StudentDrawer.tsx
- SessionDetail.tsx
- config.py
- Luxury School OS Concept
- formatters.ts
- cleanup_expired
- academy_rules.py
- ClassDetail.tsx
- ActivityLog.tsx
- register_error_handlers
- router.tsx
- Session
- compilerOptions
- days_overdue
- class.ts
- add_lifecycle_columns.py
- PinStep.tsx
- TimePicker.tsx
- TestPaymentPlans
- formatters.py
- StudentAttendanceCalendar.tsx
- create_app
- .hash_password
- test_cancel_session.py
- overdue_bucket
- payroll_service.py
- cn
- test_payroll_calc.py
- ClassCardMenu.tsx
- schemas/calendar.py
- TeacherPayroll
- get_class_sessions
- get_log_count
- TestBillingStatusDerivation
- today
- Avatar.tsx
- SessionWindowModal.tsx
- C-01 Hardcoded Fallback JWT Secret Vulnerability
- DashboardPage
- TestCheckInFlow
- check_overdue_billings
- .oxlintrc.json
- GlobalSearch.tsx
- ErrorBoundary
- BillingSummaryCard.tsx
- get_activity_logs
- renew_billing_cycles
- tsconfig.json
- routes/__init__.py
- schemas/__init__.py
- tasks/__init__.py
- utils/__init__.py
- tests/__init__.py
- integration/__init__.py
- unit/__init__.py
- Graphify Knowledge Graph Rules
- rawval
- snapshot
- deps/package.json
- Analytics & Reports Blueprint (/api/analytics)
- Settings Blueprint (/api/settings)
- Teacher Revenue Split Model
- C-02 SocketIO Wildcard CORS Vulnerability
- C-05 Missing Token Revocation Mechanism
- C-06 Unauthenticated Owner Creation Risk
- T3 Hamburger Menu Instance Overrides
- T4 Auto-Link Guest Swap Mechanism
- T6 Free Session Payout Zero Logic
- T7 Void & Compensate Cancellation Freeze
- T8 Scheduling Window (Weekly vs Temporary)
- Vinta School OS App Icon
- Vite Tooling Asset
- student.ts
- fixture
- Notification
- themeStore.ts
- marshmallow
- Test Verification Fixture (acad.txt)
- Test Verification Fixture (academy_id.txt)
- Test Verification Fixture (class_id.txt)
- Test Verification Fixture (student_id.txt)
- Test Verification Fixture (tok.txt)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 180 edges
2. `tenant_required()` - 112 edges
3. `react` - 81 edges
4. `Session` - 69 edges
5. `lucide-react` - 69 edges
6. `User` - 57 edges
7. `Class` - 53 edges
8. `Student` - 47 edges
9. `api` - 41 edges
10. `useAuthStore` - 41 edges

## Surprising Connections (you probably didn't know these)
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_audit_fk.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `credits_of()` --uses--> `StudentSubscription`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/billing.py
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_start.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `Login Screen Hero Artwork` --conceptually_related_to--> `Glassmorphic Design Tokens (--gold / --emerald)`  [INFERRED]
  vinta-school-os/src/assets/hero.png → Docs/Notes.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Tenant Core Architecture & Domain Boundaries** — docs_documentation_tenant_isolation_model, docs_documentation_entity_academy, backend_api_architecture_overview, docs_documentation_billing_architecture [EXTRACTED 1.00]
- **Session Lifecycle & Attendance Grid Flow** — docs_documentation_entity_scheduled_session, docs_documentation_attendance_workflow, vinta_tasks_t1_session_lifecycle_lock, vinta_tasks_t2_false_until_true_attendance [INFERRED 0.85]

## Communities (124 total, 35 thin omitted)

### Community 0 - "extensions.py"
Cohesion: 0.06
Nodes (60): Vinta School OS — Extension Initialization Centralized extension instances for…, Vinta School OS — Application Factory Creates and configures the Flask…, Vinta School OS — Academy & Tenant Models Academy (tenant root),…, Vinta School OS — Attendance Model SessionStudent: tracks check-in/out per…, Vinta School OS — Activity Log & Audit Trail Model Every significant action is…, Vinta School OS — Billing Models PaymentPlan, StudentBilling, PaymentLog…, Vinta School OS — Classroom, Class & Subject Models Classroom (physical room),…, Vinta School OS — Model Exports Centralized imports for Flask-Migrate and… (+52 more)

### Community 1 - "jwt_required"
Cohesion: 0.13
Nodes (22): add_guardian(), bulk_enroll_students(), create_student(), delete_student(), enroll_student(), get_stats(), get_student(), list_guardians() (+14 more)

### Community 2 - "react"
Cohesion: 0.10
Nodes (33): lucide-react, react, Badge, BadgeProps, SemanticVariant, sizeStyles, variantAliases, variantStyles (+25 more)

### Community 3 - "billing_service.py"
Cohesion: 0.06
Nodes (46): Student purchase of a Class offer (credit-based or time-based). Table name is…, StudentSubscription, Enrollment, Many-to-many: Student ↔ Class through Enrollment., _compute_teacher_cut(), create_multi_payment(), create_subscription(), create_subscription_for_payment() (+38 more)

### Community 4 - "Session"
Cohesion: 0.05
Nodes (70): Many-to-many: Session ↔ Student. Tracks attendance (is_present, check-in/out…, SessionStudent, ActivityLog, Audit trail. Every significant action in the system is logged with user_id —…, A concrete class session on a specific date. Generated from Schedule or created…, Session, The academy's settings row, or None if it has never been created., settings_for() (+62 more)

### Community 5 - "schemas/students.py"
Cohesion: 0.11
Nodes (25): AddGuardianRequestSchema, CreateStudentRequestSchema, CreateStudentResponseSchema, EnrollmentSchema, EnrollResponseSchema, EnrollStudentRequestSchema, GuardianSchema, Schema (+17 more)

### Community 6 - "schemas/attendance.py"
Cohesion: 0.10
Nodes (27): AddToSessionRequestSchema, AddToSessionResponseSchema, AutoCheckoutRequestSchema, AutoCheckoutResponseSchema, CheckInRequestSchema, CheckInResponseSchema, CheckOutRequestSchema, CheckOutResponseSchema (+19 more)

### Community 7 - "schemas/billing.py"
Cohesion: 0.06
Nodes (51): AgingBucketsResponseSchema, BillingStatsResponseSchema, CreatePlanRequestSchema, FinalizeSessionRequestSchema, FinalizeSessionResponseSchema, MarkPayoutPaidRequestSchema, PaymentPlanListResponseSchema, PaymentPlanSchema (+43 more)

### Community 8 - ".hash_pin"
Cohesion: 0.13
Nodes (12): Hash a 4-digit PIN using bcrypt., unit, Test PIN hashing and verification., Test role-based access helpers., is_owner should return True for owner role., is_owner should return False for staff role., PIN hash should be a string., Correct PIN should verify successfully. (+4 more)

### Community 9 - "ClassesPage.tsx"
Cohesion: 0.05
Nodes (52): ClassesPage, TeachersPage, DayPicker(), DayPickerProps, sizeStyles, todayISO(), toISO(), WEEKDAYS (+44 more)

### Community 10 - "tenant_required"
Cohesion: 0.06
Nodes (59): add_to_session(), auto_checkout(), check_in(), check_out(), complete_session(), get_roster(), guest_check_in(), jwt_required (+51 more)

### Community 11 - "vinta-school-os/package.json"
Cohesion: 0.04
Nodes (44): axios, clsx, oxlint, ref_path, recharts, tailwind-merge, tailwindcss, @tailwindcss/vite (+36 more)

### Community 12 - "billing.ts"
Cohesion: 0.09
Nodes (23): PaymentHistoryListProps, UseStudentBillingResult, AgingBucket, BillingRingData, BillingState, BillingStats, CreatePaymentPlanRequest, GroupCharge (+15 more)

### Community 13 - "WeekView.tsx"
Cohesion: 0.20
Nodes (23): DayView(), decimalToTime(), snapHour(), toCalendarSession(), yToTime(), hexToRgba(), SessionBlock(), SessionBlockProps (+15 more)

### Community 14 - "AcademySettings"
Cohesion: 0.07
Nodes (45): AcademySettings, Per-academy configuration singleton., add_staff(), _coerce_bool(), deactivate_staff(), delete_staff(), get_academy(), get_activity_log() (+37 more)

### Community 15 - "Student"
Cohesion: 0.07
Nodes (46): A child enrolled in the academy., Student, _calendar_status(), _covers_date(), _covers_today(), create_student(), _cycle_end_date(), delete_student() (+38 more)

### Community 16 - "ClassQuickCreate.tsx"
Cohesion: 0.19
Nodes (16): buildClassPayload(), CLASS_COLOR_PRESETS, ClassBillingFields(), classCancelBtnCls, ClassFormValues, classInputCls, classLabelCls, classSubmitBtnCls (+8 more)

### Community 17 - "BillingPage.tsx"
Cohesion: 0.10
Nodes (25): BillingPage(), BillingTab, TABS, DonutCards(), AgingBucket, AgingEntry, BUCKET_COLORS, FinanceBreakdown() (+17 more)

### Community 18 - "StudentBilling"
Cohesion: 0.05
Nodes (45): PaymentLog, PayoutRecord, Immutable revenue fact per conducted session allocation (DZD integers)., Teacher payout computed from gross revenue per conducted session., One record per billing cycle per student. Core billing entity., Individual payment transactions against a billing record., RevenueEntry, StudentBilling (+37 more)

### Community 19 - "User"
Cohesion: 0.04
Nodes (50): Academy, Academy SaaS subscription tier., Top-level tenant entity. One academy = one private school/academy., Subscription, PaymentPlan, Reusable billing plans that can be assigned to students., Every person who logs into the system. Owner or Staff., Verify a PIN against the stored hash. (+42 more)

### Community 20 - "sessionLifecycle.ts"
Cohesion: 0.20
Nodes (18): SessionActions(), canFinish(), canStart(), canStartSession(), getLifecycleRecord(), getScheduledDateTime(), getScheduledEnd(), getScheduledStart() (+10 more)

### Community 21 - "SchedulingModal.tsx"
Cohesion: 0.09
Nodes (36): errMsg(), GroupOption, inputCls, Mode, primaryBtnCls, RoomOption, SchedulingModal(), SchedulingModalProps (+28 more)

### Community 22 - "SessionMenu.tsx"
Cohesion: 0.07
Nodes (34): FinalizeSessionModal(), StatCard, SessionActionsProps, dangerBtnCls, inputCls, LogEntry, MenuItem(), ModalKind (+26 more)

### Community 23 - "BillingConfig.tsx"
Cohesion: 0.15
Nodes (18): BillingConfig(), BillingPreset, CURRENCY_OPTIONS, DEFAULT_PRESETS, inputCls, loadPresets(), REMINDER_PRESETS, RULE_ROWS (+10 more)

### Community 24 - "schemas/settings.py"
Cohesion: 0.08
Nodes (34): AcademyResponseSchema, AddStaffRequestSchema, AddStaffResponseSchema, AppearanceResponseSchema, AutomationsResponseSchema, BillingConfigResponseSchema, ProfileResponseSchema, Schema (+26 more)

### Community 25 - "routes/settings.py"
Cohesion: 0.07
Nodes (47): Vinta School OS — Analytics Blueprint /api/analytics — Dashboard stats, Revenue…, Vinta School OS — Attendance Blueprint /api/attendance — Check-in/out, PIN…, Vinta School OS — Billing Blueprint /api/billing — Payment Plans, Cycles,…, add_student_to_session(), cancel_session(), create_session(), _duration_label(), end_session() (+39 more)

### Community 26 - "SettingsPage.tsx"
Cohesion: 0.06
Nodes (31): NotificationBell(), relativeTime(), styleFor(), TYPE_STYLE, AcademyProfileProps, AddStaffModal(), AddStaffModalProps, inputCls (+23 more)

### Community 27 - "SessionCheckInModal.tsx"
Cohesion: 0.09
Nodes (45): MultiPayModal(), BILLING_MODEL_STYLE, STATUS_STYLE, SubscriptionsPanel(), SubscriptionsPanelProps, RosterEntry, SessionCheckInModal(), STATUS_CONFIG (+37 more)

### Community 28 - "routes/auth.py"
Cohesion: 0.06
Nodes (61): arguments, change_pin(), create_owner(), create_profile(), get_current_user(), get_profiles(), login(), logout() (+53 more)

### Community 29 - "schemas/notifications.py"
Cohesion: 0.23
Nodes (11): CreateNotificationRequestSchema, CreateNotificationResponseSchema, NotificationListResponseSchema, NotificationSchema, Schema, Notification schemas — Toast alerts, Broadcasts., POST /api/notifications, GET /api/notifications response. (+3 more)

### Community 30 - "env.py"
Cohesion: 0.09
Nodes (20): alembic, apscheduler_schedulers_background, init_scheduler(), Vinta School OS — APScheduler Setup Initializes and manages the background task…, Initialize APScheduler with all configured cron jobs. Called during application…, Gracefully shut down the scheduler., shutdown_scheduler(), get_engine() (+12 more)

### Community 31 - "schemas/teachers.py"
Cohesion: 0.14
Nodes (19): CreateTeacherRequestSchema, CreateTeacherResponseSchema, PayrollSummarySchema, Schema, Teacher schemas — CRUD, Contracts, Payroll., POST /api/teachers response., PUT /api/teachers/<id>, Single teacher in list. (+11 more)

### Community 32 - "TestCheckOutFlow"
Cohesion: 0.10
Nodes (14): integration, Test session roster operations., New session should have empty roster., Should be able to add a student to a session roster., Adding the same student twice should return existing record., Test auto-checkout trigger., Auto-checkout should check out all present students., Test student check-out from session. (+6 more)

### Community 33 - "TestSessionCRUD"
Cohesion: 0.07
Nodes (17): integration, Should update session date via PATCH., Moved session times should snap to 5-minute grid., Should cancel a session via DELETE., Test recurring schedule → session generation., Test session create/read/update/delete via API., Creating a schedule should auto-generate sessions for 12 weeks., Should create a new session with valid data. (+9 more)

### Community 34 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, forceConsistentCasingInFileNames, ignoreDeprecations, isolatedModules (+18 more)

### Community 35 - "test_cron_jobs.py"
Cohesion: 0.19
Nodes (17): auto_checkout_expired_sessions(), Check all in-progress sessions whose end_time has passed and auto check-out any…, _make_session(), Vinta School OS — the end-of-class cron sweep. Regression cover for two bugs…, A class that has not ended yet is left alone., A ``scheduled`` class that nobody started is the desk's to cancel. The old…, A finished class is not re-processed., A session on a given day, in a given lifecycle state. (+9 more)

### Community 36 - "Academy Root Entity"
Cohesion: 0.09
Nodes (25): Attendance Blueprint (/api/attendance), Billing & Subscriptions Blueprint (/api/billing), Calendar & Sessions Blueprint (/api/sessions), Classes & Groups Blueprint (/api/classes), Students Blueprint (/api/students), Teachers Blueprint (/api/teachers), Session Attendance & Check-in/out Flow, Student Tuition & Credit/Time Billing Architecture (+17 more)

### Community 37 - "constants.ts"
Cohesion: 0.08
Nodes (23): ACTIVITY_TYPES, AVATAR_PRESETS, AvatarPreset, BREAKPOINTS, CALENDAR_HOURS, CHART_COLORS, DEFAULT_SESSION_DURATION, ENTITY_FILTER_PAGES (+15 more)

### Community 38 - "routes/classes.py"
Cohesion: 0.06
Nodes (69): Class, A subject offering (e.g., 'Math — CM2'). Enrollment target for students., Recurring weekly slot defining when a class meets., Schedule, _apply_group_fields(), create_class(), create_classroom(), create_schedule() (+61 more)

### Community 39 - "routes/teachers.py"
Cohesion: 0.13
Nodes (26): An instructor employed by the academy., Teacher, _clean_email(), _clean_status(), create_teacher(), delete_teacher(), _email_taken(), get_stats() (+18 more)

### Community 40 - "schemas/classes.py"
Cohesion: 0.12
Nodes (24): ClassListResponseSchema, ClassListSchema, ClassroomListResponseSchema, ClassroomSchema, CreateClassRequestSchema, CreateClassResponseSchema, CreateClassroomRequestSchema, CreateScheduleRequestSchema (+16 more)

### Community 41 - "CalendarPage.tsx"
Cohesion: 0.15
Nodes (23): CalendarPage(), hourLabel(), SessionWindowModal(), layoutDay(), SlotLayout, Span, spanOf(), notifySessionsChanged() (+15 more)

### Community 42 - "StudentDrawer.tsx"
Cohesion: 0.11
Nodes (21): StudentsPage, MultiPayModalProps, BillingSummaryCardProps, StudentIdentityProps, useStudentBilling(), useStudentProfile(), UseStudentProfileResult, ENROLLMENT_LABELS (+13 more)

### Community 43 - "SessionDetail.tsx"
Cohesion: 0.14
Nodes (21): AgendaBoard(), hexToRgba(), resolveOverlaps(), InfoChipProps, RosterStudent, SessionDetail, STATUS_BADGE_CLASSES, StudentRow() (+13 more)

### Community 44 - "config.py"
Cohesion: 0.19
Nodes (12): BaseConfig, DevelopmentConfig, ProductionConfig, Vinta School OS — Configuration Environments Dev, Test, and Production…, Shared configuration across all environments., Development environment configuration., Test environment configuration., Production environment configuration. (+4 more)

### Community 45 - "Luxury School OS Concept"
Cohesion: 0.11
Nodes (19): Flask REST API Architecture, Auth Blueprint (/api/auth), Two-Stage Auth & Profile PIN Verification Flow, Docker Compose Local Environment, Flask & SQLAlchemy Dependencies, PIN-Attributed Activity Log & Audit Trail, Algerian Private Academy Target Market, Glassmorphic Design Tokens (--gold / --emerald) (+11 more)

### Community 46 - "formatters.ts"
Cohesion: 0.19
Nodes (13): ProfileCreator(), STUDENT_STATUS_LABELS, safePhone(), StudentIdentity(), STATUS_LABELS, statusLabel(), StudentTable(), TeacherTable() (+5 more)

### Community 48 - "academy_rules.py"
Cohesion: 0.17
Nodes (15): absence_consumes_credit(), count_gap_sessions(), early_payment_on_extra_sessions(), free_session_auto_present(), Vinta School OS — Academy Rules Per-academy policy, read at the moment a…, Read one boolean rule, falling back to its documented default., Toggle 1 — does a missed session still spend a credit? True (default): an…, Toggle 2 — are sessions missed during a payment gap charged later? True:… (+7 more)

### Community 49 - "ClassDetail.tsx"
Cohesion: 0.08
Nodes (39): RFC-5322, ClassCardMenuProps, ClassBillingStat(), fetchBilling(), ClassDetail(), ClassDetailProps, COLOR_PRESETS, DAY_LABELS (+31 more)

### Community 50 - "ActivityLog.tsx"
Cohesion: 0.18
Nodes (10): ActivityLog, ActivityLogEntry, ActivityLogProps, ActivityRow(), ActivityRowProps, ICON_MAP, ICON_STYLE, relativeTime() (+2 more)

### Community 52 - "router.tsx"
Cohesion: 0.07
Nodes (37): react-router-dom, AppShell(), AuthGuard(), AuthScreen, BillingPage, CalendarPage, DashboardPage, ProfileCreator (+29 more)

### Community 53 - "Session"
Cohesion: 0.12
Nodes (18): DayViewProps, FinalizeSessionModalProps, SessionCheckInModalProps, SubjectPaletteProps, WeekViewProps, AgendaBoardProps, PositionedSession, SessionDetailProps (+10 more)

### Community 54 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 55 - "days_overdue"
Cohesion: 0.24
Nodes (7): days_overdue(), Calculate how many days overdue a due date is. 0 if not overdue., Should return 0 for future due dates., Should return 0 when due date is today., Test days overdue calculation., Should return positive number for past due dates., TestDaysOverdue

### Community 56 - "class.ts"
Cohesion: 0.13
Nodes (14): AttendanceStatus, CheckInRequest, ClassBillingInfo, Classroom, ClassState, ClassStats, CreateClassRequest, CreateClassroomRequest (+6 more)

### Community 57 - "add_lifecycle_columns.py"
Cohesion: 0.16
Nodes (11): main(), Additive migration — billing relations, session lifecycle, billing toggles.…, Resolve the SQLite file the app actually opens, from DATABASE_URL., resolve_db_path(), One-shot database fix — adds any missing columns to existing tables. Run once:…, main(), Schema step — activity_logs.user_id becomes nullable. WHY The audit trail has…, Resolve the SQLite file the app actually opens, from DATABASE_URL. (+3 more)

### Community 58 - "PinStep.tsx"
Cohesion: 0.26
Nodes (8): PINInput, PINInputProps, PinStep(), PinStepProps, PIN_LENGTH, PIN_GATE_FALLBACK, PinError, verifyStaffPin()

### Community 59 - "TimePicker.tsx"
Cohesion: 0.31
Nodes (8): Column(), formatLabel(), HOURS, minutesFor(), parse(), sizeStyles, TimePicker(), TimePickerProps

### Community 60 - "TestPaymentPlans"
Cohesion: 0.29
Nodes (5): unit, Test payment plan creation and properties., Payment plans should store correct values., Term plans should have 90-day duration., TestPaymentPlans

### Community 61 - "formatters.py"
Cohesion: 0.13
Nodes (14): format_dzd(), format_phone(), now_utc(), parse_dzd(), Vinta School OS — Formatters & Helpers Phone (+213), Currency (DZD), Date/Time…, Normalize an Algerian phone number to +213XXXXXXXXX format. Accepts:…, Validate an Algerian phone number format., Format amount in Algerian Dinars with comma separators. (+6 more)

### Community 62 - "StudentAttendanceCalendar.tsx"
Cohesion: 0.21
Nodes (12): dominantState(), formatTime(), monthCells(), STATE_PRIORITY, STATE_STYLES, StateStyle, StudentAttendanceCalendar(), StudentAttendanceCalendarProps (+4 more)

### Community 63 - "create_app"
Cohesion: 0.14
Nodes (14): create_app(), check_if_token_revoked(), Application factory pattern., Register shell context objects., Register all API blueprints., _register_blueprints(), _register_shell_context(), make_shell_context() (+6 more)

### Community 64 - ".hash_password"
Cohesion: 0.12
Nodes (12): Hash a password using bcrypt., Set a new password hash (owner only)., create_owner_profile(), Create the initial owner profile for a newly provisioned academy. Called after…, owner(), Create the owner profile for the test academy., Wrong password should fail., Staff without password_hash should return False. (+4 more)

### Community 65 - "test_cancel_session.py"
Cohesion: 0.16
Nodes (21): cancel_session(), Cancel a session, recording *why*. The reason is not decoration:…, Vinta School OS — cancelling a session. ``cancel_session`` is reached from…, CANCEL_REASONS is a plain Python tuple; the column is a native enum that knows…, An unrecognised reason is a label problem, not a reason to lose the cancel., A bare DELETE still cancels; it just does not claim to know why., Tenant scoping — the lookup is by id AND academy., A class that has not run can be called off; a class that is running can be… (+13 more)

### Community 66 - "overdue_bucket"
Cohesion: 0.20
Nodes (9): get_aging_buckets(), Classify overdue billings into aging buckets., overdue_bucket(), Classify overdue days into aging buckets: 1-7d → 'recent', 8-30d → 'aging',…, Test aging bucket classification., 1-7 days overdue should be classified as 'recent'., 8-30 days overdue should be classified as 'aging'., 30+ days overdue should be classified as 'critical'. (+1 more)

### Community 67 - "payroll_service.py"
Cohesion: 0.12
Nodes (17): mark_payout_paid(), Mark a payout record as PAID (owner-only, PIN verified at route layer)., calculate_payout_for_session(), get_teacher_payout_dashboard(), get_teacher_summary(), list_payouts(), log_teacher_hours(), mark_paid() (+9 more)

### Community 68 - "cn"
Cohesion: 0.07
Nodes (32): react-dom, PageContainer(), PageContainerProps, CardFooter, ConfirmDialog, Drawer, DrawerProps, EmptyState() (+24 more)

### Community 69 - "test_payroll_calc.py"
Cohesion: 0.10
Nodes (20): Records when a teacher's hours are logged (per session)., TeacherHoursLog, export_chart_data(), export_teacher_hours(), Generate CSV for chart data based on chart type. Supports: income, enrollments,…, Generate CSV for teacher hours. Columns: Teacher, Session, Date, Hours, Subject, calculate_teacher_payroll(), generate_monthly_payroll() (+12 more)

### Community 70 - "ClassCardMenu.tsx"
Cohesion: 0.13
Nodes (21): ClassCardMenu(), EndClassModal(), FreeChip(), isRunning(), NoSessionTrigger(), RunningLight(), RunningLightState, serverMessage() (+13 more)

### Community 71 - "schemas/calendar.py"
Cohesion: 0.17
Nodes (15): CreateSessionRequestSchema, CreateSessionResponseSchema, DaySessionsResponseSchema, Schema, Calendar schemas — Session CRUD, Week/Day views, Drag-and-drop., PATCH /api/sessions/<id>, Single session in calendar view., GET /api/calendar/week response. (+7 more)

### Community 72 - "TeacherPayroll"
Cohesion: 0.22
Nodes (8): Monthly payroll record for each teacher., TeacherPayroll, list_teacher_payrolls(), List payroll records for a teacher or all teachers in an academy., Settling a payroll should set paid_date and status., Test payroll status transitions., New payroll records should start as 'pending'., TestPayrollStatus

### Community 73 - "get_class_sessions"
Cohesion: 0.28
Nodes (9): get_class_sessions(), get_day_sessions(), get_week_sessions(), date, Serialize a session to a dict for API response. The lifecycle fields are part…, Get all sessions for a given week., Get all sessions for a specific day., Get one group's sessions, soonest first. A group's page needs its own sessions… (+1 more)

### Community 75 - "TestBillingStatusDerivation"
Cohesion: 0.25
Nodes (5): Test billing status derivation logic., Status should be 'paid' when paid_date is set and paid_amount >= amount_da., Status should be 'due' when due_date is in the future., Status should transition to 'overdue' when due_date has passed., TestBillingStatusDerivation

### Community 76 - "today"
Cohesion: 0.28
Nodes (9): days_until(), month_date_range(), next_occurrence(), date, Get the first and last day of the current month., Return the next date that falls on the given day_of_week (0=Sunday)., Get today's date in the server timezone., Calculate days until a target date. Negative if past. (+1 more)

### Community 77 - "Avatar.tsx"
Cohesion: 0.33
Nodes (8): Avatar, AvatarProps, getGradientForName(), getInitials(), gradientPairs, hashCode(), sizeConfig, squircleRadius()

### Community 78 - "SessionWindowModal.tsx"
Cohesion: 0.29
Nodes (7): errMsg(), GroupOption, inputCls, RoomOption, SessionWindowModalProps, TeacherOption, CreatedGroup

### Community 80 - "DashboardPage"
Cohesion: 0.25
Nodes (6): DashboardPage(), load(), loadStats(), getWeekRange(), isToday(), canOpenAttendance()

### Community 81 - "TestCheckInFlow"
Cohesion: 0.33
Nodes (4): Test student check-in to session., Staff should be able to check in a student to a session., Check-in should create an activity log entry., TestCheckInFlow

### Community 82 - "check_overdue_billings"
Cohesion: 0.50
Nodes (4): check_overdue_billings(), Check for billings that are past due_date and mark them as overdue. Returns…, check_overdue_payments(), Check all academies for billings past their due_date. Marks them as 'overdue'…

### Community 83 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 84 - "GlobalSearch.tsx"
Cohesion: 0.13
Nodes (18): AppShell(), classMatches(), classRow(), GlobalSearch(), Row, ROW_STYLE, SECTION_ORDER, STUDENT_STATUS_LABEL (+10 more)

### Community 86 - "BillingSummaryCard.tsx"
Cohesion: 0.18
Nodes (23): BillingCalendarCard(), BillingCalendarCardProps, CYCLE_STATUS_LABELS, statusDot(), BillingSummaryCard(), DASH, formatDateRange(), formatDisplayDate() (+15 more)

### Community 87 - "get_activity_logs"
Cohesion: 0.50
Nodes (4): get_activity_logs(), _map_log_type(), Get activity logs for an academy, newest first. UI shows last 30 entries with…, Map entity_type + action to UI log type for icon/color styling: - payment →…

### Community 88 - "renew_billing_cycles"
Cohesion: 0.50
Nodes (4): Create new billing records for students whose cycles have ended. Returns count…, renew_billing_cycles(), Create new billing records for students whose cycles have ended. Runs daily at…, renew_billing_cycles()

### Community 117 - "student.ts"
Cohesion: 0.16
Nodes (14): EmptyLine(), StudentClasses(), StudentClassesProps, GuardianRow, safePhone(), StudentGuardians(), StudentGuardiansProps, AttendanceCalendar (+6 more)

### Community 118 - "fixture"
Cohesion: 0.12
Nodes (16): auth_headers_owner(), auth_headers_staff(), classroom(), client(), payment_plans(), Create a staff profile for the test academy., Create default payment plans for the test academy., Create a test teacher. (+8 more)

### Community 119 - "Notification"
Cohesion: 0.18
Nodes (16): Notification, In-app toast notification / alert., create_notification(), get_unread_count(), list_notifications(), mark_all_read(), mark_read(), jwt_required (+8 more)

### Community 121 - "themeStore.ts"
Cohesion: 0.08
Nodes (29): App(), Providers(), ProvidersProps, TOAST_COLORS, TOAST_ICONS, ToastContainer(), AppRouter(), Toast (+21 more)

### Community 124 - "marshmallow"
Cohesion: 0.29
Nodes (7): DashboardResponseSchema, Schema, Analytics schemas — Dashboard stats, Revenue chart, CSV export., GET /api/analytics/revenue-chart response., GET /api/analytics/dashboard response., RevenueChartResponseSchema, marshmallow

## Knowledge Gaps
- **384 isolated node(s):** `type`, `Meta`, `$schema`, `plugins`, `react/rules-of-hooks` (+379 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1137 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tenant_required()` connect `tenant_required` to `jwt_required`, `routes/classes.py`, `routes/teachers.py`, `AcademySettings`, `StudentBilling`, `User`, `Notification`, `routes/settings.py`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Session` connect `Session` to `extensions.py`, `test_cancel_session.py`, `TestSessionCRUD`, `billing_service.py`, `payroll_service.py`, `test_payroll_calc.py`, `routes/classes.py`, `routes/teachers.py`, `test_cron_jobs.py`, `get_class_sessions`, `tenant_required`, `AcademySettings`, `Student`, `StudentBilling`, `fixture`, `routes/settings.py`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `react`, `ClassesPage.tsx`, `WeekView.tsx`, `ClassQuickCreate.tsx`, `BillingPage.tsx`, `sessionLifecycle.ts`, `SchedulingModal.tsx`, `SessionMenu.tsx`, `BillingConfig.tsx`, `SettingsPage.tsx`, `SessionCheckInModal.tsx`, `CalendarPage.tsx`, `StudentDrawer.tsx`, `SessionDetail.tsx`, `formatters.ts`, `ClassDetail.tsx`, `ActivityLog.tsx`, `router.tsx`, `PinStep.tsx`, `TimePicker.tsx`, `StudentAttendanceCalendar.tsx`, `ClassCardMenu.tsx`, `Avatar.tsx`, `SessionWindowModal.tsx`, `GlobalSearch.tsx`, `BillingSummaryCard.tsx`, `student.ts`, `themeStore.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `tenant_required()` (e.g. with `Academy` and `User`) actually correct?**
  _`tenant_required()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `Session` (e.g. with `get_dashboard()` and `get_roster()`) actually correct?**
  _`Session` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `Meta`, `$schema` to the rest of the system?**
  _384 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extensions.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06005538248528903 - nodes in this community are weakly interconnected._