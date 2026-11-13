# Upstream test baseline

Recorded on 2026-11-13 against a fresh `hrtest.localhost` (`infra/dev/hr.sh test-site`), which has frappe, erpnext, hrms and gamcs_hr installed.

| App | Version | Commit |
| --- | --- | --- |
| frappe | 16.56.0 | `49789a1711d4` |
| erpnext | 16.55.0 | `8e10a348daaa` |
| hrms | 16.53.2 | `ba5371c5057a` |
| india_compliance | 16.11.0 | `53a39caeedad` (not on the test site, see below) |

## Results

| Module | Tests | Pass | Fail | Error | Time |
| --- | --- | --- | --- | --- | --- |
| `hrms.hr.doctype.leave_application.test_leave_application` | 44 | 44 | 0 | 0 | 38 s |
| `hrms.hr.doctype.attendance.test_attendance` | 14 | 14 | 0 | 0 | 11 s |
| `hrms.payroll.doctype.salary_slip.test_salary_slip` | 65 | 65 | 0 | 0 | 231 s |
| `gamcs_hr` (all, exact-value payroll) | 3 | 3 | 0 | 0 | 23 to 71 s |
| **Total** | **126** | **126** | **0** | **0** | |

The gamcs_hr suite was run both before and after the upstream modules on the same site, and passed both times, so it doesn't interfere with upstream fixtures.

Reproduce:

```bash
infra/dev/hr.sh test-site
infra/dev/hr.sh test
infra/dev/hr.sh upstream-test hrms.payroll.doctype.salary_slip.test_salary_slip
infra/dev/hr.sh upstream-test hrms.hr.doctype.leave_application.test_leave_application
infra/dev/hr.sh upstream-test hrms.hr.doctype.attendance.test_attendance
```

## Problems found while baselining (all fixed in infra or gamcs_hr, none upstream)

1. **india_compliance breaks upstream test discovery.** ERPNext's test item fixtures fail India Compliance's "GST Rate cannot be zero for Taxable GST Treatment" check, so with india_compliance installed, 0 tests run. Upstream hrms CI doesn't install it either, so the test site leaves it out. The demo site `hr.localhost` keeps it.
2. **Chromium not executable on first download.** v16 renders PDFs with headless Chromium, which frappe downloads lazily into `~/hrms-bench/chromium`. The first download leaves `headless_shell` without its exec bit. The first run failed `test_email_salary_slip` and `test_email_salary_slip_with_email_template` (63/65). `init.sh` now runs `bench setup-chrome` and `chmod +x` at boot.
3. **Demo data leaking into the test site.** Creating a Company triggers implicit commits, so the rollback in `IntegrationTestCase` can't remove it. ERPNext's test bootstrap (`erpnext.tests.utils`, which runs on import) refuses to create its calendar-year fiscal years once an Apr–Mar year exists. The gamcs_hr test now imports that bootstrap first, and the demo fiscal year is scoped to Demo Pvt Ltd.

## Exact-value payroll checks (gamcs_hr/tests/test_demo_payroll.py)

All cases use April 2026, the first period of FY 2026-27, with the "Demo India Monthly" structure.

| Monthly gross | Basic / HRA / Special | PF | ESI | PT | TDS | Net |
| --- | --- | --- | --- | --- | --- | --- |
| ₹20,000 | 10,000 / 4,000 / 6,000 | 1,200 | 150 | 0 | 0 | ₹18,650 |
| ₹60,000 | 30,000 / 12,000 / 18,000 | 1,800 (capped) | n/a (gross above ₹21,000) | 200 | 0 (87A relief) | ₹58,000 |
| ₹2,00,000 | 1,00,000 / 40,000 / 60,000 | 1,800 | n/a | 200 | 24,375 | ₹1,73,625 |

TDS for ₹2,00,000 a month: ₹24,00,000 minus the ₹75,000 standard deduction is ₹23,25,000 taxable. Tax is 20,000 + 40,000 + 60,000 + 80,000 + 81,250 = ₹2,81,250, plus 4% cess = ₹2,92,500 a year, or ₹24,375 a month.

hrms treats both slab bounds as inclusive. Slabs that meet at the same figure (4,00,000 to 8,00,000 followed by 8,00,000 to 12,00,000) overcharge by ₹1 times the rate at each boundary, which came to ₹0.78 a year here. The seed therefore starts each band at x00,001.

## Re-run after T01 (framework), 2026-11-13

Same commits as above, on hrtest.localhost after `migrate`: leave application 44/44, attendance 14/14, salary slip 65/65, and gamcs_hr 36/36 (21 unit + 15 integration: the 3 payroll checks plus 33 framework tests). Upstream checkouts unchanged.
