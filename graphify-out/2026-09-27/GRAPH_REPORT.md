# Graph Report - vinta-os-1.6  (2026-09-27)

## Corpus Check
- 256 files · ~213,905 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 5, .ini 2, .db 1)

## Summary
- 2535 nodes · 6357 edges · 120 communities (91 shown, 29 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 385 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0287abcf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- extensions.py
- cn.ts
- api.ts
- routes/teachers.py
- schemas/students.py
- schemas/billing.py
- MultiPayModal.tsx
- schemas/attendance.py
- tenant_required
- ClassCardMenu.tsx
- Student
- Session
- User
- TeacherDrawer.tsx
- ActivityLog
- uiStore.ts
- routes/notifications.py
- SessionDetail.tsx
- billing_service.py
- schemas/settings.py
- routes/settings.py
- SchedulingModal.tsx
- ClassesPage.tsx
- DashboardPage.tsx
- datetime
- StudentBilling
- BillingConfig.tsx
- SessionCheckInModal.tsx
- rate_limiter.py
- AddStudentModal.tsx
- env.py
- routes/auth.py
- AcademySettings
- ActivityLog.tsx
- TestCheckInFlow
- TestSessionCRUD
- Academy Root Entity
- constants.ts
- compilerOptions
- formatters.py
- student.ts
- routes/classes.py
- schemas/classes.py
- billing.ts
- create_owner
- Luxury School OS Concept
- test_session_start_and_close.py
- test_cancel_session.py
- schemas/teachers.py
- formatters.ts
- ClassQuickCreate.tsx
- StudentGuardians.tsx
- test_cron_jobs.py
- settings.ts
- Session
- SessionMenu.tsx
- compilerOptions
- add_lifecycle_columns.py
- routes/attendance.py
- vinta-school-os/package.json
- schemas/calendar.py
- academy_rules.py
- calculate_teacher_payroll
- config.py
- BillingSummaryCard.tsx
- class.ts
- signup
- auth_service.py
- conftest.py
- create_app
- StudentAttendanceCalendar.tsx
- session_lifecycle_service.py
- cron_jobs.py
- cn
- 9c2ab41f7d03_money_model.py
- StudentDrawer.tsx
- audit_service.py
- register_error_handlers
- overdue_bucket
- C-01 Hardcoded Fallback JWT Secret Vulnerability
- today
- Avatar.tsx
- marshmallow
- arranged
- PaymentHistoryList.tsx
- days_overdue
- TestBillingStatusDerivation
- TestPaymentPlans
- .oxlintrc.json
- ErrorBoundary
- Graphify Knowledge Graph Rules
- _session_duration_hours
- tsconfig.json
- routes/__init__.py
- Analytics & Reports Blueprint (/api/analytics)
- Settings Blueprint (/api/settings)
- Teacher Revenue Split Model
- schemas/__init__.py
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
- tasks/__init__.py
- utils/__init__.py
- tests/__init__.py
- integration/__init__.py
- unit/__init__.py
- user.py
- deps/package.json
- Test Verification Fixture (acad.txt)
- Test Verification Fixture (academy_id.txt)
- Test Verification Fixture (class_id.txt)
- Test Verification Fixture (student_id.txt)
- Test Verification Fixture (tok.txt)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 180 edges
2. `tenant_required()` - 112 edges
3. `react` - 81 edges
4. `Session` - 70 edges
5. `lucide-react` - 69 edges
6. `User` - 63 edges
7. `Class` - 53 edges
8. `Student` - 47 edges
9. `api` - 41 edges
10. `useAuthStore` - 41 edges

## Surprising Connections (you probably didn't know these)
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_audit_fk.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `dbval()` --uses--> `AcademySettings`  [INFERRED]
  .tmp-relprobe/probe_billing_rules.py → Backend/vinta-academy-backend/app/models/academy.py
- `credits_of()` --uses--> `StudentSubscription`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/billing.py
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_start.py → Backend/vinta-academy-backend/app/models/scheduling.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Tenant Core Architecture & Domain Boundaries** — docs_documentation_tenant_isolation_model, docs_documentation_entity_academy, backend_api_architecture_overview, docs_documentation_billing_architecture [EXTRACTED 1.00]
- **Session Lifecycle & Attendance Grid Flow** — docs_documentation_entity_scheduled_session, docs_documentation_attendance_workflow, vinta_tasks_t1_session_lifecycle_lock, vinta_tasks_t2_false_until_true_attendance [INFERRED 0.85]

## Communities (120 total, 29 thin omitted)

### Community 0 - "extensions.py"
Cohesion: 0.12
Nodes (23): Vinta School OS — Extension Initialization Centralized extension instances for…, Vinta School OS — Application Factory Creates and configures the Flask…, Vinta School OS — Attendance Model SessionStudent: tracks check-in/out per…, Vinta School OS — Activity Log & Audit Trail Model Every significant action is…, Vinta School OS — Application Entry Point Launches the Flask application with…, Integration Tests — Attendance Flow Tests for check-in/out, PIN attribution,…, flask_cors, flask_migrate (+15 more)

### Community 1 - "cn.ts"
Cohesion: 0.07
Nodes (49): lucide-react, Badge, BadgeProps, SemanticVariant, sizeStyles, variantAliases, variantStyles, Button (+41 more)

### Community 2 - "api.ts"
Cohesion: 0.12
Nodes (19): PINModal(), PINModalProps, ApiError, ApiResponse, CREDENTIAL_CHECK_ENDPOINTS, SESSION_TOLERANT_401, tokenStorage, AuthState (+11 more)

### Community 3 - "routes/teachers.py"
Cohesion: 0.06
Nodes (52): Extensible palette entity for calendar subject colors., Subject, Junction table for teacher-subject many-to-many relationship., Monthly payroll record for each teacher., An instructor employed by the academy., Records when a teacher's hours are logged (per session)., Teacher, TeacherHoursLog (+44 more)

### Community 4 - "schemas/students.py"
Cohesion: 0.11
Nodes (25): AddGuardianRequestSchema, CreateStudentRequestSchema, CreateStudentResponseSchema, EnrollmentSchema, EnrollResponseSchema, EnrollStudentRequestSchema, GuardianSchema, Schema (+17 more)

### Community 5 - "schemas/billing.py"
Cohesion: 0.06
Nodes (51): AgingBucketsResponseSchema, BillingStatsResponseSchema, CreatePlanRequestSchema, FinalizeSessionRequestSchema, FinalizeSessionResponseSchema, MarkPayoutPaidRequestSchema, PaymentPlanListResponseSchema, PaymentPlanSchema (+43 more)

### Community 6 - "MultiPayModal.tsx"
Cohesion: 0.10
Nodes (25): maxWidthMap, Modal, ModalProps, AgingBucket, AgingEntry, BUCKET_COLORS, FinanceBreakdown(), FinanceBreakdownProps (+17 more)

### Community 7 - "schemas/attendance.py"
Cohesion: 0.10
Nodes (27): AddToSessionRequestSchema, AddToSessionResponseSchema, AutoCheckoutRequestSchema, AutoCheckoutResponseSchema, CheckInRequestSchema, CheckInResponseSchema, CheckOutRequestSchema, CheckOutResponseSchema (+19 more)

### Community 8 - "tenant_required"
Cohesion: 0.09
Nodes (48): check_overdue(), create_plan(), finalize_session(), get_aging_buckets(), get_revenue(), get_revenue_chart(), get_stats(), list_payouts() (+40 more)

### Community 9 - "ClassCardMenu.tsx"
Cohesion: 0.09
Nodes (40): ClassCardMenu(), EndClassModal(), FreeChip(), isRunning(), NoSessionTrigger(), RunningLight(), RunningLightState, serverMessage() (+32 more)

### Community 10 - "Student"
Cohesion: 0.05
Nodes (73): Guardian, A child enrolled in the academy., Student guardian / emergency contact. One student can have multiple guardians., Student, add_guardian(), bulk_enroll_students(), create_student(), delete_student() (+65 more)

### Community 11 - "Session"
Cohesion: 0.06
Nodes (55): Recurring weekly slot defining when a class meets., A concrete class session on a specific date. Generated from Schedule or created…, Schedule, Session, add_student_to_session(), cancel_session(), create_session(), _duration_label() (+47 more)

### Community 12 - "User"
Cohesion: 0.07
Nodes (31): Every person who logs into the system. Owner or Staff., Hash a 4-digit PIN using bcrypt., Verify a PIN against the stored hash., Hash a password using bcrypt., Verify a password against the stored hash., Set a new password hash (owner only)., User, create_owner_profile() (+23 more)

### Community 13 - "TeacherDrawer.tsx"
Cohesion: 0.06
Nodes (40): RFC-5322, TeachersPage, AddCourseGroupModal(), AddTeacherModal(), AddTeacherModalProps, COMMISSION_PLACEHOLDER, COMMISSION_SUFFIX, COMMISSION_TYPES (+32 more)

### Community 14 - "ActivityLog"
Cohesion: 0.12
Nodes (21): Many-to-many: Session ↔ Student. Tracks attendance (is_present, check-in/out…, SessionStudent, ActivityLog, Audit trail. Every significant action in the system is logged with user_id —…, add_student_to_session(), auto_checkout_session(), check_in_student(), check_out_student() (+13 more)

### Community 15 - "uiStore.ts"
Cohesion: 0.05
Nodes (49): react-router-dom, App(), Providers(), ProvidersProps, TOAST_COLORS, TOAST_ICONS, ToastContainer(), AppRouter() (+41 more)

### Community 16 - "routes/notifications.py"
Cohesion: 0.12
Nodes (26): Notification, In-app toast notification / alert., create_notification(), get_unread_count(), list_notifications(), mark_all_read(), mark_read(), jwt_required (+18 more)

### Community 17 - "SessionDetail.tsx"
Cohesion: 0.14
Nodes (17): InfoChipProps, RosterStudent, SessionDetail, STATUS_BADGE_CLASSES, StudentRow(), StudentRowProps, SubscriptionChip(), FreeNextModal() (+9 more)

### Community 18 - "billing_service.py"
Cohesion: 0.04
Nodes (66): PayoutRecord, Student purchase of a Class offer (credit-based or time-based). Table name is…, Immutable revenue fact per conducted session allocation (DZD integers)., Teacher payout computed from gross revenue per conducted session., RevenueEntry, StudentSubscription, Class, A subject offering (e.g., 'Math — CM2'). Enrollment target for students. (+58 more)

### Community 19 - "schemas/settings.py"
Cohesion: 0.08
Nodes (34): AcademyResponseSchema, AddStaffRequestSchema, AddStaffResponseSchema, AppearanceResponseSchema, AutomationsResponseSchema, BillingConfigResponseSchema, ProfileResponseSchema, Schema (+26 more)

### Community 20 - "routes/settings.py"
Cohesion: 0.08
Nodes (49): PaymentLog, Individual payment transactions against a billing record., add_staff(), _coerce_bool(), deactivate_staff(), delete_staff(), get_academy(), get_activity_log() (+41 more)

### Community 21 - "SchedulingModal.tsx"
Cohesion: 0.10
Nodes (34): errMsg(), GroupOption, inputCls, Mode, primaryBtnCls, RoomOption, SchedulingModal(), SchedulingModalProps (+26 more)

### Community 22 - "ClassesPage.tsx"
Cohesion: 0.06
Nodes (45): DayPicker(), DayPickerProps, sizeStyles, todayISO(), toISO(), WEEKDAYS, Select, SelectAction (+37 more)

### Community 23 - "DashboardPage.tsx"
Cohesion: 0.10
Nodes (34): CalendarPage(), hourLabel(), errMsg(), GroupOption, RoomOption, SessionWindowModal(), TeacherOption, calendarRequest() (+26 more)

### Community 24 - "datetime"
Cohesion: 0.10
Nodes (27): Vinta School OS — Academy & Tenant Models Academy (tenant root),…, Vinta School OS — Billing Models PaymentPlan, StudentBilling, PaymentLog…, Vinta School OS — Classroom, Class & Subject Models Classroom (physical room),…, Vinta School OS — Model Exports Centralized imports for Flask-Migrate and…, Vinta School OS — Notification Model In-app toast notifications and alerts., Vinta School OS — Scheduling Models Schedule (recurring weekly slot), Session…, Vinta School OS — Student Models Student, Guardian (1:N), Enrollment (M:N with…, Vinta School OS — Teacher Models Teacher, TeacherPayroll, TeacherHoursLog. (+19 more)

### Community 25 - "StudentBilling"
Cohesion: 0.10
Nodes (29): One record per billing cycle per student. Core billing entity., StudentBilling, export_data(), get_dashboard(), jwt_required, route, Vinta School OS — Analytics Blueprint /api/analytics — Dashboard stats, Revenue…, Export data as CSV. Supported datasets: students, billing, teacher_hours,… (+21 more)

### Community 26 - "BillingConfig.tsx"
Cohesion: 0.11
Nodes (27): AppearanceProps, BillingConfig(), BillingConfigProps, BillingPreset, CURRENCY_OPTIONS, DEFAULT_PRESETS, inputCls, loadPresets() (+19 more)

### Community 27 - "SessionCheckInModal.tsx"
Cohesion: 0.13
Nodes (31): RosterEntry, SessionCheckInModal(), STATUS_CONFIG, StudentSearchResult, getAbsenceConsumesCredit(), getBillingRule(), getUnpaidDebt(), isFreeSessionAutoPresent() (+23 more)

### Community 28 - "rate_limiter.py"
Cohesion: 0.50
Nodes (3): Rate limiting configuration for authentication endpoints., flask_limiter, flask_limiter_util

### Community 29 - "AddStudentModal.tsx"
Cohesion: 0.29
Nodes (4): AddStudentModal(), AddStudentModalProps, ClassOption, inputClass

### Community 30 - "env.py"
Cohesion: 0.29
Nodes (8): get_engine(), get_engine_url(), get_metadata(), Run migrations in 'offline' mode. This configures the context with just a URL…, Run migrations in 'online' mode. In this scenario we need to create an Engine…, run_migrations_offline(), run_migrations_online(), logging_config

### Community 31 - "routes/auth.py"
Cohesion: 0.12
Nodes (28): Vinta School OS — Auth Blueprint /api/auth — Login, Profile Selection, PIN…, ChangePinRequestSchema, CreateOwnerRequestSchema, CreateOwnerResponseSchema, CreateProfileRequestSchema, LoginRequestSchema, MeResponseSchema, Meta (+20 more)

### Community 32 - "AcademySettings"
Cohesion: 0.06
Nodes (31): Academy, AcademySettings, Academy SaaS subscription tier., Top-level tenant entity. One academy = one private school/academy., Per-academy configuration singleton., Subscription, create_academy(), get_academy_profiles() (+23 more)

### Community 33 - "ActivityLog.tsx"
Cohesion: 0.18
Nodes (10): ActivityLog, ActivityLogEntry, ActivityLogProps, ActivityRow(), ActivityRowProps, ICON_MAP, ICON_STYLE, relativeTime() (+2 more)

### Community 34 - "TestCheckInFlow"
Cohesion: 0.08
Nodes (18): integration, Test session roster operations., New session should have empty roster., Should be able to add a student to a session roster., Adding the same student twice should return existing record., Test auto-checkout trigger., Test student check-in to session., Auto-checkout should check out all present students. (+10 more)

### Community 35 - "TestSessionCRUD"
Cohesion: 0.07
Nodes (17): integration, Should update session date via PATCH., Moved session times should snap to 5-minute grid., Should cancel a session via DELETE., Test recurring schedule → session generation., Test session create/read/update/delete via API., Creating a schedule should auto-generate sessions for 12 weeks., Should create a new session with valid data. (+9 more)

### Community 36 - "Academy Root Entity"
Cohesion: 0.09
Nodes (25): Attendance Blueprint (/api/attendance), Billing & Subscriptions Blueprint (/api/billing), Calendar & Sessions Blueprint (/api/sessions), Classes & Groups Blueprint (/api/classes), Students Blueprint (/api/students), Teachers Blueprint (/api/teachers), Session Attendance & Check-in/out Flow, Student Tuition & Credit/Time Billing Architecture (+17 more)

### Community 37 - "constants.ts"
Cohesion: 0.06
Nodes (42): ACADEMY_ID_KEY, ACTIVITY_TYPES, API_BASE_URL, AvatarPreset, BREAKPOINTS, CHART_COLORS, DEFAULT_SESSION_DURATION, ENTITY_FILTER_PAGES (+34 more)

### Community 38 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, forceConsistentCasingInFileNames, ignoreDeprecations, isolatedModules (+18 more)

### Community 39 - "formatters.py"
Cohesion: 0.14
Nodes (13): format_dzd(), format_phone(), now_utc(), parse_dzd(), Vinta School OS — Formatters & Helpers Phone (+213), Currency (DZD), Date/Time…, Normalize an Algerian phone number to +213XXXXXXXXX format. Accepts:…, Validate an Algerian phone number format., Format amount in Algerian Dinars with comma separators. (+5 more)

### Community 40 - "student.ts"
Cohesion: 0.12
Nodes (19): StudentsPage, MultiPayModalProps, BillingSummaryCardProps, StudentIdentityProps, UseStudentProfileResult, StudentDrawerProps, activePillClass(), FilterKey (+11 more)

### Community 41 - "routes/classes.py"
Cohesion: 0.08
Nodes (47): Classroom, A physical room in the academy., _apply_group_fields(), create_class(), create_classroom(), create_subject(), delete_class(), delete_classroom() (+39 more)

### Community 42 - "schemas/classes.py"
Cohesion: 0.12
Nodes (24): ClassListResponseSchema, ClassListSchema, ClassroomListResponseSchema, ClassroomSchema, CreateClassRequestSchema, CreateClassResponseSchema, CreateClassroomRequestSchema, CreateScheduleRequestSchema (+16 more)

### Community 43 - "billing.ts"
Cohesion: 0.10
Nodes (20): AgingBucket, BillingRingData, BillingState, BillingStats, CreatePaymentPlanRequest, GroupCharge, MultiPayReceipt, MultiPayRequest (+12 more)

### Community 44 - "create_owner"
Cohesion: 0.17
Nodes (24): arguments, change_pin(), create_owner(), create_profile(), get_current_user(), get_profiles(), login(), logout() (+16 more)

### Community 45 - "Luxury School OS Concept"
Cohesion: 0.11
Nodes (19): Flask REST API Architecture, Auth Blueprint (/api/auth), Two-Stage Auth & Profile PIN Verification Flow, Docker Compose Local Environment, Flask & SQLAlchemy Dependencies, PIN-Attributed Activity Log & Audit Trail, Algerian Private Academy Target Market, Glassmorphic Design Tokens (--gold / --emerald) (+11 more)

### Community 46 - "test_session_start_and_close.py"
Cohesion: 0.14
Nodes (23): close_past_temporary_sessions(), Close out one-off classes whose day passed without ever being started.…, close_past_temporary_sessions(), Close out one-off classes whose day passed without ever being started. The rule…, Vinta School OS — starting a class, and closing out one that never ran. Two…, The guard must not break double-clicks or the repair path. A class already…, A one-off class whose day passed unstarted is over, and must stop being counted…, Cancelled, never conducted — the money decision. ``conducted`` is what the… (+15 more)

### Community 47 - "test_cancel_session.py"
Cohesion: 0.16
Nodes (21): cancel_session(), Cancel a session, recording *why*. The reason is not decoration:…, Vinta School OS — cancelling a session. ``cancel_session`` is reached from…, CANCEL_REASONS is a plain Python tuple; the column is a native enum that knows…, An unrecognised reason is a label problem, not a reason to lose the cancel., A bare DELETE still cancels; it just does not claim to know why., Tenant scoping — the lookup is by id AND academy., A class that has not run can be called off; a class that is running can be… (+13 more)

### Community 48 - "schemas/teachers.py"
Cohesion: 0.14
Nodes (19): CreateTeacherRequestSchema, CreateTeacherResponseSchema, PayrollSummarySchema, Schema, Teacher schemas — CRUD, Contracts, Payroll., POST /api/teachers response., PUT /api/teachers/<id>, Single teacher in list. (+11 more)

### Community 49 - "formatters.ts"
Cohesion: 0.13
Nodes (15): ProfilePicker, ProfilePicker(), STATUS_LABELS, statusLabel(), StudentTable(), StudentTableProps, commissionBadgeLabel(), commissionRateLabel() (+7 more)

### Community 50 - "ClassQuickCreate.tsx"
Cohesion: 0.19
Nodes (16): buildClassPayload(), CLASS_COLOR_PRESETS, ClassBillingFields(), classCancelBtnCls, ClassFormValues, classInputCls, classLabelCls, classSubmitBtnCls (+8 more)

### Community 51 - "StudentGuardians.tsx"
Cohesion: 0.21
Nodes (12): EmptyLine(), ProfileCard(), ProfileCardProps, StudentClasses(), StudentClassesProps, GuardianRow, safePhone(), StudentGuardians() (+4 more)

### Community 52 - "test_cron_jobs.py"
Cohesion: 0.19
Nodes (17): auto_checkout_expired_sessions(), Check all in-progress sessions whose end_time has passed and auto check-out any…, _make_session(), Vinta School OS — the end-of-class cron sweep. Regression cover for two bugs…, A class that has not ended yet is left alone., A ``scheduled`` class that nobody started is the desk's to cancel. The old…, A finished class is not re-processed., A session on a given day, in a given lifecycle state. (+9 more)

### Community 53 - "settings.ts"
Cohesion: 0.18
Nodes (10): NotificationBell(), relativeTime(), styleFor(), TYPE_STYLE, AddStaffRequest, Notification, SettingsState, Subscription (+2 more)

### Community 54 - "Session"
Cohesion: 0.09
Nodes (50): DayView(), DayViewProps, decimalToTime(), snapHour(), toCalendarSession(), yToTime(), FinalizeSessionModalProps, hexToRgba() (+42 more)

### Community 55 - "SessionMenu.tsx"
Cohesion: 0.09
Nodes (26): BillingPage(), PayoutDashboard(), SessionActionsProps, CompensatoryModal(), dangerBtnCls, DangerConfirmModal(), EditSessionModal(), FinancesModal() (+18 more)

### Community 56 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 57 - "add_lifecycle_columns.py"
Cohesion: 0.16
Nodes (11): main(), Additive migration — billing relations, session lifecycle, billing toggles.…, Resolve the SQLite file the app actually opens, from DATABASE_URL., resolve_db_path(), One-shot database fix — adds any missing columns to existing tables. Run once:…, main(), Schema step — activity_logs.user_id becomes nullable. WHY The audit trail has…, Resolve the SQLite file the app actually opens, from DATABASE_URL. (+3 more)

### Community 58 - "routes/attendance.py"
Cohesion: 0.11
Nodes (27): add_to_session(), auto_checkout(), check_in(), check_out(), complete_session(), get_roster(), guest_check_in(), jwt_required (+19 more)

### Community 59 - "vinta-school-os/package.json"
Cohesion: 0.04
Nodes (44): axios, clsx, oxlint, ref_path, recharts, tailwind-merge, tailwindcss, @tailwindcss/vite (+36 more)

### Community 60 - "schemas/calendar.py"
Cohesion: 0.17
Nodes (15): CreateSessionRequestSchema, CreateSessionResponseSchema, DaySessionsResponseSchema, Schema, Calendar schemas — Session CRUD, Week/Day views, Drag-and-drop., PATCH /api/sessions/<id>, Single session in calendar view., GET /api/calendar/week response. (+7 more)

### Community 61 - "academy_rules.py"
Cohesion: 0.16
Nodes (17): absence_consumes_credit(), count_gap_sessions(), early_payment_on_extra_sessions(), free_session_auto_present(), Vinta School OS — Academy Rules Per-academy policy, read at the moment a…, The academy's settings row, or None if it has never been created., Read one boolean rule, falling back to its documented default., Toggle 1 — does a missed session still spend a credit? True (default): an… (+9 more)

### Community 62 - "calculate_teacher_payroll"
Cohesion: 0.11
Nodes (15): calculate_teacher_payroll(), date, Calculate payroll for a teacher for a given period. Hourly: total_hours ×…, unit, Settling a payroll should set paid_date and status., Test hourly contract payroll calculations., Hourly payroll = total_hours × hourly_rate., Payroll with zero hours should return 0 amount. (+7 more)

### Community 63 - "config.py"
Cohesion: 0.19
Nodes (12): BaseConfig, DevelopmentConfig, ProductionConfig, Vinta School OS — Configuration Environments Dev, Test, and Production…, Shared configuration across all environments., Development environment configuration., Test environment configuration., Production environment configuration. (+4 more)

### Community 64 - "BillingSummaryCard.tsx"
Cohesion: 0.22
Nodes (16): BillingCalendarCard(), BillingCalendarCardProps, CYCLE_STATUS_LABELS, statusDot(), BillingSummaryCard(), DASH, knownText(), parseISODate() (+8 more)

### Community 65 - "class.ts"
Cohesion: 0.09
Nodes (29): ClassCardMenuProps, ClassDetailProps, ClassCard(), ClassCardProps, ClassGrid(), ClassGridProps, resolveColor(), SkeletonCard() (+21 more)

### Community 66 - "signup"
Cohesion: 0.29
Nodes (7): Canonical form of an email address, for storage and for lookup. Login resolves…, Create a new academy (tenant provisioning) Creates a new academy with default…, signup(), authenticate_owner(), owner_email_taken(), True if an active owner already logs in with this address. The login request…, Authenticate an owner with email + password. Returns tokens dict on success,…

### Community 67 - "auth_service.py"
Cohesion: 0.17
Nodes (11): authenticate_profile(), change_password(), change_pin(), get_current_user(), Vinta School OS — Auth Service Hashing, JWT tokens, PIN validation, owner…, Verify a PIN for a specific user., Change a user's PIN. Returns True on success., Change an owner's password. Returns True on success. (+3 more)

### Community 68 - "conftest.py"
Cohesion: 0.11
Nodes (24): PaymentPlan, Reusable billing plans that can be assigned to students., app(), auth_headers_owner(), auth_headers_staff(), class_obj(), classroom(), client() (+16 more)

### Community 69 - "create_app"
Cohesion: 0.12
Nodes (15): create_app(), check_if_token_revoked(), Application factory pattern., Register shell context objects., Register all API blueprints., _register_blueprints(), _register_shell_context(), make_shell_context() (+7 more)

### Community 70 - "StudentAttendanceCalendar.tsx"
Cohesion: 0.21
Nodes (12): dominantState(), formatTime(), monthCells(), STATE_PRIORITY, STATE_STYLES, StateStyle, StudentAttendanceCalendar(), StudentAttendanceCalendarProps (+4 more)

### Community 71 - "session_lifecycle_service.py"
Cohesion: 0.15
Nodes (17): end_session(), is_finished(), LifecycleError, _log(), materialize_roster(), Exception, Vinta School OS — Session Lifecycle Service "a class does not exist until it…, SCHEDULED -> IN_PROGRESS, and open the register. Returns ``(session,… (+9 more)

### Community 72 - "cron_jobs.py"
Cohesion: 0.13
Nodes (14): apscheduler_schedulers_background, check_overdue_payments(), check_upcoming_renewals(), Vinta School OS — Cron Jobs Automated check-outs, overdue status checks,…, Check all academies for billings past their due_date. Marks them as 'overdue'…, Create new billing records for students whose cycles have ended. Runs daily at…, Notify staff about upcoming billing renewals (due in 3 days)., renew_billing_cycles() (+6 more)

### Community 73 - "cn"
Cohesion: 0.05
Nodes (44): react, react-dom, PageContainer(), PageContainerProps, CardFooter, ConfirmDialog, ConfirmDialogProps, Drawer (+36 more)

### Community 74 - "9c2ab41f7d03_money_model.py"
Cohesion: 0.24
Nodes (5): alembic, _columns(), _has_table(), upgrade(), add_column()

### Community 75 - "StudentDrawer.tsx"
Cohesion: 0.25
Nodes (8): PaymentHistoryListProps, useStudentBilling(), UseStudentBillingResult, useStudentProfile(), ENROLLMENT_LABELS, Field(), StudentDrawer(), Subscription

### Community 76 - "audit_service.py"
Cohesion: 0.22
Nodes (9): get_activity_logs(), get_log_count(), log_action(), _map_log_type(), Vinta School OS — Audit Service Staff PIN attribution logger, activity log…, Get total activity log count for an academy., Create an attributed activity log entry. Every action is attributed to the…, Get activity logs for an academy, newest first. UI shows last 30 entries with… (+1 more)

### Community 77 - "register_error_handlers"
Cohesion: 0.17
Nodes (3): Vinta School OS — Standardized JSON Error Handlers Consistent error response…, Register global error handlers for the Flask application., register_error_handlers()

### Community 78 - "overdue_bucket"
Cohesion: 0.24
Nodes (7): overdue_bucket(), Classify overdue days into aging buckets: 1-7d → 'recent', 8-30d → 'aging',…, Test aging bucket classification., 1-7 days overdue should be classified as 'recent'., 8-30 days overdue should be classified as 'aging'., 30+ days overdue should be classified as 'critical'., TestAgingBuckets

### Community 80 - "today"
Cohesion: 0.28
Nodes (9): days_until(), month_date_range(), next_occurrence(), date, Get the first and last day of the current month., Return the next date that falls on the given day_of_week (0=Sunday)., Get today's date in the server timezone., Calculate days until a target date. Negative if past. (+1 more)

### Community 81 - "Avatar.tsx"
Cohesion: 0.33
Nodes (8): Avatar, AvatarProps, getGradientForName(), getInitials(), gradientPairs, hashCode(), sizeConfig, squircleRadius()

### Community 82 - "marshmallow"
Cohesion: 0.29
Nodes (7): DashboardResponseSchema, Schema, Analytics schemas — Dashboard stats, Revenue chart, CSV export., GET /api/analytics/revenue-chart response., GET /api/analytics/dashboard response., RevenueChartResponseSchema, marshmallow

### Community 83 - "arranged"
Cohesion: 0.33
Nodes (6): arranged(), emptied(), not_already_picked(), A group with nothing to teach: strip the copy's enrollments., Each arrangement needs its own group; `not in ()` is not valid SQL, so the…, Make the group's newest session live today, with or without company.

### Community 84 - "PaymentHistoryList.tsx"
Cohesion: 0.38
Nodes (9): formatDateRange(), formatDisplayDate(), humaniseStatus(), METHOD_LABELS, methodLabel(), parseTimestamp(), PaymentHistoryList(), purchaseShape() (+1 more)

### Community 85 - "days_overdue"
Cohesion: 0.24
Nodes (7): days_overdue(), Calculate how many days overdue a due date is. 0 if not overdue., Should return 0 for future due dates., Should return 0 when due date is today., Test days overdue calculation., Should return positive number for past due dates., TestDaysOverdue

### Community 86 - "TestBillingStatusDerivation"
Cohesion: 0.25
Nodes (5): Test billing status derivation logic., Status should be 'paid' when paid_date is set and paid_amount >= amount_da., Status should be 'due' when due_date is in the future., Status should transition to 'overdue' when due_date has passed., TestBillingStatusDerivation

### Community 88 - "TestPaymentPlans"
Cohesion: 0.29
Nodes (5): unit, Test payment plan creation and properties., Payment plans should store correct values., Term plans should have 90-day duration., TestPaymentPlans

### Community 91 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 92 - "ErrorBoundary"
Cohesion: 0.22
Nodes (3): ErrorBoundary, Props, State

### Community 100 - "_session_duration_hours"
Cohesion: 0.50
Nodes (4): Session length in hours from start/end times (min 1h fallback)., _session_duration_hours(), Calculate session duration in hours from time objects., session_duration_hours()

### Community 122 - "user.py"
Cohesion: 0.09
Nodes (16): Vinta School OS — User Model User (Owner/Staff) with PIN hashing, role…, Throwaway: exercise the new GET /api/classes states against a DB copy. The real…, report(), bcrypt, flask_jwt_extended, pathlib, shutil, Mint a browser session for the preview pane: academy id + an access token.… (+8 more)

## Knowledge Gaps
- **384 isolated node(s):** `type`, `Meta`, `$schema`, `plugins`, `react/rules-of-hooks` (+379 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1146 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tenant_required()` connect `tenant_required` to `AcademySettings`, `routes/teachers.py`, `routes/classes.py`, `Student`, `Session`, `User`, `routes/notifications.py`, `routes/settings.py`, `StudentBilling`, `routes/attendance.py`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Session` connect `Session` to `routes/teachers.py`, `conftest.py`, `TestSessionCRUD`, `session_lifecycle_service.py`, `cron_jobs.py`, `routes/classes.py`, `Student`, `ActivityLog`, `test_cancel_session.py`, `test_session_start_and_close.py`, `billing_service.py`, `routes/settings.py`, `test_cron_jobs.py`, `datetime`, `StudentBilling`, `routes/attendance.py`, `calculate_teacher_payroll`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `cn.ts`, `api.ts`, `MultiPayModal.tsx`, `ClassCardMenu.tsx`, `TeacherDrawer.tsx`, `uiStore.ts`, `SessionDetail.tsx`, `SchedulingModal.tsx`, `ClassesPage.tsx`, `DashboardPage.tsx`, `BillingConfig.tsx`, `SessionCheckInModal.tsx`, `AddStudentModal.tsx`, `ActivityLog.tsx`, `student.ts`, `formatters.ts`, `ClassQuickCreate.tsx`, `StudentGuardians.tsx`, `settings.ts`, `Session`, `SessionMenu.tsx`, `BillingSummaryCard.tsx`, `class.ts`, `StudentAttendanceCalendar.tsx`, `StudentDrawer.tsx`, `Avatar.tsx`, `PaymentHistoryList.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `tenant_required()` (e.g. with `Academy` and `User`) actually correct?**
  _`tenant_required()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `Session` (e.g. with `get_dashboard()` and `get_roster()`) actually correct?**
  _`Session` has 41 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `Meta`, `$schema` to the rest of the system?**
  _384 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extensions.py` be split into smaller, more focused modules?**
  _Cohesion score 0.11605937921727395 - nodes in this community are weakly interconnected._