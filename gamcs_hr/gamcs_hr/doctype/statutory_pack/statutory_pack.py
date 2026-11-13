# Rules live in gamcs_hr/packs/statutory_pack.py.

import frappe
from frappe.model.document import Document

from gamcs_hr.packs import statutory_pack as rules


class StatutoryPack(Document):
	def autoname(self):
		if not self.version:
			self.version = str(frappe.utils.getdate(self.effective_from))
		self.name = f"{(self.code or '').strip().upper()}-{self.version}"

	def validate(self):
		rules.validate(self)

	def on_trash(self):
		rules.on_trash(self)

	@frappe.whitelist()
	def mark_verified(self, notes: str | None = None):
		self.check_permission("write")
		rules.mark_verified(self, notes)

	@frappe.whitelist()
	def publish(self):
		self.check_permission("write")
		rules.publish(self)

	@frappe.whitelist()
	def withdraw(self, reason: str):
		self.check_permission("write")
		rules.withdraw(self, reason)
