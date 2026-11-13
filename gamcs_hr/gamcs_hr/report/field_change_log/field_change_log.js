frappe.query_reports["Field Change Log"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{ fieldname: "ref_doctype", label: __("Document type"), fieldtype: "Link", options: "DocType" },
		{ fieldname: "docname", label: __("Document"), fieldtype: "Dynamic Link", options: "ref_doctype" },
		{ fieldname: "user", label: __("Changed by"), fieldtype: "Link", options: "User" },
		{ fieldname: "fieldname", label: __("Field"), fieldtype: "Data" },
	],
};
