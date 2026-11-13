"""Run golden scenarios through the payroll engine as it is today.

Only `slip` scenarios can run now. For each one the runner builds, on the factory
company: an employee (gender, dates, branch for the state), a submitted Salary
Structure whose earnings are the fixture's monthly amounts and whose deductions are
the demo structure's statutory rows taken verbatim from `gamcs_hr.seed.demo.COMPONENTS`,
an assignment, and any loss-of-pay leave. It then computes the salary slip for the
period and reads the values the checks name (`OUTPUTS`).

When T56 moves the demo structure onto the India payroll app, this adapter is what
changes: point `_deduction_rows` and `OUTPUTS` at the new components, then remove
`pending` marks for the checks that now match (the probe lists them).
"""

from __future__ import annotations

import calendar
from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe.utils import getdate

from gamcs_hr.seed import demo
from gamcs_hr.tests import factories

# fixture component -> (Salary Component, abbreviation)
EARNINGS = {
	"basic": ("Basic", "B"),
	"hra": ("House Rent Allowance", "HRA"),
	"special": ("Special Allowance", "SA"),
}
# statutory deduction rows of the current demo structure (no income tax: no TDS yet)
DEDUCTIONS = ("PF", "ESI", "PT")


def _component_amount(abbr):
	def read(slip):
		rows = [r for r in slip.earnings + slip.deductions if r.abbr == abbr]
		if rows:
			return to_paise(sum(r.amount for r in rows))
		# a structure row whose condition was false: genuinely zero
		return 0

	return read


# expect key -> reader(slip) -> value (paise for money). Keys not listed here are not
# produced by today's engine, so a check that uses them must stay pending.
OUTPUTS = {
	"paid_days": lambda slip: slip.payment_days,
	"gross": lambda slip: to_paise(slip.gross_pay),
	"net": lambda slip: to_paise(slip.net_pay),
	"basic": _component_amount("B"),
	"hra": _component_amount("HRA"),
	"special": _component_amount("SA"),
	"pf_ee": _component_amount("PF"),
	"esi_ee": _component_amount("ESI"),
	"pt": _component_amount("PT"),
}


def to_paise(amount) -> int:
	return int((Decimal(str(amount or 0)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def period_bounds(period: str) -> tuple[str, str]:
	y, m = (int(x) for x in period.split("-"))
	return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


# --------------------------------------------------------------------------- settings


def apply_payroll_settings(settings: dict) -> dict:
	"""Set Payroll Settings for the run; returns the previous values for restore."""
	previous = {k: frappe.db.get_single_value("Payroll Settings", k) for k in settings}
	for k, v in settings.items():
		frappe.db.set_single_value("Payroll Settings", k, v)
	frappe.clear_document_cache("Payroll Settings", "Payroll Settings")
	return previous


# --------------------------------------------------------------------------- slip


def run_slip(scenario: dict, tag: str):
	"""Build everything for one slip scenario and return the computed (unsaved) slip."""
	if scenario.get("revision"):
		raise NotImplementedError("mid-month revisions are not supported by the current engine")
	start, end = period_bounds(scenario["period"])
	employee = _make_employee(scenario["employee"], tag)
	structure = _make_structure(scenario["structure"], tag)
	base = sum(line["monthly"] for line in scenario["structure"]) / 100
	doj = scenario["employee"]["date_of_joining"]
	from_date = max(getdate(factories.FY_START), getdate(doj))
	_assign(employee, structure, base, from_date)
	for d in scenario.get("lop_dates") or ():
		_lop_day(employee, d)

	from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

	slip = make_salary_slip(structure, employee=employee, posting_date=end)
	if str(slip.start_date) != start:
		raise AssertionError(f"slip period starts {slip.start_date}, expected {start}")
	return slip


def read_outputs(slip, keys) -> dict:
	return {k: OUTPUTS[k](slip) for k in keys}


def _make_employee(spec: dict, tag: str) -> str:
	number = f"GOLD-{tag}"
	if frappe.db.exists("Employee", number):
		return number
	branch = next((b for b, (state, *_r) in factories.BRANCHES.items() if state == spec.get("state")), None)
	doc = frappe.get_doc(
		{
			"doctype": "Employee",
			"employee_number": number,
			"first_name": "Golden",
			"last_name": tag,
			"gender": spec["gender"],
			"date_of_birth": spec["date_of_birth"],
			"date_of_joining": spec["date_of_joining"],
			"relieving_date": spec.get("relieving_date"),
			"company": factories.COMPANY,
			"branch": branch,
			"holiday_list": factories.HOLIDAY_LIST,
			"status": "Active",
		}
	)
	doc.insert(set_name=number)
	return number


def _deduction_rows():
	for name, abbr, ctype, formula, condition, _extra in demo.COMPONENTS:
		if ctype == "Deduction" and abbr in DEDUCTIONS:
			row = {"salary_component": name, "abbr": abbr, "amount_based_on_formula": 1, "formula": formula}
			if condition:
				row["condition"] = condition
			yield row


def _make_structure(lines: list[dict], tag: str) -> str:
	name = f"Golden {tag}"
	if frappe.db.get_value("Salary Structure", {"name": name, "docstatus": 1}):
		return name
	demo.ensure_salary_components()
	doc = frappe.get_doc(
		{
			"doctype": "Salary Structure",
			"__newname": name,
			"company": factories.COMPANY,
			"currency": "INR",
			"payroll_frequency": "Monthly",
			"is_active": "Yes",
		}
	)
	for line in lines:
		component, abbr = EARNINGS[line["component"]]
		doc.append("earnings", {"salary_component": component, "abbr": abbr, "amount": line["monthly"] / 100})
	for row in _deduction_rows():
		doc.append("deductions", row)
	doc.insert(set_name=name)
	doc.submit()
	return name


def _assign(employee: str, structure: str, base: float, from_date):
	ssa = frappe.get_doc(
		{
			"doctype": "Salary Structure Assignment",
			"employee": employee,
			"salary_structure": structure,
			"company": factories.COMPANY,
			"currency": "INR",
			"from_date": from_date,
			"base": base,
			"variable": 0,
			"payroll_payable_account": frappe.db.get_value(
				"Company", factories.COMPANY, "default_payroll_payable_account"
			),
		}
	)
	ssa.insert()
	ssa.submit()


def _lop_day(employee: str, date: str):
	la = frappe.get_doc(
		{
			"doctype": "Leave Application",
			"employee": employee,
			"leave_type": "Leave Without Pay",
			"from_date": date,
			"to_date": date,
			"company": factories.COMPANY,
			"status": "Approved",
			"leave_approver": "Administrator",
		}
	)
	la.flags.ignore_validate = False
	la.insert(ignore_permissions=True)
	la.submit()


# kind -> callable(scenario, tag) returning a computed result `read_outputs` understands
EXECUTORS = {"slip": run_slip}
