"""Policy Version: an effective-dated snapshot of a rule document.

Used for rule doctypes that are edited in place (Leave Type, Shift Type, Overtime
Type, HR Settings, our own rule doctypes). Submittable rules keep using amendment.
Our engines read rules through `gamcs_hr.packs.get_policy(doctype, name, date)`.

A version is never edited after it is made: to change a rule from a date, make a
new version. Only the note can be corrected.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

IMMUTABLE_FIELDS = ("policy_doctype", "policy_name", "version_no", "effective_from", "snapshot")


def snapshot_of(doctype: str, name: str) -> str:
	"""JSON of the live document, child rows included."""
	doc = frappe.get_doc(doctype, name)
	data = doc.as_dict(convert_dates_to_str=True)
	data.pop("__onload", None)
	return frappe.as_json(data)


def next_version_no(doctype: str, name: str) -> int:
	rows = frappe.get_all(
		"Policy Version",
		filters={"policy_doctype": doctype, "policy_name": name},
		pluck="version_no",
		order_by="version_no desc",
		limit=1,
	)
	return int(rows[0] or 0) + 1 if rows else 1


def autoname(doc):
	if not doc.version_no:
		doc.version_no = next_version_no(doc.policy_doctype, doc.policy_name)
	doc.name = f"{doc.policy_doctype}-{doc.policy_name}-v{doc.version_no}"


def before_insert(doc):
	if not frappe.db.exists(doc.policy_doctype, doc.policy_name):
		frappe.throw(_("{0} {1} doesn't exist.").format(_(doc.policy_doctype), doc.policy_name))
	if frappe.get_meta(doc.policy_doctype).istable:
		frappe.throw(_("Version the parent rule, not a child table."))
	if not doc.snapshot:
		doc.snapshot = snapshot_of(doc.policy_doctype, doc.policy_name)
	doc.published_by = frappe.session.user
	doc.published_on = now_datetime()


def validate(doc):
	try:
		data = json.loads(doc.snapshot) if isinstance(doc.snapshot, str) else doc.snapshot
	except ValueError as e:
		frappe.throw(_("Snapshot must be valid JSON: {0}").format(e))
	if not isinstance(data, dict) or data.get("doctype") != doc.policy_doctype:
		frappe.throw(_("Snapshot must be a {0} document.").format(_(doc.policy_doctype)))
	if data.get("name") != doc.policy_name:
		frappe.throw(_("Snapshot is of {0}, not {1}.").format(data.get("name"), doc.policy_name))

	if doc.is_new():
		return
	old = doc.get_doc_before_save()
	for f in IMMUTABLE_FIELDS:
		before, after = old.get(f), doc.get(f)
		if f == "effective_from":
			before, after = getdate(before), getdate(after)
		if f == "snapshot":
			before, after = json.loads(before or "{}"), data
		if before != after:
			frappe.throw(_("A policy version can't be changed. Make a new version instead."))


def create_policy_version(doctype: str, name: str, effective_from, note: str | None = None):
	"""Snapshot the live rule now and make it apply from `effective_from`."""
	doc = frappe.get_doc(
		{
			"doctype": "Policy Version",
			"policy_doctype": doctype,
			"policy_name": name,
			"effective_from": getdate(effective_from),
			"note": note,
		}
	)
	doc.insert()
	return doc


@frappe.whitelist(methods=["POST"])
def make_version(doctype: str, name: str, effective_from: str, note: str | None = None) -> str:
	"""Desk action: save the rule as it is now as a new version from a date."""
	frappe.has_permission(doctype, "write", doc=name, throw=True)
	frappe.has_permission("Policy Version", "create", throw=True)
	return create_policy_version(doctype, name, effective_from, note).name
