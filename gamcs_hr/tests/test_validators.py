"""Validator pipeline: discovery, ordering, and running through extend_doctype_class."""

import frappe
from frappe.desk.doctype.todo.todo import ToDo
from frappe.tests import IntegrationTestCase, UnitTestCase

from gamcs_hr.framework import validators
from gamcs_hr.framework.validators import ValidatorPipeline, discover, handlers_for

PKG = "gamcs_hr.tests.fixtures.validators"
EXTENSION = "gamcs_hr.tests.fixtures.todo_extension.ToDoExtension"


class TestDiscovery(UnitTestCase):
	def setUp(self):
		validators.clear_cache()

	def test_rules_sorted_by_order_then_name_and_helpers_skipped(self):
		self.assertEqual(
			[r.name.rsplit(".", 1)[1] for r in discover(PKG)], ["c_note_only", "a_first", "b_second", "d_soft"]
		)

	def test_doctype_filter(self):
		names = lambda dt: [h.__module__.rsplit(".", 1)[1] for h in handlers_for([PKG], dt, "validate")]  # noqa: E731
		self.assertEqual(names("ToDo"), ["a_first", "b_second", "d_soft"])
		self.assertEqual(names("Note"), ["c_note_only", "a_first", "b_second", "d_soft"])
		self.assertEqual(
			[h.__name__ for h in handlers_for([PKG], "ToDo", "before_insert")], ["before_insert"]
		)


def todo_class():
	return type("TestToDo", (ValidatorPipeline, ToDo), {"validator_packages": (PKG,)})


class TestPipeline(IntegrationTestCase):
	def setUp(self):
		validators.clear_cache()

	def tearDown(self):
		frappe.db.rollback()

	def make(self, description, cls=None):
		doc = (cls or todo_class())({"doctype": "ToDo", "description": description})
		doc.flags.calls = []
		return doc

	def test_rules_run_after_upstream_method_in_order(self):
		doc = self.make("hello")
		doc.validate()
		# a_first sees _assignment, which ToDo.validate sets, so upstream ran first
		self.assertEqual(doc.flags.calls, [("a_first", True), ("b_second", None)])

	def test_rule_can_reject(self):
		with self.assertRaisesRegex(frappe.ValidationError, "rejected by b_second"):
			self.make("reject me").validate()

	def test_soft_violation_is_recorded_not_raised(self):
		doc = self.make("soft")
		doc.validate()
		self.assertEqual(doc.flags.gamcs_violations, [{"code": "soft_rule", "message": "Allowed, but flagged"}])

	def test_skip_flag(self):
		doc = self.make("reject me")
		doc.flags.skip_gamcs_validators = True
		doc.validate()
		self.assertEqual(doc.flags.calls, [])

	def test_through_extend_doctype_class_hook_on_insert(self):
		frappe.controllers.get(frappe.local.site, {}).pop("ToDo", None)
		try:
			with self.patch_hooks({"extend_doctype_class": {"ToDo": [EXTENSION]}}):
				frappe.controllers.get(frappe.local.site, {}).pop("ToDo", None)
				doc = frappe.new_doc("ToDo")
				self.assertIsInstance(doc, ValidatorPipeline)
				self.assertIsInstance(doc, ToDo)
				doc.description = "inserted"
				doc.flags.calls = []
				doc.insert()
				self.assertEqual(
					doc.flags.calls, [("b_second.before_insert", None), ("a_first", True), ("b_second", None)]
				)
				with self.assertRaisesRegex(frappe.ValidationError, "rejected by b_second"):
					frappe.get_doc({"doctype": "ToDo", "description": "reject me"}).insert()
		finally:
			frappe.controllers.get(frappe.local.site, {}).pop("ToDo", None)
