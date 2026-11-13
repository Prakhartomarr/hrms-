import { describe, expect, it } from "vitest"
import { statusTone } from "./status"

describe("statusTone", () => {
	it("maps common statuses, ignoring case", () => {
		expect(statusTone("Approved")).toBe("success")
		expect(statusTone("open")).toBe("warning")
		expect(statusTone("Rejected")).toBe("danger")
		expect(statusTone("Work From Home")).toBe("info")
	})

	it("falls back to neutral", () => {
		expect(statusTone("Something else")).toBe("neutral")
		expect(statusTone(null)).toBe("neutral")
	})
})
