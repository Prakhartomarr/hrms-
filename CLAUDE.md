# CLAUDE.md: rules for coding agents in this repo

AGENTS.md points here. This file is the single source.

## What this is

`gamcs_hr` is a custom Frappe app that turns Frappe HR (frappe/hrms) + ERPNext v16 + India Compliance into a full HRMS for Indian and Middle East SMBs. Status: the foundation is in place (dev infra, demo seed, upstream test baseline). Feature work is queued in `docs/build-queue.md`. **Read `docs/conventions.md` before writing code**: module layout, `hooks_part.py`, `setup.py`, validators, tests, frontend routes.

The earlier from-scratch TypeScript attempt is archived on branch `archive/ts-scaffold`. Never modify, rebase or delete that branch.

## Hard rules

1. **Never edit upstream apps** (`frappe`, `erpnext`, `hrms`, `india_compliance` in `~/hrms-bench/apps/`). Their working trees must stay clean, and `git status` there must show nothing. Extend from `gamcs_hr` instead:
   - **Hooks** in your module's `gamcs_hr/<module>/hooks_part.py`, never in `hooks.py` itself (it merges the parts in the order of `gamcs_hr/modules_order.py`): `doc_events`, `extend_doctype_class` (one extension class per upstream doctype, running auto-discovered validators), `override_whitelisted_methods`, `doctype_js` / `doctype_list_js`, `scheduler_events`, `permission_query_conditions`, `has_permission`. Use `override_doctype_class` only as a last resort.
   - **Custom Fields / Property Setters** declared in `gamcs_hr/<module>/setup.py` (`CUSTOM_FIELDS`, `PROPERTY_SETTERS`). The setup registry creates them with `module = "GAMCS HR"` on install and every migrate. No exported fixture JSON.
   - **Client scripts** as files in `gamcs_hr/public/js/` wired through `doctype_js`, never as DB-only Client Script records
   - **New doctypes** in module `GAMCS HR` (`gamcs_hr/gamcs_hr/doctype/`), created in developer mode so the JSON lands in the repo
   - **Vue pages / portal pages** in `gamcs_hr` (`gamcs_hr/www/`, or a separate `frontend/` built into `gamcs_hr/public/`)
   - **Data migrations** as patches listed in `gamcs_hr/patches.txt`
   If something truly cannot be done without an upstream change, stop and write it up in `docs/decisions/` instead of patching.
2. **Never touch `~/gamcs-crm`**, or its bench, containers (`gamcs-*`, `gamcs-prod-*`), volumes or networks. Another team works there live. Also leave Alchemist (`alchemist-*`) alone.
3. **Ports:** web **8200**, socketio **9200**, compose project **`hrms-dev`**. These are taken by others: 8000, 9100, 8080 (CRM), and 5173, 4001, 9000 (Alchemist).
4. **No `git push`** unless the user asks in this session. Commit in logical steps.
5. **Never copy HROne's** text, branding, screenshots, icons or product and module names. Build equivalent features under our own names and wording.
6. **Money and statutory logic must have exact-value tests.** This covers payroll, PF, ESI, PT, TDS, gratuity, leave encashment, LOP and arrears. Assert exact rupee amounts (and rounding) for named scenarios. "Is not None" or "> 0" is not a test.
7. **Public repo:** no credentials, no `.env`, no `site_config.json`, no SQL dumps. The dev password lives only in `~/hrms/.env` (gitignored).
8. Keep everything out of `~/Desktop`, which is iCloud-synced and evicts files.

## Layout

- Repo: `~/hrms`, mounted into the bench at `~/hrms-bench/apps/gamcs_hr`, so edits are live.
- Bench: `~/hrms-bench` (outside the repo; created by `infra/dev/setup.sh`).
- Sites: `hr.localhost` (demo data) and `hrtest.localhost` (tests only). Desk at http://hr.localhost:8200/app; Frappe HR PWA at http://hr.localhost:8200/hrms.
- Versions: frappe / erpnext / hrms / india_compliance on `version-16`. See `docs/decisions/0001-frappe-v16-stack.md`.

## Common commands (run from `~/hrms`)

```bash
infra/dev/setup.sh                 # first-time setup, or start after a nuke
infra/dev/hr.sh up | down | logs   # start / stop / follow
infra/dev/hr.sh migrate            # bench --site hr.localhost migrate
infra/dev/hr.sh build              # bench build (all apps); `hr.sh bench build --app gamcs_hr` for ours
infra/dev/hr.sh seed               # idempotent demo data
infra/dev/hr.sh test-site          # once: throwaway test site hrtest.localhost
infra/dev/hr.sh test               # gamcs_hr tests on hrtest.localhost
infra/dev/hr.sh upstream-test hrms.hr.doctype.attendance.test_attendance
infra/dev/hr.sh reset              # drop + recreate site, reinstall apps, reseed
infra/dev/hr.sh shell              # shell in the bench container
```

Tests: put them in `gamcs_hr/tests/` or next to a doctype (`test_<doctype>.py`). Use `frappe.tests.IntegrationTestCase` (v16). Always run tests on **`hrtest.localhost`**, never on the demo site `hr.localhost`, because upstream `before_tests` creates `_Test Company` fixtures. The test site deliberately leaves out india_compliance, whose GST validation rejects ERPNext's test items. It also leaves out india_payroll (not installed anywhere yet; see `docs/decisions/0002-india-payroll-deferred.md`). Any gamcs_hr code that depends on india_compliance or india_payroll must import it lazily, and its tests must skip when it isn't installed. CI (`.github/workflows/ci.yml`) runs the gamcs_hr suite on a fresh bench at the versions pinned in `docker/ci/versions.env`.

## Specs and the build queue

- Feature specs live **outside the repo** at `~/hrone-research/specs/` on this machine. They are reference material only and must not be committed (rule 5).
- The ordered work list is `docs/build-queue.md`. Record each decision as an ADR in `docs/decisions/NNNN-title.md`.

## UI rules (for any page or desk customisation)

- One primary button per view.
- Sentence case for labels, buttons and headings.
- Money as ₹ with Indian digit grouping (₹12,34,567.00). Use `format_currency` / `frappe.format` with INR, and never hand-roll it.
- 8 pt spacing grid.
- Near-black body text (not pure #000), and WCAG AA contrast at minimum.
- Every key flow (apply leave, check in, run payroll, submit claim) ends in a clear success state that says what happened and what comes next.

## Commits

End every commit message with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
