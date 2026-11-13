"""Customisations owned by the `common` module (synced by the setup registry)."""

CUSTOM_FIELDS = {
	"Employee": [
		{
			"fieldname": "gamcs_legacy_employee_id",
			"label": "Legacy employee ID",
			"fieldtype": "Data",
			"insert_after": "employee_number",
			"no_copy": 1,
			"search_index": 1,
			"description": "ID of this person in the previous HR system. Set by data migration.",
		},
	],
}
