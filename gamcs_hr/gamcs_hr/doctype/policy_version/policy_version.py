# Rules live in gamcs_hr/packs/policy_version.py.

from frappe.model.document import Document

from gamcs_hr.packs import policy_version as rules


class PolicyVersion(Document):
	def autoname(self):
		rules.autoname(self)

	def before_insert(self):
		rules.before_insert(self)

	def validate(self):
		rules.validate(self)
