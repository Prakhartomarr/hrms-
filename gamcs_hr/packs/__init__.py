"""Versioned statutory packs and policy versions (T10).

Public entry points for other modules:

	from gamcs_hr.packs import get_pack, get_pack_segments, get_policy

- `get_pack(kind, code, on_date)`: the published Statutory Pack in force on a date.
- `get_pack_segments(kind, code, from_date, to_date)`: every published version that
  covers a period, with its day range (for split months such as September 2026 PF).
- `get_policy(doctype, name, on_date)`: a rule document as it stood on a date, from
  its Policy Version snapshots.

See docs/decisions/0009-statutory-packs-and-policy-versions.md.
"""

from gamcs_hr.packs.resolver import (
	PackNotFoundError,
	PolicyVersionNotFoundError,
	get_pack,
	get_pack_segments,
	get_policy,
)

__all__ = (
	"PackNotFoundError",
	"PolicyVersionNotFoundError",
	"get_pack",
	"get_pack_segments",
	"get_policy",
)
