// Publish workflow buttons: draft -> CA verified -> published (-> withdrawn).
// One primary action per state.
frappe.ui.form.on("Statutory Pack", {
	refresh(frm) {
		if (frm.is_new()) return;
		const call = (method, args) =>
			frm.call(method, args || {}).then(() => frm.reload_doc());

		if (frm.doc.needs_verification && frm.doc.status === "Draft") {
			frm.dashboard.set_headline(
				__("Draft. A CA has to verify these values before the pack can be published."),
				"orange"
			);
		}

		if (frm.doc.status === "Draft") {
			frm.page.set_primary_action(__("Mark CA verified"), () => {
				frappe.prompt(
					{ fieldname: "notes", fieldtype: "Small Text", label: __("Review notes") },
					(v) => call("mark_verified", { notes: v.notes }),
					__("Mark CA verified"),
					__("Mark verified")
				);
			});
		} else if (frm.doc.status === "CA verified") {
			frm.page.set_primary_action(__("Publish"), () => {
				frappe.confirm(
					__("Publish {0}? Payroll will use it for dates from {1}.", [
						frm.doc.name,
						frappe.datetime.str_to_user(frm.doc.effective_from),
					]),
					() => call("publish")
				);
			});
		} else if (frm.doc.status === "Published") {
			frm.add_custom_button(__("Withdraw"), () => {
				frappe.prompt(
					{ fieldname: "reason", fieldtype: "Small Text", label: __("Reason"), reqd: 1 },
					(v) => call("withdraw", { reason: v.reason }),
					__("Withdraw pack"),
					__("Withdraw")
				);
			});
		}
	},
});
