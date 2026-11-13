import frappe


def validate(doc):
	doc.flags.setdefault("calls", []).append(("b_second", None))
	if doc.description == "reject me":
		frappe.throw("rejected by b_second")


def before_insert(doc):
	doc.flags.setdefault("calls", []).append(("b_second.before_insert", None))
