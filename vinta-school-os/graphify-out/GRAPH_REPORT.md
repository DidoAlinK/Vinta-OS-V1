# Graph Report - vinta-school-os  (2026-09-27)

## Corpus Check
- 164 files · ~165,405 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 1145 nodes · 3141 edges · 44 communities (43 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0287abcf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- formatters.ts
- BillingConfig.tsx
- SessionMenu.tsx
- package.json
- DashboardPage.tsx
- TeacherDrawer.tsx
- index.ts
- api.ts
- SchedulingModal.tsx
- BillingPage.tsx
- student.ts
- cn
- router.tsx
- compilerOptions
- lucide-react
- react-i18next
- cn.ts
- StudentDrawer.tsx
- BillingSummaryCard.tsx
- billing.ts
- ClassQuickCreate.tsx
- themeStore.ts
- ClassDetail.tsx
- ClassGrid.tsx
- providers.tsx
- FinanceBreakdown.tsx
- compilerOptions
- uiStore.ts
- class.ts
- ProfileCreator.tsx
- NotificationBell.tsx
- PaymentHistoryList.tsx
- GlobalSearch.tsx
- StudentAttendanceCalendar.tsx
- Translation conventions — Vinta School OS
- authStore.ts
- ClassesPage.tsx
- ErrorBoundary.tsx
- Avatar.tsx
- DayPicker.tsx
- TimePicker.tsx
- .oxlintrc.json
- React + TypeScript + Vite
- tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `cn()` - 180 edges
2. `react-i18next` - 82 edges
3. `react` - 81 edges
4. `lucide-react` - 69 edges
5. `api` - 41 edges
6. `useAuthStore` - 41 edges
7. `Session` - 37 edges
8. `toast` - 28 edges
9. `compilerOptions` - 25 edges
10. `SessionCheckInModal()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `ToastContainer()` --calls--> `useUIStore`  [EXTRACTED]
  src/app/providers.tsx → src/stores/uiStore.ts
- `CardFooter` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/Card.tsx → src/lib/cn.ts
- `ConfirmDialog` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/ConfirmDialog.tsx → src/lib/cn.ts
- `EmptyState()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/EmptyState.tsx → src/lib/cn.ts
- `Table()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/Table.tsx → src/lib/cn.ts

## Import Cycles
- None detected.

## Communities (44 total, 1 thin omitted)

### Community 0 - "formatters.ts"
Cohesion: 0.05
Nodes (69): DayView(), DayViewProps, decimalToTime(), snapHour(), toCalendarSession(), yToTime(), FinalizeSessionModalProps, hexToRgba() (+61 more)

### Community 1 - "BillingConfig.tsx"
Cohesion: 0.05
Nodes (71): BILLING_MODEL_STYLE, STATUS_STYLE, SubscriptionsPanel(), SubscriptionsPanelProps, UNKNOWN_STATUS, RosterEntry, SessionCheckInModal(), STATUS_CONFIG (+63 more)

### Community 2 - "SessionMenu.tsx"
Cohesion: 0.05
Nodes (64): ClassCardMenu(), EndClassModal(), FreeChip(), isRunning(), NoSessionTrigger(), RunningLight(), RunningLightState, serverMessage() (+56 more)

### Community 3 - "package.json"
Cohesion: 0.04
Nodes (46): dependencies, axios, clsx, i18next, lucide-react, react, react-dom, react-i18next (+38 more)

### Community 4 - "DashboardPage.tsx"
Cohesion: 0.06
Nodes (53): CalendarPage(), REASON_KEYS, STATUS_KEYS, FinalizeSessionModal(), CONFLICT_KIND_KEYS, errMsg(), GroupOption, inputCls (+45 more)

### Community 5 - "TeacherDrawer.tsx"
Cohesion: 0.05
Nodes (55): RFC-5322, FinancesModal(), LogModal(), AddTeacherModal(), AddTeacherModalProps, COMMISSION_PLACEHOLDER, COMMISSION_SUFFIX_KEYS, COMMISSION_TYPE_KEYS (+47 more)

### Community 6 - "index.ts"
Cohesion: 0.05
Nodes (38): DEFAULT_LANGUAGE, DIRECTION, initialLanguage, LANGUAGE_LABELS, Namespace, NAMESPACES, resources, SUPPORTED_LANGUAGES (+30 more)

### Community 7 - "api.ts"
Cohesion: 0.06
Nodes (37): PINInput, PINInputProps, PinStep(), PinStepProps, ApiError, ApiResponse, CREDENTIAL_CHECK_ENDPOINTS, SESSION_TOLERANT_401 (+29 more)

### Community 8 - "SchedulingModal.tsx"
Cohesion: 0.09
Nodes (37): CONFLICT_KIND_KEYS, conflictKinds(), errMsg(), GroupOption, inputCls, Mode, primaryBtnCls, REASON_KEYS (+29 more)

### Community 9 - "BillingPage.tsx"
Cohesion: 0.10
Nodes (25): Card, CardBody, CardFooter, CardHeaderProps, CardProps, BillingPage(), BillingTab, TABS (+17 more)

### Community 10 - "student.ts"
Cohesion: 0.09
Nodes (26): i18next, MultiPayModalProps, AddStudentModal(), BillingSummaryCardProps, StudentIdentityProps, UseStudentProfileResult, StudentDrawerProps, activePillClass() (+18 more)

### Community 11 - "cn"
Cohesion: 0.12
Nodes (21): react-dom, PageContainer(), PageContainerProps, Drawer, DrawerProps, maxWidthMap, Modal, ModalProps (+13 more)

### Community 12 - "router.tsx"
Cohesion: 0.09
Nodes (19): AppShell(), AuthGuard(), AuthScreen, BillingPage, CalendarPage, ClassesPage, DashboardPage, ProfileGuard() (+11 more)

### Community 13 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, forceConsistentCasingInFileNames, ignoreDeprecations, isolatedModules (+18 more)

### Community 14 - "lucide-react"
Cohesion: 0.13
Nodes (17): lucide-react, Button, ButtonProps, sizeStyles, variantStyles, ConfirmDialog, ConfirmDialogProps, EmptyState() (+9 more)

### Community 15 - "react-i18next"
Cohesion: 0.13
Nodes (16): react, react-i18next, Column, Table(), TableProps, AddSubjectModal(), AddSubjectModalProps, COLOR_PRESETS (+8 more)

### Community 16 - "cn.ts"
Cohesion: 0.14
Nodes (16): CardHeader, Toggle, ToggleProps, AddStaffModal(), AddStaffModalProps, inputCls, Appearance(), OptionChip() (+8 more)

### Community 17 - "StudentDrawer.tsx"
Cohesion: 0.15
Nodes (18): EmptyLine(), InlineSpinner(), ProfileCard(), ProfileCardProps, StudentClasses(), StudentClassesProps, GuardianRow, safePhone() (+10 more)

### Community 18 - "BillingSummaryCard.tsx"
Cohesion: 0.21
Nodes (18): BillingCalendarCard(), BillingCalendarCardProps, CYCLE_STATUS_KEYS, statusDot(), activeLocale(), BillingSummaryCard(), DASH, formatDateRange() (+10 more)

### Community 19 - "billing.ts"
Cohesion: 0.10
Nodes (20): AgingBucket, BillingRingData, BillingState, BillingStats, CreatePaymentPlanRequest, GroupCharge, MultiPayReceipt, MultiPayRequest (+12 more)

### Community 20 - "ClassQuickCreate.tsx"
Cohesion: 0.17
Nodes (17): buildClassPayload(), CLASS_COLOR_PRESETS, ClassBillingFields(), classCancelBtnCls, ClassFormValues, classInputCls, classLabelCls, classSubmitBtnCls (+9 more)

### Community 21 - "themeStore.ts"
Cohesion: 0.16
Nodes (19): applyDocumentLanguage(), Language, readStoredLanguage(), FONT_SIZE_KEY, LANGUAGE_KEY, THEME_KEY, applyFontSize(), applyLanguage() (+11 more)

### Community 22 - "ClassDetail.tsx"
Cohesion: 0.13
Nodes (17): BillingBadge, BillingReading, ClassBillingStat(), fetchBilling(), ClassDetail(), COLOR_PRESETS, DAY_KEYS, EnrolledStudent (+9 more)

### Community 23 - "ClassGrid.tsx"
Cohesion: 0.18
Nodes (16): ClassCardMenuProps, ClassDetailProps, ClassesPage(), ClassCard(), ClassCardProps, ClassGrid(), ClassGridProps, resolveColor() (+8 more)

### Community 24 - "providers.tsx"
Cohesion: 0.13
Nodes (12): App(), Providers(), ProvidersProps, TOAST_COLORS, TOAST_ICONS, ToastContainer(), AppRouter(), Toast (+4 more)

### Community 25 - "FinanceBreakdown.tsx"
Cohesion: 0.13
Nodes (14): Badge, BadgeProps, SemanticVariant, sizeStyles, variantAliases, variantStyles, AgingBucket, AgingEntry (+6 more)

### Community 26 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 27 - "uiStore.ts"
Cohesion: 0.19
Nodes (12): react-router-dom, ICON_MAP, Sidebar(), Topbar(), NAV_ITEMS, STAFF_HIDDEN_PAGES, FocusTarget, ToastAction (+4 more)

### Community 28 - "class.ts"
Cohesion: 0.12
Nodes (15): AttendanceStatus, CheckInRequest, ClassBillingInfo, Classroom, ClassState, ClassStats, CreateClassRequest, CreateClassroomRequest (+7 more)

### Community 29 - "ProfileCreator.tsx"
Cohesion: 0.26
Nodes (11): ProfileCreator, ProfilePicker, PINModal(), PINModalProps, ProfileCreator(), ProfileCreatorProps, ProfilePicker(), AVATAR_PRESETS (+3 more)

### Community 30 - "NotificationBell.tsx"
Cohesion: 0.18
Nodes (10): NotificationBell(), relativeTime(), styleFor(), TYPE_STYLE, AddStaffRequest, Notification, SettingsState, Subscription (+2 more)

### Community 31 - "PaymentHistoryList.tsx"
Cohesion: 0.22
Nodes (13): humaniseStatus(), METHOD_LABEL_KEYS, METHOD_LABELS, methodLabel(), parseTimestamp(), PaymentHistoryList(), PaymentHistoryListProps, purchaseShape() (+5 more)

### Community 32 - "GlobalSearch.tsx"
Cohesion: 0.22
Nodes (10): classMatches(), classRow(), GlobalSearch(), Row, ROW_STYLE, SECTION_ORDER, STUDENT_STATUS_KEY, studentRow() (+2 more)

### Community 33 - "StudentAttendanceCalendar.tsx"
Cohesion: 0.24
Nodes (11): dominantState(), formatTime(), monthCells(), STATE_PRIORITY, STATE_STYLES, StateStyle, StudentAttendanceCalendar(), StudentAttendanceCalendarProps (+3 more)

### Community 34 - "Translation conventions — Vinta School OS"
Cohesion: 0.15
Nodes (12): Dates, numbers, currency, Do not translate, Finishing, Interpolation and plurals, Key naming, Languages, Namespaces, RTL: physical → logical utilities (+4 more)

### Community 35 - "authStore.ts"
Cohesion: 0.22
Nodes (11): AuthState, CreateProfileRequest, LoginRequest, LoginResponse, ProfileListResponse, ProfilePicture, SignupRequest, SignupResponse (+3 more)

### Community 36 - "ClassesPage.tsx"
Cohesion: 0.18
Nodes (9): AddClassroomModal(), cancelBtnCls, ClassroomList(), COLOR_PRESETS, inputCls, SUBJECT_OPTIONS, submitBtnCls, Tab (+1 more)

### Community 37 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (3): ErrorBoundary, Props, State

### Community 38 - "Avatar.tsx"
Cohesion: 0.33
Nodes (8): Avatar, AvatarProps, getGradientForName(), getInitials(), gradientPairs, hashCode(), sizeConfig, squircleRadius()

### Community 39 - "DayPicker.tsx"
Cohesion: 0.39
Nodes (8): DayPicker(), DayPickerProps, sizeStyles, todayISO(), toISO(), weekdayNames(), isLanguage(), localeTag()

### Community 40 - "TimePicker.tsx"
Cohesion: 0.31
Nodes (8): Column(), formatLabel(), HOURS, minutesFor(), parse(), sizeStyles, TimePicker(), TimePickerProps

### Community 41 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 42 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

## Knowledge Gaps
- **388 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `name` (+383 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 480 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `formatters.ts`, `BillingConfig.tsx`, `SessionMenu.tsx`, `DashboardPage.tsx`, `TeacherDrawer.tsx`, `api.ts`, `SchedulingModal.tsx`, `BillingPage.tsx`, `student.ts`, `router.tsx`, `lucide-react`, `react-i18next`, `cn.ts`, `StudentDrawer.tsx`, `BillingSummaryCard.tsx`, `ClassQuickCreate.tsx`, `ClassDetail.tsx`, `ClassGrid.tsx`, `providers.tsx`, `FinanceBreakdown.tsx`, `uiStore.ts`, `ProfileCreator.tsx`, `NotificationBell.tsx`, `PaymentHistoryList.tsx`, `GlobalSearch.tsx`, `StudentAttendanceCalendar.tsx`, `ClassesPage.tsx`, `Avatar.tsx`, `DayPicker.tsx`, `TimePicker.tsx`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `react-i18next` connect `react-i18next` to `formatters.ts`, `BillingConfig.tsx`, `SessionMenu.tsx`, `package.json`, `DashboardPage.tsx`, `TeacherDrawer.tsx`, `index.ts`, `api.ts`, `SchedulingModal.tsx`, `BillingPage.tsx`, `student.ts`, `cn`, `router.tsx`, `lucide-react`, `cn.ts`, `StudentDrawer.tsx`, `BillingSummaryCard.tsx`, `ClassQuickCreate.tsx`, `ClassDetail.tsx`, `ClassGrid.tsx`, `providers.tsx`, `FinanceBreakdown.tsx`, `uiStore.ts`, `ProfileCreator.tsx`, `NotificationBell.tsx`, `PaymentHistoryList.tsx`, `GlobalSearch.tsx`, `StudentAttendanceCalendar.tsx`, `ClassesPage.tsx`, `ErrorBoundary.tsx`, `Avatar.tsx`, `DayPicker.tsx`, `TimePicker.tsx`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `react` connect `react-i18next` to `formatters.ts`, `BillingConfig.tsx`, `SessionMenu.tsx`, `package.json`, `DashboardPage.tsx`, `TeacherDrawer.tsx`, `api.ts`, `SchedulingModal.tsx`, `BillingPage.tsx`, `student.ts`, `cn`, `router.tsx`, `lucide-react`, `cn.ts`, `StudentDrawer.tsx`, `ClassQuickCreate.tsx`, `ClassDetail.tsx`, `ClassGrid.tsx`, `providers.tsx`, `FinanceBreakdown.tsx`, `uiStore.ts`, `ProfileCreator.tsx`, `NotificationBell.tsx`, `GlobalSearch.tsx`, `StudentAttendanceCalendar.tsx`, `ClassesPage.tsx`, `ErrorBoundary.tsx`, `Avatar.tsx`, `DayPicker.tsx`, `TimePicker.tsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _388 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `formatters.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052941176470588235 - nodes in this community are weakly interconnected._
- **Should `BillingConfig.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.053554040895813046 - nodes in this community are weakly interconnected._
- **Should `SessionMenu.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0547945205479452 - nodes in this community are weakly interconnected._