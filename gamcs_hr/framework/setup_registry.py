"""Shared setup registry: syncs every module's custom fields and property setters.

Each feature module may ship `gamcs_hr/<module>/setup.py` with any of:

	CUSTOM_FIELDS = {"Employee": [{"fieldname": "...", "fieldtype": "Data", ...}]}
	PROPERTY_SETTERS = [
		{"doctype": "Employee", "fieldname": "pan_number", "property": "bold",
		 "value": "1", "property_type": "Check"},
		# doctype-level: leave out "fieldname"
		{"doctype": "Employee", "property": "search_fields", "value": "...", "property_type": "Data"},
	]
	def after_sync(): ...   # optional, idempotent extra setup (roles, settings, records)

`CUSTOM_FIELDS` / `PROPERTY_SETTERS` may also be zero-argument functions returning the
same shapes, for values that need a lookup.

`run()` is wired to both `after_install` and `after_migrate` in hooks.py, so every
`bench migrate` brings the site in line with the code. It is idempotent: unchanged
fields and property setters are left alone. Everything is created with
`module = "GAMCS HR"`, so it is easy to find and never mixed with user customisations.

Two modules declaring the same (doctype, fieldname) custom field, or the same
(doctype, fieldname, property) property setter, is an error: each customisation has
exactly one owner.

Removing a field is not automatic (data could be lost). Drop it from `setup.py` and
add a patch that deletes it.
"""

from __future__ import annotations

import importlib
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

MODULE_DEF = "GAMCS HR"
PACKAGE = "gamcs_hr"


class SetupConflictError(frappe.ValidationError):
	pass


@dataclass
class SetupPlan:
	custom_fields: dict[str, list[dict]] = field(default_factory=dict)
	property_setters: list[dict] = field(default_factory=list)
	after_sync: list[tuple[str, Any]] = field(default_factory=list)
	owners: dict[tuple, str] = field(default_factory=dict)


def _value(mod, name, default):
	value = getattr(mod, name, default)
	return value() if callable(value) else value


def _import_setup(package: str, module: str):
	dotted = f"{package}.{module}.setup"
	try:
		return importlib.import_module(dotted)
	except ModuleNotFoundError as e:
		if e.name and dotted.startswith(e.name):
			return None
		raise


def _claim(plan: SetupPlan, key: tuple, source: str):
	if key in plan.owners and plan.owners[key] != source:
		raise SetupConflictError(f"{key} is declared by both {plan.owners[key]} and {source}")
	plan.owners[key] = source


def collect(modules: Iterable[str] | None = None, package: str = PACKAGE) -> SetupPlan:
	"""Read every module's setup.py into one plan, checking for duplicate owners."""
	if modules is None:
		from gamcs_hr.modules_order import MODULES as modules

	plan = SetupPlan()
	for module in modules:
		mod = _import_setup(package, module)
		if mod is None:
			continue
		source = mod.__name__

		for doctypes, fields in (_value(mod, "CUSTOM_FIELDS", None) or {}).items():
			for doctype in (doctypes,) if isinstance(doctypes, str) else doctypes:
				for df in (fields,) if isinstance(fields, dict) else fields:
					_claim(plan, ("Custom Field", doctype, df["fieldname"]), source)
					plan.custom_fields.setdefault(doctype, []).append({"module": MODULE_DEF, **df})

		for ps in _value(mod, "PROPERTY_SETTERS", None) or []:
			ps = {"fieldname": None, "module": MODULE_DEF, **ps}
			_claim(plan, ("Property Setter", ps["doctype"], ps["fieldname"], ps["property"]), source)
			plan.property_setters.append(ps)

		if callable(getattr(mod, "after_sync", None)):
			plan.after_sync.append((source, mod.after_sync))
	return plan


def sync_property_setter(ps: dict) -> bool:
	"""Create or update one property setter. Returns True when something changed."""
	doctype, fieldname = ps["doctype"], ps["fieldname"]
	name = f"{doctype}-{fieldname or 'main'}-{ps['property']}"
	value = str(ps["value"])
	existing = frappe.db.get_value(
		"Property Setter", name, ["value", "property_type", "module"], as_dict=True
	)
	if existing and (existing.value, existing.property_type, existing.module) == (
		value,
		ps["property_type"],
		ps["module"],
	):
		return False
	if existing:
		frappe.db.set_value(
			"Property Setter",
			name,
			{"value": value, "property_type": ps["property_type"], "module": ps["module"]},
		)
		frappe.clear_cache(doctype=doctype)
		return True
	doc = frappe.get_doc(
		{
			"doctype": "Property Setter",
			"doctype_or_field": "DocField" if fieldname else "DocType",
			"doc_type": doctype,
			"field_name": fieldname,
			"property": ps["property"],
			"value": value,
			"property_type": ps["property_type"],
			"module": ps["module"],
			"is_system_generated": 1,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	return True


def run(modules: Iterable[str] | None = None, package: str = PACKAGE) -> SetupPlan:
	"""Sync all declared customisations. Safe to call any number of times."""
	plan = collect(modules, package)
	if plan.custom_fields:
		create_custom_fields(plan.custom_fields, update=True)
	for ps in plan.property_setters:
		sync_property_setter(ps)
	for _source, fn in plan.after_sync:
		fn()
	return plan


def after_install():
	run()


def after_migrate():
	run()
