"""Rules of the Statutory Pack doctype: validation and the publish workflow.

Draft -> CA verified -> Published (-> Withdrawn). Only published packs resolve
(gamcs_hr/packs/resolver.py). The status moves only through `mark_verified`,
`publish` and `withdraw`, never by editing the field.

Dates: `effective_from` and `effective_to` are both inclusive. An empty
`effective_to` means the version has no end date yet. When a newer version is
published, an open-ended older version of the same kind and code is closed the day
before the newer one starts.
"""

from __future__ import annotations

import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, getdate, now_datetime

from gamcs_hr.packs.constants import (
	CONTENT_FIELDS,
	DRAFT,
	PUBLISHED,
	PUBLISHER_ROLES,
	SOURCE_FIELDS,
	VERIFIED,
	VERIFIER_ROLES,
	WITHDRAW_ROLES,
	WITHDRAWN,
)

CODE_PATTERN = re.compile(r"^[A-Z0-9_-]+$")


class PackWorkflowError(frappe.ValidationError):
	pass


def parse_json(value, default=None):
	"""JSON fields arrive as a string from the form and as a dict or list from code."""
	if value in (None, ""):
		return default
	if isinstance(value, (dict, list)):
		return value
	return json.loads(value)


def _content(doc) -> dict:
	out = {f: doc.get(f) for f in CONTENT_FIELDS}
	for f in ("effective_from", "effective_to"):
		out[f] = getdate(out[f]) if out[f] else None
	for f in ("values", "tenant_overridable"):
		try:
			out[f] = parse_json(out[f])
		except ValueError:
			pass  # reported by validate
	out["sources"] = [tuple(str(row.get(f) or "") for f in SOURCE_FIELDS) for row in doc.get("sources") or []]
	return out


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------


def validate(doc):
	doc.code = (doc.code or "").strip().upper()
	if not CODE_PATTERN.match(doc.code):
		frappe.throw(_("Code may only use capitals, digits, hyphen and underscore, like PF-IN."))
	if doc.state:
		doc.state = doc.state.strip().upper()
	if doc.effective_to and getdate(doc.effective_to) < getdate(doc.effective_from):
		frappe.throw(_("Effective to can't be before effective from."))

	try:
		values = parse_json(doc.values)
	except ValueError as e:
		frappe.throw(_("Values must be valid JSON: {0}").format(e))
	if not isinstance(values, dict):
		frappe.throw(_("Values must be a JSON object."))
	try:
		overridable = parse_json(doc.tenant_overridable, [])
	except ValueError as e:
		frappe.throw(_("Company may override must be valid JSON: {0}").format(e))
	if not isinstance(overridable, list):
		frappe.throw(_("Company may override must be a JSON list of value keys."))

	_guard_status_and_content(doc)


def _guard_status_and_content(doc):
	transition = doc.flags.gamcs_pack_transition
	old = None if doc.is_new() else doc.get_doc_before_save()

	if old is None:
		if doc.status != DRAFT and not transition:
			frappe.throw(_("A new pack starts as a draft."), PackWorkflowError)
		return

	if old.status != doc.status and not transition:
		frappe.throw(
			_("Use the Mark CA verified, Publish or Withdraw actions to change the status."),
			PackWorkflowError,
		)

	before, after = _content(old), _content(doc)
	changed = [f for f in after if after[f] != before[f]]
	if not changed:
		return

	if old.status in (PUBLISHED, WITHDRAWN):
		closing_only = changed == ["effective_to"] and doc.flags.gamcs_pack_close
		if not closing_only:
			frappe.throw(
				_("{0} packs can't be edited. Make a new version instead.").format(_(old.status)),
				PackWorkflowError,
			)
	elif old.status == VERIFIED and not transition:
		# Any change to what the CA checked sends the pack back for checking.
		doc.status = DRAFT
		doc.needs_verification = 1
		doc.reviewed_by = None
		doc.reviewed_on = None
		frappe.msgprint(_("Values changed, so the pack is back in draft and needs verifying again."))


def on_trash(doc):
	if doc.status != DRAFT:
		frappe.throw(_("Only draft packs can be deleted. Withdraw a published one."), PackWorkflowError)


# ---------------------------------------------------------------------------
# workflow
# ---------------------------------------------------------------------------


def _require_role(roles, action):
	if frappe.session.user == "Administrator":
		return
	if not set(roles) & set(frappe.get_roles()):
		frappe.throw(
			_("You need one of these roles to {0}: {1}").format(action, ", ".join(roles)),
			frappe.PermissionError,
		)


def _save(doc, **flags):
	"""Save with the transition flags set, and clear them again afterwards so a later
	plain save of the same object goes through the normal guards."""
	flags = {"gamcs_pack_transition": True, **flags}
	for k, v in flags.items():
		doc.flags[k] = v
	try:
		doc.save()
	finally:
		for k in flags:
			doc.flags.pop(k, None)


def mark_verified(doc, notes: str | None = None):
	"""A CA (Statutory Reviewer) confirms the values against the primary sources."""
	_require_role(VERIFIER_ROLES, _("verify a pack"))
	if doc.status != DRAFT:
		frappe.throw(_("Only a draft can be verified. This pack is {0}.").format(_(doc.status)))
	if not doc.get("sources"):
		frappe.throw(_("Add at least one source before verifying."))
	if frappe.session.user != "Administrator" and frappe.session.user == doc.owner:
		frappe.throw(_("Someone other than the author has to verify this pack."), PackWorkflowError)
	doc.status = VERIFIED
	doc.needs_verification = 0
	doc.reviewed_by = frappe.session.user
	doc.reviewed_on = now_datetime()
	if notes:
		doc.review_notes = notes
	_save(doc)
	return doc


def publish(doc):
	"""Make a verified pack the one that resolves for its dates."""
	_require_role(PUBLISHER_ROLES, _("publish a pack"))
	if doc.status != VERIFIED:
		frappe.throw(_("Only a CA-verified pack can be published. This pack is {0}.").format(_(doc.status)))

	start = getdate(doc.effective_from)
	end = getdate(doc.effective_to) if doc.effective_to else None
	to_close = []
	for other in frappe.get_all(
		"Statutory Pack",
		filters={"kind": doc.kind, "code": doc.code, "status": PUBLISHED, "name": ("!=", doc.name)},
		fields=["name", "effective_from", "effective_to"],
	):
		o_start = getdate(other.effective_from)
		o_end = getdate(other.effective_to) if other.effective_to else None
		overlaps = (end is None or o_start <= end) and (o_end is None or start <= o_end)
		if not overlaps:
			continue
		if o_end is None and o_start < start:
			to_close.append(other.name)  # open-ended older version: close it
			continue
		frappe.throw(
			_("{0} is already published for {1} to {2}. Withdraw it or change the dates first.").format(
				other.name, other.effective_from, other.effective_to or _("no end date")
			),
			PackWorkflowError,
		)

	for name in to_close:
		older = frappe.get_doc("Statutory Pack", name)
		older.effective_to = add_days(start, -1)
		_save(older, gamcs_pack_close=True)
		doc.supersedes = name

	doc.status = PUBLISHED
	doc.published_by = frappe.session.user
	doc.published_on = now_datetime()
	_save(doc)
	return doc


def withdraw(doc, reason: str):
	"""Take a published pack out of use. Its dates are not handed to another version."""
	_require_role(WITHDRAW_ROLES, _("withdraw a pack"))
	if doc.status != PUBLISHED:
		frappe.throw(_("Only a published pack can be withdrawn."))
	if not (reason or "").strip():
		frappe.throw(_("Say why the pack is withdrawn."))
	doc.status = WITHDRAWN
	note = _("Withdrawn by {0} on {1}: {2}").format(frappe.session.user, now_datetime(), reason.strip())
	doc.review_notes = f"{doc.review_notes}\n{note}" if doc.review_notes else note
	_save(doc)
	return doc
