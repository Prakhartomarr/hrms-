"""Field Change Log: Version diffs flattened into one row per changed field.

Frappe's Version rows store raw before and after values, and query reports don't
pass through Frappe's list masking. So this report applies masking itself, with the
same rules as the rest of the app (gamcs_hr/org/masking.py):

- a field with `mask = 1` shows as XXXXXXXX unless the user's roles have the
  `mask` permission at its permlevel (Meta.get_masked_fields);
- child-table fields follow the child doctype's mask settings for that parent;
- an employee sees their own Employee record's values in full.

Rows are limited to documents the user may read. Child rows that were added or
removed are listed without their values, since those can hold masked fields.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.model.utils.mask import mask_field_value
from frappe.utils import add_days, cint, get_datetime, getdate, nowdate

from gamcs_hr.audit.setup import TRACKED_DOCTYPES

DEFAULT_LIMIT = 2000
MAX_LIMIT = 20000


def columns() -> list[dict]:
	return [
		{"fieldname": "changed_on", "label": _("Changed on"), "fieldtype": "Datetime", "width": 160},
		{
			"fieldname": "changed_by",
			"label": _("Changed by"),
			"fieldtype": "Link",
			"options": "User",
			"width": 180,
		},
		{
			"fieldname": "ref_doctype",
			"label": _("Document type"),
			"fieldtype": "Link",
			"options": "DocType",
			"width": 150,
		},
		{
			"fieldname": "docname",
			"label": _("Document"),
			"fieldtype": "Dynamic Link",
			"options": "ref_doctype",
			"width": 160,
		},
		{"fieldname": "table", "label": _("Table"), "fieldtype": "Data", "width": 130},
		{"fieldname": "row_no", "label": _("Row"), "fieldtype": "Int", "width": 60},
		{"fieldname": "field", "label": _("Field"), "fieldtype": "Data", "width": 160},
		{"fieldname": "old_value", "label": _("Before"), "fieldtype": "Data", "width": 180},
		{"fieldname": "new_value", "label": _("After"), "fieldtype": "Data", "width": 180},
		{"fieldname": "note", "label": _("Note"), "fieldtype": "Data", "width": 140},
		{
			"fieldname": "version",
			"label": _("Version"),
			"fieldtype": "Link",
			"options": "Version",
			"hidden": 1,
		},
	]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return columns(), get_rows(filters)


def _version_filters(filters) -> dict:
	to_date = getdate(filters.to_date or nowdate())
	from_date = getdate(filters.from_date or add_days(to_date, -30))
	if from_date > to_date:
		frappe.throw(_("From date must be on or before to date."))
	out = {
		"creation": (
			"between",
			[get_datetime(f"{from_date} 00:00:00"), get_datetime(f"{to_date} 23:59:59.999999")],
		),
		"ref_doctype": filters.ref_doctype or ("in", TRACKED_DOCTYPES),
	}
	if filters.docname:
		out["docname"] = filters.docname
	if filters.user:
		out["owner"] = filters.user
	return out


class _Access:
	"""Per-run caches for read permission and masked fields."""

	def __init__(self):
		self.user = frappe.session.user
		self._read: dict[tuple, bool] = {}
		self._masked: dict[tuple, dict] = {}
		self._own_employee = None
		if self.user not in ("Administrator", "Guest"):
			self._own_employee = frappe.db.get_value("Employee", {"user_id": self.user}, "name")

	def can_read(self, doctype: str, name: str) -> bool:
		key = (doctype, name)
		if key not in self._read:
			if frappe.db.exists(doctype, name):
				allowed = frappe.has_permission(doctype, "read", doc=name, user=self.user)
			else:  # deleted since: fall back to the doctype-level right
				allowed = frappe.has_permission(doctype, "read", user=self.user)
			self._read[key] = bool(allowed)
		return self._read[key]

	def masked(self, doctype: str, parenttype: str | None = None) -> dict:
		key = (doctype, parenttype)
		if key not in self._masked:
			try:
				fields = frappe.get_meta(doctype).get_masked_fields(parenttype=parenttype)
			except frappe.DoesNotExistError:
				fields = []
			self._masked[key] = {df.fieldname: df for df in fields}
		return self._masked[key]

	def unmasked_for_self(self, doctype: str, name: str) -> bool:
		return doctype == "Employee" and bool(self._own_employee) and name == self._own_employee


def _label(meta, fieldname: str) -> str:
	df = meta.get_field(fieldname) if meta else None
	return _(df.label) if df and df.label else fieldname


def _show(value, df) -> str:
	if value is None:
		return ""
	value = (
		value
		if isinstance(value, str)
		else frappe.as_json(value)
		if isinstance(value, (dict, list))
		else str(value)
	)
	return mask_field_value(df, value) if df else value


def _note(data: dict) -> str:
	notes = []
	if data.get("data_import"):
		notes.append(_("Data import"))
	if data.get("impersonated_by"):
		notes.append(_("Impersonated by {0}").format(data["impersonated_by"]))
	return ", ".join(notes)


def flatten(version: dict, access: _Access) -> list[dict]:
	"""Rows for one Version record, masked for the current user."""
	try:
		data = json.loads(version["data"] or "{}")
	except ValueError:
		return []
	doctype, docname = version["ref_doctype"], version["docname"]
	try:
		meta = frappe.get_meta(doctype)
	except frappe.DoesNotExistError:
		meta = None
	unmask = access.unmasked_for_self(doctype, docname)
	masked = {} if unmask else access.masked(doctype)
	base = {
		"version": version["name"],
		"changed_on": version["creation"],
		"changed_by": version["owner"],
		"ref_doctype": doctype,
		"docname": docname,
		"note": _note(data),
	}
	rows = []

	for change in data.get("changed") or []:
		fieldname, old, new = change[0], change[1], change[2]
		df = masked.get(fieldname)
		rows.append(
			{
				**base,
				"field": _label(meta, fieldname),
				"fieldname": fieldname,
				"old_value": _show(old, df),
				"new_value": _show(new, df),
			}
		)

	for table_field, idx, _rowname, changes in data.get("row_changed") or []:
		child_dt = meta.get_field(table_field).options if meta and meta.get_field(table_field) else None
		child_meta = frappe.get_meta(child_dt) if child_dt else None
		child_masked = {} if unmask or not child_dt else access.masked(child_dt, doctype)
		for fieldname, old, new in changes:
			df = child_masked.get(fieldname)
			rows.append(
				{
					**base,
					"table": _label(meta, table_field),
					"row_no": cint(idx) + 1,
					"field": _label(child_meta, fieldname),
					"fieldname": fieldname,
					"old_value": _show(old, df),
					"new_value": _show(new, df),
				}
			)

	for key, text in (("added", _("Row added")), ("removed", _("Row removed"))):
		for table_field, row in data.get(key) or []:
			rows.append(
				{
					**base,
					"table": _label(meta, table_field),
					"row_no": cint((row or {}).get("idx")) or None,
					"field": _label(meta, table_field),
					"fieldname": table_field,
					"old_value": text if key == "removed" else "",
					"new_value": text if key == "added" else "",
				}
			)
	return rows


def get_rows(filters) -> list[dict]:
	limit = min(cint(filters.limit) or DEFAULT_LIMIT, MAX_LIMIT)
	versions = frappe.get_all(
		"Version",
		filters=_version_filters(filters),
		fields=["name", "ref_doctype", "docname", "owner", "creation", "data"],
		order_by="creation desc",
		limit=limit,
	)
	access = _Access()
	out = []
	for version in versions:
		if not access.can_read(version.ref_doctype, version.docname):
			continue
		for row in flatten(version, access):
			if filters.fieldname and filters.fieldname not in (row.get("fieldname"), row.get("field")):
				continue
			out.append(row)
	return out
