PROPERTY_SETTERS = [
	{"doctype": "ToDo", "fieldname": "description", "property": "bold", "value": 1, "property_type": "Check"},
]

CALLS = []


def after_sync():
	CALLS.append("alpha")
