"""Setup of the `packs` module (run by the setup registry on install and migrate)."""

import frappe

from gamcs_hr.packs.constants import REVIEWER_ROLE


def after_sync():
	"""Idempotent: the reviewer role and the draft seed packs."""
	if not frappe.db.exists("Role", REVIEWER_ROLE):
		frappe.get_doc(
			{"doctype": "Role", "role_name": REVIEWER_ROLE, "desk_access": 1, "is_custom": 1}
		).insert(ignore_permissions=True)

	from gamcs_hr.packs.seed import ensure_seed_packs

	ensure_seed_packs()
