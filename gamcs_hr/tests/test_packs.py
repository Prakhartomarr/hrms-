"""Statutory packs (publish workflow, lookups by date) and policy versions (T10)."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from gamcs_hr.packs import (
	PackNotFoundError,
	PolicyVersionNotFoundError,
	get_pack,
	get_pack_segments,
	get_policy,
)
from gamcs_hr.packs.constants import DRAFT, PUBLISHED, REVIEWER_ROLE, VERIFIED, WITHDRAWN
from gamcs_hr.packs.policy_version import create_policy_version
from gamcs_hr.packs.seed import ensure_seed_packs
from gamcs_hr.packs.statutory_pack import PackWorkflowError

CODE = "PF-TEST"
SOURCE = {"title": "Test notification", "url": "https://example.com/notification.pdf", "tier": "P"}


def make_pack(effective_from, effective_to=None, ceiling=15000, code=CODE, kind="PF", status=PUBLISHED):
	doc = frappe.get_doc(
		{
			"doctype": "Statutory Pack",
			"kind": kind,
			"code": code,
			"effective_from": effective_from,
			"effective_to": effective_to,
			"values": frappe.as_json({"ceiling": ceiling, "eeRatePct": "12"}),
			"sources": [SOURCE],
		}
	).insert()
	if status in (VERIFIED, PUBLISHED, WITHDRAWN):
		doc.mark_verified("checked")
	if status in (PUBLISHED, WITHDRAWN):
		doc.publish()
	if status == WITHDRAWN:
		doc.withdraw("test")
	return doc


def make_user(email, roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}
		).insert(ignore_permissions=True)
	user = frappe.get_doc("User", email)
	user.add_roles(*roles)
	return email


class PackTestCase(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()


class TestPackLookupBoundaries(PackTestCase):
	"""PF ceiling ₹15,000 up to 16 Sep 2026 and ₹25,000 from 17 Sep 2026."""

	def setUp(self):
		super().setUp()
		self.old = make_pack("2026-04-01", None, 15000)
		self.new = make_pack("2026-09-17", None, 25000)

	def test_ceiling_by_date(self):
		cases = [
			("2026-04-01", 15000),  # first day of the first version
			("2026-06-15", 15000),
			("2026-09-16", 15000),  # last day of the old ceiling
			("2026-09-17", 25000),  # first day of the new ceiling
			("2026-09-30", 25000),
			("2030-01-01", 25000),  # open-ended
		]
		for day, ceiling in cases:
			with self.subTest(day=day):
				self.assertEqual(get_pack("PF", CODE, day)["values"]["ceiling"], ceiling)

	def test_before_first_version_is_not_found(self):
		with self.assertRaises(PackNotFoundError):
			get_pack("PF", CODE, "2026-03-31")

	def test_unknown_code_is_not_found(self):
		with self.assertRaises(PackNotFoundError):
			get_pack("PF", "PF-NOPE", "2026-09-17")

	def test_publishing_closes_the_open_ended_older_version(self):
		self.old.reload()
		self.assertEqual(getdate(self.old.effective_to), getdate("2026-09-16"))
		self.new.reload()
		self.assertEqual(self.new.supersedes, self.old.name)
		pack = get_pack("PF", CODE, "2026-09-16")
		self.assertEqual((pack.name, pack.effective_to), (self.old.name, getdate("2026-09-16")))

	def test_overlapping_publish_is_refused(self):
		clash = make_pack("2026-05-01", "2026-06-30", 20000, status=VERIFIED)
		with self.assertRaises(PackWorkflowError):
			clash.publish()

	def test_september_2026_splits_16_and_14_days(self):
		segments = get_pack_segments("PF", CODE, "2026-09-01", "2026-09-30")
		self.assertEqual(
			[(s.pack["values"]["ceiling"], str(s.from_date), str(s.to_date), s.days) for s in segments],
			[(15000, "2026-09-01", "2026-09-16", 16), (25000, "2026-09-17", "2026-09-30", 14)],
		)

	def test_month_inside_one_version_is_one_segment(self):
		segments = get_pack_segments("PF", CODE, "2026-10-01", "2026-10-31")
		self.assertEqual([(s.pack["values"]["ceiling"], s.days) for s in segments], [(25000, 31)])

	def test_period_with_a_gap_is_not_found(self):
		with self.assertRaisesRegex(PackNotFoundError, "2026-03-31"):
			get_pack_segments("PF", CODE, "2026-03-31", "2026-04-30")


class TestOnlyPublishedResolves(PackTestCase):
	def test_draft_verified_and_withdrawn_do_not_resolve(self):
		for code, status in (("PF-DRAFT", DRAFT), ("PF-VERIFIED", VERIFIED), ("PF-WITHDRAWN", WITHDRAWN)):
			make_pack("2026-04-01", None, 15000, code=code, status=status)
			with self.subTest(status=status), self.assertRaises(PackNotFoundError):
				get_pack("PF", code, "2026-05-01")

	def test_kind_must_match(self):
		make_pack("2026-04-01", None, 21000, code="ESI-TEST", kind="ESI")
		self.assertEqual(get_pack("ESI", "ESI-TEST", "2026-05-01")["values"]["ceiling"], 21000)
		with self.assertRaises(PackNotFoundError):
			get_pack("PF", "ESI-TEST", "2026-05-01")


class TestPublishWorkflow(PackTestCase):
	def test_status_moves_only_through_actions(self):
		doc = make_pack("2026-04-01", status=DRAFT)
		doc.status = PUBLISHED
		with self.assertRaises(PackWorkflowError):
			doc.save()

	def test_new_pack_must_start_as_draft(self):
		with self.assertRaises(PackWorkflowError):
			frappe.get_doc(
				{
					"doctype": "Statutory Pack",
					"kind": "PF",
					"code": CODE,
					"effective_from": "2026-04-01",
					"values": "{}",
					"status": PUBLISHED,
				}
			).insert()

	def test_publish_needs_verification_first(self):
		doc = make_pack("2026-04-01", status=DRAFT)
		with self.assertRaises(frappe.ValidationError):
			doc.publish()

	def test_verify_needs_a_source(self):
		doc = make_pack("2026-04-01", status=DRAFT)
		doc.sources = []
		doc.save()
		with self.assertRaisesRegex(frappe.ValidationError, "source"):
			doc.mark_verified()

	def test_editing_a_verified_pack_sends_it_back_to_draft(self):
		doc = make_pack("2026-04-01", status=VERIFIED)
		doc.values = frappe.as_json({"ceiling": 16000, "eeRatePct": "12"})
		doc.save()
		self.assertEqual((doc.status, doc.needs_verification, doc.reviewed_by), (DRAFT, 1, None))

	def test_review_notes_can_change_without_losing_verification(self):
		doc = make_pack("2026-04-01", status=VERIFIED)
		doc.review_notes = "Checked against the gazette copy."
		doc.save()
		self.assertEqual(doc.status, VERIFIED)

	def test_published_pack_is_read_only(self):
		doc = make_pack("2026-04-01")
		doc.values = frappe.as_json({"ceiling": 16000})
		with self.assertRaises(PackWorkflowError):
			doc.save()
		doc.reload()
		with self.assertRaises(PackWorkflowError):
			doc.delete()

	def test_effective_to_before_from_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			make_pack("2026-04-01", "2026-03-31", status=DRAFT)

	def test_values_must_be_a_json_object(self):
		doc = make_pack("2026-04-01", status=DRAFT)
		doc.values = "[1, 2]"
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_name_is_code_and_version(self):
		doc = make_pack("2026-09-17", status=DRAFT, code="pf-test")
		self.assertEqual((doc.name, doc.code, doc.version), ("PF-TEST-2026-09-17", "PF-TEST", "2026-09-17"))

	def test_roles_and_maker_checker(self):
		author = make_user("pack.author@example.com", ("HR Manager",))
		reviewer = make_user("pack.reviewer@example.com", (REVIEWER_ROLE,))

		frappe.set_user(author)
		doc = make_pack("2026-04-01", status=DRAFT)
		with self.assertRaises(frappe.PermissionError):
			doc.mark_verified()  # HR Manager isn't a reviewer

		frappe.set_user(reviewer)
		doc = frappe.get_doc("Statutory Pack", doc.name)
		doc.mark_verified("ok")
		self.assertEqual((doc.status, doc.reviewed_by), (VERIFIED, reviewer))
		with self.assertRaises(frappe.PermissionError):
			doc.publish()  # a reviewer can't publish

		frappe.set_user(author)
		doc = frappe.get_doc("Statutory Pack", doc.name)
		doc.publish()
		self.assertEqual((doc.status, doc.published_by), (PUBLISHED, author))

	def test_author_cannot_verify_own_pack(self):
		both = make_user("pack.both@example.com", ("HR Manager", REVIEWER_ROLE))
		frappe.set_user(both)
		doc = make_pack("2026-04-01", status=DRAFT)
		with self.assertRaises(PackWorkflowError):
			doc.mark_verified()

	def test_withdraw_needs_a_reason(self):
		doc = make_pack("2026-04-01")
		with self.assertRaises(frappe.ValidationError):
			doc.withdraw(" ")
		doc.withdraw("Wrong notification")
		self.assertEqual(doc.status, WITHDRAWN)
		self.assertIn("Wrong notification", doc.review_notes)


class TestSeedPfPack(PackTestCase):
	def test_seed_is_two_drafts_pending_ca(self):
		ensure_seed_packs()
		rows = frappe.get_all(
			"Statutory Pack",
			filters={"code": "PF-IN"},
			fields=["name", "status", "needs_verification", "effective_from", "effective_to", "values"],
			order_by="effective_from",
		)
		self.assertEqual(
			[
				(
					r.name,
					r.status,
					r.needs_verification,
					str(r.effective_from),
					str(r.effective_to) if r.effective_to else None,
					frappe.parse_json(r["values"])["ceiling"],
				)
				for r in rows
			],
			[
				("PF-IN-2026-04-01", DRAFT, 1, "2026-04-01", "2026-09-16", 15000),
				("PF-IN-2026-09-17", DRAFT, 1, "2026-09-17", None, 25000),
			],
		)
		self.assertTrue(frappe.get_doc("Statutory Pack", "PF-IN-2026-09-17").sources)
		# drafts don't resolve
		with self.assertRaises(PackNotFoundError):
			get_pack("PF", "PF-IN", "2026-09-17")

	def test_seed_resolves_once_published(self):
		ensure_seed_packs()
		for name in ("PF-IN-2026-04-01", "PF-IN-2026-09-17"):
			doc = frappe.get_doc("Statutory Pack", name)
			if doc.status == DRAFT:
				doc.mark_verified()
			if doc.status == VERIFIED:
				doc.publish()
		self.assertEqual(get_pack("PF", "PF-IN", "2026-09-16")["values"]["ceiling"], 15000)
		self.assertEqual(get_pack("PF", "PF-IN", "2026-09-17")["values"]["ceiling"], 25000)
		self.assertEqual(get_pack("PF", "PF-IN", "2026-09-17")["values"]["epsRatePct"], "8.33")

	def test_seed_is_idempotent_and_keeps_edits(self):
		ensure_seed_packs()
		doc = frappe.get_doc("Statutory Pack", "PF-IN-2026-04-01")
		doc.review_notes = "edited by reviewer"
		doc.save()
		self.assertEqual(ensure_seed_packs(), [])
		self.assertEqual(
			frappe.db.get_value("Statutory Pack", doc.name, "review_notes"), "edited by reviewer"
		)


class TestPolicyVersions(PackTestCase):
	def setUp(self):
		super().setUp()
		self.rule = "_Test Policy Version Designation"
		if not frappe.db.exists("Designation", self.rule):
			frappe.get_doc({"doctype": "Designation", "designation_name": self.rule}).insert()
		self._describe("v1")
		self.v1 = create_policy_version("Designation", self.rule, "2026-04-01", "first")
		self._describe("v2")
		self.v2 = create_policy_version("Designation", self.rule, "2026-09-17")
		self._describe("live, not versioned")

	def _describe(self, text):
		doc = frappe.get_doc("Designation", self.rule)
		doc.description = text
		doc.save()

	def test_version_by_date(self):
		cases = [
			("2026-04-01", "v1"),
			("2026-09-16", "v1"),
			("2026-09-17", "v2"),
			("2027-03-31", "v2"),
		]
		for day, expected in cases:
			with self.subTest(day=day):
				doc = get_policy("Designation", self.rule, day)
				self.assertEqual(doc.description, expected)
		self.assertEqual(
			get_policy("Designation", self.rule, "2026-09-17").flags.gamcs_policy_version, self.v2.name
		)

	def test_before_first_version_raises(self):
		with self.assertRaises(PolicyVersionNotFoundError):
			get_policy("Designation", self.rule, "2026-03-31")

	def test_numbering_and_names(self):
		self.assertEqual((self.v1.version_no, self.v2.version_no), (1, 2))
		self.assertEqual(self.v2.name, f"Designation-{self.rule}-v2")
		self.assertEqual(self.v1.published_by, "Administrator")

	def test_later_version_on_the_same_date_wins(self):
		self._describe("v2 corrected")
		v3 = create_policy_version("Designation", self.rule, "2026-09-17", "correction")
		self.assertEqual(v3.version_no, 3)
		self.assertEqual(get_policy("Designation", self.rule, "2026-10-01").description, "v2 corrected")
		self.assertEqual(get_policy("Designation", self.rule, "2026-09-01").description, "v1")

	def test_unversioned_rule_falls_back_to_live(self):
		other = "_Test Policy Version Unversioned"
		if not frappe.db.exists("Designation", other):
			frappe.get_doc(
				{"doctype": "Designation", "designation_name": other, "description": "live"}
			).insert()
		doc = get_policy("Designation", other, "2026-05-01")
		self.assertEqual((doc.description, doc.flags.gamcs_policy_version), ("live", None))
		with self.assertRaises(PolicyVersionNotFoundError):
			get_policy("Designation", other, "2026-05-01", fallback_to_live=False)

	def test_versions_are_immutable(self):
		doc = frappe.get_doc("Policy Version", self.v1.name)
		doc.effective_from = "2026-05-01"
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		doc.reload()
		doc.snapshot = frappe.as_json({**frappe.parse_json(doc.snapshot), "description": "tampered"})
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		doc.reload()
		doc.note = "only the note may change"
		doc.save()

	def test_snapshot_keeps_child_rows(self):
		name = "_Test Policy Version Holidays"
		if not frappe.db.exists("Holiday List", name):
			frappe.get_doc(
				{
					"doctype": "Holiday List",
					"holiday_list_name": name,
					"from_date": "2026-04-01",
					"to_date": "2027-03-31",
					"holidays": [{"holiday_date": "2026-08-15", "description": "Independence Day"}],
				}
			).insert()
		create_policy_version("Holiday List", name, "2026-04-01")
		live = frappe.get_doc("Holiday List", name)
		live.append("holidays", {"holiday_date": "2026-10-02", "description": "Gandhi Jayanti"})
		live.save()
		doc = get_policy("Holiday List", name, "2026-12-01")
		self.assertEqual([str(h.holiday_date) for h in doc.holidays], ["2026-08-15"])
