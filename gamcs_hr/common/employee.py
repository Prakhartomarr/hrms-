def normalise_legacy_id(doc, method=None):
	"""Trim and upper-case the legacy ID so migration lookups match exactly."""
	if doc.get("gamcs_legacy_employee_id"):
		doc.gamcs_legacy_employee_id = doc.gamcs_legacy_employee_id.strip().upper()
