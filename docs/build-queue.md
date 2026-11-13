# Build queue

The ordered list of work for gamcs_hr. Feature specs are kept outside the repo. Each task names the folders it **owns** (only that task writes there), what it **depends** on, and its **lane**. Tasks in different lanes within the same wave can run at the same time. How modules, hooks, customisations, validators and routes fit together: `docs/conventions.md`.

Every task ends with tests (IntegrationTestCase or UnitTestCase on the server, Vitest for UI units) and an ADR in `docs/decisions/` for any choice we made ourselves. Money and statutory tasks assert exact rupee values.

**Lanes**

| Lane | Area | Main folders |
| --- | --- | --- |
| A | Platform and approvals | `org/`, `policy/`, `permissions/`, `audit/`, `packs/`, `approvals/`, `inbox/`, `notify/` |
| L | Leave | `leave/` |
| T | Attendance and time | `attendance/`, `timesheet/` |
| H | Home, communication, people | `comms/`, `people/` |
| F | Frontend | `frontend/src/pages/<area>/` |
| P | Payroll and statutory | `payroll/`, `statutory/` |
| Q | QA and data | `tests/`, `migration/`, `scripts/` |

Status: `done`, `in progress`, or blank (not started). All paths are under `gamcs_hr/` unless they start with `frontend/`, `tests/` or `docs/`.

## Wave 0: foundation

| ID | Task | Owns | Depends | Lane | Status |
| --- | --- | --- | --- | --- | --- |
| T01 | Framework: hooks merger (`hooks_part.py` per module, order in `modules_order.py`), per-module setup registry for custom fields and property setters, validator pipeline for doctype extensions, CI on a pinned bench in Docker, conventions doc, this queue. India payroll app evaluated and pinned (deferred to T56, ADR 0002) | `hooks.py`, `modules_order.py`, `framework/`, `common/`, `.github/`, `docker/`, `docs/conventions.md` | | A | done |
| T02 | Site bootstrap for dev and tests: company, branches with states, departments, grades, about 30 employees in a reporting tree, holiday list, leave types; reusable test factories | `tests/factories.py`, `scripts/bootstrap.py` (both under `gamcs_hr/`) | T01 | Q | done |
| T03 | Employee app shell at `/work`: Vue SPA, routes auto-registered from `pages/**/route.ts`, phone bottom bar and desktop nav, header with search and notifications, design tokens, formatting helpers (₹ with lakh grouping, dates, durations like `7h 30m`), page actions with one primary button, success and empty states, PWA manifest and service worker shell | `frontend/` (except `pages/*`), `www/work.py` | T01 | F | done |

## Wave 1: platform core

| ID | Task | Owns | Depends | Lane | Status |
| --- | --- | --- | --- | --- | --- |
| T04 | Organisation masters: Business Unit doctype; Branch fields (state, city class, head, IP allowlist, PT and LWF registration); department head; Employee fields (functional manager, Aadhaar, ESIC dispensary, PF joining date, PAN-Aadhaar link status, bank verified, international worker; reuse fields India Compliance already adds where they exist); nominee and family member child tables; masking of sensitive fields | `org/` | T01 | A | |
| T05 | Job history snapshots with validity dates, kept current from Employee, promotion, transfer and salary structure changes; helpers for the manager chain on a date and the unit head | `org/job_history/` | T04 | A | |
| T06 | Policy engine: applicability rules and per-employee overrides, `resolve(employee, kind, date)` that also explains its answer; table-driven tests | `policy/` | T04 | A | |
| T07 | Policy materialiser: derive leave policy, holiday list, shift and approver assignments from the rules, on Employee change and nightly; stamp the source of each derived record | `policy/materialise/` | T06 | A | |
| T08 | Data-scope permissions: scope rule doctype, generic query conditions and `has_permission` (team scope via the Employee tree), extra permission types (approve, export sensitive, raise on behalf, override), role templates; permission matrix tests | `permissions/` | T04 | A | |
| T09 | Audit: change tracking on key doctypes, audit trail registration, field change log report with masking | `audit/` | T01 | A | done |
| T10 | Versioned statutory packs and policy versions with a draft, verified, published workflow; lookups by kind, code and date | `packs/` | T01 | A | done |

T05, T06 and T08 can run in parallel after T04. T09 and T10 can run alongside T04.

## Wave 2: approvals and inbox

| ID | Task | Owns | Depends | Lane | Status |
| --- | --- | --- | --- | --- | --- |
| T11 | Approval route doctype (levels, approver rules, any/all mode, notify-only steps, conditions with a safe evaluator, turnaround settings, versions) and its resolver | `approvals/route/` | T05, T06 | A | |
| T12 | Approval runtime: per-document approval levels and current approvers, generated workflows per doctype, any/all handling, skip reasons; Leave Application wired first | `approvals/runtime/` | T11 | A | |
| T13 | Task store on ToDo: open and close tasks as levels change, priority score, buckets, claim, archive, for-information items | `inbox/` | T12 | A | |
| T14 | Turnaround clock on working days (approver's holidays and shift), reminders with quiet hours, escalation, auto-approve or auto-reject with re-validation, HR fallback | `approvals/tat/` | T12 | A | |
| T15 | Approval actions API: approve, reject, send back, delegate, add approver, withdraw, override, reassign, bulk (one job per item with a summary); out-of-office delegation | `approvals/actions/` | T12 | A | |
| T16 | Cancellation after approval (cancel requested, then cancelled through its own route) | `approvals/cancel/` | T15 | A | |
| T17 | Notifications: per-user preferences, default event and channel matrix, web push, grouping, email templates, morning digest with signed action links | `notify/` | T13 | A | |
| T18 | Inbox API (sections, card view models per doctype, counts) and the Vue inbox (to do, for information, my requests, team, tracker; inline and bulk actions) | `inbox/api.py`, `frontend/src/pages/inbox/` | T13, T15, T03 | F | |
| T19 | Self-service lock for pending mandatory tasks, and scheduled recurring tasks with module callbacks | `inbox/ess_lock/` | T13 | A | |

After T12: T13, T14 and T15 in parallel; then T16, T17 and T19; T18 after T15.

## Wave 3: leave, attendance, timesheets, home, people

| ID | Task | Owns | Depends | Lane | Status |
| --- | --- | --- | --- | --- | --- |
| T20 | Leave Application extension with the validator pipeline, soft violations, and a preview API (days, sandwiched days, balance after, LOP split, teammates away) | `leave/overrides/`, `leave/api.py` | T12 | L | |
| T21 | Leave type rules as validators: eligibility (gender, status, ESI, age, waiting period), minimum notice, documents, monthly and per-period caps, clubbing, minimum balance, blocked dates | `leave/validators/`, `leave/setup.py` | T20 | L | |
| T22 | Back-dating and future-dating limits per role (shared with attendance), raised-by and raised-as, HR-raised auto-approval, private requests | `leave/limits/`, `common/request_limits.py` | T20 | L | |
| T23 | Sandwich rules: all variants, chained requests, reversal on cancel; table tests | `leave/sandwich/` | T20 | L | |
| T24 | Negative balance limit, LOP split, reservation against the next cycle | `leave/balance/` | T20 | L | |
| T25 | Credit rules: credit by days worked, tenure slabs, proration for leavers, statutory earned leave preset | `leave/credit/` | T10 | L | |
| T26 | Year end: carry forward, encash and lapse order; alerts; employee encashment requests with limits | `leave/year_end/` | T25 | L | |
| T27 | Short leave policy and requests; leave donation | `leave/short_leave/`, `leave/donation/` | T12 | L | |
| T28 | Comp-off: minimum hours, expiry per credit, cap, either comp-off or overtime, holiday on a weekly off | `leave/comp_off/` | T20 | L | |
| T29 | Leave reports: utilisation, liability in ₹, sandwich hits | `leave/report/` | T23 | L | |
| T30 | Vue leave: apply with live preview and success state, balances, my requests, holidays, optional holiday choice, team calendar | `frontend/src/pages/leave/` | T20, T03 | F | |
| T31 | Migration from the previous HR system: directory, opening leave balances, holidays; dry-run report | `migration/legacy/` | T04 | Q | |
| T32 | Weekly-off policy doctype, generated into holiday lists through the materialiser, publish notice | `attendance/weekly_off/` | T07 | T | |
| T33 | Check-in extensions: IP allowlist, selfie, accuracy, polygons, multiple sites, outside-fence punches as requests, temporary sites; idempotent punch API with offline and late-sync flags | `attendance/checkin/` | T04 | T | |
| T34 | Shift type extensions (flexible core hours, split shifts, breaks, half-day minutes, hard stop, shift allowance) and the attendance computation for them | `attendance/shift/` | T01 | T | |
| T35 | Auto-shift from first punch; roster API (copy week, publish, weekly-off cells); weekly-off swap requests | `attendance/roster/` | T34 | T | |
| T36 | Attendance corrections (missed punch), on-duty with times and project, work from home; approvals through T12; missed-punch status and next-morning nudge | `attendance/requests/` | T12, T33 | T | |
| T37 | Late and early rules and penalties (by count or duration, deduction priority, waiver) | `attendance/penalty/` | T10 | T | |
| T38a | Attendance cycle per pay group: readiness checks, chunked processing jobs with progress | `attendance/cycle/` | T07 | T | |
| T38b | Cycle rules: final day status, absence sandwich and absconding task, weekly-off and holiday entitlement, penalties, paid days, LOP through unpaid leave, optimistic mode | `attendance/cycle/rules/` | T38a, T37 | T | |
| T39 | Cycle lock and unlock across leave, attendance, requests, check-ins and shift assignments; changes after lock become draft payroll corrections inside the arrear window | `attendance/lock/` | T38a | T | |
| T40 | Biometric devices: evaluate the open-source ZKTeco connector apps on v16, device doctype with heartbeat and silence alerts, punch file import presets | `attendance/biometric/` | T33 | T | |
| T41 | Overtime: minimum minutes, rounding, slabs, breaks, weekly and quarterly caps, pre-approval | `attendance/overtime/` | T34 | T | |
| T42 | Attendance reports: daily muster, live presence, absence alerts, late and early, overtime trend, shift coverage, habit alerts | `attendance/report/` | T38b | T | |
| T43 | Vue attendance for employees: check-in sheet (location, selfie, offline queue, confirmation), calendar and day detail with reasons, request forms | `frontend/src/pages/attendance/` | T33, T36, T03 | F | |
| T44 | Vue attendance for managers and HR: team today, team attendance, roster editor, cycle processing screen with readiness, progress, review and lock | `frontend/src/pages/team/`, `frontend/src/pages/attendance-cycle/` | T35, T38b | F | |
| T45 | Timesheets: project membership dates and approval mode, weekly periods, validations | `timesheet/` | T01 | T | |
| T46 | Timesheet approvals grouped by approver, line-level rejection, freeze and unfreeze, reminders and auto-submit, overtime candidates | `timesheet/approval/` | T45, T12 | T | |
| T47 | Vue timesheet: weekly grid, day view, timer, copy last week, approver grid | `frontend/src/pages/timesheet/` | T45, T03 | F | |
| T48 | Timesheet reports: missing, turnaround, logged against attended, budget burn | `timesheet/report/` | T46 | T | |
| T49 | Announcements (audience from the policy resolver, scheduling, recurrence, acknowledgement, tracking), feed posts with reactions and comments, celebration and new-joiner posts | `comms/` | T06 | H | |
| T50 | Policy handbook with versions and acknowledgement tasks | `comms/handbook/` | T13 | H | |
| T51 | Vue home: greeting and check-in, needs attention, inbox snapshot, balances, who is away, celebrations, feed, holidays, team card; announcement and handbook pages | `frontend/src/pages/home/`, `frontend/src/pages/comms/` | T49, T18 | F | |
| T52 | Vue people: directory, org chart, my profile; profile change requests with approval | `frontend/src/pages/people/`, `people/` | T08, T12 | H | |
| T53 | Vue manager extras: delegation, raise on behalf, notification settings | `frontend/src/pages/me/` | T15, T17 | F | |
| T54 | End-to-end tests for the main flows, punch reliability, permission matrix run | `tests/e2e/` | T30, T43, T47, T51 | Q | |

Exit for waves 1 to 3: GAMCS runs a full month on it in parallel with its current system.

## Wave 4: payroll and statutory

| ID | Task | Owns | Depends | Lane | Status |
| --- | --- | --- | --- | --- | --- |
| T55 | Golden test harness: named payroll scenarios asserted to the paisa; CI gate on upstream version bumps | `tests/golden/` | T02 | Q | |
| T56 | Adopt the India payroll app (pinned in ADR 0002): enable it, move the demo structure onto it, statutory flags and exclusion heads on salary components, wage definition helper | `payroll/components/` | T10, T55 | P | |
| T57 | PF from packs: rates, ceilings, pension cut-off at 58, international workers | `statutory/pf/` | T56 | P | |
| T58 | ESI from packs: contribution periods, wage definition, low-wage exemption, rounding, PwD ceiling | `statutory/esi/` | T56 | P | |
| T59 | PT and LWF packs per state, overrides, PT register | `statutory/pt_lwf/` | T56 | P | |
| T60 | Pay groups and payroll calendars; filling payroll entries from them | `payroll/pay_group/` | T06 | P | |
| T61 | CTC balancer (top-down, with the PF and ESI circularity), basic-share and minimum-wage checks, structure preview API | `payroll/structure/` | T56 | P | |
| T62 | Payroll run stepper over Payroll Entry with undo, and pre-run checks | `payroll/run/` | T60, T39 | P | |
| T63 | Maker-checker verification, OTP-gated release, publishing separate from submission, payslip passwords and distribution | `payroll/run/release/` | T62 | P | |
| T64 | Chunked salary slip creation and a 5,000-employee load test | `payroll/perf/` | T62 | P | |
| T65 | Adjustments and arrears: editor, arrears from back-dated structure changes, attendance arrears, off-cycle payments | `payroll/adjustments/` | T62 | P | |
| T66 | Income tax under the new Act, part 1: exemption categories, employer NPS limits, HRA city class, landlord PAN | `statutory/tds/` | T56 | P | |
| T67 | Income tax part 2: perquisites, LTA blocks, previous-employer income, no-PAN rule | `statutory/tds/perquisites/` | T66 | P | |
| T68 | Declaration and proof windows with lock; employee tax forms (print) and a data export fallback for the annual certificate | `statutory/forms/` | T66 | P | |
| T69 | Statutory challans, compliance calendar, challan dashboard | `statutory/challans/` | T10 | P | |
| T70 | PF arrears return file, ESIC upload layout, PF return format checks | `statutory/returns/` | T57, T58 | P | |
| T71 | Bank transfer file engine with formats for the main Indian banks | `payroll/bank_files/` | T63 | P | |
| T72 | Accounting export to Tally (XML journal vouchers) | `payroll/accounting/` | T63 | P | |
| T73 | Gratuity (rules, ceiling, provision), bonus pack and register | `statutory/gratuity_bonus/` | T56 | P | |
| T74 | Employee loans (EMIs as additional salary, foreclosure, perquisite value) | `payroll/loans/` | T60 | P | |
| T75 | Full and final settlement (notice recovery, encashment exemption, tax) and its Vue wizard | `payroll/fnf/`, `frontend/src/pages/fnf/` | T73, T74 | P | |
| T76a-c | Payroll reports in three groups: registers; variance and year to date; liabilities and loans | `payroll/report/<group>/` | T63 | P | |
| T77 | Vue payroll admin: run workspace, pre-run checks, inputs, verify, release, publish | `frontend/src/pages/payroll/` | T63 | F | |
| T78 | Vue employee pay: payslips, CTC, tax sheet, declarations with proofs, tax form downloads, loans | `frontend/src/pages/pay/` | T68, T74 | F | |

After T56: T57, T58, T59, T61, T66, T69 and T73 in parallel. T64 and T65 after T62; T71 and T72 after T63. Exit: two parallel payroll months match the current system to the paisa.

## Wave 5 and later (grouped; each item is a 2 to 3 hour task, IDs assigned when the wave starts)

| Group | Items |
| --- | --- |
| Employee lifecycle | pre-joining portal (link, profile, documents, offer acceptance); candidate to employee with offer CTC; onboarding tasks, escalation, buddy, bulk; probation reviews; resignation, notice and buyout, clearance, last-day actions; scheduled transfers and promotions with salary revision; letter templates with bulk release and protected PDFs; e-acceptance links; document vault; lifecycle reports |
| Recruitment | requisitions with approval and budget check; opening visibility and recruiter turnaround; pipeline stages and alerts; interview links and calendar invites; offer breakup and acceptance; funnel reports; agency portal |
| Performance | key results and goals; check-ins; one-to-ones and continuous feedback; 360 reviews with external raters; review stages; calibration and distribution; nine-box; improvement plans; increment cycle with budgets; dashboards |
| Engagement | surveys; mood check; recognition and badges; points and budgets; fundraisers; engagement dashboard |
| Expenses | expense policies (limits, per diem, windows); mileage; duplicate and anomaly checks; payout through payroll; reports; Vue claim screens |
| HR helpdesk | HR tickets on Issue (categories, forms), escalation, canned replies, satisfaction, knowledge base suggestions, Vue ticket screens |
| Assets | light HR asset tracking with requests, temporary allocation, onboarding and exit hooks, QR scan page |
| Assistant | action registry over MCP and whitelisted methods; confirmation flow; policy questions; pre-payroll checks; resume and receipt parsing; letter drafting |
| Chat bots | WhatsApp (identity binding, commands, approval cards, payslips); Microsoft Teams bot |
| Integrations and API | public API layer; signed webhooks; directory sync; e-sign and DigiLocker; job boards; background verification |
| Analytics | role dashboards; joined report sets; salary analytics; scheduled report packs |
| Go-to-market | implementation kit with validators; parallel-run reconciliation; attendance kiosk page; work plans |
