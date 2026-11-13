"""T03: server side of the /work app shell (session context, routes, service worker)."""

import frappe
from frappe.tests import IntegrationTestCase

from gamcs_hr.work_app import api
from gamcs_hr.work_app.service_worker import ROUTE, ServiceWorkerPage
from gamcs_hr.www import work


def _user(email: str, first_name: str) -> str:
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": first_name, "send_welcome_email": 0}
		).insert(ignore_permissions=True)
	return email


def _employee(user: str, first_name: str, reports_to: str | None = None) -> str:
	company = frappe.db.get_value("Company", {}, "name")
	doc = frappe.get_doc(
		{
			"doctype": "Employee",
			"first_name": first_name,
			"gender": "Female",
			"date_of_birth": "1990-05-01",
			"date_of_joining": "2024-04-01",
			"company": company,
			"status": "Active",
			"user_id": user,
			"reports_to": reports_to,
		}
	).insert(ignore_permissions=True)
	return doc.name


class TestWorkShell(IntegrationTestCase):
	def test_context_for_user_with_employee(self):
		manager_user = _user("t03.manager@example.com", "Asha")
		manager = _employee(manager_user, "Asha")
		report_user = _user("t03.report@example.com", "Ravi")
		_employee(report_user, "Ravi", reports_to=manager)

		ctx = api.build_context(manager_user)
		self.assertEqual(ctx["user"]["name"], manager_user)
		self.assertEqual(ctx["user"]["first_name"], "Asha")
		self.assertEqual(ctx["employee"]["name"], manager)
		self.assertTrue(ctx["is_manager"])

		ctx = api.build_context(report_user)
		self.assertEqual(ctx["employee"]["employee_name"], "Ravi")
		self.assertFalse(ctx["is_manager"])

	def test_context_for_user_without_employee(self):
		user = _user("t03.noemployee@example.com", "Meera")
		ctx = api.build_context(user)
		self.assertIsNone(ctx["employee"])
		self.assertFalse(ctx["is_manager"])
		self.assertEqual(ctx["unread_notifications"], 0)

	def test_inactive_employee_is_not_resolved(self):
		user = _user("t03.left@example.com", "Kiran")
		name = _employee(user, "Kiran")
		frappe.db.set_value("Employee", name, {"status": "Left", "relieving_date": "2026-01-31"})
		self.assertIsNone(api.get_employee_for_user(user))
		self.assertIsNone(api.get_employee_for_user("Guest"))

	def test_notifications_are_the_users_own_and_capped(self):
		user = _user("t03.notify@example.com", "Neha")
		other = _user("t03.other@example.com", "Omar")
		for i in range(3):
			frappe.get_doc(
				{"doctype": "Notification Log", "for_user": user, "subject": f"Hello {i}", "type": "Alert"}
			).insert(ignore_permissions=True)
		frappe.get_doc(
			{"doctype": "Notification Log", "for_user": other, "subject": "Not yours", "type": "Alert"}
		).insert(ignore_permissions=True)

		frappe.set_user(user)
		try:
			items = api.get_notifications(limit=2)
			self.assertEqual(len(items), 2)
			self.assertNotIn("Not yours", [n.subject for n in items])
			self.assertEqual(len(api.get_notifications(limit=500)), 3)
			self.assertEqual(api.build_context(user)["unread_notifications"], 3)
		finally:
			frappe.set_user("Administrator")

	def test_work_routes_are_registered(self):
		rules = frappe.get_hooks("website_route_rules", app_name="gamcs_hr")
		self.assertIn({"from_route": "/work/<path:app_path>", "to_route": "work"}, rules)
		self.assertIn(
			"gamcs_hr.work_app.service_worker.ServiceWorkerPage",
			frappe.get_hooks("page_renderer", app_name="gamcs_hr"),
		)

	def test_service_worker_renderer_only_claims_its_route(self):
		self.assertFalse(ServiceWorkerPage(path="work").can_render())
		self.assertFalse(ServiceWorkerPage(path="sw.js").can_render())
		self.assertEqual(ROUTE, "work-sw.js")

	def test_boot_json_cannot_close_its_script_tag(self):
		out = work.boot_json({"name": "</script><script>alert(1)</script>"})
		self.assertNotIn("<", out)
		self.assertEqual(frappe.parse_json(out)["name"], "</script><script>alert(1)</script>")
