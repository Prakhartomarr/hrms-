"""Reusable test factories: a small GAMCS-like organisation with deterministic names.

Use them from a test class:

	from gamcs_hr.tests.factories import OrgTestCase

	class TestSomething(OrgTestCase):
		def test_x(self):
			ceo = self.org.employee("ceo")
			...

or call the pieces directly (`make_company()`, `make_employees()`, ...). Every factory
looks its record up by a fixed name first and only creates what is missing, so calling
it again returns the same records and creates nothing. `make_org(commit=True)` (what
`OrgTestCase` does) persists the baseline on the test site, so after the first run the
whole organisation resolves in a few cheap lookups. Changes a test makes on top of it
are rolled back with the test class as usual.

What you get (see `ORG_CHART` for the full tree):

- company `COMPANY` (India, INR) with branches in four states (`BRANCHES`), each with an
  office Address carrying its state, linked to the company and the branch
- departments, designations and grades L1-L5
- 30 employees: a CEO, five department heads, five line managers and their teams, with
  `reports_to` set; docnames equal their employee numbers (`GTPL-001` ...)
- holiday list `HOLIDAY_LIST` (Sundays + national holidays) with a company-level
  Holiday List Assignment, which hrms v16 needs on top of the company default
- the demo leave types and a simple salary structure `SALARY_STRUCTURE`
  (Basic 50%, HRA 20%, Special 30%, PF, ESI, PT; no income tax)

Only for tests and `gamcs_hr.scripts.bootstrap`. Never import this from app code.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import frappe
from frappe.utils import add_days, getdate

from gamcs_hr.seed import demo

COMPANY = "GAMCS Test Pvt Ltd"
ABBR = "GTPL"
EMAIL_DOMAIN = "gamcs-test.example"
FY_START, FY_END = "2026-04-01", "2027-03-31"
HOLIDAY_LIST = "GTPL India 2026-27"
HOLIDAY_FROM = "2026-01-01"
SALARY_STRUCTURE = "GTPL Monthly"

# branch: (state, city, pincode)
BRANCHES = {
	"Bengaluru": ("Karnataka", "Bengaluru", "560001"),
	"Mumbai": ("Maharashtra", "Mumbai", "400001"),
	"New Delhi": ("Delhi", "New Delhi", "110001"),
	"Chennai": ("Tamil Nadu", "Chennai", "600001"),
}

DEPARTMENTS = ("Management", "Engineering", "Sales", "Operations", "Finance", "Human Resources")

# grade: (description, default monthly base pay)
GRADES = {
	"L1": ("Staff", 25000),
	"L2": ("Senior staff", 45000),
	"L3": ("Manager", 90000),
	"L4": ("Head of department", 180000),
	"L5": ("Executive leadership", 400000),
}

# key, first name, last name, gender, department, designation, grade, branch, reports to (key)
# Parents come before their reports. Numbers follow list order: GTPL-001 is the CEO.
ORG_CHART = (
	("ceo", "Meera", "Krishnan", "Female", "Management", "Chief Executive Officer", "L5", "Bengaluru", None),
	# heads report to the CEO
	("eng.head", "Arjun", "Rao", "Male", "Engineering", "Head of Engineering", "L4", "Bengaluru", "ceo"),
	("sales.head", "Priya", "Mehta", "Female", "Sales", "Head of Sales", "L4", "Mumbai", "ceo"),
	("ops.head", "Karthik", "Iyer", "Male", "Operations", "Head of Operations", "L4", "Chennai", "ceo"),
	("fin.head", "Neha", "Shah", "Female", "Finance", "Head of Finance", "L4", "Mumbai", "ceo"),
	("hr.head", "Rohan", "Kapoor", "Male", "Human Resources", "Head of People", "L4", "New Delhi", "ceo"),
	# line managers report to their head
	(
		"eng.platform.mgr",
		"Divya",
		"Nair",
		"Female",
		"Engineering",
		"Engineering Manager",
		"L3",
		"Bengaluru",
		"eng.head",
	),
	(
		"eng.product.mgr",
		"Siddharth",
		"Menon",
		"Male",
		"Engineering",
		"Engineering Manager",
		"L3",
		"Chennai",
		"eng.head",
	),
	("sales.west.mgr", "Kavya", "Desai", "Female", "Sales", "Sales Manager", "L3", "Mumbai", "sales.head"),
	("sales.north.mgr", "Varun", "Singh", "Male", "Sales", "Sales Manager", "L3", "New Delhi", "sales.head"),
	(
		"ops.mgr",
		"Lakshmi",
		"Pillai",
		"Female",
		"Operations",
		"Operations Manager",
		"L3",
		"Chennai",
		"ops.head",
	),
	# teams
	(
		"eng.platform.1",
		"Aditya",
		"Kulkarni",
		"Male",
		"Engineering",
		"Senior Software Engineer",
		"L2",
		"Bengaluru",
		"eng.platform.mgr",
	),
	(
		"eng.platform.2",
		"Ananya",
		"Hegde",
		"Female",
		"Engineering",
		"Software Engineer",
		"L1",
		"Bengaluru",
		"eng.platform.mgr",
	),
	(
		"eng.platform.3",
		"Ishaan",
		"Bhat",
		"Male",
		"Engineering",
		"Software Engineer",
		"L1",
		"Bengaluru",
		"eng.platform.mgr",
	),
	(
		"eng.platform.4",
		"Sneha",
		"Reddy",
		"Female",
		"Engineering",
		"Software Engineer",
		"L1",
		"Bengaluru",
		"eng.platform.mgr",
	),
	(
		"eng.product.1",
		"Pranav",
		"Naidu",
		"Male",
		"Engineering",
		"Senior Software Engineer",
		"L2",
		"Chennai",
		"eng.product.mgr",
	),
	(
		"eng.product.2",
		"Tanvi",
		"Joshi",
		"Female",
		"Engineering",
		"Software Engineer",
		"L1",
		"Chennai",
		"eng.product.mgr",
	),
	(
		"eng.product.3",
		"Kabir",
		"Gupta",
		"Male",
		"Engineering",
		"Software Engineer",
		"L1",
		"Chennai",
		"eng.product.mgr",
	),
	(
		"eng.product.4",
		"Riya",
		"Agarwal",
		"Female",
		"Engineering",
		"Software Engineer",
		"L1",
		"Chennai",
		"eng.product.mgr",
	),
	("sales.west.1", "Yash", "Patel", "Male", "Sales", "Sales Executive", "L1", "Mumbai", "sales.west.mgr"),
	(
		"sales.west.2",
		"Pooja",
		"Banerjee",
		"Female",
		"Sales",
		"Sales Executive",
		"L1",
		"Mumbai",
		"sales.west.mgr",
	),
	(
		"sales.north.1",
		"Nikhil",
		"Chopra",
		"Male",
		"Sales",
		"Sales Executive",
		"L1",
		"New Delhi",
		"sales.north.mgr",
	),
	(
		"sales.north.2",
		"Simran",
		"Malhotra",
		"Female",
		"Sales",
		"Sales Executive",
		"L1",
		"New Delhi",
		"sales.north.mgr",
	),
	("ops.1", "Harsh", "Verma", "Male", "Operations", "Operations Executive", "L1", "Chennai", "ops.mgr"),
	(
		"ops.2",
		"Swati",
		"Mukherjee",
		"Female",
		"Operations",
		"Operations Executive",
		"L1",
		"Chennai",
		"ops.mgr",
	),
	("ops.3", "Tarun", "Sharma", "Male", "Operations", "Operations Executive", "L1", "Chennai", "ops.mgr"),
	("fin.1", "Aditi", "Rao", "Female", "Finance", "Accountant", "L2", "Mumbai", "fin.head"),
	("fin.2", "Manish", "Shah", "Male", "Finance", "Accountant", "L1", "Mumbai", "fin.head"),
	("hr.1", "Bhavna", "Iyer", "Female", "Human Resources", "HR Executive", "L2", "New Delhi", "hr.head"),
	("hr.2", "Rahul", "Menon", "Male", "Human Resources", "HR Executive", "L1", "New Delhi", "hr.head"),
)

# components from the demo seed used by the test structure (no income tax: no slab needed)
STRUCTURE_COMPONENTS = ("B", "HRA", "SA", "PF", "ESI", "PT")


def employee_number(index: int) -> str:
	"""1-based position in ORG_CHART -> employee number and docname."""
	return f"{ABBR}-{index:03d}"


EMPLOYEE_IDS = {row[0]: employee_number(i) for i, row in enumerate(ORG_CHART, start=1)}


def department_name(department: str) -> str:
	return f"{department} - {ABBR}"


def branch_state(branch: str) -> str:
	return BRANCHES[branch][0]


@dataclass(frozen=True)
class Org:
	company: str
	abbr: str
	branches: dict[str, str]  # branch -> state
	departments: dict[str, str]  # department_name -> Department docname
	designations: tuple[str, ...]
	grades: tuple[str, ...]
	employees: dict[str, str]  # ORG_CHART key -> Employee docname
	holiday_list: str
	leave_types: tuple[str, ...]
	salary_structure: str
	extra: dict = field(default_factory=dict)

	def employee(self, key: str) -> str:
		return self.employees[key]

	def reports_of(self, key: str) -> list[str]:
		"""Direct reports of an ORG_CHART key, as Employee docnames."""
		return [self.employees[k] for k, *_rest, parent in ORG_CHART if parent == key]


# --------------------------------------------------------------------------- company


def make_company(company: str = COMPANY, abbr: str = ABBR) -> str:
	if frappe.flags.in_test:
		# ERPNext's shared test bootstrap creates calendar-year fiscal years on import and
		# refuses to once an Apr-Mar one exists, so let it run before we look for ours.
		import erpnext.tests.utils  # noqa: F401
	if not frappe.db.exists("Company", company):
		frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": company,
				"abbr": abbr,
				"country": "India",
				"default_currency": "INR",
				"chart_of_accounts": "Standard",
			}
		).insert()
	_ensure_fiscal_year(company)
	return company


def _ensure_fiscal_year(company: str):
	"""Make sure an Apr-Mar fiscal year (or one covering it) applies to the company."""
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year

	try:
		get_fiscal_year(FY_START, company=company)
		return
	except FiscalYearError:
		frappe.clear_last_message()
	fy = frappe.db.get_value("Fiscal Year", {"year_start_date": FY_START, "year_end_date": FY_END})
	if fy:
		doc = frappe.get_doc("Fiscal Year", fy)
		doc.append("companies", {"company": company})
		doc.save()
		return
	frappe.get_doc(
		{
			"doctype": "Fiscal Year",
			"year": f"2026-2027 {ABBR}",
			"year_start_date": FY_START,
			"year_end_date": FY_END,
			"companies": [{"company": company}],
		}
	).insert()


def make_branches(company: str = COMPANY) -> dict[str, str]:
	"""Branches plus an office Address per branch that records its state."""
	state_field = _branch_state_field()
	for branch, (state, city, pincode) in BRANCHES.items():
		if not frappe.db.exists("Branch", branch):
			frappe.get_doc({"doctype": "Branch", "branch": branch}).insert()
		if state_field and frappe.db.get_value("Branch", branch, state_field) != state:
			frappe.db.set_value("Branch", branch, state_field, state)
		title = f"{ABBR} {branch}"
		if not frappe.db.exists("Address", {"address_title": title}):
			frappe.get_doc(
				{
					"doctype": "Address",
					"address_title": title,
					"address_type": "Office",
					"address_line1": f"1 {city} Business Park",
					"city": city,
					"state": state,
					"pincode": pincode,
					"country": "India",
					"is_your_company_address": 1,
					"links": [
						{"link_doctype": "Company", "link_name": company},
						{"link_doctype": "Branch", "link_name": branch},
					],
				}
			).insert()
	return {b: s for b, (s, _c, _p) in BRANCHES.items()}


def _branch_state_field():
	"""Use the org module's Branch state field once it exists (plain-text types only)."""
	df = frappe.get_meta("Branch").get_field("gamcs_state")
	return df.fieldname if df and df.fieldtype in ("Data", "Select", "Autocomplete") else None


def make_departments(company: str = COMPANY) -> dict[str, str]:
	out = {}
	for dept in DEPARTMENTS:
		name = frappe.db.get_value("Department", {"department_name": dept, "company": company})
		if not name:
			name = (
				frappe.get_doc(
					{
						"doctype": "Department",
						"department_name": dept,
						"company": company,
						"parent_department": "All Departments",
					}
				)
				.insert()
				.name
			)
		out[dept] = name
	return out


def make_designations() -> tuple[str, ...]:
	names = tuple(dict.fromkeys(row[5] for row in ORG_CHART))
	for d in names:
		if not frappe.db.exists("Designation", d):
			frappe.get_doc({"doctype": "Designation", "designation_name": d}).insert()
	return names


def make_grades(salary_structure: str | None = None) -> tuple[str, ...]:
	for grade, (_desc, base) in GRADES.items():
		if frappe.db.exists("Employee Grade", grade):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Employee Grade",
				"__newname": grade,
				"default_base_pay": base,
				"currency": "INR",
				"default_salary_structure": salary_structure,
			}
		)
		doc.insert(set_name=grade)
	return tuple(GRADES)


# --------------------------------------------------------------------------- calendar and leave


def make_holiday_list(company: str = COMPANY) -> str:
	"""Holiday list with Sundays and national holidays, assigned to the company (v16)."""
	if not frappe.db.exists("Holiday List", HOLIDAY_LIST):
		hl = frappe.get_doc(
			{
				"doctype": "Holiday List",
				"holiday_list_name": HOLIDAY_LIST,
				"from_date": HOLIDAY_FROM,
				"to_date": FY_END,
				"weekly_off": "Sunday",
			}
		)
		hl.get_weekly_off_dates()
		taken = {str(h.holiday_date) for h in hl.holidays}
		for date, desc in demo.NATIONAL_HOLIDAYS:
			if date not in taken:
				hl.append("holidays", {"holiday_date": date, "description": desc, "weekly_off": 0})
		hl.insert()
	if frappe.db.get_value("Company", company, "default_holiday_list") != HOLIDAY_LIST:
		frappe.db.set_value("Company", company, "default_holiday_list", HOLIDAY_LIST)
	if not frappe.db.exists(
		"Holiday List Assignment",
		{"applicable_for": "Company", "assigned_to": company, "holiday_list": HOLIDAY_LIST, "docstatus": 1},
	):
		hla = frappe.get_doc(
			{
				"doctype": "Holiday List Assignment",
				"applicable_for": "Company",
				"assigned_to": company,
				"holiday_list": HOLIDAY_LIST,
				"from_date": HOLIDAY_FROM,
			}
		)
		hla.insert()
		hla.submit()
	return HOLIDAY_LIST


def make_leave_types() -> tuple[str, ...]:
	"""The demo seed's leave types (same names and rules)."""
	for lt, (_alloc, extra) in demo.LEAVE_TYPES.items():
		if not frappe.db.exists("Leave Type", lt):
			frappe.get_doc({"doctype": "Leave Type", "leave_type_name": lt, **extra}).insert()
	return tuple(demo.LEAVE_TYPES)


# --------------------------------------------------------------------------- payroll


def make_salary_structure(company: str = COMPANY) -> str:
	"""Submitted monthly structure on `base`: Basic 50%, HRA 20%, Special 30%, PF, ESI, PT."""
	if frappe.db.get_value("Salary Structure", {"name": SALARY_STRUCTURE, "docstatus": 1}):
		return SALARY_STRUCTURE
	demo.ensure_salary_components()
	doc = frappe.get_doc(
		{
			"doctype": "Salary Structure",
			"__newname": SALARY_STRUCTURE,
			"company": company,
			"currency": "INR",
			"payroll_frequency": "Monthly",
			"is_active": "Yes",
		}
	)
	for name, abbr, ctype, formula, condition, _extra in demo.COMPONENTS:
		if abbr not in STRUCTURE_COMPONENTS:
			continue
		row = {"salary_component": name, "abbr": abbr, "amount_based_on_formula": 1, "formula": formula}
		if condition:
			row["condition"] = condition
		doc.append("earnings" if ctype == "Earning" else "deductions", row)
	doc.insert(set_name=SALARY_STRUCTURE)
	doc.submit()
	return doc.name


def assign_salary_structure(employee: str, base: float, from_date: str = FY_START) -> str:
	"""Submitted Salary Structure Assignment of SALARY_STRUCTURE (reuses a matching one)."""
	existing = frappe.db.get_value(
		"Salary Structure Assignment",
		{
			"employee": employee,
			"salary_structure": SALARY_STRUCTURE,
			"from_date": from_date,
			"base": base,
			"docstatus": 1,
		},
	)
	if existing:
		return existing
	company = frappe.db.get_value("Employee", employee, "company")
	ssa = frappe.get_doc(
		{
			"doctype": "Salary Structure Assignment",
			"employee": employee,
			"salary_structure": SALARY_STRUCTURE,
			"company": company,
			"currency": "INR",
			"from_date": from_date,
			"base": base,
			"variable": 0,
			"payroll_payable_account": frappe.db.get_value(
				"Company", company, "default_payroll_payable_account"
			),
		}
	)
	ssa.insert()
	ssa.submit()
	return ssa.name


# --------------------------------------------------------------------------- employees


def make_employees(company: str = COMPANY) -> dict[str, str]:
	"""The ORG_CHART tree. Docname = employee number; reports_to repaired if it drifted."""
	departments = make_departments(company)
	meta = frappe.get_meta("Employee")
	out: dict[str, str] = {}
	for i, (key, first, last, gender, dept, designation, grade, branch, parent) in enumerate(
		ORG_CHART, start=1
	):
		number = employee_number(i)
		manager = out[parent] if parent else None
		if not frappe.db.exists("Employee", number):
			values = {
				"doctype": "Employee",
				"employee_number": number,
				"first_name": first,
				"last_name": last,
				"gender": gender,
				# deterministic, spread out, all well before FY 2026-27
				"date_of_birth": add_days(getdate("1975-01-01"), i * 223),
				"date_of_joining": add_days(getdate("2019-04-01"), (i - 1) * 41),
				"company": company,
				"branch": branch,
				"department": departments[dept],
				"designation": designation,
				"employment_type": "Full-time",
				"status": "Active",
				"reports_to": manager,
				"company_email": f"{first.lower()}.{last.lower()}.{i:03d}@{EMAIL_DOMAIN}",
				"prefered_contact_email": "Company Email",
				"ctc": GRADES[grade][1] * 12,
				"salary_currency": "INR",
				"salary_mode": "Bank",
			}
			if meta.has_field("grade"):
				values["grade"] = grade
			if meta.has_field("holiday_list"):
				values["holiday_list"] = HOLIDAY_LIST
			frappe.get_doc(values).insert(set_name=number)
		elif frappe.db.get_value("Employee", number, "reports_to") != manager:
			doc = frappe.get_doc("Employee", number)
			doc.reports_to = manager
			doc.save()  # through the document so the nested set stays consistent
		out[key] = number
	return out


def make_user_for(employee: str, roles: tuple[str, ...] = ("Employee",)) -> str:
	"""Desk user for an employee (email = company email), linked via user_id."""
	e = frappe.db.get_value(
		"Employee", employee, ["user_id", "company_email", "first_name", "last_name"], as_dict=True
	)
	user = e.user_id or e.company_email
	if not frappe.db.exists("User", user):
		u = frappe.get_doc(
			{
				"doctype": "User",
				"email": user,
				"first_name": e.first_name,
				"last_name": e.last_name,
				"send_welcome_email": 0,
				"roles": [{"role": r} for r in roles],
			}
		)
		u.flags.no_welcome_mail = True
		u.insert(ignore_permissions=True)
	else:
		u = frappe.get_doc("User", user)
		missing = [r for r in roles if r not in {x.role for x in u.roles}]
		if missing:
			u.add_roles(*missing)
	if e.user_id != user:
		frappe.db.set_value("Employee", employee, "user_id", user)
	return user


# --------------------------------------------------------------------------- everything


def make_org(company: str = COMPANY, commit: bool = False) -> Org:
	"""The whole organisation. commit=True persists it (test-site baseline, bootstrap)."""
	frappe.flags.mute_emails = True
	make_company(company)
	branches = make_branches(company)
	departments = make_departments(company)
	designations = make_designations()
	holiday_list = make_holiday_list(company)
	leave_types = make_leave_types()
	structure = make_salary_structure(company)
	grades = make_grades(structure)
	employees = make_employees(company)
	if commit:
		frappe.db.commit()
	return Org(
		company=company,
		abbr=ABBR,
		branches=branches,
		departments=departments,
		designations=designations,
		grades=grades,
		employees=employees,
		holiday_list=holiday_list,
		leave_types=leave_types,
		salary_structure=structure,
	)


try:
	from frappe.tests import IntegrationTestCase
except ImportError:  # pragma: no cover - frappe < 16
	IntegrationTestCase = object


class OrgTestCase(IntegrationTestCase):
	"""IntegrationTestCase with `cls.org` built once per class (and persisted on the test site)."""

	org: Org

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.org = make_org(commit=True)
