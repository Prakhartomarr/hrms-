import { describe, expect, it, vi } from "vitest"
import { primaryCount, registerPrimary } from "./primaryGuard"

describe("primary button guard", () => {
	it("allows one primary per scope", () => {
		const warn = vi.fn()
		const off = registerPrimary("page", "Save", warn)
		const offSheet = registerPrimary("sheet", "Confirm", warn)
		expect(warn).not.toHaveBeenCalled()
		expect(primaryCount("page")).toBe(1)
		off()
		offSheet()
		expect(primaryCount("page")).toBe(0)
	})

	it("warns when a second primary appears in the same scope", () => {
		const warn = vi.fn()
		const a = registerPrimary("page", "Save", warn)
		const b = registerPrimary("page", "Submit", warn)
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("Save, Submit"))
		a()
		b()
	})
})
