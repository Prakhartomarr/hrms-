"""Golden probe: run every slip check, pending ones included, and print the gaps.

	infra/dev/hr.sh golden probe
	(= bench --site hrtest.localhost execute gamcs_hr.tests.golden.probe.run)

Pending checks that already match are listed as "matches now". Some match only by
coincidence (a flat rule giving the right number), so the owning task removes a
mark only once the rule behind it is in place. The run is rolled back at the end. Only for
the test site (allow_tests must be on).
"""

from __future__ import annotations

import collections

import frappe

from gamcs_hr.tests import factories
from gamcs_hr.tests.golden import engine, loader


def run(only: str | None = None):
	if not frappe.conf.get("allow_tests"):
		raise frappe.ValidationError("probe runs on the test site only (allow_tests is off)")
	frappe.flags.in_test = True
	frappe.flags.mute_emails = True
	factories.make_org(commit=True)  # the shared test baseline, same as OrgTestCase
	previous = engine.apply_payroll_settings(loader.defaults()["payroll_settings"])
	results = {}
	tally = collections.Counter()
	lines = []
	try:
		for check in loader.load_checks():
			if only and not check.case_id.startswith(only):
				continue
			label = f"{check.case_id} {check.variant}/{check.name}"
			if check.kind not in engine.EXECUTORS:
				tally["pending, no executor yet"] += 1
				continue
			key = (check.case_id, check.variant)
			if key not in results:
				tag = f"PROBE-{check.case_id}-{check.variant}".upper().replace("_", "-")
				try:
					results[key] = (engine.run_slip(check.scenario, tag), None)
				except Exception as e:
					results[key] = (None, f"{type(e).__name__}: {e}")
			slip, error = results[key]
			pend = f"  [{check.pending_label()}]" if check.pending else ""
			if error:
				status = "pending, cannot run" if check.pending else "ERROR"
				tally[status] += 1
				lines.append(f"{status:>20}  {label}: {error}{pend}")
				continue
			readable = [k for k in check.expect if k in engine.OUTPUTS]
			actual = engine.read_outputs(slip, readable)
			unread = [k for k in check.expect if k not in engine.OUTPUTS]
			diffs = [
				f"{k} expected {check.expect[k]} got {actual[k]}"
				for k in readable
				if actual[k] != check.expect[k]
			]
			if not check.pending:
				status = "PASS" if not diffs else "FAIL"
			elif diffs:
				status = "pending, differs"
			elif unread:
				status = "pending, no output"
			else:
				status = "matches now"
			tally[status] += 1
			detail = "; ".join(diffs + ([f"engine has no {', '.join(unread)}"] if unread else []))
			lines.append(f"{status:>20}  {label}{': ' + detail if detail else ''}{pend}")
	finally:
		engine.apply_payroll_settings(previous)
		frappe.db.rollback()
	print("\n".join(lines))
	print("\n" + ", ".join(f"{k}: {v}" for k, v in sorted(tally.items())))
