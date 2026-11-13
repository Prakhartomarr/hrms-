"""Golden payroll suite: every check in `cases/*.yaml` becomes one test.

- active check: the scenario runs through today's engine and every expected key must
  match to the paisa;
- pending check: skipped with `pending(feature="T57"): <reason>`, never run as a pass.

Run alone with `infra/dev/hr.sh golden`; `infra/dev/hr.sh golden probe` also runs the
pending slip checks and shows how far each one is from its expected values.
"""

from __future__ import annotations

import collections

from frappe.tests import UnitTestCase

from gamcs_hr.tests.factories import OrgTestCase
from gamcs_hr.tests.golden import engine, loader


def format_diff(expect: dict, actual: dict) -> str:
	lines = []
	for k, want in expect.items():
		got = actual.get(k)
		mark = "  " if got == want else "!!"
		lines.append(f"{mark} {k}: expected {want}, got {got}")
	return "\n".join(lines)


class GoldenRun:
	"""Computes each scenario once and shares the result between its checks."""

	def __init__(self):
		self.results = {}

	def result(self, check: loader.Check):
		key = (check.case_id, check.variant)
		if key not in self.results:
			tag = f"{check.case_id}-{check.variant}".upper().replace("_", "-")
			try:
				self.results[key] = (engine.EXECUTORS[check.kind](check.scenario, tag), None)
			except Exception as e:  # reported on every check of the scenario
				self.results[key] = (None, e)
		return self.results[key]

	def actual(self, check: loader.Check) -> dict:
		slip, error = self.result(check)
		if error:
			raise error
		return engine.read_outputs(slip, check.expect)


class TestGoldenFixtures(UnitTestCase):
	def test_all_cases_present(self):
		ids = [c["id"] for c in loader.load_cases()]
		self.assertEqual(ids, [f"G{i:02d}" for i in range(1, 57)])

	def test_fixtures_are_consistent(self):
		problems = loader.validate()
		self.assertEqual(problems, [], "\n".join(problems))

	def test_every_pending_check_names_a_feature(self):
		for c in loader.load_checks():
			if c.pending:
				self.assertTrue(c.reason, c.key)
				self.assertTrue(c.pending_label().startswith('pending(feature="'), c.key)


class TestGoldenPayroll(OrgTestCase):
	golden: GoldenRun

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls._previous_settings = engine.apply_payroll_settings(loader.defaults()["payroll_settings"])
		cls.golden = GoldenRun()

	@classmethod
	def tearDownClass(cls):
		engine.apply_payroll_settings(cls._previous_settings)
		checks = loader.load_checks()
		pending = collections.Counter(f for c in checks for f in c.pending)
		active = sum(1 for c in checks if not c.pending)
		print(
			f"\ngolden: {len(checks)} checks, {active} active, {len(checks) - active} pending "
			f"({', '.join(f'{f} x{n}' for f, n in sorted(pending.items()))})"
		)
		super().tearDownClass()

	def _run_check(self, check: loader.Check):
		if check.pending:
			self.skipTest(check.pending_label())
		actual = self.golden.actual(check)
		self.assertEqual(
			actual,
			check.expect,
			f"{check.case_id} {check.title} [{check.variant}/{check.name}]\n"
			+ format_diff(check.expect, actual),
		)


def _make_test(check: loader.Check):
	def test(self):
		self._run_check(check)

	test.__doc__ = f"{check.case_id} {check.variant}/{check.name}: {check.title}"
	return test


for _check in loader.load_checks():
	setattr(TestGoldenPayroll, f"test_{_check.key}", _make_test(_check))
del _check
