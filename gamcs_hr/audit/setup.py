"""Customisations owned by the `audit` module (synced by the setup registry).

Turns `track_changes` on for every doctype in `hooks_part.audit_trail_doctypes`
whose own definition has it off, so each save writes a Version row with the field
diff. Doctypes that already track changes need no property setter.
"""

import frappe

from gamcs_hr.audit.hooks_part import audit_trail_doctypes

TRACKED_DOCTYPES = tuple(audit_trail_doctypes)


def doctypes_needing_tracking() -> list[str]:
	"""Doctypes in the list that exist on this site and don't track changes natively."""
	rows = frappe.get_all(
		"DocType",
		filters={"name": ("in", TRACKED_DOCTYPES), "track_changes": 0, "istable": 0},
		pluck="name",
	)
	return sorted(rows)


def PROPERTY_SETTERS():
	if not frappe.db.table_exists("DocType"):
		return []
	return [
		{"doctype": dt, "property": "track_changes", "value": 1, "property_type": "Check"}
		for dt in doctypes_needing_tracking()
	]
