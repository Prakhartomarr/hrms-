"""Load order of gamcs_hr feature modules.

Every module that ships a `hooks_part.py` or a `setup.py` must be listed here.
The order decides:

- the order in which hook values are merged into `gamcs_hr/hooks.py`, so for
  example `doc_events` handlers from `org` run before those from `leave`;
- the order in which each module's custom fields and property setters are synced
  by the setup registry (after_install / after_migrate).

Entries are dotted package paths relative to `gamcs_hr`. Entries whose package does
not exist yet are skipped, so the list is written once, up front, in build-queue
dependency order, and tasks only add their own folder. That keeps this file out of
merge conflicts. Add a new entry only for a module the queue does not list yet, and
put it after everything it depends on.

`gamcs_hr/tests/test_hooks_merge.py` fails if a module with a `hooks_part.py` or
`setup.py` is missing from this list.
"""

MODULES: tuple[str, ...] = (
	# wave 0: shared helpers
	"common",
	# wave 1: platform core
	"org",
	"org.job_history",
	"policy",
	"policy.materialise",
	"permissions",
	"audit",
	"packs",
	# wave 2: approvals and inbox
	"approvals.route",
	"approvals.runtime",
	"inbox",
	"approvals.tat",
	"approvals.actions",
	"approvals.cancel",
	"notify",
	"inbox.ess_lock",
	# wave 3: leave
	"leave",
	"leave.limits",
	"leave.sandwich",
	"leave.balance",
	"leave.credit",
	"leave.year_end",
	"leave.short_leave",
	"leave.donation",
	"leave.comp_off",
	"leave.report",
	"migration.legacy",
	# wave 3: attendance and time
	"attendance.weekly_off",
	"attendance.checkin",
	"attendance.shift",
	"attendance.roster",
	"attendance.requests",
	"attendance.penalty",
	"attendance.cycle",
	"attendance.cycle.rules",
	"attendance.lock",
	"attendance.biometric",
	"attendance.overtime",
	"attendance.report",
	"timesheet",
	"timesheet.approval",
	"timesheet.report",
	# wave 3: home, communication, people
	"comms",
	"comms.handbook",
	"people",
	# wave 4: payroll and statutory
	"payroll.components",
	"statutory.pf",
	"statutory.esi",
	"statutory.pt_lwf",
	"payroll.pay_group",
	"payroll.structure",
	"payroll.run",
	"payroll.run.release",
	"payroll.perf",
	"payroll.adjustments",
	"statutory.tds",
	"statutory.tds.perquisites",
	"statutory.forms",
	"statutory.challans",
	"statutory.returns",
	"payroll.bank_files",
	"payroll.accounting",
	"statutory.gratuity_bonus",
	"payroll.loans",
	"payroll.fnf",
	"payroll.report",
)
