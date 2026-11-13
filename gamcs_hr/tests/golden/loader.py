"""Load and check the golden payroll fixtures in `cases/*.yaml`.

Each file holds `cases`; a case has `variants` (one scenario each) and every variant
has named `checks`. A check is an `expect` dict (money in integer paise) plus an
optional `pending: {feature: T57 | [T57, T58], reason: ...}` mark. One test runs per
check, so a part of a case can pass while the rest waits for its feature.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass
from pathlib import Path

import yaml

from gamcs_hr.tests.golden.features import FEATURES

CASES_DIR = Path(__file__).parent / "cases"

# keys that are never money; besides these, *_days, *_pct and *_date keys are not money
NON_MONEY = frozenset(
	{
		"paid_days",
		"covered",
		"eligible",
		"flag",
		"error",
		"years",
		"source_month",
		"eps_member_from",
		"recommended",
		"rows",
		"month",
		"state",
	}
)


def is_money_key(key: str) -> bool:
	return key not in NON_MONEY and not key.endswith(("_days", "_pct", "_date"))


@dataclass(frozen=True)
class Check:
	case_id: str
	title: str
	area: str
	variant: str
	name: str
	scenario: dict
	expect: dict
	pending: tuple[str, ...]  # feature ids; empty = active
	reason: str
	ca_signoff: bool
	note: str = ""

	@property
	def key(self) -> str:
		return f"{self.case_id}_{self.variant}_{self.name}"

	@property
	def kind(self) -> str:
		return self.scenario["kind"]

	def pending_label(self) -> str:
		return f'pending(feature="{",".join(self.pending)}"): {self.reason}'


@functools.cache
def defaults() -> dict:
	return yaml.safe_load((CASES_DIR / "_defaults.yaml").read_text())


@functools.cache
def load_cases() -> tuple[dict, ...]:
	out = []
	for path in sorted(CASES_DIR.glob("*.yaml")):
		if path.name.startswith("_"):
			continue
		doc = yaml.safe_load(path.read_text())
		for case in doc["cases"]:
			out.append({**case, "area": doc["area"], "file": path.name})
	return tuple(sorted(out, key=lambda c: c["id"]))


@functools.cache
def load_checks() -> tuple[Check, ...]:
	checks = []
	for case in load_cases():
		for variant in case["variants"]:
			for name, spec in variant["checks"].items():
				pending = spec.get("pending") or {}
				feature = pending.get("feature") or ()
				checks.append(
					Check(
						case_id=case["id"],
						title=case["title"],
						area=case["area"],
						variant=variant["name"],
						name=name,
						scenario=variant["scenario"],
						expect=spec["expect"],
						pending=(feature,) if isinstance(feature, str) else tuple(feature),
						reason=pending.get("reason", ""),
						ca_signoff=bool(case.get("ca_signoff")),
						note=spec.get("note", ""),
					)
				)
	return tuple(checks)


def validate() -> list[str]:
	"""Problems in the fixtures, as readable lines (empty when all is well)."""
	from gamcs_hr.tests.golden import engine

	problems = []
	ids = [c["id"] for c in load_cases()]
	if len(ids) != len(set(ids)):
		problems.append(f"duplicate case ids: {sorted({i for i in ids if ids.count(i) > 1})}")
	keys = [c.key for c in load_checks()]
	if len(keys) != len(set(keys)):
		problems.append("duplicate case/variant/check names")
	for case in load_cases():
		if not case.get("variants"):
			problems.append(f"{case['id']}: no variants")
		for v in case.get("variants", ()):
			if not v.get("checks"):
				problems.append(f"{case['id']}/{v['name']}: no checks")
	for c in load_checks():
		where = c.key
		if not c.expect:
			problems.append(f"{where}: empty expect")
		problems += [f"{where}: {p}" for p in _money_problems(c.expect)]
		if c.pending:
			unknown = [f for f in c.pending if f not in FEATURES]
			if unknown:
				problems.append(f"{where}: unknown feature {unknown}")
			if not c.reason:
				problems.append(f"{where}: pending without a reason")
		else:
			# an active check must be runnable now, every key readable from the engine
			if c.kind not in engine.EXECUTORS:
				problems.append(f"{where}: active but no executor for kind {c.kind!r}")
			else:
				missing = [k for k in c.expect if k not in engine.OUTPUTS]
				if missing:
					problems.append(f"{where}: active but the engine has no output for {missing}")
	return problems


def _money_problems(d, path=""):
	out = []
	if isinstance(d, dict):
		for k, v in d.items():
			p = f"{path}.{k}" if path else k
			if isinstance(v, (dict, list)):
				out += _money_problems(v, p)
			elif is_money_key(k) and not (isinstance(v, int) and not isinstance(v, bool)):
				out.append(f"{p} = {v!r} is not integer paise")
	elif isinstance(d, list):
		for i, v in enumerate(d):
			out += _money_problems(v, f"{path}[{i}]")
	return out
