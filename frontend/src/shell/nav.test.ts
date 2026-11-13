import { describe, expect, it } from "vitest"
import { NAV_ITEMS, isActive } from "./nav"

describe("nav", () => {
	it("has the five places in order, in sentence case", () => {
		expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Today", "Inbox", "Leave", "Attendance", "Me"])
	})

	it("matches sections and their sub-pages", () => {
		const [today, inbox] = NAV_ITEMS
		expect(isActive(today, "/")).toBe(true)
		expect(isActive(today, "/inbox")).toBe(false)
		expect(isActive(inbox, "/inbox/LV-001")).toBe(true)
		expect(isActive(inbox, "/inboxes")).toBe(false)
	})
})
