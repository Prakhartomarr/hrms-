"""Hooks merger: merge semantics, module loading, and the real merged hooks."""

import os

import frappe
from frappe.tests import UnitTestCase

import gamcs_hr
from gamcs_hr.framework.hooks_merge import (
	HookConflictError,
	build_hooks,
	find_module_files,
	load_parts,
	merge_hooks,
)
from gamcs_hr.modules_order import MODULES

FIXTURES = "gamcs_hr.tests.fixtures.modules"


class TestMergeSemantics(UnitTestCase):
	def test_new_keys_are_copied_not_shared(self):
		part = {"doc_events": {"ToDo": {"validate": ["a"]}}}
		merged = merge_hooks({}, [("m", part)])
		merged["doc_events"]["ToDo"]["validate"].append("b")
		self.assertEqual(part["doc_events"]["ToDo"]["validate"], ["a"])

	def test_doc_events_become_per_event_lists_in_module_order(self):
		merged = merge_hooks(
			{"doc_events": {"ToDo": {"validate": "base.v"}}},
			[
				("one", {"doc_events": {"ToDo": {"validate": "one.v", "on_update": "one.u"}}}),
				("two", {"doc_events": {"ToDo": {"validate": ["two.v"]}, "Note": {"validate": "two.n"}}}),
			],
		)
		self.assertEqual(
			merged["doc_events"],
			{
				"ToDo": {"validate": ["base.v", "one.v", "two.v"], "on_update": "one.u"},
				"Note": {"validate": "two.n"},
			},
		)

	def test_lists_concatenate_without_duplicates(self):
		merged = merge_hooks({"scheduler_events": {"daily": ["a", "b"]}}, [("m", {"scheduler_events": {"daily": ["b", "c"]}})])
		self.assertEqual(merged["scheduler_events"]["daily"], ["a", "b", "c"])

	def test_strings_at_top_level_become_lists(self):
		merged = merge_hooks({"app_include_js": "a.js"}, [("m", {"app_include_js": "b.js"})])
		self.assertEqual(merged["app_include_js"], ["a.js", "b.js"])

	def test_same_override_twice_is_allowed(self):
		parts = [("one", {"extend_doctype_class": {"ToDo": "x.A"}}), ("two", {"extend_doctype_class": {"ToDo": "x.A"}})]
		self.assertEqual(merge_hooks({}, parts)["extend_doctype_class"], {"ToDo": "x.A"})

	def test_two_overrides_for_one_doctype_conflict(self):
		for hook in ("override_doctype_class", "extend_doctype_class", "override_whitelisted_methods"):
			parts = [("one", {hook: {"ToDo": "x.A"}}), ("two", {hook: {"ToDo": "x.B"}})]
			with self.assertRaisesRegex(HookConflictError, f"two: {hook}.ToDo"):
				merge_hooks({}, parts)

	def test_different_doctypes_in_single_value_hook_merge(self):
		parts = [("one", {"extend_doctype_class": {"ToDo": "x.A"}}), ("two", {"extend_doctype_class": {"Note": "x.B"}})]
		self.assertEqual(merge_hooks({}, parts)["extend_doctype_class"], {"ToDo": "x.A", "Note": "x.B"})

	def test_reserved_hooks_cannot_be_set_by_modules(self):
		for key in ("app_name", "required_apps", "after_migrate", "after_install", "fixtures"):
			with self.assertRaisesRegex(HookConflictError, "only be set in gamcs_hr/hooks.py"):
				merge_hooks({}, [("m", {key: "x"})])

	def test_dict_meeting_scalar_conflicts(self):
		with self.assertRaises(HookConflictError):
			merge_hooks({"doc_events": {"ToDo": {"validate": "a"}}}, [("m", {"doc_events": {"ToDo": "b"}})])

	def test_conflicting_non_string_scalars(self):
		with self.assertRaises(HookConflictError):
			merge_hooks({"export_python_type_annotations": True}, [("m", {"export_python_type_annotations": False})])
		merged = merge_hooks({"export_python_type_annotations": True}, [("m", {"export_python_type_annotations": True})])
		self.assertIs(merged["export_python_type_annotations"], True)


class TestModuleLoading(UnitTestCase):
	def test_load_parts_skips_missing_modules_and_ignores_non_hooks(self):
		parts = load_parts(FIXTURES, ["alpha", "does_not_exist", "beta"])
		self.assertEqual([src for src, _ in parts], [f"{FIXTURES}.alpha.hooks_part", f"{FIXTURES}.beta.hooks_part"])
		beta = parts[1][1]
		self.assertNotIn("helper", beta)
		self.assertNotIn("_unused", beta)
		self.assertNotIn("_private", beta)

	def test_broken_import_inside_a_hooks_part_is_not_swallowed(self):
		with self.assertRaises(ModuleNotFoundError):
			load_parts(FIXTURES, ["badimport"])

	def test_build_hooks_from_fixture_modules(self):
		merged = build_hooks({"app_name": "x", "doc_events": {"*": {"on_update": "base.any"}}}, FIXTURES, ["alpha", "beta"])
		self.assertEqual(
			merged["doc_events"],
			{
				"*": {"on_update": "base.any"},
				"ToDo": {"validate": ["alpha.validate", "beta.validate"], "on_update": ["alpha.on_update"]},
				"Note": {"validate": "beta.note_validate"},
			},
		)
		self.assertEqual(
			merged["scheduler_events"], {"daily": ["alpha.daily", "beta.daily"], "cron": {"0 1 * * *": ["beta.cron"]}}
		)
		self.assertEqual(merged["app_include_js"], ["alpha.bundle.js", "beta.bundle.js"])

	def test_module_order_decides_handler_order(self):
		merged = build_hooks({}, FIXTURES, ["beta", "alpha"])
		self.assertEqual(merged["doc_events"]["ToDo"]["validate"], ["beta.validate", "alpha.validate"])

	def test_clashing_extension_classes_fail_at_load(self):
		with self.assertRaisesRegex(HookConflictError, "clash.hooks_part: extend_doctype_class.ToDo"):
			build_hooks({}, FIXTURES, ["alpha", "clash"])


class TestRealHooks(UnitTestCase):
	def test_every_module_with_hooks_or_setup_is_listed(self):
		app_dir = os.path.dirname(gamcs_hr.__file__)
		unlisted = find_module_files(app_dir) - set(MODULES)
		self.assertFalse(unlisted, f"add these to gamcs_hr/modules_order.py: {sorted(unlisted)}")

	def test_modules_order_has_no_duplicates(self):
		self.assertEqual(len(MODULES), len(set(MODULES)))

	def test_app_metadata_and_entry_points_survive_merge(self):
		from gamcs_hr import hooks

		self.assertEqual(hooks.app_name, "gamcs_hr")
		self.assertEqual(hooks.required_apps, ["frappe/erpnext", "frappe/hrms"])
		self.assertEqual(hooks.after_migrate, "gamcs_hr.framework.setup_registry.after_migrate")
		self.assertEqual(hooks.after_install, "gamcs_hr.framework.setup_registry.after_install")

	def test_frappe_sees_module_hooks(self):
		frappe.clear_cache()
		handlers = frappe.get_hooks("doc_events", app_name="gamcs_hr")["Employee"]["validate"]
		self.assertIn("gamcs_hr.common.employee.normalise_legacy_id", handlers)
