# 0009. Statutory packs and policy versions

Status: accepted, 13 Nov 2026 (T10)

## Context

Statutory numbers (PF, ESI, PT, LWF, minimum wage, bonus, income tax) change by notification, often mid-month. Rule doctypes such as Leave Type or Shift Type are edited in place, so last month's rule is lost. Payroll and leave engines need the value that applied on a given date.

## Decision

- **`Statutory Pack`** doctype (module GAMCS HR, logic in `gamcs_hr/packs/`). Key: `kind` + `code` (for example `PF` / `PF-IN`, `PT` / `PT-MH`). Named `<code>-<version>`; the version defaults to the effective-from date. `values` is a JSON object; rates are stored as strings so callers can make Decimals without float noise. Sources are a child table.
- **Dates are inclusive on both ends** (`effective_to` is the last day the version applies, empty means open-ended). Our research notes use an exclusive end date; desk users read "effective to 16-09-2026" more naturally, so we store the inclusive form.
- **Workflow:** Draft → CA verified → Published, plus Withdrawn. The status changes only through `mark_verified`, `publish` and `withdraw`. Verifying needs the `Statutory Reviewer` role (or System Manager), a source, and a different person from the author. Publishing needs HR Manager or System Manager. Editing a verified pack sends it back to draft; a published or withdrawn pack can't be edited or deleted.
- **Overlaps:** publishing refuses a pack whose dates overlap another published version of the same kind and code, except that an open-ended older version is closed the day before the new one starts (and recorded in `supersedes`). That is the normal "new notification" flow.
- **Only published packs resolve.** `get_pack(kind, code, date)` returns the one version in force; `get_pack_segments(kind, code, from, to)` returns each version covering a period with its day count, for split months such as September 2026 PF (16 days at ₹15,000, 14 days at ₹25,000). Both raise `PackNotFoundError` rather than guessing. No cache yet: the table is small and the query is indexed by kind and code.
- **`Policy Version`**: a JSON snapshot (children included) of a rule document with `effective_from` and a running `version_no`. Versions are immutable except the note. `get_policy(doctype, name, date)` returns an unsaved document built from the latest version on or before the date (same-date ties: the higher version number). A rule never versioned returns the live document; a rule with versions but none in force on the date raises `PolicyVersionNotFoundError`. Submittable rules keep using Frappe amendment.
- **Seed:** `PF-IN-2026-04-01` (₹15,000 ceiling, to 16 Sep 2026) and `PF-IN-2026-09-17` (₹25,000, open-ended) are created as drafts that need verification, by the packs module's `after_sync`, only when missing. They do not resolve until a CA verifies them and HR publishes them.

## Not done here

- Per-company acceptance of a published pack and company overrides of `tenant_overridable` keys.
- Blocking direct edits of published rule doctypes (a `before_save` hook per rule doctype); each rule's owning task decides whether to route edits through new versions. `gamcs_hr.packs.policy_version.make_version` is the whitelisted method a desk button can call.
