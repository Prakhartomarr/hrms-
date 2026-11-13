"""Setup registry: collection, ownership conflicts, idempotent sync."""

import frappe
from frappe.tests import IntegrationTestCase

from gamcs_hr.framework import setup_registry
from gamcs_hr.framework.setup_registry import SetupConflictError, collect, sync_property_setter
from gamcs_hr.tests.fixtures.modules.alpha import setup as alpha_setup

FIXTURES = "gamcs_hr.tests.fixtures.modules"


class TestCollect(IntegrationTestCase):
	def test_collects_in_module_order_and_stamps_module(self):
		plan = collect(["alpha", "missing", "beta"], package=FIXTURES)
		self.assertEqual(
			plan.custom_fields,
			{"ToDo": [{"module": "GAMCS HR", "fieldname": "gamcs_test_ref", "fieldtype": "Data", "label": "Test ref"}]},
		)
		self.assertEqual(
			plan.property_setters,
			[
				{
					"fieldname": "description",
					"module": "GAMCS HR",
					"doctype": "ToDo",
					"property": "bold",
					"value": 1,
					"property_type": "Check",
				}
			],
		)
		self.assertEqual([src for src, _ in plan.after_sync], [f"{FIXTURES}.alpha.setup"])

	def test_two_owners_of_one_field_is_an_error(self):
		with self.assertRaisesRegex(SetupConflictError, "gamcs_test_ref"):
			collect(["beta", "clash"], package=FIXTURES)


class TestSync(IntegrationTestCase):
	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_cache(doctype="ToDo")

	def test_property_setter_sync_is_idempotent(self):
		ps = collect(["alpha"], package=FIXTURES).property_setters[0]
		self.assertTrue(sync_property_setter(ps))
		row = frappe.db.get_value(
			"Property Setter", "ToDo-description-bold", ["value", "module", "doctype_or_field"], as_dict=True
		)
		self.assertEqual((row.value, row.module, row.doctype_or_field), ("1", "GAMCS HR", "DocField"))
		self.assertFalse(sync_property_setter(ps))  # second run: nothing to do
		self.assertTrue(sync_property_setter({**ps, "value": 0}))  # changed value: updated in place
		self.assertEqual(frappe.db.get_value("Property Setter", "ToDo-description-bold", "value"), "0")
		self.assertEqual(frappe.db.count("Property Setter", {"doc_type": "ToDo", "property": "bold"}), 1)

	def test_run_calls_after_sync_hooks(self):
		alpha_setup.CALLS.clear()
		setup_registry.run(["alpha"], package=FIXTURES)
		self.assertEqual(alpha_setup.CALLS, ["alpha"])
		self.assertTrue(frappe.db.exists("Property Setter", "ToDo-description-bold"))


class TestRealModules(IntegrationTestCase):
	def test_common_module_field_exists_and_resync_is_a_no_op(self):
		setup_registry.run()  # what after_migrate does
		name = frappe.db.get_value("Custom Field", {"dt": "Employee", "fieldname": "gamcs_legacy_employee_id"})
		self.assertTrue(name)
		before = frappe.db.get_value("Custom Field", name, ["module", "modified", "insert_after"], as_dict=True)
		self.assertEqual((before.module, before.insert_after), ("GAMCS HR", "employee_number"))
		self.assertTrue(frappe.db.has_column("Employee", "gamcs_legacy_employee_id"))

		setup_registry.run()
		self.assertEqual(frappe.db.get_value("Custom Field", name, "modified"), before.modified)

	def test_after_migrate_is_registered(self):
		self.assertIn(
			"gamcs_hr.framework.setup_registry.after_migrate", frappe.get_hooks("after_migrate", app_name="gamcs_hr")
		)

	def test_common_employee_handler(self):
		from gamcs_hr.common.employee import normalise_legacy_id

		doc = frappe._dict(gamcs_legacy_employee_id="  emp-0042 ")
		normalise_legacy_id(doc)
		self.assertEqual(doc.gamcs_legacy_employee_id, "EMP-0042")
