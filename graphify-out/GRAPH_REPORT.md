# Graph Report - vinta-os-1.6  (2026-09-27)

## Corpus Check
- 254 files · ~215,466 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 5, .ini 2, .out 1)

## Summary
- 2566 nodes · 6385 edges · 121 communities (88 shown, 33 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 353 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0287abcf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- extensions.py
- cn
- routes/calendar.py
- routes/teachers.py
- routes/students.py
- schemas/billing.py
- BillingPage.tsx
- routes/attendance.py
- tenant_required
- ClassCardMenu.tsx
- student_service.py
- jwt_required
- User
- TeacherDrawer.tsx
- Session
- api.ts
- routes/notifications.py
- SessionMenu.tsx
- billing_service.py
- schemas/settings.py
- routes/settings.py
- SchedulingModal.tsx
- ClassesPage.tsx
- DashboardPage.tsx
- Class
- Student
- BillingConfig.tsx
- SessionCheckInModal.tsx
- rate_limiter.py
- uiStore.ts
- env.py
- routes/auth.py
- TestAuthentication
- ActivityLog.tsx
- TestCheckInFlow
- TestSessionCRUD
- Academy Root Entity
- constants.ts
- compilerOptions
- formatters.py
- jwt_required
- routes/classes.py
- schemas/classes.py
- academy_data_service.py
- create_owner
- Luxury School OS Concept
- test_session_start_and_close.py
- GlobalSearch.tsx
- schemas/teachers.py
- log_activity
- ClassQuickCreate.tsx
- _enrich_student
- Academy
- TestTenantIsolation
- formatters.ts
- TimePicker.tsx
- compilerOptions
- add_lifecycle_columns.py
- base.py
- vinta-school-os/package.json
- schemas/calendar.py
- academy_rules.py
- payroll_service.py
- config.py
- StudentDrawer.tsx
- class.ts
- create_academy
- auth_service.py
- fixture
- create_app
- .tmp-dangerprobe.py
- react-dom
- token_blacklist.py
- PinStep.tsx
- Guardian
- get_stats
- ActivityLog
- register_error_handlers
- test_billing_cycles.py
- C-01 Hardcoded Fallback JWT Secret Vulnerability
- today
- Avatar.tsx
- marshmallow
- _sqlite_enable_foreign_keys
- rawval
- days_overdue
- TestBillingStatusDerivation
- snapshot
- PaymentPlan
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
- .tmp-deleteone.py
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
4. `Session` - 72 edges
5. `lucide-react` - 69 edges
6. `User` - 65 edges
7. `Class` - 55 edges
8. `Student` - 48 edges
9. `api` - 41 edges
10. `useAuthStore` - 41 edges

## Surprising Connections (you probably didn't know these)
- `Login Screen Hero Artwork` --conceptually_related_to--> `Glassmorphic Design Tokens (--gold / --emerald)`  [INFERRED]
  vinta-school-os/src/assets/hero.png → Docs/Notes.md
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_audit_fk.py → Backend/vinta-academy-backend/app/models/scheduling.py
- `dbval()` --uses--> `AcademySettings`  [INFERRED]
  .tmp-relprobe/probe_billing_rules.py → Backend/vinta-academy-backend/app/models/academy.py
- `credits_of()` --uses--> `StudentSubscription`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/billing.py
- `make_session()` --uses--> `Session`  [INFERRED]
  .tmp-relprobe/probe_finalise.py → Backend/vinta-academy-backend/app/models/scheduling.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Tenant Core Architecture & Domain Boundaries** — docs_documentation_tenant_isolation_model, docs_documentation_entity_academy, backend_api_architecture_overview, docs_documentation_billing_architecture [EXTRACTED 1.00]
- **Session Lifecycle & Attendance Grid Flow** — docs_documentation_entity_scheduled_session, docs_documentation_attendance_workflow, vinta_tasks_t1_session_lifecycle_lock, vinta_tasks_t2_false_until_true_attendance [INFERRED 0.85]

## Communities (121 total, 33 thin omitted)

### Community 0 - "extensions.py"
Cohesion: 0.07
Nodes (52): Vinta School OS — Extension Initialization Centralized extension instances for…, Vinta School OS — Application Factory Creates and configures the Flask…, Vinta School OS — Academy & Tenant Models Academy (tenant root),…, Vinta School OS — Attendance Model SessionStudent: tracks check-in/out per…, Vinta School OS — Activity Log & Audit Trail Model Every significant action is…, Vinta School OS — Classroom, Class & Subject Models Classroom (physical room),…, Vinta School OS — Notification Model In-app toast notifications and alerts., Vinta School OS — Scheduling Models Schedule (recurring weekly slot), Session… (+44 more)

### Community 1 - "cn"
Cohesion: 0.06
Nodes (69): lucide-react, react, SettingsPage, PageContainer(), PageContainerProps, Button, ButtonProps, sizeStyles (+61 more)

### Community 2 - "routes/calendar.py"
Cohesion: 0.10
Nodes (23): _duration_label(), end_session(), Vinta School OS — Calendar Blueprint /api/calendar, /api/sessions — Week/Month…, Update a session. Body: { date?, start_time?, end_time?, is_free_session? } A…, How long the class runs, in the words the log should read. "1 h 45 min", not…, Finalise a class: IN_PROGRESS -> CONDUCTED, and close the register. This is the…, update_session(), create_session() (+15 more)

### Community 3 - "routes/teachers.py"
Cohesion: 0.09
Nodes (33): Junction table for teacher-subject many-to-many relationship., An instructor employed by the academy., Teacher, TeacherSubject, _clean_email(), _clean_status(), create_teacher(), delete_teacher() (+25 more)

### Community 4 - "routes/students.py"
Cohesion: 0.12
Nodes (27): Vinta School OS — Students Blueprint /api/students — CRUD, Guardians, Profile…, AddGuardianRequestSchema, CreateStudentRequestSchema, CreateStudentResponseSchema, EnrollmentSchema, EnrollResponseSchema, EnrollStudentRequestSchema, GuardianSchema (+19 more)

### Community 5 - "schemas/billing.py"
Cohesion: 0.06
Nodes (51): AgingBucketsResponseSchema, BillingStatsResponseSchema, CreatePlanRequestSchema, FinalizeSessionRequestSchema, FinalizeSessionResponseSchema, MarkPayoutPaidRequestSchema, PaymentPlanListResponseSchema, PaymentPlanSchema (+43 more)

### Community 6 - "BillingPage.tsx"
Cohesion: 0.04
Nodes (55): BillingPage, Badge, BadgeProps, SemanticVariant, sizeStyles, variantAliases, variantStyles, maxWidthMap (+47 more)

### Community 7 - "routes/attendance.py"
Cohesion: 0.06
Nodes (51): add_to_session(), auto_checkout(), check_in(), check_out(), complete_session(), get_roster(), guest_check_in(), jwt_required (+43 more)

### Community 8 - "tenant_required"
Cohesion: 0.08
Nodes (49): check_overdue(), create_plan(), finalize_session(), get_aging_buckets(), get_revenue(), get_revenue_chart(), get_stats(), list_payouts() (+41 more)

### Community 9 - "ClassCardMenu.tsx"
Cohesion: 0.09
Nodes (43): ClassCardMenu(), EndClassModal(), FreeChip(), isRunning(), NoSessionTrigger(), RunningLight(), RunningLightState, serverMessage() (+35 more)

### Community 10 - "student_service.py"
Cohesion: 0.11
Nodes (28): _covers_date(), _covers_today(), _cycle_end_date(), delete_student(), _derive_status(), _get_attendance_calendar(), _get_primary_subscription(), _paid_on() (+20 more)

### Community 11 - "jwt_required"
Cohesion: 0.10
Nodes (27): add_student_to_session(), cancel_session(), create_session(), get_day(), get_session_roster(), get_week(), list_sessions(), jwt_required (+19 more)

### Community 12 - "User"
Cohesion: 0.06
Nodes (33): Every person who logs into the system. Owner or Staff., Hash a 4-digit PIN using bcrypt., Verify a PIN against the stored hash., Hash a password using bcrypt., Verify a password against the stored hash., Set a new password hash (owner only)., User, create_owner_profile() (+25 more)

### Community 13 - "TeacherDrawer.tsx"
Cohesion: 0.11
Nodes (26): BillingPage(), ClassBillingStat(), fetchBilling(), FinancesModal(), LogModal(), commissionBadgeLabel(), commissionRateLabel(), DAYS (+18 more)

### Community 14 - "Session"
Cohesion: 0.10
Nodes (29): Many-to-many: Session ↔ Student. Tracks attendance (is_present, check-in/out…, SessionStudent, A concrete class session on a specific date. Generated from Schedule or created…, Session, add_student_to_session(), auto_checkout_session(), get_session_roster(), get_session_roster_with_badges() (+21 more)

### Community 15 - "api.ts"
Cohesion: 0.06
Nodes (47): react-router-dom, AppShell(), AuthGuard(), AuthScreen, CalendarPage, DashboardPage, ProfileCreator, ProfileGuard() (+39 more)

### Community 16 - "routes/notifications.py"
Cohesion: 0.12
Nodes (26): Notification, In-app toast notification / alert., create_notification(), get_unread_count(), list_notifications(), mark_all_read(), mark_read(), jwt_required (+18 more)

### Community 17 - "SessionMenu.tsx"
Cohesion: 0.10
Nodes (24): InfoChipProps, RosterStudent, SessionDetail, STATUS_BADGE_CLASSES, StudentRow(), StudentRowProps, SubscriptionChip(), dangerBtnCls (+16 more)

### Community 18 - "billing_service.py"
Cohesion: 0.07
Nodes (37): PaymentLog, PayoutRecord, Vinta School OS — Billing Models PaymentPlan, StudentBilling, PaymentLog…, Student purchase of a Class offer (credit-based or time-based). Table name is…, Immutable revenue fact per conducted session allocation (DZD integers)., Teacher payout computed from gross revenue per conducted session., Individual payment transactions against a billing record., RevenueEntry (+29 more)

### Community 19 - "schemas/settings.py"
Cohesion: 0.08
Nodes (34): AcademyResponseSchema, AddStaffRequestSchema, AddStaffResponseSchema, AppearanceResponseSchema, AutomationsResponseSchema, BillingConfigResponseSchema, ProfileResponseSchema, Schema (+26 more)

### Community 20 - "routes/settings.py"
Cohesion: 0.07
Nodes (56): AcademySettings, Academy SaaS subscription tier., Per-academy configuration singleton., Subscription, add_staff(), _coerce_bool(), deactivate_staff(), delete_staff() (+48 more)

### Community 21 - "SchedulingModal.tsx"
Cohesion: 0.09
Nodes (37): errMsg(), GroupOption, inputCls, Mode, primaryBtnCls, RoomOption, SchedulingModal(), SchedulingModalProps (+29 more)

### Community 22 - "ClassesPage.tsx"
Cohesion: 0.04
Nodes (63): RFC-5322, ClassesPage, DayPicker(), DayPickerProps, sizeStyles, todayISO(), toISO(), WEEKDAYS (+55 more)

### Community 23 - "DashboardPage.tsx"
Cohesion: 0.10
Nodes (37): CalendarPage(), hourLabel(), errMsg(), GroupOption, inputCls, RoomOption, SessionWindowModal(), SessionWindowModalProps (+29 more)

### Community 24 - "Class"
Cohesion: 0.11
Nodes (20): Class, A subject offering (e.g., 'Math — CM2'). Enrollment target for students., Enrollment, Many-to-many: Student ↔ Class through Enrollment., Move an enrollment to another group. Returns (payload, status_code)., Transfer an enrollment out of this class. Body: { enrollment_id, new_group_id }…, _transfer_enrollment(), transfer_enrollment_from_class() (+12 more)

### Community 25 - "Student"
Cohesion: 0.08
Nodes (35): One record per billing cycle per student. Core billing entity., StudentBilling, A child enrolled in the academy., Student, export_data(), get_dashboard(), jwt_required, route (+27 more)

### Community 26 - "BillingConfig.tsx"
Cohesion: 0.09
Nodes (27): NotificationBell(), relativeTime(), styleFor(), TYPE_STYLE, AppearanceProps, BillingConfig(), BillingConfigProps, BillingPreset (+19 more)

### Community 27 - "SessionCheckInModal.tsx"
Cohesion: 0.09
Nodes (43): RosterEntry, SessionCheckInModal(), STATUS_CONFIG, StudentSearchResult, DangerConfirmModal(), BILLING_RULE_DEFAULTS, BILLING_RULE_FIELDS, BillingRuleField (+35 more)

### Community 28 - "rate_limiter.py"
Cohesion: 0.50
Nodes (3): Rate limiting configuration for authentication endpoints., flask_limiter, flask_limiter_util

### Community 29 - "uiStore.ts"
Cohesion: 0.06
Nodes (31): zustand, ProvidersProps, TOAST_COLORS, TOAST_ICONS, ToastContainer(), StudentsPage, TeachersPage, Toast (+23 more)

### Community 30 - "env.py"
Cohesion: 0.09
Nodes (20): alembic, apscheduler_schedulers_background, init_scheduler(), Vinta School OS — APScheduler Setup Initializes and manages the background task…, Initialize APScheduler with all configured cron jobs. Called during application…, Gracefully shut down the scheduler., shutdown_scheduler(), get_engine() (+12 more)

### Community 31 - "routes/auth.py"
Cohesion: 0.12
Nodes (28): Vinta School OS — Auth Blueprint /api/auth — Login, Profile Selection, PIN…, ChangePinRequestSchema, CreateOwnerRequestSchema, CreateOwnerResponseSchema, CreateProfileRequestSchema, LoginRequestSchema, MeResponseSchema, Meta (+20 more)

### Community 32 - "TestAuthentication"
Cohesion: 0.12
Nodes (10): integration, Wrong password should return 401., Non-existent email should return 401., Valid PIN with correct academy should return access token., Invalid PIN should return 401., Verify PIN without X-Academy-Id should return 400., Protected routes should require JWT token., Test authentication flows. (+2 more)

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
Nodes (41): ACADEMY_ID_KEY, ACTIVITY_TYPES, API_BASE_URL, AvatarPreset, BREAKPOINTS, CHART_COLORS, DEFAULT_SESSION_DURATION, ENTITY_FILTER_PAGES (+33 more)

### Community 38 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, forceConsistentCasingInFileNames, ignoreDeprecations, isolatedModules (+18 more)

### Community 39 - "formatters.py"
Cohesion: 0.14
Nodes (13): format_dzd(), format_phone(), now_utc(), parse_dzd(), Vinta School OS — Formatters & Helpers Phone (+213), Currency (DZD), Date/Time…, Normalize an Algerian phone number to +213XXXXXXXXX format. Accepts:…, Validate an Algerian phone number format., Format amount in Algerian Dinars with comma separators. (+5 more)

### Community 40 - "jwt_required"
Cohesion: 0.15
Nodes (20): add_guardian(), bulk_enroll_students(), create_student(), delete_student(), enroll_student(), get_student(), list_guardians(), jwt_required (+12 more)

### Community 41 - "routes/classes.py"
Cohesion: 0.09
Nodes (41): Recurring weekly slot defining when a class meets., Schedule, create_classroom(), create_schedule(), create_subject(), delete_class(), delete_classroom(), delete_schedule() (+33 more)

### Community 42 - "schemas/classes.py"
Cohesion: 0.12
Nodes (24): ClassListResponseSchema, ClassListSchema, ClassroomListResponseSchema, ClassroomSchema, CreateClassRequestSchema, CreateClassResponseSchema, CreateClassroomRequestSchema, CreateScheduleRequestSchema (+16 more)

### Community 43 - "academy_data_service.py"
Cohesion: 0.18
Nodes (16): _academy_owned_tables(), _collect(), _delete(), _delete_where(), _foreign_keys(), _primary_key(), purge_academy_data(), Vinta School OS — Academy Data Purge One ordered, foreign-key-safe way to… (+8 more)

### Community 44 - "create_owner"
Cohesion: 0.15
Nodes (28): arguments, change_pin(), create_owner(), create_profile(), get_current_user(), get_profiles(), login(), logout() (+20 more)

### Community 45 - "Luxury School OS Concept"
Cohesion: 0.11
Nodes (19): Flask REST API Architecture, Auth Blueprint (/api/auth), Two-Stage Auth & Profile PIN Verification Flow, Docker Compose Local Environment, Flask & SQLAlchemy Dependencies, PIN-Attributed Activity Log & Audit Trail, Algerian Private Academy Target Market, Glassmorphic Design Tokens (--gold / --emerald) (+11 more)

### Community 46 - "test_session_start_and_close.py"
Cohesion: 0.06
Nodes (55): cancel_session(), Cancel a session, recording *why*. The reason is not decoration:…, close_past_temporary_sessions(), LifecycleError, _log(), Exception, SCHEDULED -> IN_PROGRESS, and open the register. Returns ``(session,…, Close out one-off classes whose day passed without ever being started.… (+47 more)

### Community 47 - "GlobalSearch.tsx"
Cohesion: 0.22
Nodes (10): classMatches(), classRow(), GlobalSearch(), Row, ROW_STYLE, SECTION_ORDER, STUDENT_STATUS_LABEL, studentRow() (+2 more)

### Community 48 - "schemas/teachers.py"
Cohesion: 0.14
Nodes (19): CreateTeacherRequestSchema, CreateTeacherResponseSchema, PayrollSummarySchema, Schema, Teacher schemas — CRUD, Contracts, Payroll., POST /api/teachers response., PUT /api/teachers/<id>, Single teacher in list. (+11 more)

### Community 49 - "log_activity"
Cohesion: 0.18
Nodes (11): _apply_group_fields(), create_class(), _normalize_billing_model(), Create a new class. Body: { name, subject?, color?, teacher_id?, capacity?,…, Update class fields (legacy + CourseGroup money-model fields)., Map friendly billing-model names to the DB enum values., Apply any CourseGroup fields present in data. Returns applied names., update_class() (+3 more)

### Community 50 - "ClassQuickCreate.tsx"
Cohesion: 0.19
Nodes (16): buildClassPayload(), CLASS_COLOR_PRESETS, ClassBillingFields(), classCancelBtnCls, ClassFormValues, classInputCls, classLabelCls, classSubmitBtnCls (+8 more)

### Community 51 - "_enrich_student"
Cohesion: 0.17
Nodes (12): list_students(), List all students for the academy with computed status fields. Query params:…, _calendar_status(), _enrich_student(), _get_billing_calendar(), get_student(), list_students(), List all students for an academy with computed status fields. ``q`` optionally… (+4 more)

### Community 52 - "Academy"
Cohesion: 0.11
Nodes (26): Academy, Top-level tenant entity. One academy = one private school/academy., auto_checkout_expired_sessions(), check_overdue_payments(), check_upcoming_renewals(), Vinta School OS — Cron Jobs Automated check-outs, overdue status checks,…, Check all academies for billings past their due_date. Marks them as 'overdue'…, Create new billing records for students whose cycles have ended. Runs daily at… (+18 more)

### Community 53 - "TestTenantIsolation"
Cohesion: 0.22
Nodes (6): Ensure cross-academy access is blocked., Helper to create a second academy for cross-tenant testing., Student list should only return students from the authenticated academy., Students should be accessible with correct academy header., Request without X-Academy-Id should return 400., TestTenantIsolation

### Community 54 - "formatters.ts"
Cohesion: 0.08
Nodes (50): DayView(), DayViewProps, decimalToTime(), snapHour(), toCalendarSession(), yToTime(), FinalizeSessionModalProps, hexToRgba() (+42 more)

### Community 55 - "TimePicker.tsx"
Cohesion: 0.31
Nodes (8): Column(), formatLabel(), HOURS, minutesFor(), parse(), sizeStyles, TimePicker(), TimePickerProps

### Community 56 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 57 - "add_lifecycle_columns.py"
Cohesion: 0.16
Nodes (11): main(), Additive migration — billing relations, session lifecycle, billing toggles.…, Resolve the SQLite file the app actually opens, from DATABASE_URL., resolve_db_path(), One-shot database fix — adds any missing columns to existing tables. Run once:…, main(), Schema step — activity_logs.user_id becomes nullable. WHY The audit trail has…, Resolve the SQLite file the app actually opens, from DATABASE_URL. (+3 more)

### Community 58 - "base.py"
Cohesion: 0.33
Nodes (6): ErrorSchema, MessageSchema, Schema, Base schemas shared across all modules., Standard success message response., Standard error response.

### Community 59 - "vinta-school-os/package.json"
Cohesion: 0.05
Nodes (43): axios, clsx, oxlint, ref_path, recharts, tailwind-merge, tailwindcss, @tailwindcss/vite (+35 more)

### Community 60 - "schemas/calendar.py"
Cohesion: 0.17
Nodes (15): CreateSessionRequestSchema, CreateSessionResponseSchema, DaySessionsResponseSchema, Schema, Calendar schemas — Session CRUD, Week/Day views, Drag-and-drop., PATCH /api/sessions/<id>, Single session in calendar view., GET /api/calendar/week response. (+7 more)

### Community 61 - "academy_rules.py"
Cohesion: 0.16
Nodes (17): absence_consumes_credit(), count_gap_sessions(), early_payment_on_extra_sessions(), free_session_auto_present(), Vinta School OS — Academy Rules Per-academy policy, read at the moment a…, The academy's settings row, or None if it has never been created., Read one boolean rule, falling back to its documented default., Toggle 1 — does a missed session still spend a credit? True (default): an… (+9 more)

### Community 62 - "payroll_service.py"
Cohesion: 0.06
Nodes (37): Monthly payroll record for each teacher., Records when a teacher's hours are logged (per session)., TeacherHoursLog, TeacherPayroll, calculate_payout_for_session(), calculate_teacher_payroll(), generate_monthly_payroll(), get_teacher_payout_dashboard() (+29 more)

### Community 63 - "config.py"
Cohesion: 0.19
Nodes (12): BaseConfig, DevelopmentConfig, ProductionConfig, Vinta School OS — Configuration Environments Dev, Test, and Production…, Shared configuration across all environments., Development environment configuration., Test environment configuration., Production environment configuration. (+4 more)

### Community 64 - "StudentDrawer.tsx"
Cohesion: 0.05
Nodes (76): MultiPayModalProps, BillingCalendarCard(), BillingCalendarCardProps, CYCLE_STATUS_LABELS, statusDot(), BillingSummaryCard(), BillingSummaryCardProps, DASH (+68 more)

### Community 65 - "class.ts"
Cohesion: 0.09
Nodes (29): ClassCardMenuProps, ClassDetailProps, ClassCard(), ClassCardProps, ClassGrid(), ClassGridProps, resolveColor(), SkeletonCard() (+21 more)

### Community 66 - "create_academy"
Cohesion: 0.33
Nodes (5): Canonical form of an email address, for storage and for lookup. Login resolves…, authenticate_owner(), Authenticate an owner with email + password. Returns tokens dict on success,…, create_academy(), Full academy provisioning flow: 1. Create Academy record 2. Create…

### Community 67 - "auth_service.py"
Cohesion: 0.17
Nodes (11): authenticate_profile(), change_password(), change_pin(), get_current_user(), Vinta School OS — Auth Service Hashing, JWT tokens, PIN validation, owner…, Verify a PIN for a specific user., Change a user's PIN. Returns True on success., Change an owner's password. Returns True on success. (+3 more)

### Community 68 - "fixture"
Cohesion: 0.11
Nodes (18): app(), auth_headers_owner(), auth_headers_staff(), class_obj(), classroom(), client(), payment_plans(), Create default payment plans for the test academy. (+10 more)

### Community 69 - "create_app"
Cohesion: 0.13
Nodes (16): create_app(), check_if_token_revoked(), Application factory pattern., Register shell context objects., Register all API blueprints., _register_blueprints(), _register_shell_context(), make_shell_context() (+8 more)

### Community 70 - ".tmp-dangerprobe.py"
Cohesion: 0.32
Nodes (6): attached(), owned(), Throwaway: exercise the danger zone against a copy of the dev DB. The real…, Row counts for the tables that name an academy directly., {table: {academy or '(orphan)': count}} for the joined tables., report()

### Community 71 - "react-dom"
Cohesion: 0.33
Nodes (5): react-dom, App(), Providers(), AppRouter(), vinta_school_os_src_styles_globals

### Community 72 - "token_blacklist.py"
Cohesion: 0.33
Nodes (5): blacklist_token(), cleanup_expired(), Simple in-memory token blacklist for JWT revocation. For production, replace…, Add a token JTI to the blacklist., Remove expired entries from the blacklist.

### Community 73 - "PinStep.tsx"
Cohesion: 0.26
Nodes (8): PINInput, PINInputProps, PinStep(), PinStepProps, PIN_LENGTH, PIN_GATE_FALLBACK, PinError, verifyStaffPin()

### Community 74 - "Guardian"
Cohesion: 0.40
Nodes (4): Guardian, Student guardian / emergency contact. One student can have multiple guardians., create_student(), Create a new student with a default guardian. No billing/subscription record is…

### Community 75 - "get_stats"
Cohesion: 0.50
Nodes (4): get_stats(), Get aggregate student statistics for the stats rail., get_student_stats(), Get aggregate student statistics for the stats rail. Counts mirror the per-…

### Community 76 - "ActivityLog"
Cohesion: 0.21
Nodes (11): ActivityLog, Audit trail. Every significant action in the system is logged with user_id —…, get_activity_logs(), get_log_count(), log_action(), _map_log_type(), Vinta School OS — Audit Service Staff PIN attribution logger, activity log…, Get total activity log count for an academy. (+3 more)

### Community 78 - "test_billing_cycles.py"
Cohesion: 0.21
Nodes (8): overdue_bucket(), Classify overdue days into aging buckets: 1-7d → 'recent', 8-30d → 'aging',…, Unit Tests — Billing Cycle Calculations Tests for payment status derivation,…, Test aging bucket classification., 1-7 days overdue should be classified as 'recent'., 8-30 days overdue should be classified as 'aging'., 30+ days overdue should be classified as 'critical'., TestAgingBuckets

### Community 80 - "today"
Cohesion: 0.28
Nodes (9): days_until(), month_date_range(), next_occurrence(), date, Get the first and last day of the current month., Return the next date that falls on the given day_of_week (0=Sunday)., Get today's date in the server timezone., Calculate days until a target date. Negative if past. (+1 more)

### Community 81 - "Avatar.tsx"
Cohesion: 0.33
Nodes (8): Avatar, AvatarProps, getGradientForName(), getInitials(), gradientPairs, hashCode(), sizeConfig, squircleRadius()

### Community 82 - "marshmallow"
Cohesion: 0.29
Nodes (7): DashboardResponseSchema, Schema, Analytics schemas — Dashboard stats, Revenue chart, CSV export., GET /api/analytics/revenue-chart response., GET /api/analytics/dashboard response., RevenueChartResponseSchema, marshmallow

### Community 83 - "_sqlite_enable_foreign_keys"
Cohesion: 0.67
Nodes (3): Turn on foreign key enforcement for every SQLite connection as it opens.…, _sqlite_enable_foreign_keys(), listens_for

### Community 85 - "days_overdue"
Cohesion: 0.24
Nodes (7): days_overdue(), Calculate how many days overdue a due date is. 0 if not overdue., Should return 0 for future due dates., Should return 0 when due date is today., Test days overdue calculation., Should return positive number for past due dates., TestDaysOverdue

### Community 86 - "TestBillingStatusDerivation"
Cohesion: 0.25
Nodes (5): Test billing status derivation logic., Status should be 'paid' when paid_date is set and paid_amount >= amount_da., Status should be 'due' when due_date is in the future., Status should transition to 'overdue' when due_date has passed., TestBillingStatusDerivation

### Community 88 - "PaymentPlan"
Cohesion: 0.20
Nodes (9): PaymentPlan, Reusable billing plans that can be assigned to students., create_payment_plan(), Create a new payment plan., unit, Test payment plan creation and properties., Payment plans should store correct values., Term plans should have 90-day duration. (+1 more)

### Community 91 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 100 - "_session_duration_hours"
Cohesion: 0.50
Nodes (4): Session length in hours from start/end times (min 1h fallback)., _session_duration_hours(), Calculate session duration in hours from time objects., session_duration_hours()

### Community 122 - ".tmp-deleteone.py"
Cohesion: 0.17
Nodes (13): Classroom, Extensible palette entity for calendar subject colors., A physical room in the academy., Subject, pick(), Throwaway: call one DELETE endpoint against a copy of the dev DB. python .tmp-…, A real row of the model the rule's last placeholder names., Throwaway: does every DELETE endpoint still work with foreign keys enforced?… (+5 more)

## Knowledge Gaps
- **384 isolated node(s):** `type`, `Meta`, `$schema`, `plugins`, `react/rules-of-hooks` (+379 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1160 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tenant_required()` connect `tenant_required` to `routes/calendar.py`, `routes/teachers.py`, `routes/students.py`, `routes/attendance.py`, `jwt_required`, `routes/classes.py`, `jwt_required`, `get_stats`, `User`, `routes/notifications.py`, `log_activity`, `billing_service.py`, `_enrich_student`, `routes/settings.py`, `Academy`, `Class`, `Student`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `BillingPage.tsx`, `ClassCardMenu.tsx`, `TeacherDrawer.tsx`, `api.ts`, `SessionMenu.tsx`, `SchedulingModal.tsx`, `ClassesPage.tsx`, `DashboardPage.tsx`, `BillingConfig.tsx`, `SessionCheckInModal.tsx`, `uiStore.ts`, `ActivityLog.tsx`, `GlobalSearch.tsx`, `ClassQuickCreate.tsx`, `formatters.ts`, `TimePicker.tsx`, `StudentDrawer.tsx`, `class.ts`, `PinStep.tsx`, `Avatar.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Session` connect `Session` to `extensions.py`, `routes/calendar.py`, `routes/teachers.py`, `fixture`, `TestSessionCRUD`, `routes/attendance.py`, `routes/classes.py`, `student_service.py`, `jwt_required`, `test_session_start_and_close.py`, `billing_service.py`, `routes/settings.py`, `Academy`, `Student`, `.tmp-deleteone.py`, `payroll_service.py`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `tenant_required()` (e.g. with `Academy` and `User`) actually correct?**
  _`tenant_required()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `Session` (e.g. with `get_dashboard()` and `get_roster()`) actually correct?**
  _`Session` has 41 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `Meta`, `$schema` to the rest of the system?**
  _384 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extensions.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06987681970884659 - nodes in this community are weakly interconnected._