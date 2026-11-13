"""Hooks of the `work_app` module. Literals only: this file is imported by hooks.py."""

# Every /work/... path is served by gamcs_hr/www/work.py; the SPA router takes it from there.
website_route_rules = [
	{"from_route": "/work/<path:app_path>", "to_route": "work"},
]

# /work-sw.js: the service worker, served from the site root so it may control /work.
page_renderer = ["gamcs_hr.work_app.service_worker.ServiceWorkerPage"]
