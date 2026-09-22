# VINTA SCHOOL OS — CLAUDE BUILD PLAN
## Frontend only. Backend frozen. New UI stays.

### 0. PURPOSE ANCHOR — READ BEFORE EVERY TASK
You are building a CRM for Algerian private academies (Les Cours + Languages).
- A `Classroom` = physical room only. Zero billing logic.
- A `CourseGroup` (Class) = teacher + subject + level + group (e.g. Ahmed — Math 1er Lycée Group A). ALL billing lives here.
- A `ScheduledSession` = one date/time where a Group meets in a Classroom.
- Money: `CREDIT_BASED` (Les Cours: pay N credits) OR `TIME_BASED` (Languages: pay for time access, currently LOCKED to Coming Soon).
- Currency DZD as integers. Every money action is PIN-verified.
- Current new UI is GOOD. Do not restyle from scratch. Work upon it. Adapt to tokens only.

### GLOBAL HARD RULES
1. **DO NOT TOUCH BACKEND.** `E:\Vinta OS test 3\Backend\vinta-academy-backend` — 55 endpoints working. Frontend only: `E:\Vinta OS test 3\Frontend`.
2. **NO new backend routes, NO migration edits, NO model edits.** Reuse existing `GET /classes/:id/students`, `POST /classes/:id/enroll`, attendance, subscription endpoints. If endpoint missing, filter frontend-side.
3. **UI source of truth in order:**
   1. Current new UI in Frontend (keep layout)
   2. `main-program-mockup-V5.1-FIXED.html` (pixel reference)
   3. `vinta_school_os_dev_reference.html` (tokens: --gold/--emerald, Space Grotesk headings + Inter body, squircle, glass-panel + diagonal sheen, light/dark)
4. **DELETED — never re-add:**
   - `allow_rollover` / Toggle 3 — REMOVED. Unused credits expire.
   - `countGapSessions` / Toggle 2 — DELETED. Replaced by debt-first rule below.
   - `restoreCreditsOnCancellation` / Toggle 5 — DELETED. Cancel only from SCHEDULED so nothing to restore.
5. **Execution:** Do ONE TASK, then STOP and wait for user to say `next`. Do not batch tasks. Do not guess. If data missing show `Not set` / `Retry`, never silent `catch { set([]) }`.

---

### TASK OVERVIEW
- T1: Session lifecycle lock
- T2: False-Until-True attendance
- T3: Hamburger (instance-only)
- T4: Auto-link guest swap
- T5: Credits + Debt + N + Toggle 1
- T6: Free session (payout 0)
- T7: Void + Compensate + Cancel lock
- T8: Scheduling Window (Weekly vs Temporary) from ClassSchedulingCalendar.jsx
- T9: Teacher email + Student/Class wiring fixes
- T10: Settings Billing Rules final list
- T11: Verification

---

### T1 — SESSION LIFECYCLE LOCK
**Goal:** No attendance/billing before Start.
States: `SCHEDULED -> IN_PROGRESS -> CONDUCTED`, `SCHEDULED -> CANCELLED`. `CANCELLED` NEVER from `IN_PROGRESS`.
- Toast at `scheduledStartTime`: `🔔 [Group] scheduled to start NOW [Start Class] [Snooze 5 min]`
- Manual early start via hamburger `Start Class Now`. Record `actualStartTime`.
- [Start Class] greys + disabled on first click. `initializeAttendance` idempotent + `UNIQUE(studentId, sessionId)`.
- Toast at `scheduledEndTime`: `Has this class finished? [Yes, Class Done] [No, Running Late +10min]`. Yes (PIN) -> CONDUCTED + payout calc + freeze attendance.
**Accept:** Cannot open attendance grid while SCHEDULED. Double-click Start creates 1 row per student.

### T2 — FALSE UNTIL TRUE ATTENDANCE
**Goal:** Paper grid replica.
- On Start: bulk-create all enrolled as `ABSENT (− red) [+ Present]`.
- Click flips to `PRESENT (+ green) [− Absent]` for undo.
- Bottom search bar `+ Guest`: search any student, adds row `+ blue ⚡ Swap [Remove]`.
- No silent catch. On 500 show toast + Retry + `No students enrolled yet [Add Students]`.
**Accept:** Start with 6 enrolled = 6 red rows. Toggle 1, others untouched.

### T3 — HAMBURGER ☰ (INSTANCE ONLY)
**Goal:** Single entry point, no random icons.
Add ☰ top-right of every session card/row. Contextual:
- If SCHEDULED: Start Class, Edit THIS instance, Reschedule, Cancel Class, Teacher Absent, Mark NEXT as Free, Show Finances, View Log
- If IN_PROGRESS: Extend +30, End Class, Edit THIS instance, Mark NEXT as Free, Void Live Session [Owner PIN], Add Compensatory Session, Show Finances, View Log
- If CONDUCTED/CANCELLED: Show Finances, View Log (read-only)
**Rule:** Hamburger Edit/Reschedule/Room = THIS session only. Never touches series, price, N, template. Series edits only in Classes page.
**Accept:** Reschedule live class disabled. Cancel/Teacher Absent hidden when IN_PROGRESS.

### T4 — AUTO-LINK GUEST SWAP (NO BRAINCELLS)
**Goal:** 1 visit = 1 credit, no modal.
On Guest check-in:if target.teacherId == student's teacherId
AND exists ABSENT same teacher within 7 days (swapTime - originalStart <= 7d)
AND same active cycle AND original payout != PAID
-> AUTO-LINK
- Flip original `ABSENT -> PRESENT_VIA_SWAP (linkedSessionId=swapId, correctedBy, correctedAt)`
- Create swap side `PRESENT + isGroupSwap=true + billingSuppressed=true + linkedSessionId=originalId`
- Decrement 1 credit TOTAL.
- Toast only: `Linked to Mon 14:00 — [Undo]`. Undo unlinks.
- If 2+ candidates: auto-pick OLDEST FIFO.
- If different teacher: never link = plain Extra, bills normally.
- If none in 7 days: plain Extra. Old ABSENT locks per Toggle 1.
- `linked absence NEVER creates makeup token` (anti double-dip).
- TIME_BASED: disable linking entirely. Guest = PRESENT + swap flag, zero billing. `// TODO Coming Soon`.
**Accept:** Mon ABSENT + Wed guest same teacher = Mon flips to via-swap, Wed suppressed, 1 credit total.

### T5 — CREDITS + DEBT-FIRST + N CONFIGURABLE
**Goal:** N-session blocks, debt real.
- `CourseGroup.creditsPerCycle: int 1-20` (4 standard, 8 = 2000Da for 8 sessions). No float. Snapshot to `Subscription.totalCredits` at payment.
- PRESENT in own group decrements immediately.
- ABSENT handling per Toggle 1 `absenceConsumesCredit` (default true): if true, ABSENT consumes 1 at End Class finalization unless auto-linked in window; if false, ABSENT never consumes.
- Front-desk CAN check-in with no subscription -> `unpaid=true` debt.
- On Record Payment: `remaining = N - unpaidDebtCount` (oldest first). Ex: debt 4, N=4, pays once -> 0 DEPLETED, must pay 2nd month.
- Toggles effective next Monday 00:00 (week-versioning, no retroactive).
**Accept:** Debt 4 + pay N=4 = 0 remaining. Debt 4 + pay N=8 = 4 remaining.

### T6 — FREE SESSION (TEACHER PAYS)
**Goal:** Teacher says next time free.
- `CourseGroup.pendingFreeSession: boolean`. Hamburger sets true. Stays until NEXT session CREATED (regular Sunday OR ad-hoc Monday extra). That session gets `isFreeSession=true`, then auto-clear to false.
- If `isFreeSession`: revenue=0, `teacherCutDa=0` for ALL commission types, no credit decrement.
- Toggle 6 `freeSessionAutoPresent` (default true): if true auto-mark PRESENT, skip tracking; if false track normally for records.
**Accept:** Free session shows Finances 0/0/0, no credits moved.

### T7 — VOID + COMPENSATE + CANCEL LOCK
**Goal:** Live abort without fake math.
- Cancel/Teacher Absent only from SCHEDULED -> CANCELLED, zero credit impact by construction.
- If IN_PROGRESS needs abort: `Void Live Session [Owner PIN]` -> `CANCELLED(reason=LIVE_VOID)`, restore ONLY this session's credits, mark rows VOIDED. OR `End Class` normally = full pay per formula. No pro-rata.
- `Add Compensatory Session`: creates new SCHEDULED for whole group (pick date/time/room).
**Accept:** Void restores only that session. Cancel hidden when live.

### T8 — SCHEDULING WINDOW (WEEKLY vs TEMPORARY)
**Goal:** Replace drag-drop creation. Calendar stays view-only. Use `ClassSchedulingCalendar.jsx` as blueprint, restyle to gold/emerald + squircle + glass, keep current UI.
- Entry: `+ New Class` button (toolbar + empty cell click) -> modal asks first: `[🔁 Weekly] [🕐 Temporary]`
- Weekly form: Group, Teacher auto, Day, Start-End, Room, Starts from, Ends (Never / After N sessions / On date). Creates `ScheduleDefinition type=WEEKLY` + rolling 8 weeks ScheduledSessions.
- Temporary form: Link to Group (optional, billing only), Teacher, Date, Start-End, Room, Reason (Makeup/Trial/Extra/Reschedule). Creates exactly 1 ScheduledSession.
- Conflict (room overlap OR teacher overlap vs non-CANCELLED) BLOCKS submit inline, not warning.
- `ScheduledSession.scheduleDefinitionId` traces origin.
- Calendar badges: `🔁` Weekly (emerald), `🕐 + reason` Temporary (gold).
- Edit scope for WEEKLY: `This session only / This and following (split definition) / All series (regen future non-CONDUCTED)`. Temporary = edit directly, no prompt.
- Cancel one WEEKLY occurrence cancels that session only, definition untouched.
**Accept:** Cannot double-book room/teacher. Temporary never spawns series.

### T9 — TEACHER EMAIL + WIRING FIXES (THE BUG YOU SAW)
**Goal:** No more — — —.
- Teacher form add `email` required, unique per academy, validated. Show name+email+phone on class header.
- ClassDetail: `0 slots` fix -> fetch from `/sessions or /schedules`, show `Mon/Wed/Fri 09:00-10:30 + count`. Row shows billing per THIS group: Paid / DEPLETED / OVERDUE / debt N, not just `active`.
- StudentDetail: Billing summary wire Plan=`subject-level (Credit N)`, Sessions/month=`creditsPerCycle`, Renews on=`cycleDeadline`, Status=`subscription.status`. Calendar dots: PRESENT emerald, VIA_SWAP blue ⚡, ABSENT red, SCHEDULED gold-outline.
- Add Students modal: fetch all, filter out enrolledIds frontend, searchable list + checkbox + `X available`, Confirm -> POST enroll each -> refetch students, update `6/15->N/15` no reload. Enrolled never appear in available.
**Accept:** Yacine profile has 0 `—`. Add Students shows unenrolled only.

### T10 — SETTINGS BILLING RULES (FINAL LIST)
Owner PIN only. Final toggles only (do not re-add deleted):
- [x] `absenceConsumesCredit` default true — Charge for missed sessions?
- [ ] `allowMakeups` default false
- [x] `freeSessionAutoPresent` default true
- [ ] `shareCreditsAcrossGroups` default false
- [x] `earlyPaymentOnExtraSessions` default true
- `swapLinkWindow`: `SAME_DAY` (default, same calendar day Algiers) vs `OPEN` (7-day rolling, closes on payout PAID, hard cap 30d)
**Accept:** Changing toggle applies next Monday, not retroactively.

### T11 — VERIFICATION
Playwright: seed, login, Math-CM2 shows 6 rows, Add Students search works, Yacine billing has 0 dashes, Start->Present->End->Payout=correct, Guest same-teacher auto-links, Free=0 pay, Void restores, Weekly+Temporary create with conflict block. Side-by-side vs mockup, report diffs.