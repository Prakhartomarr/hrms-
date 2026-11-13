# Conventions

How gamcs_hr code is laid out so several tasks can work in parallel without touching the same files. CLAUDE.md has the hard rules; this file has the mechanics. The framework lives in `gamcs_hr/framework/` and is owned by T01: change it only in a task that is about the framework.

## Module layout

A feature module is a Python package under `gamcs_hr/`, named in `gamcs_hr/modules_order.py` (for example `leave`, `attendance.checkin`, `statutory.pf`). The build queue (`docs/build-queue.md`) says which task owns which folder. A task writes only inside the folders it owns.

```
gamcs_hr/<module>/
  __init__.py
  hooks_part.py        # this module's hooks (optional)
  setup.py             # this module's custom fields and property setters (optional)
  overrides/<doctype>.py   # one extension class per upstream doctype (optional)
  validators/*.py      # one rule per file (optional)
  api.py               # whitelisted methods
  report/, doctype/    # as needed
```

New doctypes still go in the `GAMCS HR` Frappe module (`gamcs_hr/gamcs_hr/doctype/`), created in developer mode on hr.localhost. Name them without a prefix collision with upstream doctypes, and keep their Python helpers in the owning feature module.

`modules_order.py` already lists every module in the queue, in dependency order. Entries whose package doesn't exist yet are skipped. You only edit it if you add a module the queue doesn't have. A test fails when a folder has a `hooks_part.py` or `setup.py` but isn't listed.

## Hooks: `hooks_part.py`

Never add feature hooks to `gamcs_hr/hooks.py`. Put them in `gamcs_hr/<module>/hooks_part.py` as plain literals (no frappe calls, no DB access, because Frappe imports hooks before a site is set up):

```python
# gamcs_hr/leave/hooks_part.py
doc_events = {"Leave Application": {"on_cancel": "gamcs_hr.leave.sandwich.reverse"}}
extend_doctype_class = {
	"Leave Application": "gamcs_hr.leave.overrides.leave_application.LeaveApplicationExtension"
}
scheduler_events = {"daily": ["gamcs_hr.leave.credit.post_daily"]}
```

`hooks.py` merges every module's values in `modules_order` order (`gamcs_hr/framework/hooks_merge.py`):

| Shape | Result |
| --- | --- |
| key only in one place | copied as is |
| dict and dict | merged key by key, recursively |
| list and list | concatenated in module order, exact duplicates dropped |
| string and string, or string and list | one list, in module order |
| `doc_events[doctype][event]` from two modules | a list; Frappe runs the handlers in module order |
| `override_doctype_class`, `extend_doctype_class`, `override_whitelisted_methods`: two different values for the same key | error (one owner per doctype or method) |
| `app_*`, `required_apps`, `before/after_install`, `before/after_migrate`, uninstall hooks, `fixtures` set in a module | error (these belong to `hooks.py`) |
| any other clash (dict vs string, two different booleans) | error |

Errors are raised when hooks load, so a clash fails the test run and `bench migrate` straight away rather than silently shadowing a handler.

Hooks are cached. After changing a `hooks_part.py`, run `infra/dev/hr.sh bench --site hr.localhost clear-cache` (tests load fresh).

## Custom fields and property setters: `setup.py`

No exported fixture JSON for customisations (several tasks editing `custom_field.json` would always conflict). Declare them in the owning module:

```python
# gamcs_hr/org/setup.py
CUSTOM_FIELDS = {
	"Branch": [
		{"fieldname": "gamcs_state", "label": "State", "fieldtype": "Link", "options": "...",
		 "insert_after": "branch"},
	],
}
PROPERTY_SETTERS = [
	{"doctype": "Employee", "fieldname": "cell_number", "property": "bold", "value": 1,
	 "property_type": "Check"},
	# leave out "fieldname" for a doctype-level property
]

def after_sync():
	"""Optional. Idempotent extra setup: roles, default settings, seed records."""
```

Both values may also be zero-argument functions. `gamcs_hr/framework/setup_registry.py` collects every module (in `modules_order` order) and syncs them on `after_install` and on every `bench migrate`:

- every record gets `module = "GAMCS HR"`;
- it is idempotent: unchanged records aren't touched, changed ones are updated in place;
- each (doctype, fieldname) field and each (doctype, field, property) setter has exactly one owner. A second module declaring the same one is an error.
- Fieldnames start with `gamcs_` unless you deliberately reuse an existing upstream field.
- Removing a field is never automatic. Drop it from `setup.py` and add a patch in `gamcs_hr/patches.txt` that deletes it.

Never create customisations through Customize Form on hr.localhost and leave them only in the database.

## Changing upstream behaviour: one extension class per doctype

For an upstream doctype (Leave Application, Attendance, Salary Slip, ...) the owning module registers **one** extension class through `extend_doctype_class`. Frappe stacks it on top of whatever class is in effect, including the overrides hrms and india_compliance install (hrms replaces Employee, Timesheet, Payment Entry and Project), so we never fight over `override_doctype_class`.

The class mixes in `ValidatorPipeline` and names its rule packages:

```python
# gamcs_hr/leave/overrides/leave_application.py
from gamcs_hr.framework.validators import ValidatorPipeline

class LeaveApplicationExtension(ValidatorPipeline):
	validator_packages = ("gamcs_hr.leave.validators",)
```

Each non-underscore file in a rule package is one rule. It defines functions named after document events (`before_validate`, `validate`, `before_insert`, `after_insert`, `before_save`, `on_update`, `before_submit`, `on_submit`, `before_cancel`, `on_cancel`, `on_trash`):

```python
# gamcs_hr/leave/validators/min_notice.py
import frappe
from frappe import _

DOCTYPES = ("Leave Application",)   # optional filter
ORDER = 20                          # optional, default 100; ties run in file-name order

def validate(doc):
	if ...:
		frappe.throw(_("Apply at least {0} days ahead").format(n))
```

- A new rule is a new file. Nobody edits a shared list.
- Rules run after the upstream method for the same event, so they see values upstream computed.
- Soft rules call `record_violation(doc, code, message)` instead of throwing. The caller reads `doc.flags.gamcs_violations`.
- Set `doc.flags.skip_gamcs_validators = True` to bypass all rules (data migration only).
- Underscore files (`_helpers.py`) are shared helpers and never run as rules.
- Rules for a doctype another module owns: either ask the owner to add your package to `validator_packages`, or use a plain `doc_events` handler in your own `hooks_part.py`. Both are fine; don't add a second extension class.
- Use `override_doctype_class` only to replace a method outright, then subclass the class currently in effect and note it in an ADR.

## Tests

- Server code: `frappe.tests.IntegrationTestCase` (needs the DB) or `frappe.tests.UnitTestCase` (pure logic). Put them in `gamcs_hr/tests/test_<topic>.py` or next to a doctype as `test_<doctype>.py`.
- Run on **hrtest.localhost** only: `infra/dev/hr.sh test` (all of gamcs_hr) or `infra/dev/hr.sh bench --site hrtest.localhost run-tests --module gamcs_hr.tests.test_x`.
- Money and statutory logic: exact rupee values for named scenarios (CLAUDE.md rule 6).
- Anything that needs india_compliance or india_payroll imports them lazily and skips when the app isn't installed. The test site has neither.
- Test-only packages go in `gamcs_hr/tests/fixtures/`. Files there are never named `test_*.py`.
- The upstream baseline (docs/baseline-tests.md) must keep passing. Run it when you touch payroll, leave or attendance behaviour.
- CI (`.github/workflows/ci.yml`) lints with ruff (`ruff check`, `ruff format --check`, config in `pyproject.toml`) and runs the gamcs_hr suite on a fresh bench at the versions pinned in `docker/ci/versions.env`.
- UI units: Vitest, next to the page (from T03 on).

## Frontend routes (built by T03)

The employee and manager app is a Vue SPA in `frontend/`, served at `/work`. Routes are registered automatically by folder: the router loads `import.meta.glob("./pages/**/route.ts")`, so each UI task adds `frontend/src/pages/<area>/route.ts` and never edits a shared router file.

```ts
// frontend/src/pages/leave/route.ts
export default [
	{ path: "/leave", name: "leave", component: () => import("./LeavePage.vue"), meta: { title: "Leave" } },
];
```

Shared components live in `frontend/src/ui/` and belong to T03. Later tasks put their own components inside their page folder. Follow the UI rules in CLAUDE.md.

## Decisions and patches

- Any choice the spec leaves to us gets a short ADR: `docs/decisions/NNNN-title.md` (next free number, written in plain English).
- Data changes go in patches listed in `gamcs_hr/patches.txt`, never in `setup.py`'s `after_sync`. `after_sync` is only for idempotent configuration.
