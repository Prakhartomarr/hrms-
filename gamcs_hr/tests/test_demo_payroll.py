"""Exact-value checks for the demo India salary structure (CLAUDE.md rule 6).

Each case builds a salary slip for April 2026 (the first FY 2026-27 period, so the
TDS projection covers 12 months) for a throwaway employee with a known monthly gross.
"""

import frappe
from frappe.tests import IntegrationTestCase

from gamcs_hr.seed import demo

POSTING_DATE = "2026-04-30"


def make_employee(number, base):
	emp = frappe.db.get_value("Employee", {"employee_number": number})
	if not emp:
		emp = (
			frappe.get_doc(
				{
					"doctype": "Employee",
					"employee_number": number,
					"first_name": "Payroll",
					"last_name": f"Test {number}",
					"gender": "Female",
					"date_of_birth": "1990-01-01",
					"date_of_joining": "2025-01-01",
					"company": demo.COMPANY,
					"holiday_list": demo.HOLIDAY_LIST,
					"status": "Active",
				}
			)
			.insert()
			.name
		)
	ssa = frappe.get_doc(
		{
			"doctype": "Salary Structure Assignment",
			"employee": emp,
			"salary_structure": demo.SALARY_STRUCTURE,
			"company": demo.COMPANY,
			"currency": "INR",
			"from_date": demo.FY_START,
			"base": base,
			"income_tax_slab": demo.TAX_SLAB,
			"payroll_payable_account": frappe.db.get_value(
				"Company", demo.COMPANY, "default_payroll_payable_account"
			),
		}
	)
	ssa.insert()
	ssa.submit()
	return emp


def slip_amounts(emp):
	from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

	slip = make_salary_slip(demo.SALARY_STRUCTURE, employee=emp, posting_date=POSTING_DATE)
	rows = {r.abbr: r.amount for r in slip.earnings + slip.deductions}
	return slip, rows


class TestDemoPayroll(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		demo.run()

	def test_below_esi_ceiling(self):
		slip, a = slip_amounts(make_employee("TST-PAY-20K", 20000))
		self.assertEqual(slip.payment_days, 30)
		self.assertEqual((a["B"], a["HRA"], a["SA"]), (10000, 4000, 6000))
		self.assertEqual(slip.gross_pay, 20000)
		self.assertEqual(a["PF"], 1200)  # 12% of basic 10,000
		self.assertEqual(a["ESI"], 150)  # 0.75% of 20,000
		self.assertNotIn("PT", a)  # gross below 25,000
		self.assertEqual(a.get("IT", 0), 0)
		self.assertEqual(slip.net_pay, 18650)

	def test_mid_salary_pf_capped_tax_rebated(self):
		slip, a = slip_amounts(make_employee("TST-PAY-60K", 60000))
		self.assertEqual((a["B"], a["HRA"], a["SA"]), (30000, 12000, 18000))
		self.assertEqual(a["PF"], 1800)  # capped at 12% of the 15,000 wage ceiling
		self.assertNotIn("ESI", a)  # gross above 21,000
		self.assertEqual(a["PT"], 200)
		# 7,20,000 - 75,000 standard deduction = 6,45,000 <= 12,00,000 relief limit -> nil
		self.assertEqual(a.get("IT", 0), 0)
		self.assertEqual(slip.net_pay, 58000)

	def test_high_salary_new_regime_tds(self):
		slip, a = slip_amounts(make_employee("TST-PAY-200K", 200000))
		self.assertEqual(a["PF"], 1800)
		self.assertEqual(a["PT"], 200)
		# annual 24,00,000 - 75,000 = 23,25,000 taxable
		# 20,000 + 40,000 + 60,000 + 80,000 + 25% of 3,25,000 (81,250) = 2,81,250
		# + 4% cess 11,250 = 2,92,500 a year -> 24,375 a month
		self.assertEqual(a["IT"], 24375)
		self.assertEqual(slip.net_pay, 200000 - 1800 - 200 - 24375)
