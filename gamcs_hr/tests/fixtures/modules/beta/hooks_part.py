from gamcs_hr.framework import hooks_merge as _unused  # modules and functions are ignored


def helper():  # functions are not hooks
	return 1


doc_events = {
	"ToDo": {"validate": "beta.validate", "on_update": "alpha.on_update"},
	"Note": {"validate": "beta.note_validate"},
}
scheduler_events = {"daily": ["beta.daily"], "cron": {"0 1 * * *": ["beta.cron"]}}
app_include_js = ["beta.bundle.js"]
_private = {"not": "a hook"}
