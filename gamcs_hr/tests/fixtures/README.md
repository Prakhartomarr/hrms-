Test-only packages for the framework tests (hooks merger, setup registry, validator
pipeline). Nothing here is loaded by the real app: `hooks.py` and the setup registry
only read modules listed in `gamcs_hr/modules_order.py`.
