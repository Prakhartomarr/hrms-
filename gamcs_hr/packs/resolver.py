"""Lookups: statutory packs by kind, code and date; rule documents by date.

Only published packs resolve. Both pack dates are inclusive; an empty
`effective_to` means open-ended. Policy versions apply from `effective_from` until
the next version of the same rule starts.
"""

from __future__ import annotations

from datetime import date

import frappe
from frappe import _
from frappe.utils import add_days, date_diff, getdate

from gamcs_hr.packs.constants import PUBLISHED
from gamcs_hr.packs.statutory_pack import parse_json

PACK_FIELDS = (
	"name",
	"kind",
	"code",
	"version",
	"effective_from",
	"effective_to",
	"country",
	"state",
	"local_body",
	"values",
	"tenant_overridable",
	"supersedes",
)


class PackNotFoundError(frappe.DoesNotExistError):
	pass


class PolicyVersionNotFoundError(frappe.DoesNotExistError):
	pass


def _published(kind: str, code: str) -> list[frappe._dict]:
	rows = frappe.get_all(
		"Statutory Pack",
		filters={"kind": kind, "code": code, "status": PUBLISHED},
		fields=list(PACK_FIELDS),
		order_by="effective_from asc",
	)
	for row in rows:
		row.effective_from = getdate(row.effective_from)
		row.effective_to = getdate(row.effective_to) if row.effective_to else None
		row["values"] = parse_json(row["values"], {})
		row.tenant_overridable = parse_json(row.tenant_overridable, [])
	return rows


def _covers(row, day: date) -> bool:
	return row.effective_from <= day and (row.effective_to is None or day <= row.effective_to)


def get_pack(kind: str, code: str, on_date) -> frappe._dict:
	"""The published pack of `kind` and `code` in force on `on_date`.

	Returns a dict with the pack's fields, `values` already parsed. Raises
	PackNotFoundError when no published version covers the date."""
	day = getdate(on_date)
	matches = [row for row in _published(kind, code) if _covers(row, day)]
	if not matches:
		raise PackNotFoundError(
			_("No published {0} pack {1} is in force on {2}.").format(kind, code, day.isoformat())
		)
	return matches[-1]  # publish() prevents overlaps; latest start wins if data was forced in


def get_pack_segments(kind: str, code: str, from_date, to_date) -> list[frappe._dict]:
	"""Every published version covering [from_date, to_date], each with its own day range.

	Each item: `pack` (as get_pack returns it), `from_date`, `to_date`, `days`
	(inclusive count). Raises PackNotFoundError naming the first uncovered day."""
	start, end = getdate(from_date), getdate(to_date)
	if end < start:
		frappe.throw(_("The period ends before it starts."))
	segments = []
	day = start
	rows = _published(kind, code)
	while day <= end:
		row = next((r for r in reversed(rows) if _covers(r, day)), None)
		if row is None:
			raise PackNotFoundError(
				_("No published {0} pack {1} is in force on {2}.").format(kind, code, day.isoformat())
			)
		seg_end = min(end, row.effective_to) if row.effective_to else end
		# a later version may start inside this one only if data was forced in; respect it
		later = [r.effective_from for r in rows if day < r.effective_from <= seg_end]
		if later:
			seg_end = getdate(add_days(min(later), -1))
		segments.append(
			frappe._dict(pack=row, from_date=day, to_date=seg_end, days=date_diff(seg_end, day) + 1)
		)
		day = getdate(add_days(seg_end, 1))
	return segments


# ---------------------------------------------------------------------------
# policy versions
# ---------------------------------------------------------------------------


def get_policy_version_name(doctype: str, name: str, on_date) -> str | None:
	rows = frappe.get_all(
		"Policy Version",
		filters={"policy_doctype": doctype, "policy_name": name, "effective_from": ("<=", getdate(on_date))},
		pluck="name",
		order_by="effective_from desc, version_no desc",
		limit=1,
	)
	return rows[0] if rows else None


def get_policy(doctype: str, name: str, on_date, fallback_to_live: bool = True):
	"""The rule document `doctype`/`name` as it stood on `on_date`.

	Returns an unsaved Document built from the latest Policy Version whose
	`effective_from` is on or before the date (ties: highest version number), with
	`doc.flags.gamcs_policy_version` set to that version's name.

	A rule that has never been versioned returns the live document when
	`fallback_to_live` is true. A rule that has versions, none of them in force yet
	on the date, raises PolicyVersionNotFoundError: guessing would silently apply a
	rule before it started."""
	version = get_policy_version_name(doctype, name, on_date)
	if version:
		snapshot = parse_json(frappe.db.get_value("Policy Version", version, "snapshot"), {})
		doc = frappe.get_doc(snapshot)
		doc.flags.gamcs_policy_version = version
		return doc

	has_versions = frappe.db.exists("Policy Version", {"policy_doctype": doctype, "policy_name": name})
	if has_versions or not fallback_to_live:
		raise PolicyVersionNotFoundError(
			_("{0} {1} has no version in force on {2}.").format(
				_(doctype), name, getdate(on_date).isoformat()
			)
		)
	doc = frappe.get_doc(doctype, name)
	doc.flags.gamcs_policy_version = None
	return doc
