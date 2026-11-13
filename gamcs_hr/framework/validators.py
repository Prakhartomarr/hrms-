"""Pluggable validator pipelines for upstream doctypes.

Convention (see docs/conventions.md): one extension class per upstream doctype, owned
by one module, registered with Frappe's `extend_doctype_class` hook. The class mixes
in `ValidatorPipeline` and names the packages its rules live in:

	# gamcs_hr/leave/overrides/leave_application.py
	from gamcs_hr.framework.validators import ValidatorPipeline

	class LeaveApplicationExtension(ValidatorPipeline):
		validator_packages = ("gamcs_hr.leave.validators",)

	# gamcs_hr/leave/hooks_part.py
	extend_doctype_class = {
		"Leave Application": "gamcs_hr.leave.overrides.leave_application.LeaveApplicationExtension"
	}

Every non-underscore `.py` file in a validator package is one rule. A rule file
defines functions named after document events, each taking the document:

	# gamcs_hr/leave/validators/min_notice.py
	DOCTYPES = ("Leave Application",)   # optional; default: any doctype using the package
	ORDER = 20                          # optional; lower runs first, default 100, ties by file name

	def validate(doc):
		if ...:
			frappe.throw(_("..."))

A new rule is a new file: nobody edits a shared list. Rules run after the upstream
controller's own method for the same event, so they see the values upstream has
computed (for example `total_leave_days`).

`extend_doctype_class` (rather than `override_doctype_class`) is the default because
it stacks on top of whatever class is already in place, including overrides that hrms
or india_compliance install (hrms replaces Employee, Timesheet, Payment Entry and
Project). Use `override_doctype_class` only when a method has to be replaced outright,
and then subclass the class currently in effect.

Soft rules (a warning HR may accept) call `record_violation(doc, code, message)`
instead of throwing; callers read them from `doc.flags.gamcs_violations`.
"""

from __future__ import annotations

import functools
import importlib
import pkgutil
from collections.abc import Callable, Iterable
from dataclasses import dataclass

EVENTS = (
	"before_validate",
	"validate",
	"before_insert",
	"after_insert",
	"before_save",
	"on_update",
	"before_submit",
	"on_submit",
	"before_cancel",
	"on_cancel",
	"on_trash",
)

DEFAULT_ORDER = 100


@dataclass(frozen=True)
class Rule:
	name: str
	order: int
	doctypes: tuple[str, ...] | None
	handlers: dict[str, Callable]

	def applies_to(self, doctype: str) -> bool:
		return self.doctypes is None or doctype in self.doctypes


@functools.cache
def discover(package: str) -> tuple[Rule, ...]:
	"""All rules in `package`, sorted by (ORDER, module name). Cached per process."""
	pkg = importlib.import_module(package)
	rules = []
	for info in pkgutil.iter_modules(pkg.__path__):
		if info.name.startswith("_") or info.ispkg:
			continue
		mod = importlib.import_module(f"{package}.{info.name}")
		handlers = {event: getattr(mod, event) for event in EVENTS if callable(getattr(mod, event, None))}
		if not handlers:
			continue
		doctypes = getattr(mod, "DOCTYPES", None)
		if isinstance(doctypes, str):
			doctypes = (doctypes,)
		rules.append(
			Rule(
				name=mod.__name__,
				order=int(getattr(mod, "ORDER", DEFAULT_ORDER)),
				doctypes=tuple(doctypes) if doctypes is not None else None,
				handlers=handlers,
			)
		)
	return tuple(sorted(rules, key=lambda r: (r.order, r.name)))


def clear_cache():
	discover.cache_clear()


def handlers_for(packages: Iterable[str], doctype: str, event: str) -> list[Callable]:
	out = []
	for package in packages:
		for rule in discover(package):
			if event in rule.handlers and rule.applies_to(doctype):
				out.append(rule.handlers[event])
	return out


def run_validators(doc, event: str, packages: Iterable[str]) -> None:
	for handler in handlers_for(packages, doc.doctype, event):
		handler(doc)


def record_violation(doc, code: str, message: str) -> None:
	"""Note a soft rule breach on the document without stopping the save."""
	violations = doc.flags.gamcs_violations or []
	violations.append({"code": code, "message": message})
	doc.flags.gamcs_violations = violations


def _event_method(event: str):
	def method(self, *args, **kwargs):
		parent = getattr(super(ValidatorPipeline, self), event, None)
		result = parent(*args, **kwargs) if parent else None
		if not self.flags.get("skip_gamcs_validators"):
			run_validators(self, event, self.validator_packages)
		return result

	method.__name__ = event
	method.__qualname__ = f"ValidatorPipeline.{event}"
	return method


class ValidatorPipeline:
	"""Mixin: after each upstream event method, run the discovered rules for it."""

	validator_packages: tuple[str, ...] = ()


for _event in EVENTS:
	setattr(ValidatorPipeline, _event, _event_method(_event))
del _event
