"""Features golden checks can wait for, keyed by build-queue task.

A check marked `pending: {feature: T57}` is skipped with this description until the
owning task lands and removes the mark from the fixture. Run the probe
(`infra/dev/hr.sh golden probe`) to see which pending slip checks already match.
"""

FEATURES = {
	"T56": "wage definition on salary components (wage classes, 50% add-back) and rupee rounding",
	"T57": "PF from packs: code wages, 25,000 ceiling, employer EPS/EPF/EDLI/admin, split month, VPF, age 58",
	"T58": "ESI from packs: code wages, employer share, contribution periods, low-wage exemption",
	"T59": "PT and LWF packs per state",
	"T61": "CTC balancer, basic-share and minimum-wage checks",
	"T63": "salary hold and release",
	"T65": "adjustments and arrears",
	"T66": "income tax under the 2025 Act: projection, rebate, surcharge, HRA, employer NPS",
	"T67": "previous-employer income and perquisites",
	"T71": "bank transfer files",
	"T73": "gratuity",
	"T74": "employee loans",
	"T75": "full and final settlement",
}


def describe(feature_ids) -> str:
	return "; ".join(f"{f}: {FEATURES[f]}" for f in feature_ids)
