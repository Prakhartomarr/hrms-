app_name = "gamcs_hr"
app_title = "GAMCS HR"
app_publisher = "GA Management Consultants LLP"
app_description = "HRMS extensions on top of Frappe HR and ERPNext"
app_email = "dev@example.com"
app_license = "GPL-3.0"

# Installed after these; never edit them, extend them from here (see CLAUDE.md).
required_apps = ["frappe/erpnext", "frappe/hrms"]

# ---------------------------------------------------------------------------
# Extension points. Add entries here rather than editing upstream apps.
# ---------------------------------------------------------------------------

# Assets on desk / website
# app_include_css = "/assets/gamcs_hr/css/gamcs_hr.css"
# app_include_js = "/assets/gamcs_hr/js/gamcs_hr.js"

# Per-doctype client scripts shipped in the app
# doctype_js = {"Employee": "public/js/employee.js"}

# Server-side event handlers, additive to upstream's own
# doc_events = {
# 	"Leave Application": {"validate": "gamcs_hr.leave.validate"},
# }

# Replace an upstream controller class with a subclass that lives in gamcs_hr
# override_doctype_class = {"Salary Slip": "gamcs_hr.overrides.salary_slip.GAMCSSalarySlip"}

# Replace an upstream whitelisted method
# override_whitelisted_methods = {}

# Custom fields / property setters exported with `bench --site hr.localhost export-fixtures`
fixtures = [
	{"dt": "Custom Field", "filters": [["module", "=", "GAMCS HR"]]},
	{"dt": "Property Setter", "filters": [["module", "=", "GAMCS HR"]]},
	{"dt": "Client Script", "filters": [["module", "=", "GAMCS HR"]]},
]

# scheduler_events = {"daily": ["gamcs_hr.tasks.daily"]}
