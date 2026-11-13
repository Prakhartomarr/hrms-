import { describe, expect, it } from "vitest"
import {
	formatDate,
	formatDateLong,
	formatDuration,
	formatDurationSeconds,
	formatINR,
	formatNumber,
	formatTime,
	greeting,
} from "./format"

describe("formatINR", () => {
	it.each([
		[1234567, "₹12,34,567.00"],
		[123456789.5, "₹12,34,56,789.50"],
		[100000, "₹1,00,000.00"],
		[999, "₹999.00"],
		[0, "₹0.00"],
		[0.005, "₹0.01"],
		[-24500, "-₹24,500.00"],
		["124500", "₹1,24,500.00"],
	])("%s → %s", (input, expected) => {
		expect(formatINR(input)).toBe(expected)
	})

	it("drops paise when asked", () => {
		expect(formatINR(124500, 0)).toBe("₹1,24,500")
	})

	it("never shows minus zero", () => {
		expect(formatINR(-0.001)).toBe("₹0.00")
	})

	it("returns empty for missing values", () => {
		expect(formatINR(null)).toBe("")
		expect(formatINR(undefined)).toBe("")
		expect(formatINR("")).toBe("")
		expect(formatINR("abc")).toBe("")
	})
})

describe("formatNumber", () => {
	it("groups in lakhs", () => {
		expect(formatNumber(1234567)).toBe("12,34,567")
		expect(formatNumber(7.5, 1)).toBe("7.5")
	})
})

describe("dates", () => {
	it("formats a Date the Indian way", () => {
		expect(formatDate(new Date(2026, 10, 13))).toBe("13 Nov 2026")
	})

	it("reads Frappe date strings as local dates", () => {
		expect(formatDate("2026-11-13")).toBe("13 Nov 2026")
		expect(formatDate("2026-01-01 00:30:00")).toBe("1 Jan 2026")
		expect(formatDate("2026-09-05")).toBe("5 Sep 2026")
	})

	it("adds the weekday in the long form", () => {
		expect(formatDateLong("2026-11-13")).toBe("Friday, 13 Nov 2026")
	})

	it("returns empty for missing or bad input", () => {
		expect(formatDate(null)).toBe("")
		expect(formatDate("not a date")).toBe("")
	})

	it("formats times on a 12-hour clock", () => {
		expect(formatTime("2026-11-13 09:05:00")).toBe("9:05 am")
		expect(formatTime("2026-11-13 00:00:00")).toBe("12:00 am")
		expect(formatTime("2026-11-13 12:30:00")).toBe("12:30 pm")
		expect(formatTime("2026-11-13 18:30:00")).toBe("6:30 pm")
	})
})

describe("formatDuration", () => {
	it.each([
		[450, "7h 30m"],
		[480, "8h"],
		[45, "45m"],
		[0, "0m"],
		[61.9, "1h 1m"],
		[-65, "-1h 5m"],
		[1500, "25h"],
	])("%s minutes → %s", (minutes, expected) => {
		expect(formatDuration(minutes)).toBe(expected)
	})

	it("accepts seconds", () => {
		expect(formatDurationSeconds(27000)).toBe("7h 30m")
		expect(formatDurationSeconds(59)).toBe("0m")
	})

	it("returns empty for missing values", () => {
		expect(formatDuration(null)).toBe("")
		expect(formatDuration(Number.NaN)).toBe("")
	})
})

describe("greeting", () => {
	it("follows the time of day", () => {
		expect(greeting(new Date(2026, 10, 13, 8))).toBe("Good morning")
		expect(greeting(new Date(2026, 10, 13, 13))).toBe("Good afternoon")
		expect(greeting(new Date(2026, 10, 13, 19))).toBe("Good evening")
	})
})
