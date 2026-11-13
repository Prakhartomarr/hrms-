"""Idempotent demo data for local development.

    bench --site hr.localhost execute gamcs_hr.seed.demo.run

Every step looks its record up by a natural key first and only creates what is
missing, so it is safe to re-run. Nothing here is used in production code paths.
"""

import os
import random

import frappe
from frappe.utils import add_days, getdate

COMPANY = "Demo Pvt Ltd"
ABBR = "DPL"
FY_START, FY_END = "2026-04-01", "2027-03-31"
HOLIDAY_LIST = "Demo India 2026-27"
LEAVE_PERIOD = "FY 2026-27"
LEAVE_POLICY = "Demo Standard Leave Policy"
SALARY_STRUCTURE = "Demo India Monthly"
TAX_SLAB = "FY 2026-27 New Regime"
EMAIL_DOMAIN = "demo.example"

BRANCHES = {
	# name: (latitude, longitude) of a plausible office location
	"Bengaluru": (12.9716, 77.5946),
	"Mumbai": (19.0760, 72.8777),
}
# department: (head designation, member designation, headcount incl. head)
DEPARTMENTS = {
	"Engineering": ("Engineering Manager", "Software Engineer", 14),
	"Sales": ("Sales Manager", "Sales Executive", 9),
	"Operations": ("Operations Manager", "Operations Executive", 7),
	"Finance": ("Finance Manager", "Accountant", 6),
	"Human Resources": ("HR Manager", "HR Executive", 5),
	"Customer Success": ("Customer Success Manager", "Customer Success Executive", 8),
}
# 1 CEO + 49 across departments = 50
NATIONAL_HOLIDAYS = [
	("2026-01-26", "Republic Day"),
	("2026-03-04", "Holi"),
	("2026-05-01", "Labour Day"),
	("2026-08-15", "Independence Day"),
	("2026-10-02", "Gandhi Jayanti"),
	("2026-10-20", "Dussehra"),
	("2026-11-09", "Diwali"),
	("2026-12-25", "Christmas"),
	("2027-01-26", "Republic Day"),
	("2027-03-22", "Holi"),
]
FIRST_NAMES = {
	"Male": "Aarav Vivaan Aditya Arjun Sai Reyansh Krishna Ishaan Rohan Kabir Vihaan Ayaan Dhruv Kunal Nikhil "
	"Rahul Siddharth Varun Yash Karthik Manish Pranav Harsh Rajat Tarun".split(),
	"Female": "Ananya Diya Saanvi Aadhya Kavya Ishita Meera Priya Riya Sneha Tanvi Neha Pooja Shreya Aditi "
	"Nisha Kritika Lakshmi Divya Swati Anjali Pallavi Ritu Simran Bhavna".split(),
}
LAST_NAMES = (
	"Sharma Verma Iyer Nair Reddy Patel Shah Gupta Mehta Rao Menon Kulkarni Desai Joshi Banerjee "
	"Mukherjee Singh Chopra Malhotra Pillai Agarwal Bhat Hegde Naidu Kapoor"
).split()


def run(commit=True):
	"""commit=False lets tests build the data inside their own (rolled back) transaction."""
	frappe.flags.mute_emails = True
	ensure_setup_complete()
	ensure_company_basics()
	ensure_holiday_list()
	branches = ensure_branches()
	ensure_shift_types(branches)
	employees = ensure_employees()
	ensure_shift_assignments(employees)
	ensure_leave_setup(employees)
	ensure_payroll(employees)
	if commit:
		frappe.db.commit()
	summary = {
		"company": COMPANY,
		"employees": frappe.db.count("Employee", {"company": COMPANY}),
		"branches": len(branches),
		"departments": frappe.db.count("Department", {"company": COMPANY, "is_group": 0}),
		"leave_allocations": frappe.db.count("Leave Allocation", {"company": COMPANY, "docstatus": 1}),
		"salary_structure_assignments": frappe.db.count(
			"Salary Structure Assignment", {"company": COMPANY, "docstatus": 1}
		),
	}
	print("gamcs_hr demo seed:", summary)
	return summary


# --------------------------------------------------------------------------- setup


def ensure_setup_complete():
	if frappe.db.exists("Company", COMPANY):
		return
	if frappe.is_setup_complete():
		# setup already done for another company (e.g. by upstream tests): add ours directly
		frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": COMPANY,
				"abbr": ABBR,
				"country": "India",
				"default_currency": "INR",
				"chart_of_accounts": "Standard",
			}
		).insert()
		ensure_fiscal_year()
		return
	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	setup_complete(
		{
			"language": "English",
			"country": "India",
			"timezone": "Asia/Kolkata",
			"currency": "INR",
			"full_name": "Administrator",
			"company_name": COMPANY,
			"company_abbr": ABBR,
			"chart_of_accounts": "Standard",
			"fy_start_date": FY_START,
			"fy_end_date": FY_END,
			"setup_demo": 0,
		}
	)
	if not frappe.db.exists("Company", COMPANY):
		frappe.throw(f"Setup wizard did not create {COMPANY}; check the error log")
	ensure_fiscal_year()


def ensure_fiscal_year():
	"""Apr-Mar fiscal year scoped to our company (a company row avoids clashing with
	calendar-year fiscal years other companies may have, e.g. upstream test fixtures)."""
	fy = frappe.db.get_value(
		"Fiscal Year",
		{"year_start_date": FY_START, "year_end_date": FY_END},
		"name",
	)
	if fy:
		doc = frappe.get_doc("Fiscal Year", fy)
		if doc.companies and not any(c.company == COMPANY for c in doc.companies):
			doc.append("companies", {"company": COMPANY})
			doc.save()
		return
	frappe.get_doc(
		{
			"doctype": "Fiscal Year",
			"year": "2026-2027" if not frappe.db.exists("Fiscal Year", "2026-2027") else "2026-2027 DPL",
			"year_start_date": FY_START,
			"year_end_date": FY_END,
			"companies": [{"company": COMPANY}],
		}
	).insert()


def ensure_company_basics():
	for d in (
		{h for h, _m, _n in DEPARTMENTS.values()}
		| {m for _h, m, _n in DEPARTMENTS.values()}
		| {"Chief Executive Officer"}
	):
		if not frappe.db.exists("Designation", d):
			frappe.get_doc({"doctype": "Designation", "designation_name": d}).insert()
	for dept in DEPARTMENTS:
		if not frappe.db.exists("Department", {"department_name": dept, "company": COMPANY}):
			frappe.get_doc(
				{
					"doctype": "Department",
					"department_name": dept,
					"company": COMPANY,
					"parent_department": "All Departments",
				}
			).insert()
	frappe.db.set_value("Company", COMPANY, "default_currency", "INR")


def dept_name(dept):
	return frappe.db.get_value("Department", {"department_name": dept, "company": COMPANY})


def ensure_holiday_list():
	if not frappe.db.exists("Holiday List", HOLIDAY_LIST):
		hl = frappe.get_doc(
			{
				"doctype": "Holiday List",
				"holiday_list_name": HOLIDAY_LIST,
				"from_date": "2026-01-01",
				"to_date": FY_END,
				"weekly_off": "Sunday",
			}
		)
		hl.get_weekly_off_dates()
		existing = {str(h.holiday_date) for h in hl.holidays}
		for date, desc in NATIONAL_HOLIDAYS:
			if date not in existing:
				hl.append("holidays", {"holiday_date": date, "description": desc, "weekly_off": 0})
		hl.insert()
	frappe.db.set_value("Company", COMPANY, "default_holiday_list", HOLIDAY_LIST)
	# hrms v16 resolves holidays through Holiday List Assignment (employee, else company)
	if not frappe.db.exists(
		"Holiday List Assignment",
		{"applicable_for": "Company", "assigned_to": COMPANY, "holiday_list": HOLIDAY_LIST, "docstatus": 1},
	):
		hla = frappe.get_doc(
			{
				"doctype": "Holiday List Assignment",
				"applicable_for": "Company",
				"assigned_to": COMPANY,
				"holiday_list": HOLIDAY_LIST,
				"from_date": "2026-01-01",
			}
		)
		hla.insert()
		hla.submit()


def ensure_branches():
	for b in BRANCHES:
		if not frappe.db.exists("Branch", b):
			frappe.get_doc({"doctype": "Branch", "branch": b}).insert()
	return list(BRANCHES)


# --------------------------------------------------------------------------- attendance


def ensure_shift_types(branches):
	hr = frappe.get_single("HR Settings")
	hr.allow_geolocation_tracking = 1
	if hr.meta.has_field("allow_employee_checkin_from_mobile_app"):
		hr.allow_employee_checkin_from_mobile_app = 1
	hr.save()

	for branch, (lat, lng) in BRANCHES.items():
		loc = f"{branch} Office"
		if not frappe.db.exists("Shift Location", loc):
			frappe.get_doc(
				{
					"doctype": "Shift Location",
					"location_name": loc,
					"latitude": lat,
					"longitude": lng,
					"checkin_radius": 200,
				}
			).insert()

	shifts = {
		"General Shift": ("09:30:00", "18:30:00"),
		"Early Shift": ("07:00:00", "16:00:00"),
	}
	for name, (start, end) in shifts.items():
		if frappe.db.exists("Shift Type", name):
			continue
		frappe.get_doc(
			{
				"doctype": "Shift Type",
				"name": name,
				"__newname": name,
				"start_time": start,
				"end_time": end,
				"holiday_list": HOLIDAY_LIST,
				"enable_auto_attendance": 1,
				"process_attendance_after": FY_START,
				"determine_check_in_and_check_out": "Alternating entries as IN and OUT during the same shift",
				"working_hours_calculation_based_on": "First Check-in and Last Check-out",
				"begin_check_in_before_shift_start_time": 60,
				"allow_check_out_after_shift_end_time": 120,
				"late_entry_grace_period": 15,
				"enable_late_entry_marking": 1,
				"working_hours_threshold_for_half_day": 4,
				"working_hours_threshold_for_absent": 2,
			}
		).insert()


def ensure_shift_assignments(employees):
	for i, emp in enumerate(employees):
		if frappe.db.exists("Shift Assignment", {"employee": emp, "docstatus": 1}):
			continue
		branch = frappe.db.get_value("Employee", emp, "branch")
		sa = frappe.get_doc(
			{
				"doctype": "Shift Assignment",
				"employee": emp,
				"company": COMPANY,
				"shift_type": "Early Shift" if i % 5 == 4 else "General Shift",
				"start_date": FY_START,
				"status": "Active",
				"shift_location": f"{branch} Office",
			}
		)
		sa.insert()
		sa.submit()


# --------------------------------------------------------------------------- employees


def ensure_employees():
	"""1 CEO, a head per department reporting to the CEO, members reporting to their head."""
	rng = random.Random(42)  # deterministic names / dates / salaries
	plan = [("Executive", "Chief Executive Officer", None)]
	for dept, (head, member, count) in DEPARTMENTS.items():
		plan.append((dept, head, "CEO"))
		plan.extend((dept, member, "HEAD") for _ in range(count - 1))

	created, heads, ceo = [], {}, None
	for i, (dept, designation, reports) in enumerate(plan, start=1):
		number = f"DPL{i:03d}"
		gender = "Female" if i % 2 == 0 else "Male"
		first = FIRST_NAMES[gender][rng.randrange(len(FIRST_NAMES[gender]))]
		last = LAST_NAMES[rng.randrange(len(LAST_NAMES))]
		joining = add_days(getdate("2019-01-07"), rng.randrange(0, 2600))
		dob = add_days(getdate("1975-01-01"), rng.randrange(0, 9000))
		branch = "Bengaluru" if i % 3 else "Mumbai"
		ctc = salary_for(designation, rng)

		emp = frappe.db.get_value("Employee", {"employee_number": number})
		if not emp:
			doc = frappe.get_doc(
				{
					"doctype": "Employee",
					"employee_number": number,
					"first_name": first,
					"last_name": last,
					"gender": gender,
					"date_of_birth": dob,
					"date_of_joining": joining,
					"company": COMPANY,
					"branch": branch,
					"department": dept_name(dept) if dept != "Executive" else None,
					"designation": designation,
					"employment_type": "Full-time",
					"status": "Active",
					"holiday_list": HOLIDAY_LIST,
					"company_email": f"{first.lower()}.{last.lower()}.{i:03d}@{EMAIL_DOMAIN}",
					"prefered_contact_email": "Company Email",
					"ctc": ctc * 12,
					"salary_currency": "INR",
					"salary_mode": "Bank",
				}
			)
			doc.flags.ignore_mandatory = False
			doc.insert()
			emp = doc.name
		if reports is None:
			ceo = emp
		elif reports == "CEO":
			heads[dept] = emp
		manager = None if reports is None else ceo if reports == "CEO" else heads[dept]
		if manager and frappe.db.get_value("Employee", emp, "reports_to") != manager:
			frappe.db.set_value("Employee", emp, "reports_to", manager)
		created.append(emp)

	# department heads approve leave / expenses for their department
	for dept, head in heads.items():
		d = frappe.get_doc("Department", dept_name(dept))
		user = ensure_user_for(head)
		if user and not any(r.approver == user for r in d.leave_approvers):
			d.append("leave_approvers", {"approver": user})
			d.save()
	return created


def ensure_user_for(emp):
	"""Department heads get a desk user so approval flows can be demoed."""
	e = frappe.db.get_value(
		"Employee", emp, ["user_id", "company_email", "first_name", "last_name"], as_dict=1
	)
	if e.user_id:
		set_demo_password(e.user_id)
		return e.user_id
	if not frappe.db.exists("User", e.company_email):
		u = frappe.get_doc(
			{
				"doctype": "User",
				"email": e.company_email,
				"first_name": e.first_name,
				"last_name": e.last_name,
				"send_welcome_email": 0,
				"roles": [{"role": r} for r in ("Employee", "Leave Approver", "Expense Approver", "HR User")],
			}
		)
		u.flags.no_welcome_mail = True
		u.insert(ignore_permissions=True)
	frappe.db.set_value("Employee", emp, "user_id", e.company_email)
	set_demo_password(e.company_email)
	return e.company_email


def set_demo_password(user):
	"""Dev-only login so /hrms can be demoed as an employee. Value comes from ~/hrms/.env."""
	password = os.environ.get("DEMO_PASSWORD") or os.environ.get("ADMIN_PASSWORD")
	if password:
		from frappe.utils.password import update_password

		update_password(user, password)


def salary_for(designation, rng):
	"""Monthly gross (base) in INR, rounded to the nearest 500."""
	if designation == "Chief Executive Officer":
		lo, hi = 400000, 400000
	elif "Manager" in designation:
		lo, hi = 120000, 220000
	elif designation == "Software Engineer":
		lo, hi = 45000, 110000
	else:
		lo, hi = 18000, 45000  # some below the ESI ceiling of 21,000
	return round(rng.randint(lo, hi) / 500) * 500


# --------------------------------------------------------------------------- leave


LEAVE_TYPES = {
	# name: (annual allocation, extra fields)
	"Casual Leave": (12, {"max_continuous_days_allowed": 3, "include_holiday": 0}),
	"Sick Leave": (12, {"include_holiday": 0}),
	"Privilege Leave": (
		18,
		{
			"is_carry_forward": 1,
			"maximum_carry_forwarded_leaves": 30,
			"allow_encashment": 1,
			"is_earned_leave": 0,
		},
	),
	"Leave Without Pay": (0, {"is_lwp": 1}),
}


def ensure_leave_setup(employees):
	for lt, (_alloc, extra) in LEAVE_TYPES.items():
		if not frappe.db.exists("Leave Type", lt):
			frappe.get_doc({"doctype": "Leave Type", "leave_type_name": lt, **extra}).insert()

	if not frappe.db.exists("Leave Period", {"from_date": FY_START, "company": COMPANY}):
		frappe.get_doc(
			{
				"doctype": "Leave Period",
				"from_date": FY_START,
				"to_date": FY_END,
				"company": COMPANY,
				"is_active": 1,
			}
		).insert()
	period = frappe.db.get_value("Leave Period", {"from_date": FY_START, "company": COMPANY})

	policy = frappe.db.get_value("Leave Policy", {"title": LEAVE_POLICY, "docstatus": 1})
	if not policy:
		lp = frappe.get_doc(
			{
				"doctype": "Leave Policy",
				"title": LEAVE_POLICY,
				"leave_policy_details": [
					{"leave_type": lt, "annual_allocation": alloc}
					for lt, (alloc, _x) in LEAVE_TYPES.items()
					if alloc
				],
			}
		)
		lp.insert()
		lp.submit()
		policy = lp.name

	for emp in employees:
		if frappe.db.exists(
			"Leave Policy Assignment", {"employee": emp, "leave_policy": policy, "docstatus": 1}
		):
			continue
		lpa = frappe.get_doc(
			{
				"doctype": "Leave Policy Assignment",
				"employee": emp,
				"company": COMPANY,
				"leave_policy": policy,
				"assignment_based_on": "Leave Period",
				"leave_period": period,
				"effective_from": FY_START,
				"effective_to": FY_END,
			}
		)
		lpa.insert()
		lpa.submit()  # creates the Leave Allocations


# --------------------------------------------------------------------------- payroll

# abbr, type, formula / condition. Earnings are written on `base` only (Basic 50%,
# HRA 20% = 40% of basic, Special 30%) because hrms v16 rejects payment-days proration
# on a formula that references another prorated component. Statutory notes:
#  PF: 12% employee share on basic capped at the 15,000 wage ceiling (=> max 1,800)
#  ESI: 0.75% employee share of gross, only while gross <= 21,000
#  PT: Karnataka slab, 200/month when gross >= 25,000 (simplified; state-specific in reality)
COMPONENTS = [
	("Basic", "B", "Earning", "base * 0.5", "", {"is_tax_applicable": 1}),
	("House Rent Allowance", "HRA", "Earning", "base * 0.2", "", {"is_tax_applicable": 1}),
	("Special Allowance", "SA", "Earning", "base * 0.3", "", {"is_tax_applicable": 1}),
	("Provident Fund", "PF", "Deduction", "round(min(B, 15000) * 0.12)", "", {}),
	("Employee State Insurance", "ESI", "Deduction", "ceil(gross_pay * 0.0075)", "base <= 21000", {}),
	("Professional Tax", "PT", "Deduction", "200", "gross_pay >= 25000", {}),
	("Income Tax", "IT", "Deduction", "", "", {"variable_based_on_taxable_salary": 1}),
]


def ensure_salary_components():
	"""Upsert COMPONENTS. Also used by gamcs_hr.tests.factories."""
	# upsert: the setup wizard already creates Basic, HRA, PF, PT and Income Tax with
	# its own abbreviations and payment-days settings, so align them with ours.
	for name, abbr, ctype, _f, _c, extra in COMPONENTS:
		values = {
			"salary_component_abbr": abbr,
			"type": ctype,
			# deductions derive from already-prorated earnings / gross, so never prorate twice
			"depends_on_payment_days": 1 if ctype == "Earning" else 0,
			**extra,
		}
		if frappe.db.exists("Salary Component", name):
			comp = frappe.get_doc("Salary Component", name)
			if any(comp.get(k) != v for k, v in values.items()):
				comp.update(values)
				comp.save()
		else:
			frappe.get_doc({"doctype": "Salary Component", "salary_component": name, **values}).insert()


def ensure_payroll(employees):
	ensure_salary_components()
	ensure_tax_slab()
	ensure_payroll_period()

	ss = frappe.db.get_value("Salary Structure", {"name": SALARY_STRUCTURE, "docstatus": 1})
	if not ss:
		doc = frappe.get_doc(
			{
				"doctype": "Salary Structure",
				"name": SALARY_STRUCTURE,
				"__newname": SALARY_STRUCTURE,
				"company": COMPANY,
				"currency": "INR",
				"payroll_frequency": "Monthly",
				"is_active": "Yes",
				"earnings": [],
				"deductions": [],
			}
		)
		for name, abbr, ctype, formula, condition, extra in COMPONENTS:
			row = {"salary_component": name, "abbr": abbr}
			if formula:
				row.update({"amount_based_on_formula": 1, "formula": formula})
			if condition:
				row["condition"] = condition
			if extra.get("variable_based_on_taxable_salary"):
				row["variable_based_on_taxable_salary"] = 1
			doc.append("earnings" if ctype == "Earning" else "deductions", row)
		doc.insert()
		doc.submit()
		ss = doc.name

	payable = frappe.db.get_value("Company", COMPANY, "default_payroll_payable_account")
	for emp in employees:
		if frappe.db.exists("Salary Structure Assignment", {"employee": emp, "docstatus": 1}):
			continue
		e = frappe.db.get_value("Employee", emp, ["ctc", "date_of_joining"], as_dict=1)
		ssa = frappe.get_doc(
			{
				"doctype": "Salary Structure Assignment",
				"employee": emp,
				"salary_structure": ss,
				"company": COMPANY,
				"currency": "INR",
				"from_date": max(getdate(FY_START), getdate(e.date_of_joining)),
				"base": (e.ctc or 0) / 12,
				"variable": 0,
				"income_tax_slab": TAX_SLAB,
				"payroll_payable_account": payable,
			}
		)
		ssa.insert()
		ssa.submit()


def ensure_payroll_period():
	"""hrms computes TDS (variable_based_on_taxable_salary) per Payroll Period."""
	if frappe.db.exists("Payroll Period", {"company": COMPANY, "start_date": FY_START}):
		return
	frappe.get_doc(
		{
			"doctype": "Payroll Period",
			"name": "FY 2026-27 DPL",
			"__newname": "FY 2026-27 DPL",
			"company": COMPANY,
			"start_date": FY_START,
			"end_date": FY_END,
		}
	).insert()


def ensure_tax_slab():
	"""New tax regime as announced for FY 2025-26 and carried into FY 2026-27.

	0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, above 24L 30%.
	Standard deduction 75,000; section 87A rebate makes tax nil up to 12L taxable income
	(tax_relief_limit, with marginal relief handled by hrms); 4% health and education cess.
	"""
	# hrms treats both ends of a slab as inclusive, so each band starts one rupee after
	# the previous one ends (4,00,001 not 4,00,000); overlapping bounds overcharge Rs 1 x rate.
	bands = [
		(0, 400000, 0),
		(400001, 800000, 5),
		(800001, 1200000, 10),
		(1200001, 1600000, 15),
		(1600001, 2000000, 20),
		(2000001, 2400000, 25),
		(2400001, 0, 30),
	]
	if frappe.db.exists("Income Tax Slab", {"name": TAX_SLAB, "docstatus": 1}):
		# repair slabs seeded before the one-rupee fix (submitted, so update rows in place)
		for row in frappe.get_all("Taxable Salary Slab", {"parent": TAX_SLAB}, ["name", "from_amount"]):
			if row.from_amount and row.from_amount % 100000 == 0:
				frappe.db.set_value("Taxable Salary Slab", row.name, "from_amount", row.from_amount + 1)
		return
	doc = frappe.get_doc(
		{
			"doctype": "Income Tax Slab",
			"name": TAX_SLAB,
			"__newname": TAX_SLAB,
			"effective_from": FY_START,
			"company": COMPANY,
			"currency": "INR",
			"standard_tax_exemption_amount": 75000,
			"allow_tax_exemption": 0,
			"tax_relief_limit": 1200000,
			"slabs": [{"from_amount": f, "to_amount": t, "percent_deduction": p} for f, t, p in bands],
			"other_taxes_and_charges": [{"description": "Health and Education Cess", "percent": 4}],
		}
	)
	doc.insert()
	doc.submit()
