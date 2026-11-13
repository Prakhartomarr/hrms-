"""Change tracking, audit trail registration and the Field Change Log report (T09)."""

import frappe
from frappe.tests import IntegrationTestCase

from gamcs_hr.audit import setup as audit_setup
from gamcs_hr.audit.field_change_log import execute
from gamcs_hr.audit.hooks_part import audit_trail_doctypes

DESIGNATION = "_Test Audit Designation"


def _clear_mask_cache():
	frappe.clear_cache(doctype="Designation")
	frappe.cache.delete_keys("masked_fields::Designation")


class TestChangeTracking(IntegrationTestCase):
	def test_every_listed_doctype_exists(self):
		missing = [dt for dt in audit_trail_doctypes if not frappe.db.exists("DocType", dt)]
		self.assertEqual(missing, [])

	def test_sensitive_doctypes_track_changes(self):
		for dt in (
			"Leave Application",
			"Payroll Entry",
			"Salary Slip",
			"Holiday List",
			"Branch",
			"Job Offer",
		):
			with self.subTest(doctype=dt):
				self.assertEqual(frappe.get_meta(dt).track_changes, 1)

	def test_setters_only_for_doctypes_that_need_them(self):
		setters = {ps["doctype"] for ps in audit_setup.PROPERTY_SETTERS()}
		self.assertIn("Leave Application", setters)
		self.assertIn("Payroll Entry", setters)
		self.assertNotIn("Employee", setters)  # tracks changes natively
		self.assertNotIn("Statutory Pack", setters)
		self.assertTrue(
			all(
				ps["property"] == "track_changes" and ps["value"] == 1
				for ps in audit_setup.PROPERTY_SETTERS()
			)
		)

	def test_registered_with_the_audit_trail(self):
		hooked = set(frappe.get_hooks("audit_trail_doctypes"))
		self.assertTrue({"Leave Application", "Salary Structure Assignment", "Statutory Pack"} <= hooked)


class TestFieldChangeLog(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Designation", DESIGNATION):
			frappe.get_doc({"doctype": "Designation", "designation_name": DESIGNATION}).insert()
		doc = frappe.get_doc("Designation", DESIGNATION)
		# Frappe skips Versions in tests unless asked
		doc.description = "Before value"
		doc.save(ignore_version=False)
		doc.description = "After value"
		doc.save(ignore_version=False)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		_clear_mask_cache()

	def _rows(self, **filters):
		_columns, rows = execute(
			{"ref_doctype": "Designation", "docname": DESIGNATION, "fieldname": "description", **filters}
		)
		return rows

	def test_before_and_after_values(self):
		rows = self._rows()
		self.assertEqual(
			[(r["field"], r["old_value"], r["new_value"], r["changed_by"]) for r in rows][:1],
			[("Description", "Before value", "After value", "Administrator")],
		)

	def test_masked_field_is_hidden_without_unmask_permission(self):
		frappe.make_property_setter(
			{
				"doctype": "Designation",
				"fieldname": "description",
				"property": "mask",
				"value": "1",
				"property_type": "Check",
			},
			validate_fields_for_doctype=False,
		)
		_clear_mask_cache()
		user = "audit.viewer@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc(
				{"doctype": "User", "email": user, "first_name": "Audit", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		frappe.get_doc("User", user).add_roles("HR Manager")

		frappe.set_user(user)
		rows = self._rows()
		self.assertTrue(rows)
		self.assertEqual((rows[0]["old_value"], rows[0]["new_value"]), ("XXXXXXXX", "XXXXXXXX"))

		frappe.set_user("Administrator")  # Administrator is never masked
		rows = self._rows()
		self.assertEqual((rows[0]["old_value"], rows[0]["new_value"]), ("Before value", "After value"))

	def test_rows_need_read_permission(self):
		user = "audit.nobody@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc(
				{"doctype": "User", "email": user, "first_name": "Nobody", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		frappe.set_user(user)
		self.assertEqual(self._rows(), [])

	def test_child_rows_added_are_listed_without_values(self):
		from gamcs_hr.audit.field_change_log import _Access, flatten

		version = {
			"name": "v",
			"ref_doctype": "Holiday List",
			"docname": "x",
			"owner": "Administrator",
			"creation": "2026-11-13 10:00:00",
			"data": frappe.as_json(
				{
					"changed": [],
					"added": [
						["holidays", {"idx": 2, "holiday_date": "2026-10-02", "description": "secret"}]
					],
					"row_changed": [["holidays", 0, "row1", [["description", "Old", "New"]]]],
				}
			),
		}
		rows = flatten(version, _Access())
		self.assertEqual(
			[(r["table"], r["row_no"], r["field"], r["old_value"], r["new_value"]) for r in rows],
			[("Holidays", 1, "Description", "Old", "New"), ("Holidays", 2, "Holidays", "", "Row added")],
		)
