"""The test factories themselves: shape of the org, determinism, idempotency, payroll."""

import frappe

from gamcs_hr.scripts import bootstrap
from gamcs_hr.tests import factories
from gamcs_hr.tests.factories import OrgTestCase

POSTING_DATE = "2026-04-30"


def _counts(company):
	return {
		dt: frappe.db.count(dt, flt)
		for dt, flt in (
			("Employee", {"company": company}),
			("Department", {"company": company}),
			("Branch", {}),
			("Designation", {}),
			("Employee Grade", {}),
			("Holiday List", {}),
			("Holiday List Assignment", {"assigned_to": company}),
			("Leave Type", {}),
			("Salary Structure", {"company": company}),
			("Address", {"address_title": ("like", f"{factories.ABBR} %")}),
		)
	}


class TestFactories(OrgTestCase):
	def test_reporting_tree(self):
		emps = frappe.get_all(
			"Employee",
			filters={"company": self.org.company},
			fields=["name", "reports_to", "designation", "status"],
		)
		self.assertEqual(len(emps), 30)
		self.assertEqual(len(self.org.employees), 30)
		by_name = {e.name: e for e in emps}
		roots = [e.name for e in emps if not e.reports_to]
		self.assertEqual(roots, [self.org.employee("ceo")])
		self.assertEqual(by_name[self.org.employee("ceo")].designation, "Chief Executive Officer")

		heads = self.org.reports_of("ceo")
		self.assertEqual(len(heads), 5)
		self.assertTrue(all(by_name[h].designation.startswith("Head of") for h in heads))
		managers = [k for k, *_r in factories.ORG_CHART if k.endswith(".mgr")]
		self.assertEqual(len(managers), 5)
		for m in managers:
			self.assertTrue(self.org.reports_of(m), m)

		# every chain ends at the CEO within 3 hops, with no cycles
		for e in emps:
			seen, cur = set(), e.name
			while by_name[cur].reports_to:
				self.assertNotIn(cur, seen)
				seen.add(cur)
				cur = by_name[cur].reports_to
			self.assertEqual(cur, self.org.employee("ceo"))
			self.assertLessEqual(len(seen), 3)

	def test_deterministic_names(self):
		self.assertEqual(self.org.employee("ceo"), "GTPL-001")
		self.assertEqual(self.org.employee("hr.2"), "GTPL-030")
		self.assertEqual(self.org.employees, factories.EMPLOYEE_IDS)
		e = frappe.db.get_value(
			"Employee",
			"GTPL-002",
			["employee_number", "employee_name", "department", "branch", "reports_to"],
			as_dict=True,
		)
		self.assertEqual(
			e,
			{
				"employee_number": "GTPL-002",
				"employee_name": "Arjun Rao",
				"department": "Engineering - GTPL",
				"branch": "Bengaluru",
				"reports_to": "GTPL-001",
			},
		)
		self.assertEqual(self.org.departments["Engineering"], factories.department_name("Engineering"))

	def test_branches_in_four_states(self):
		self.assertEqual(
			self.org.branches,
			{
				"Bengaluru": "Karnataka",
				"Mumbai": "Maharashtra",
				"New Delhi": "Delhi",
				"Chennai": "Tamil Nadu",
			},
		)
		for branch, state in self.org.branches.items():
			addr = frappe.db.get_value(
				"Dynamic Link",
				{"parenttype": "Address", "link_doctype": "Branch", "link_name": branch},
				"parent",
			)
			self.assertEqual(frappe.db.get_value("Address", addr, "state"), state)
			self.assertTrue(
				frappe.db.exists("Employee", {"company": self.org.company, "branch": branch}), branch
			)

	def test_grades_and_designations(self):
		self.assertEqual(self.org.grades, ("L1", "L2", "L3", "L4", "L5"))
		self.assertEqual(
			frappe.db.get_value("Employee Grade", "L4", ["default_base_pay", "default_salary_structure"]),
			(180000, factories.SALARY_STRUCTURE),
		)
		if frappe.get_meta("Employee").has_field("grade"):
			self.assertEqual(frappe.db.get_value("Employee", self.org.employee("ceo"), "grade"), "L5")
		for d in self.org.designations:
			self.assertTrue(frappe.db.exists("Designation", d))

	def test_holidays_resolve_through_assignment(self):
		from hrms.utils.holiday_list import get_holiday_list_for_employee

		self.assertEqual(
			get_holiday_list_for_employee(self.org.employee("ops.1"), as_on="2026-06-01"),
			factories.HOLIDAY_LIST,
		)
		holidays = {
			str(h.holiday_date): h.weekly_off
			for h in frappe.get_all(
				"Holiday", {"parent": factories.HOLIDAY_LIST}, ["holiday_date", "weekly_off"]
			)
		}
		self.assertEqual(holidays["2026-08-15"], 0)  # Independence Day
		self.assertEqual(holidays["2026-04-05"], 1)  # a Sunday

	def test_leave_types(self):
		self.assertEqual(
			self.org.leave_types, ("Casual Leave", "Sick Leave", "Privilege Leave", "Leave Without Pay")
		)
		self.assertEqual(frappe.db.get_value("Leave Type", "Leave Without Pay", "is_lwp"), 1)

	def test_idempotent(self):
		before = _counts(self.org.company)
		again = factories.make_org()
		self.assertEqual(again, self.org)
		self.assertEqual(_counts(self.org.company), before)

	def test_reports_to_drift_is_repaired(self):
		emp = self.org.employee("ops.3")
		doc = frappe.get_doc("Employee", emp)
		doc.reports_to = self.org.employee("ceo")
		doc.save()
		factories.make_employees()
		self.assertEqual(frappe.db.get_value("Employee", emp, "reports_to"), self.org.employee("ops.mgr"))

	def test_make_user_for(self):
		emp = self.org.employee("fin.2")
		user = factories.make_user_for(emp, roles=("Employee", "Leave Approver"))
		self.assertEqual(user, f"manish.shah.028@{factories.EMAIL_DOMAIN}")
		self.assertEqual(frappe.db.get_value("Employee", emp, "user_id"), user)
		self.assertEqual(factories.make_user_for(emp), user)
		self.assertIn("Leave Approver", frappe.get_roles(user))

	def _slip(self, key, base):
		from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

		emp = self.org.employee(key)
		factories.assign_salary_structure(emp, base)
		slip = make_salary_slip(self.org.salary_structure, employee=emp, posting_date=POSTING_DATE)
		return slip, {r.abbr: r.amount for r in slip.earnings + slip.deductions}

	def test_salary_structure_above_esi_ceiling(self):
		slip, a = self._slip("sales.west.1", 30000)
		self.assertEqual(slip.payment_days, slip.total_working_days)
		self.assertEqual((a["B"], a["HRA"], a["SA"]), (15000, 6000, 9000))
		self.assertEqual(slip.gross_pay, 30000)
		self.assertEqual(a["PF"], 1800)  # 12% of basic, capped at the 15,000 ceiling
		self.assertNotIn("ESI", a)
		self.assertEqual(a["PT"], 200)
		self.assertNotIn("IT", a)
		self.assertEqual(slip.net_pay, 28000)

	def test_salary_structure_below_esi_ceiling(self):
		slip, a = self._slip("ops.2", 20000)
		self.assertEqual((a["B"], a["HRA"], a["SA"]), (10000, 4000, 6000))
		self.assertEqual(a["PF"], 1200)
		self.assertEqual(a["ESI"], 150)  # 0.75% of 20,000
		self.assertNotIn("PT", a)
		self.assertEqual(slip.net_pay, 18650)


class TestBootstrap(OrgTestCase):
	def test_runs_on_a_set_up_site_without_touching_settings(self):
		before = bootstrap.site_default_changes()
		summary = bootstrap.run(site_defaults=0, commit=0)
		self.assertEqual(summary["employees"], 30)
		self.assertEqual(summary["company"], factories.COMPANY)
		self.assertEqual(summary["settings_changed"], [])
		self.assertEqual(bootstrap.site_default_changes(), before)

	def test_site_default_changes_lists_only_differences(self):
		changes = bootstrap.site_default_changes()
		for key, (current, wanted) in changes.items():
			doctype, fieldname = key.split(".", 1)
			self.assertNotEqual(str(current or ""), str(wanted))
			self.assertEqual(frappe.db.get_single_value(doctype, fieldname), current)
