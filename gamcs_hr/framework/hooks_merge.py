"""Merge per-module hook fragments into one set of app hooks.

`gamcs_hr/hooks.py` is the only hooks file Frappe reads, and it is shared by every
feature module. To keep parallel tasks out of each other's way, each module puts its
hooks in `gamcs_hr/<module>/hooks_part.py` and `hooks.py` merges them, in the order of
`gamcs_hr.modules_order.MODULES`.

Pure Python on purpose: Frappe imports `hooks.py` in contexts where no site is
initialised (bench commands, workers booting), so nothing here may touch frappe.

Merge semantics, applied key by key (base hooks first, then modules in order):

- A key seen for the first time is copied as is (deep copy).
- dict + dict: merged recursively, key by key, with these same rules. This covers
  `doc_events` ({doctype: {event: handlers}}), `scheduler_events`, `doctype_js` and
  friends.
- list + list: concatenated in merge order. Exact duplicates are dropped, so the same
  handler is never registered twice.
- str + str, str + list, list + str: turned into one list (concatenated, deduplicated).
  So two modules adding a `validate` handler for the same doctype end up with
  `doc_events[dt]["validate"] == [first, second]`, which Frappe runs in that order.
- Keys in `SINGLE_VALUE_HOOKS` (for example `override_doctype_class`) must not get two
  different values for the same doctype or method: that raises `HookConflictError`.
  The rule is one controller class per upstream doctype.
- Keys in `RESERVED_HOOKS` (app metadata, install and migrate entry points) may only
  be set in `hooks.py` itself. A module that sets one raises `HookConflictError`.
- Anything else (a scalar meeting a dict, two different non-string scalars) raises
  `HookConflictError`, because there is no safe way to combine them.
"""

from __future__ import annotations

import copy
import importlib
import os
from collections.abc import Iterable, Mapping
from types import FunctionType, ModuleType
from typing import Any

# Hooks whose leaves name exactly one implementation. Frappe keeps only the last
# value for these, so two gamcs_hr modules setting the same key would silently
# shadow each other.
SINGLE_VALUE_HOOKS = frozenset(
	{
		"override_doctype_class",
		"extend_doctype_class",
		"override_whitelisted_methods",
		"standard_queries",
		"website_route_rules_single",
	}
)

# Hooks a module may not set. They belong to hooks.py (app identity and the shared
# install / migrate entry points that run the setup registry).
RESERVED_HOOKS = frozenset(
	{
		"app_name",
		"app_title",
		"app_publisher",
		"app_description",
		"app_email",
		"app_license",
		"app_version",
		"required_apps",
		"before_install",
		"after_install",
		"after_migrate",
		"before_migrate",
		"before_uninstall",
		"after_uninstall",
		"fixtures",
	}
)

HOOKS_PART = "hooks_part"


class HookConflictError(ValueError):
	pass


def _as_list(value: Any) -> list:
	return list(value) if isinstance(value, list | tuple) else [value]


def _concat_unique(left: Iterable, right: Iterable) -> list:
	out: list = []
	for item in [*left, *right]:
		if item not in out:
			out.append(item)
	return out


def merge_values(left: Any, right: Any, path: tuple[str, ...], source: str = "?") -> Any:
	"""Merge `right` into `left` and return the result. Neither input is mutated."""
	where = ".".join(path)
	single = bool(path) and path[0] in SINGLE_VALUE_HOOKS

	if isinstance(left, Mapping) and isinstance(right, Mapping):
		out = dict(left)
		for key, value in right.items():
			if key in out:
				out[key] = merge_values(out[key], value, (*path, str(key)), source)
			else:
				out[key] = copy.deepcopy(value)
		return out

	if isinstance(left, Mapping) or isinstance(right, Mapping):
		raise HookConflictError(f"{source}: cannot merge a dict with a non-dict at {where}")

	if single:
		if left == right:
			return left
		raise HookConflictError(
			f"{source}: {where} is already set to {left!r}; one implementation per key "
			f"(extend the existing class or method instead of adding a second one)"
		)

	is_seq = (list, tuple, str)
	if isinstance(left, is_seq) and isinstance(right, is_seq):
		return _concat_unique(_as_list(left), _as_list(right))

	if left == right:
		return left
	raise HookConflictError(f"{source}: conflicting values at {where}: {left!r} vs {right!r}")


def public_hooks(module: ModuleType) -> dict[str, Any]:
	"""Hook values a module defines, using Frappe's own rule (public, not a module,
	function or class)."""
	return {
		key: value
		for key, value in vars(module).items()
		if not key.startswith("_") and not isinstance(value, ModuleType | FunctionType | type)
	}


def merge_hooks(base: Mapping[str, Any], parts: Iterable[tuple[str, Mapping[str, Any]]]) -> dict[str, Any]:
	"""Merge `(source, hooks)` fragments into `base`, in order."""
	merged = copy.deepcopy(dict(base))
	for source, part in parts:
		for key, value in part.items():
			if key in RESERVED_HOOKS:
				raise HookConflictError(f"{source}: {key!r} may only be set in gamcs_hr/hooks.py")
			if key in merged:
				merged[key] = merge_values(merged[key], value, (key,), source)
			else:
				merged[key] = copy.deepcopy(value)
	return merged


def load_parts(package: str, modules: Iterable[str]) -> list[tuple[str, dict[str, Any]]]:
	"""Import `<package>.<module>.hooks_part` for each listed module that has one."""
	parts = []
	for module in modules:
		dotted = f"{package}.{module}.{HOOKS_PART}"
		try:
			mod = importlib.import_module(dotted)
		except ModuleNotFoundError as e:
			# Only "this module (or its hooks_part) does not exist yet" is fine.
			# A missing import *inside* an existing hooks_part is a real error.
			if e.name and dotted.startswith(e.name):
				continue
			raise
		parts.append((dotted, public_hooks(mod)))
	return parts


def build_hooks(base: Mapping[str, Any], package: str, modules: Iterable[str]) -> dict[str, Any]:
	return merge_hooks(base, load_parts(package, modules))


def find_module_files(app_dir: str, names: Iterable[str] = (f"{HOOKS_PART}.py", "setup.py")) -> set[str]:
	"""Dotted module paths (relative to the app package) that contain any of `names`.

	Skips tests and the framework itself. Used by the test that keeps
	modules_order.MODULES complete.
	"""
	names = set(names)
	skip = {"tests", "framework", "__pycache__", "node_modules", "public", "frontend", "templates", "www"}
	found = set()
	for root, dirs, files in os.walk(app_dir):
		dirs[:] = [d for d in dirs if d not in skip and not d.startswith(".")]
		rel = os.path.relpath(root, app_dir)
		if rel == ".":
			continue
		if names & set(files):
			found.add(rel.replace(os.sep, "."))
	return found
