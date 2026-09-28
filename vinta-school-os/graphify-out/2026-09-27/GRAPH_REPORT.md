# Graph Report - vinta-school-os  (2026-09-27)

## Corpus Check
- 164 files · ~154,948 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 1138 nodes · 3113 edges · 57 communities (56 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0287abcf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- BillingConfig.tsx
- DashboardPage.tsx
- formatters.ts
- package.json
- api.ts
- SchedulingModal.tsx
- index.ts
- SettingsPage.tsx
- compilerOptions
- api
- react-i18next
- react
- SessionMenu.tsx
- student.ts
- router.tsx
- MultiPayModal.tsx
- BillingSummaryCard.tsx
- PayoutDashboard.tsx
- cn
- ClassQuickCreate.tsx
- billing.ts
- ClassCardMenu.tsx
- themeStore.ts
- sessionLifecycle.ts
- AddTeacherModal.tsx
- uiStore.ts
- ClassGrid.tsx
- ClassDetail.tsx
- compilerOptions
- DayPicker.tsx
- Session
- SessionDetail.tsx
- StudentGuardians.tsx
- TeacherDrawer.tsx
- class.ts
- ClassesPage.tsx
- PaymentHistoryList.tsx
- StudentDrawer.tsx
- StudentAttendanceCalendar.tsx
- teacher.ts
- authStore.ts
- ProfileCreator.tsx
- GlobalSearch.tsx
- Translation conventions — Vinta School OS
- teacherEmails.ts
- isGrossProfitEnabled
- ErrorBoundary.tsx
- providers.tsx
- Avatar.tsx
- TimePicker.tsx
- BillingPage.tsx
- AgendaBoard.tsx
- AddStudentModal.tsx
- .oxlintrc.json
- AddStaffModal.tsx
- React + TypeScript + Vite
- tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `cn()` - 180 edges
2. `react` - 81 edges
3. `react-i18next` - 79 edges
4. `lucide-react` - 69 edges
5. `api` - 41 edges
6. `useAuthStore` - 41 edges
7. `Session` - 37 edges
8. `toast` - 28 edges
9. `compilerOptions` - 25 edges
10. `SessionCheckInModal()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `PageContainer()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/PageContainer.tsx → src/lib/cn.ts
- `CardFooter` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/Card.tsx → src/lib/cn.ts
- `ConfirmDialog` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/ConfirmDialog.tsx → src/lib/cn.ts
- `Drawer` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/Drawer.tsx → src/lib/cn.ts
- `EmptyState()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/EmptyState.tsx → src/lib/cn.ts

## Import Cycles
- None detected.

## Communities (57 total, 1 thin omitted)

### Community 0 - "BillingConfig.tsx"
Cohesion: 0.06
Nodes (62): RosterEntry, SessionCheckInModal(), STATUS_CONFIG, StudentSearchResult, ClassBillingStat(), fetchBilling(), DangerConfirmModal(), VoidModal() (+54 more)

### Community 1 - "DashboardPage.tsx"
Cohesion: 0.06
Nodes (51): CalendarPage(), REASON_KEYS, STATUS_KEYS, FinalizeSessionModal(), CONFLICT_KIND_KEYS, errMsg(), GroupOption, inputCls (+43 more)

### Community 2 - "formatters.ts"
Cohesion: 0.08
Nodes (40): DayView(), DayViewProps, decimalToTime(), snapHour(), toCalendarSession(), yToTime(), hexToRgba(), SessionBlock() (+32 more)

### Community 3 - "package.json"
Cohesion: 0.04
Nodes (46): dependencies, axios, clsx, i18next, lucide-react, react, react-dom, react-i18next (+38 more)

### Community 4 - "api.ts"
Cohesion: 0.06
Nodes (34): PinStep(), PinStepProps, ApiError, ApiResponse, CREDENTIAL_CHECK_ENDPOINTS, SESSION_TOLERANT_401, ACADEMY_ID_KEY, ACTIVITY_TYPES (+26 more)

### Community 5 - "SchedulingModal.tsx"
Cohesion: 0.09
Nodes (38): CONFLICT_KIND_KEYS, errMsg(), GroupOption, inputCls, Mode, primaryBtnCls, REASON_KEYS, RoomOption (+30 more)

### Community 6 - "index.ts"
Cohesion: 0.05
Nodes (37): DEFAULT_LANGUAGE, DIRECTION, LANGUAGE_LABELS, Namespace, NAMESPACES, resources, SUPPORTED_LANGUAGES, src_i18n_locales_ar_auth (+29 more)

### Community 7 - "SettingsPage.tsx"
Cohesion: 0.11
Nodes (23): Toggle, ToggleProps, AcademyProfile(), AcademyProfileProps, TERM_OPTIONS, WORKING_DAYS, Appearance(), AppearanceProps (+15 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, forceConsistentCasingInFileNames, ignoreDeprecations, isolatedModules (+18 more)

### Community 9 - "api"
Cohesion: 0.15
Nodes (19): Card, CardBody, CardFooter, CardHeader, CardHeaderProps, CardProps, DonutCards(), DonutCardsProps (+11 more)

### Community 10 - "react-i18next"
Cohesion: 0.12
Nodes (18): lucide-react, react-i18next, TeachersPage, Drawer, DrawerProps, maxWidthMap, Modal, ModalProps (+10 more)

### Community 11 - "react"
Cohesion: 0.14
Nodes (15): react, PageContainer(), PageContainerProps, Button, ButtonProps, sizeStyles, variantStyles, ConfirmDialog (+7 more)

### Community 12 - "SessionMenu.tsx"
Cohesion: 0.13
Nodes (19): COMMISSION_TYPE_KEYS, dangerBtnCls, FreeNextModal(), inputCls, LogEntry, MenuItem(), ModalKind, ModalShell() (+11 more)

### Community 13 - "student.ts"
Cohesion: 0.12
Nodes (19): i18next, StudentsPage, activePillClass(), FilterKey, StatCard(), StatCardProps, StudentsPage(), STATUS_LABEL_KEYS (+11 more)

### Community 14 - "router.tsx"
Cohesion: 0.12
Nodes (15): AppShell(), AuthGuard(), AuthScreen, BillingPage, CalendarPage, ClassesPage, DashboardPage, ProfileGuard() (+7 more)

### Community 15 - "MultiPayModal.tsx"
Cohesion: 0.16
Nodes (17): LineItem, MultiPayModal(), MultiPayModalProps, PAYMENT_METHODS, PinInput(), PayoutDashboard(), BILLING_MODEL_STYLE, STATUS_STYLE (+9 more)

### Community 16 - "BillingSummaryCard.tsx"
Cohesion: 0.20
Nodes (18): BillingCalendarCard(), BillingCalendarCardProps, CYCLE_STATUS_KEYS, statusDot(), BillingSummaryCard(), DASH, knownText(), parseISODate() (+10 more)

### Community 17 - "PayoutDashboard.tsx"
Cohesion: 0.11
Nodes (16): Badge, BadgeProps, SemanticVariant, sizeStyles, variantAliases, variantStyles, AgingBucket, AgingEntry (+8 more)

### Community 18 - "cn"
Cohesion: 0.12
Nodes (15): Column, Table(), TableProps, Toast, ToastContext, ToastContextValue, ToastProvider(), RevenueChart() (+7 more)

### Community 19 - "ClassQuickCreate.tsx"
Cohesion: 0.17
Nodes (17): buildClassPayload(), CLASS_COLOR_PRESETS, ClassBillingFields(), classCancelBtnCls, ClassFormValues, classInputCls, classLabelCls, classSubmitBtnCls (+9 more)

### Community 20 - "billing.ts"
Cohesion: 0.11
Nodes (18): PaymentHistoryListProps, UseStudentBillingResult, AgingBucket, BillingState, CreatePaymentPlanRequest, GroupCharge, MultiPayReceipt, MultiPayRequest (+10 more)

### Community 21 - "ClassCardMenu.tsx"
Cohesion: 0.16
Nodes (17): ClassCardMenu(), EndClassModal(), FreeChip(), isRunning(), NoSessionTrigger(), RunningLight(), RunningLightState, serverMessage() (+9 more)

### Community 22 - "themeStore.ts"
Cohesion: 0.17
Nodes (18): Language, readStoredLanguage(), FONT_SIZE_KEY, LANGUAGE_KEY, THEME_KEY, applyFontSize(), applyLanguage(), applyTheme() (+10 more)

### Community 23 - "sessionLifecycle.ts"
Cohesion: 0.23
Nodes (15): canStartSession(), getLifecycleRecord(), getScheduledDateTime(), getScheduledEnd(), getScheduledStart(), isSessionDay(), isSnoozed(), LifecycleRecord (+7 more)

### Community 24 - "AddTeacherModal.tsx"
Cohesion: 0.12
Nodes (14): react-dom, Select, SelectAction, SelectOption, SelectProps, AddTeacherModalProps, COMMISSION_PLACEHOLDER, COMMISSION_SUFFIX_KEYS (+6 more)

### Community 25 - "uiStore.ts"
Cohesion: 0.16
Nodes (14): react-router-dom, ToastContainer(), AppShell(), ICON_MAP, Sidebar(), Topbar(), NAV_ITEMS, STAFF_HIDDEN_PAGES (+6 more)

### Community 26 - "ClassGrid.tsx"
Cohesion: 0.18
Nodes (16): ClassCardMenuProps, ClassDetailProps, ClassesPage(), ClassCard(), ClassCardProps, ClassGrid(), ClassGridProps, resolveColor() (+8 more)

### Community 27 - "ClassDetail.tsx"
Cohesion: 0.15
Nodes (15): BillingBadge, BillingReading, ClassDetail(), COLOR_PRESETS, DAY_KEYS, EnrolledStudent, ENROLLMENT_STATUS_KEYS, getScheduleBounds() (+7 more)

### Community 28 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 29 - "DayPicker.tsx"
Cohesion: 0.22
Nodes (12): NotificationBell(), relativeTime(), styleFor(), TYPE_STYLE, DayPicker(), DayPickerProps, sizeStyles, todayISO() (+4 more)

### Community 30 - "Session"
Cohesion: 0.17
Nodes (15): FinalizeSessionModalProps, SchedulingModalProps, SessionCheckInModalProps, AgendaBoardProps, PositionedSession, SessionActions(), SessionActionsProps, SessionDetailProps (+7 more)

### Community 31 - "SessionDetail.tsx"
Cohesion: 0.17
Nodes (13): InfoChipProps, RosterStudent, SessionDetail, startTimeLabel(), STATUS_BADGE_CLASSES, STATUS_LABEL_KEYS, StudentRow(), StudentRowProps (+5 more)

### Community 32 - "StudentGuardians.tsx"
Cohesion: 0.19
Nodes (13): EmptyLine(), ProfileCard(), ProfileCardProps, StudentClasses(), StudentClassesProps, GuardianRow, safePhone(), StudentGuardians() (+5 more)

### Community 33 - "TeacherDrawer.tsx"
Cohesion: 0.16
Nodes (13): COMMISSION_SUFFIX_KEYS, COMMISSION_TYPE_KEYS, commissionBadgeLabel(), commissionRateLabel(), DAY_ANCHORS, DAYS, editInputCls, generateWeeklySchedule() (+5 more)

### Community 34 - "class.ts"
Cohesion: 0.12
Nodes (15): AttendanceStatus, CheckInRequest, ClassBillingInfo, Classroom, ClassState, ClassStats, CreateClassRequest, CreateClassroomRequest (+7 more)

### Community 35 - "ClassesPage.tsx"
Cohesion: 0.14
Nodes (12): AddClassroomModal(), AddCourseGroupModal(), cancelBtnCls, ClassroomList(), COLOR_PRESETS, inputCls, SUBJECT_OPTIONS, submitBtnCls (+4 more)

### Community 36 - "PaymentHistoryList.tsx"
Cohesion: 0.25
Nodes (13): activeLocale(), formatDateRange(), formatDisplayDate(), humaniseStatus(), METHOD_LABEL_KEYS, METHOD_LABELS, methodLabel(), parseTimestamp() (+5 more)

### Community 37 - "StudentDrawer.tsx"
Cohesion: 0.22
Nodes (11): BillingSummaryCardProps, useStudentBilling(), useStudentProfile(), UseStudentProfileResult, ENROLLMENT_LABEL_KEYS, enrollmentLabel(), Field(), StudentDrawer() (+3 more)

### Community 38 - "StudentAttendanceCalendar.tsx"
Cohesion: 0.22
Nodes (12): dominantState(), formatTime(), monthCells(), STATE_PRIORITY, STATE_STYLES, StateStyle, StudentAttendanceCalendar(), StudentAttendanceCalendarProps (+4 more)

### Community 39 - "teacher.ts"
Cohesion: 0.16
Nodes (12): TeacherDrawerProps, TeacherTableProps, COMMISSION_TYPE_LABELS, CommissionType, CreateTeacherRequest, Teacher, TeacherHoursLog, TeacherPayoutSummary (+4 more)

### Community 40 - "authStore.ts"
Cohesion: 0.20
Nodes (12): tokenStorage, AuthState, CreateProfileRequest, LoginRequest, LoginResponse, ProfileListResponse, ProfilePicture, SignupRequest (+4 more)

### Community 41 - "ProfileCreator.tsx"
Cohesion: 0.28
Nodes (10): ProfileCreator, ProfilePicker, PINModal(), PINModalProps, ProfileCreator(), ProfileCreatorProps, ProfilePicker(), AVATAR_PRESETS (+2 more)

### Community 42 - "GlobalSearch.tsx"
Cohesion: 0.22
Nodes (10): classMatches(), classRow(), GlobalSearch(), Row, ROW_STYLE, SECTION_ORDER, STUDENT_STATUS_KEY, studentRow() (+2 more)

### Community 43 - "Translation conventions — Vinta School OS"
Cohesion: 0.15
Nodes (12): Dates, numbers, currency, Do not translate, Finishing, Interpolation and plurals, Key naming, Languages, Namespaces, RTL: physical → logical utilities (+4 more)

### Community 44 - "teacherEmails.ts"
Cohesion: 0.29
Nodes (10): RFC-5322, TeachersPage(), currentAcademy(), getTeacherEmail(), isValidEmail(), listTeacherEmails(), loadAll(), saveAll() (+2 more)

### Community 45 - "isGrossProfitEnabled"
Cohesion: 0.31
Nodes (9): BillingPage(), FinancesModal(), LogModal(), currentAcademy(), isGrossProfitEnabled(), load(), save(), setGrossProfitEnabled() (+1 more)

### Community 46 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (3): ErrorBoundary, Props, State

### Community 47 - "providers.tsx"
Cohesion: 0.25
Nodes (6): App(), Providers(), ProvidersProps, TOAST_COLORS, TOAST_ICONS, AppRouter()

### Community 48 - "Avatar.tsx"
Cohesion: 0.33
Nodes (8): Avatar, AvatarProps, getGradientForName(), getInitials(), gradientPairs, hashCode(), sizeConfig, squircleRadius()

### Community 49 - "TimePicker.tsx"
Cohesion: 0.31
Nodes (8): Column(), formatLabel(), HOURS, minutesFor(), parse(), sizeStyles, TimePicker(), TimePickerProps

### Community 50 - "BillingPage.tsx"
Cohesion: 0.25
Nodes (6): BillingTab, TABS, FinanceBreakdown(), BillingRingData, BillingStats, RevenueDataPoint

### Community 51 - "AgendaBoard.tsx"
Cohesion: 0.50
Nodes (7): AgendaBoard(), hexToRgba(), menuAnchorAt(), menuAnchorForElement(), resolveOverlaps(), getCurrentHour(), getSessionOrigin()

### Community 52 - "AddStudentModal.tsx"
Cohesion: 0.29
Nodes (4): AddStudentModal(), AddStudentModalProps, ClassOption, inputClass

### Community 53 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 54 - "AddStaffModal.tsx"
Cohesion: 0.40
Nodes (3): AddStaffModal(), AddStaffModalProps, inputCls

### Community 55 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

## Knowledge Gaps
- **386 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `name` (+381 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 478 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `BillingConfig.tsx`, `DashboardPage.tsx`, `formatters.ts`, `api.ts`, `SchedulingModal.tsx`, `SettingsPage.tsx`, `api`, `react-i18next`, `react`, `SessionMenu.tsx`, `student.ts`, `MultiPayModal.tsx`, `BillingSummaryCard.tsx`, `PayoutDashboard.tsx`, `ClassQuickCreate.tsx`, `ClassCardMenu.tsx`, `AddTeacherModal.tsx`, `uiStore.ts`, `ClassGrid.tsx`, `ClassDetail.tsx`, `DayPicker.tsx`, `Session`, `SessionDetail.tsx`, `StudentGuardians.tsx`, `TeacherDrawer.tsx`, `ClassesPage.tsx`, `PaymentHistoryList.tsx`, `StudentDrawer.tsx`, `StudentAttendanceCalendar.tsx`, `teacher.ts`, `ProfileCreator.tsx`, `GlobalSearch.tsx`, `teacherEmails.ts`, `isGrossProfitEnabled`, `Avatar.tsx`, `TimePicker.tsx`, `BillingPage.tsx`, `AgendaBoard.tsx`, `AddStudentModal.tsx`, `AddStaffModal.tsx`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `BillingConfig.tsx`, `DashboardPage.tsx`, `formatters.ts`, `package.json`, `api.ts`, `SchedulingModal.tsx`, `SettingsPage.tsx`, `api`, `react-i18next`, `SessionMenu.tsx`, `student.ts`, `router.tsx`, `MultiPayModal.tsx`, `PayoutDashboard.tsx`, `cn`, `ClassQuickCreate.tsx`, `billing.ts`, `ClassCardMenu.tsx`, `AddTeacherModal.tsx`, `uiStore.ts`, `ClassGrid.tsx`, `ClassDetail.tsx`, `DayPicker.tsx`, `Session`, `SessionDetail.tsx`, `TeacherDrawer.tsx`, `ClassesPage.tsx`, `StudentDrawer.tsx`, `StudentAttendanceCalendar.tsx`, `teacher.ts`, `ProfileCreator.tsx`, `GlobalSearch.tsx`, `ErrorBoundary.tsx`, `providers.tsx`, `Avatar.tsx`, `TimePicker.tsx`, `BillingPage.tsx`, `AgendaBoard.tsx`, `AddStudentModal.tsx`, `AddStaffModal.tsx`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `react-i18next` connect `react-i18next` to `BillingConfig.tsx`, `DashboardPage.tsx`, `formatters.ts`, `package.json`, `api.ts`, `SchedulingModal.tsx`, `index.ts`, `SettingsPage.tsx`, `api`, `react`, `SessionMenu.tsx`, `student.ts`, `router.tsx`, `MultiPayModal.tsx`, `BillingSummaryCard.tsx`, `PayoutDashboard.tsx`, `cn`, `ClassQuickCreate.tsx`, `billing.ts`, `ClassCardMenu.tsx`, `AddTeacherModal.tsx`, `uiStore.ts`, `ClassGrid.tsx`, `ClassDetail.tsx`, `DayPicker.tsx`, `Session`, `SessionDetail.tsx`, `StudentGuardians.tsx`, `TeacherDrawer.tsx`, `ClassesPage.tsx`, `PaymentHistoryList.tsx`, `StudentDrawer.tsx`, `StudentAttendanceCalendar.tsx`, `teacher.ts`, `ProfileCreator.tsx`, `GlobalSearch.tsx`, `ErrorBoundary.tsx`, `Avatar.tsx`, `TimePicker.tsx`, `BillingPage.tsx`, `AgendaBoard.tsx`, `AddStudentModal.tsx`, `AddStaffModal.tsx`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _386 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BillingConfig.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `DashboardPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06490384615384616 - nodes in this community are weakly interconnected._
- **Should `formatters.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08470588235294117 - nodes in this community are weakly interconnected._