"""Session context for the /work app: who is signed in and which employee they are."""

import frappe

EMPLOYEE_FIELDS = (
	"name",
	"employee_name",
	"first_name",
	"designation",
	"department",
	"company",
	"branch",
	"image",
)


def get_employee_for_user(user: str) -> dict | None:
	"""The active Employee linked to `user`, or None when there is no such record."""
	if not user or user == "Guest":
		return None
	employee = frappe.db.get_value(
		"Employee",
		{"user_id": user, "status": "Active"},
		list(EMPLOYEE_FIELDS),
		as_dict=True,
	)
	return employee or None


def build_context(user: str) -> dict:
	"""Everything the shell needs on first paint. Kept small: pages fetch their own data."""
	user_doc = frappe.db.get_value(
		"User", user, ["name", "full_name", "first_name", "user_image"], as_dict=True
	) or frappe._dict(name=user, full_name=user, first_name=user, user_image=None)
	employee = get_employee_for_user(user)
	is_manager = bool(
		employee and frappe.db.exists("Employee", {"reports_to": employee.name, "status": "Active"})
	)
	return {
		"user": {
			"name": user_doc.name,
			"full_name": user_doc.full_name or user_doc.name,
			"first_name": user_doc.first_name or user_doc.full_name or user_doc.name,
			"image": user_doc.user_image,
		},
		"employee": employee,
		"is_manager": is_manager,
		"unread_notifications": unread_notification_count(user),
	}


def unread_notification_count(user: str) -> int:
	return frappe.db.count("Notification Log", {"for_user": user, "read": 0})


@frappe.whitelist()
def get_context() -> dict:
	"""Shell context for the signed-in user. Guests are refused by @whitelist (no allow_guest)."""
	return build_context(frappe.session.user)


@frappe.whitelist()
def get_notifications(limit: int = 7) -> list[dict]:
	"""The latest notifications for the bell, newest first. At most 20."""
	limit = max(1, min(int(limit), 20))
	return frappe.get_all(
		"Notification Log",
		filters={"for_user": frappe.session.user},
		fields=["name", "subject", "type", "read", "creation", "document_type", "document_name"],
		order_by="creation desc",
		limit=limit,
	)
