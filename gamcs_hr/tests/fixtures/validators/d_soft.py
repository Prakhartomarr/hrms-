from gamcs_hr.framework.validators import record_violation

ORDER = 200


def validate(doc):
	if doc.description == "soft":
		record_violation(doc, "soft_rule", "Allowed, but flagged")
