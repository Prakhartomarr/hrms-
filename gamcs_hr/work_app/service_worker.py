"""Serves the /work service worker from the site root.

A service worker only controls pages under its own path, and Frappe serves built
assets from /assets/gamcs_hr/frontend/, which cannot control /work. So /work-sw.js is
rendered here from the built file, with `Service-Worker-Allowed: /work` and no caching.
"""

from pathlib import Path

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer
from werkzeug.wrappers import Response

ROUTE = "work-sw.js"


def built_service_worker() -> Path:
	return Path(frappe.get_app_path("gamcs_hr", "public", "frontend", "sw.js"))


class ServiceWorkerPage(BaseRenderer):
	def can_render(self):
		return self.path == ROUTE and built_service_worker().is_file()

	def render(self):
		response = Response(built_service_worker().read_bytes(), mimetype="application/javascript")
		response.headers["Service-Worker-Allowed"] = "/work"
		response.headers["Cache-Control"] = "no-cache"
		return response
