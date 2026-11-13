# 0010. Field-level audit and the Field Change Log

Status: accepted, 13 Nov 2026 (T09)

## Context

Frappe writes a Version row with a field diff on every save, but only for doctypes with `track_changes` on. About half of the HR and payroll doctypes have it off, including Leave Application, Leave Policy, Payroll Entry, Holiday List, Branch, Department and Job Offer.

## Decision

- One list, `audit_trail_doctypes` in `gamcs_hr/audit/hooks_part.py`, of about 50 doctypes that hold people, policy, calendar, leave, attendance and pay data, plus our Statutory Pack and Policy Version. Employee Checkin is left out on purpose (high volume, no edits).
- The hook does two things for free: Frappe's Audit Trail can compare amended versions of them, and india_compliance's audit-trail lock stops anyone switching tracking off once the audit trail is enabled in Accounts Settings.
- `gamcs_hr/audit/setup.py` adds a `track_changes = 1` property setter for every listed doctype whose own definition has it off. Those that track natively get no setter.
- **Field Change Log** (Script Report, ref doctype Employee, for HR Manager and System Manager) flattens Version JSON into one row per changed field: when, who, document, table and row for child rows, field label, before, after, and a note for data import or impersonation. Filters: dates (default last 30 days), document type (default: the tracked list), document, user, field.
- **Masking in the report.** Query reports bypass Frappe's list masking, and Version stores raw values, so the report masks itself with the same rules as the rest of the app (`gamcs_hr/org/masking.py`): `Meta.get_masked_fields` per doctype, and per child doctype for its parent; an employee sees their own Employee values. Added and removed child rows are listed without values. Rows are limited to documents the user can read.

## Known gaps

- `frappe.db.set_value` and bulk SQL updates don't write Versions. Our own code must use `doc.save()` (or write a Version) when it changes tracked records.
- Version has no IP address, so the report has no IP column.
- Masking follows the user's current rights, not those at the time of the change.
