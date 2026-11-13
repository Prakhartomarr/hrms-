# 0002: frappe/india-payroll is pinned but not installed yet

- Status: accepted (revisit in build-queue task T56)
- Date: 2026-11-13

## Context

[frappe/india-payroll](https://github.com/frappe/india-payroll) (GPL-3.0, by Frappe) adds Indian statutory payroll on top of Frappe HR: Professional Tax, ESI, LWF and EPF (with EPS, EDLI and admin charges), Indian tax slabs and exemption categories, and TDS return / Form 16 filing. Task T01 was to add it to the bench.

What we checked on 2026-11-13:

| Item | Finding |
| --- | --- |
| Branch | `version-16`, head `3321103d9fdc394d1c66692eb267416293d59a8e` (committed 2026-10-21, after tag v16.1.0) |
| Requires | `required_apps = ["frappe/hrms"]`, Python `>=3.14`. **No dependency on india_compliance**: nothing imports it (one docstring mentions it). |
| v16 compatibility | `bench get-app`, `install-app` and `migrate` on hr.localhost all worked; the desk loaded |
| How it hooks in | `regional_overrides` for country India on `apply_regional_deductions`, `apply_regional_employer_contributions`, `apply_regional_ctc_components` and `apply_surcharge_with_marginal_relief`; `doc_events` on Salary Structure Assignment, Payroll Settings, Company, Salary Slip, TDS Return, TDS Challan; a 5-minute cron that polls filing jobs; custom fields on Payroll Settings and Company; usage telemetry through Frappe's own telemetry switch |
| Install side effects | creates salary components (Professional Tax, Employee/Employer State Insurance, Labour Welfare Fund, Provident Fund, VPF, Employer Provident Fund, Employer Pension Scheme, EDLI, EPF Admin Charges), four income tax slabs, 18 tax exemption categories and about 670 custom fields |

## What broke

The regional deduction hook owns the statutory rows on every salary slip of an Indian company. When a statute is switched off in Payroll Settings (the default after install), it **removes** the matching row, matched by component name. Our demo structure uses the same names (Provident Fund, Employee State Insurance, Professional Tax), so on hr.localhost the demo slips lost PF, ESI and PT:

| Monthly gross | Net pay before | Net pay with india-payroll installed |
| --- | --- | --- |
| ₹20,000 | ₹18,650 (PF 1,200, ESI 150) | ₹20,000 (no PF, no ESI) |
| ₹60,000 | ₹58,000 (PF 1,800, PT 200) | ₹60,000 |
| ₹2,00,000 | ₹1,73,625 (PF 1,800, PT 200, TDS 24,375) | ₹1,75,625 (TDS only) |

Switching the statutes on is not a drop-in fix either: it computes ESI on Basic + DA (not gross, as the demo does) and PT from the employee's employment state, so every exact-value expectation changes. Re-basing the demo payroll onto india-payroll's engine is exactly what T56 is for, with golden tests (T55) in place first.

The same hook would also apply to the upstream salary slip tests on the test site, whose `_Test Company` is Indian.

## Decision

- Do **not** install india-payroll in T01. It was uninstalled cleanly: hr.localhost was restored from the backup taken just before the install (so the seeded components, slabs, categories and custom fields are gone), the package was pip-uninstalled and `apps/india_payroll` removed. Demo slips are back to the values above, and the upstream checkouts are untouched.
- **Pin**: `3321103d9fdc394d1c66692eb267416293d59a8e` on `version-16`. `infra/dev/init.sh` fetches exactly that commit when `WITH_INDIA_PAYROLL=1` is set in `~/hrms/.env` (default off), and then installs it on hr.localhost before gamcs_hr.
- **Test site**: hrtest.localhost stays without india-payroll (as it stays without india_compliance), so the upstream baseline keeps passing. When T56 lands, its tests and the golden suite run on a separate site (or a temporary install) with india-payroll present, and skip when it is not installed, the same rule we use for india_compliance.
- CI does not fetch it until then.

## Consequences

- Until T56, PF, ESI and PT come from our demo salary structure formulas, which are simplified (see docs/baseline-tests.md).
- T56 must: turn on `WITH_INDIA_PAYROLL`, rename or drop the demo's duplicate statutory components, configure Payroll Settings (statute switches, registration numbers) and Salary Structure Assignment fields (employment state, EPF applicability) in the seed, and rewrite the exact-value expectations against the india-payroll results.
- Telemetry: india-payroll reports install and usage events through Frappe's telemetry, which follows the site's telemetry setting. Decide in T56 whether to turn it off on our sites.
