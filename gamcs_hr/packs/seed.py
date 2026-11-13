"""Starter statutory packs, created as drafts that a CA must verify before use.

Created only when missing (by name) and never updated afterwards, so a reviewer's
edits on the site are kept. Values follow our statutory spec; every number marked
here has to be checked against the primary notification before publishing.
"""

from __future__ import annotations

import copy

import frappe

from gamcs_hr.packs.constants import DRAFT

PENDING_CA = (
	"Draft, pending CA verification. Seeded by gamcs_hr; not used until a CA verifies and HR publishes it."
)

# PF rates and limits for tax year 2026-27 (common to both versions below).
# Rates are strings so callers can turn them into Decimals without float noise.
_PF_COMMON = {
	"eeRatePct": "12",
	"reducedRatePct": "10",
	"epsRatePct": "8.33",
	"edliRatePct": "0.5",
	"adminRatePct": "0.5",
	"adminMinPerMonth": 500,
	"adminMinNoContributors": 75,
	"edliAdminRatePct": "0",
	"epsAgeLimit": 58,
	"higherPensionExtraPct": "1.16",
	"higherPensionBase": 15000,
	"splitMethod": "CALENDAR_DAYS_OF_30",
	"rounding": {
		"ee": "HALF_UP_1",
		"eps": "HALF_UP_1",
		"edli": "HALF_UP_1",
		"admin": "ESTABLISHMENT_HALF_UP_1",
	},
	"dueDay": 15,
	"wageDefinition": "CODE",
}

# Source for the wage ceiling change from ₹15,000 to ₹25,000 on 17 Sep 2026:
# notification S.O. 5109(E) under the Code on Social Security, as explained in the
# EPFO FAQ on the revised wage ceiling (copy at the staffnews.in link below), with
# secondary reporting by SCC Online (19 Sep 2026). Contribution rates: EPFO's
# published contribution rate table.
_PF_SOURCES = [
	{
		"title": "EPFO FAQ on the revised wage ceiling (S.O. 5109(E))",
		"url": "https://www.staffnews.in/wp-content/uploads/2026/10/EPFO_Wage_Ceiling_FAQs.pdf",
		"tier": "P-copy",
	},
	{
		"title": "Labour ministry notifies ₹25,000 wage ceiling under the Social Security Code",
		"url": "https://www.scconline.com/blog/post/2026/09/19/labour-ministry-notifies-25000-wage-ceiling-under-social-security-code/",
		"tier": "S",
	},
	{
		"title": "EPFO contribution rates",
		"url": "https://web.archive.org/web/2024/https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf",
		"tier": "P-copy",
	},
]


def _pf(version: str, effective_from: str, effective_to: str | None, ceiling: int, extra: dict | None = None):
	values = {**copy.deepcopy(_PF_COMMON), "ceiling": ceiling, **(extra or {})}
	return {
		"doctype": "Statutory Pack",
		"kind": "PF",
		"code": "PF-IN",
		"version": version,
		"country": "India",
		"effective_from": effective_from,
		"effective_to": effective_to,
		"values": frappe.as_json(values, indent=1),
		"tenant_overridable": frappe.as_json(["eeRatePct"]),
		"open_question": "EPS pensionable-salary cap after 17 Sep 2026; rounding order in the split month.",
		"review_notes": PENDING_CA,
		"sources": copy.deepcopy(_PF_SOURCES),
	}


SEED_PACKS = [
	# ₹15,000 ceiling up to and including 16 Sep 2026.
	_pf("2026-04-01", "2026-04-01", "2026-09-16", 15000),
	# ₹25,000 ceiling from 17 Sep 2026. EPF-only members with wages up to ₹25,000
	# become EPS members from this date.
	_pf(
		"2026-09-17",
		"2026-09-17",
		None,
		25000,
		{"epsEntryOnCeilingRaise": {"date": "2026-09-17", "wageLimit": 25000}},
	),
]


def ensure_seed_packs() -> list[str]:
	"""Insert missing seed packs as drafts. Returns the names created."""
	if not frappe.db.table_exists("Statutory Pack"):
		return []
	created = []
	for data in SEED_PACKS:
		name = f"{data['code']}-{data['version']}"
		if frappe.db.exists("Statutory Pack", name):
			continue
		doc = frappe.get_doc({**copy.deepcopy(data), "status": DRAFT, "needs_verification": 1})
		doc.flags.ignore_permissions = True
		doc.insert()
		created.append(doc.name)
	return created
