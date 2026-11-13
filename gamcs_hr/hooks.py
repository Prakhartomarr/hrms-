app_name = "gamcs_hr"
app_title = "GAMCS HR"
app_publisher = "GA Management Consultants LLP"
app_description = "HRMS extensions on top of Frappe HR and ERPNext"
app_email = "dev@example.com"
app_license = "GPL-3.0"

# Installed after these; never edit them, extend them from here (see CLAUDE.md).
# Keep this a literal: bench reads it from the file without importing it.
required_apps = ["frappe/erpnext", "frappe/hrms"]

# ---------------------------------------------------------------------------
# Shared entry points. Do not add feature hooks to this file.
#
# Feature hooks (doc_events, extend_doctype_class, scheduler_events, doctype_js,
# permission_query_conditions, ...) go in gamcs_hr/<module>/hooks_part.py and are
# merged below in the order of gamcs_hr/modules_order.py. Merge rules: see
# gamcs_hr/framework/hooks_merge.py and docs/conventions.md.
# ---------------------------------------------------------------------------

# Custom fields and property setters of every module (gamcs_hr/<module>/setup.py),
# synced on install and on every migrate.
after_install = "gamcs_hr.framework.setup_registry.after_install"
after_migrate = "gamcs_hr.framework.setup_registry.after_migrate"


def _merge_module_hooks():
	from gamcs_hr.framework.hooks_merge import build_hooks
	from gamcs_hr.modules_order import MODULES

	base = {k: v for k, v in globals().items() if not k.startswith("_")}
	globals().update(build_hooks(base, "gamcs_hr", MODULES))


_merge_module_hooks()
