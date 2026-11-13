"""Hooks of the `audit` module. Literals only: this file is imported by hooks.py.

`audit_trail_doctypes` registers these doctypes with Frappe's audit trail (compare
amended versions) and with india_compliance's audit-trail lock, which stops anyone
switching their change tracking off once the audit trail is enabled in Accounts
Settings. `gamcs_hr/audit/setup.py` turns `track_changes` on for the same list.
"""

audit_trail_doctypes = [
	# people and organisation
	"Employee",
	"Branch",
	"Department",
	"Designation",
	"Employee Grade",
	"Employee Promotion",
	"Employee Transfer",
	"Employee Separation",
	"Job Offer",
	# calendars, leave and attendance
	"Holiday List",
	"Holiday List Assignment",
	"Leave Type",
	"Leave Policy",
	"Leave Policy Assignment",
	"Leave Allocation",
	"Leave Adjustment",
	"Leave Application",
	"Leave Block List",
	"Leave Encashment",
	"Compensatory Leave Request",
	"Attendance",
	"Attendance Request",
	"Shift Type",
	"Shift Assignment",
	"Shift Schedule",
	"Overtime Type",
	"Overtime Slip",
	"HR Settings",
	# pay
	"Salary Component",
	"Salary Structure",
	"Salary Structure Assignment",
	"Salary Slip",
	"Salary Withholding",
	"Payroll Entry",
	"Payroll Settings",
	"Additional Salary",
	"Arrear",
	"Payroll Correction",
	"Employee Incentive",
	"Retention Bonus",
	"Income Tax Slab",
	"Employee Tax Exemption Declaration",
	"Employee Tax Exemption Proof Submission",
	"Gratuity",
	"Gratuity Rule",
	"Full and Final Statement",
	"Expense Claim",
	"Employee Advance",
	# gamcs_hr rule data
	"Statutory Pack",
	"Policy Version",
]
