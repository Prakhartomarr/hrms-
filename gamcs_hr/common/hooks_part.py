"""Hooks of the `common` module. Literals only: this file is imported by hooks.py."""

doc_events = {
	"Employee": {
		"validate": "gamcs_hr.common.employee.normalise_legacy_id",
	},
}
