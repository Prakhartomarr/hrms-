import { describe, expect, it } from "vitest"
import { SAMPLE_BALANCES, SAMPLE_PENDING, workingTotal } from "./sample"

describe("Today sample sheet", () => {
	it.each(SAMPLE_BALANCES.map((b) => [b.label, b]))("%s footnote adds up to the figure", (_l, b) => {
		expect(workingTotal(b.working)).toBeCloseTo(b.days, 10)
	})

	it("highlights exactly one pending item", () => {
		expect(SAMPLE_PENDING.filter((p) => p.needsYou)).toHaveLength(1)
	})
})
