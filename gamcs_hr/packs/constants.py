"""Names shared by the packs module."""

DRAFT = "Draft"
VERIFIED = "CA verified"
PUBLISHED = "Published"
WITHDRAWN = "Withdrawn"
STATUSES = (DRAFT, VERIFIED, PUBLISHED, WITHDRAWN)

KINDS = (
	"CODE_WAGES",
	"PF",
	"ESI",
	"PT",
	"LWF",
	"INCOME_TAX",
	"GRATUITY",
	"BONUS",
	"MIN_WAGE",
	"COMPLIANCE_CALENDAR",
	"BANK_FORMAT",
)

# Who may move a pack along draft -> CA verified -> published.
REVIEWER_ROLE = "Statutory Reviewer"
VERIFIER_ROLES = (REVIEWER_ROLE, "System Manager")
PUBLISHER_ROLES = ("HR Manager", "System Manager")
WITHDRAW_ROLES = ("System Manager",)

# Fields whose change makes a verified pack go back to draft, and that a published
# pack never changes (apart from effective_to when a newer version closes it).
CONTENT_FIELDS = (
	"kind",
	"code",
	"version",
	"effective_from",
	"effective_to",
	"country",
	"state",
	"local_body",
	"values",
	"tenant_overridable",
)
SOURCE_FIELDS = ("title", "url", "tier", "retrieved_on")
