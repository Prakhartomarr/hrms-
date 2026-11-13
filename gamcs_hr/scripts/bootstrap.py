"""Set up a fresh dev or test site with GAMCS-like defaults and the factory organisation.

	bench --site hr.localhost execute gamcs_hr.scripts.bootstrap.run
	bench --site hrtest.localhost execute gamcs_hr.scripts.bootstrap.run --kwargs "{'site_defaults': 0}"

Steps, each idempotent:

1. complete the setup wizard if it hasn't run (India, INR, Asia/Kolkata, Apr-Mar year,
   company `factories.COMPANY`); on a site that is already set up nothing is redone
2. site defaults (`SITE_DEFAULTS`, `HR_DEFAULTS`): Indian date and number formats,
   Monday week start, 9 standard working hours, retirement at 58. Skip on the shared
   test site (`site_defaults=0`), because upstream tests assume the stock formats.
3. the organisation from `gamcs_hr.tests.factories.make_org`: branches in four states,
   departments, grades, 30 employees in a reporting tree, holiday list and its
   assignment, leave types, salary structure

It does not replace `hr.sh seed` (the demo company); both can live on one site.
"""

import frappe

from gamcs_hr.tests import factories

SITE_DEFAULTS = {
	"country": "India",
	"time_zone": "Asia/Kolkata",
	"currency": "INR",
	"date_format": "dd-mm-yyyy",
	"number_format": "#,##,###.##",
	"first_day_of_the_week": "Monday",
}
HR_DEFAULTS = {
	"standard_working_hours": 9,
	"retirement_age": 58,
}


def run(site_defaults=1, commit=1):
	frappe.flags.mute_emails = True
	ensure_setup_complete()
	changed = apply_site_defaults() if int(site_defaults) else {}
	org = factories.make_org(commit=False)
	if int(commit):
		frappe.db.commit()
	summary = {
		"company": org.company,
		"branches": org.branches,
		"departments": len(org.departments),
		"employees": len(org.employees),
		"holiday_list": org.holiday_list,
		"leave_types": len(org.leave_types),
		"salary_structure": org.salary_structure,
		"settings_changed": sorted(changed),
	}
	print("gamcs_hr bootstrap:", summary)
	return summary


def ensure_setup_complete():
	if frappe.is_setup_complete():
		return
	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	setup_complete(
		{
			"language": "English",
			"country": "India",
			"timezone": "Asia/Kolkata",
			"currency": "INR",
			"full_name": "Administrator",
			"company_name": factories.COMPANY,
			"company_abbr": factories.ABBR,
			"chart_of_accounts": "Standard",
			"fy_start_date": factories.FY_START,
			"fy_end_date": factories.FY_END,
			"setup_demo": 0,
		}
	)
	if not frappe.db.exists("Company", factories.COMPANY):
		frappe.throw(f"Setup wizard did not create {factories.COMPANY}; check the error log")


def site_default_changes():
	"""{"Doctype.field": (current, wanted)} for every default that differs. Read only."""
	out = {}
	for doctype, wanted in (("System Settings", SITE_DEFAULTS), ("HR Settings", HR_DEFAULTS)):
		meta = frappe.get_meta(doctype)
		for fieldname, value in wanted.items():
			if not meta.has_field(fieldname):
				continue
			current = frappe.db.get_single_value(doctype, fieldname)
			if str(current or "") != str(value):
				out[f"{doctype}.{fieldname}"] = (current, value)
	return out


def apply_site_defaults():
	changes = site_default_changes()
	for doctype in ("System Settings", "HR Settings"):
		fields = {k.split(".", 1)[1]: v for k, (_c, v) in changes.items() if k.startswith(doctype + ".")}
		if fields:
			doc = frappe.get_single(doctype)
			doc.update(fields)
			doc.save()
	return changes
