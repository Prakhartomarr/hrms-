doc_events = {"ToDo": {"validate": "alpha.validate", "on_update": ["alpha.on_update"]}}
scheduler_events = {"daily": ["alpha.daily"]}
extend_doctype_class = {"ToDo": "alpha.ToDoExtension"}
app_include_js = "alpha.bundle.js"
