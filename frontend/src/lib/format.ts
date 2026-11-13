/**
 * Display formatting for the /work app. Indian conventions throughout.
 *
 * Money uses Intl with the en-IN locale (lakh/crore grouping), as CLAUDE.md asks: never
 * hand-roll digit grouping. Dates are built from fixed month names because browsers
 * disagree on en-IN month abbreviations ("Sep" vs "Sept").
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const inrFormatters = new Map<number, Intl.NumberFormat>()

/** ₹12,34,567.00. `decimals` defaults to 2 (paise shown). Null and NaN give "". */
export function formatINR(amount: number | string | null | undefined, decimals = 2): string {
	const value = toNumber(amount)
	if (value === null) return ""
	let formatter = inrFormatters.get(decimals)
	if (!formatter) {
		formatter = new Intl.NumberFormat("en-IN", {
			style: "currency",
			currency: "INR",
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		})
		inrFormatters.set(decimals, formatter)
	}
	// Avoid "-₹0.00" for values that round to zero.
	const rounded = Number(value.toFixed(decimals))
	return formatter.format(Object.is(rounded, -0) ? 0 : rounded)
}

/** 12,34,567 (Indian grouping, no currency). */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
	const n = toNumber(value)
	if (n === null) return ""
	return new Intl.NumberFormat("en-IN", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(n)
}

/** 13 Nov 2026. Accepts a Date or an ISO date / datetime string ("2026-11-13"). */
export function formatDate(input: Date | string | null | undefined): string {
	const d = toDate(input)
	if (!d) return ""
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Friday, 13 Nov 2026 */
export function formatDateLong(input: Date | string | null | undefined): string {
	const d = toDate(input)
	if (!d) return ""
	return `${WEEKDAYS[d.getDay()]}, ${formatDate(d)}`
}

/** 9:05 am, 6:30 pm (12-hour clock, as people in India write it). */
export function formatTime(input: Date | string | null | undefined): string {
	const d = toDate(input)
	if (!d) return ""
	const h = d.getHours()
	const m = String(d.getMinutes()).padStart(2, "0")
	return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "am" : "pm"}`
}

/** Minutes to "7h 30m", "45m", "8h", "0m". Fractions of a minute are dropped. */
export function formatDuration(minutes: number | null | undefined): string {
	if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return ""
	const sign = minutes < 0 ? "-" : ""
	const total = Math.floor(Math.abs(minutes))
	const h = Math.floor(total / 60)
	const m = total % 60
	if (h === 0) return `${sign}${m}m`
	if (m === 0) return `${sign}${h}h`
	return `${sign}${h}h ${m}m`
}

/** Seconds to the same form as formatDuration ("7h 30m"). */
export function formatDurationSeconds(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return ""
	return formatDuration(Math.trunc(seconds / 60))
}

/** Morning before 12, afternoon before 17, evening after. */
export function greeting(now: Date = new Date()): string {
	const h = now.getHours()
	if (h < 12) return "Good morning"
	if (h < 17) return "Good afternoon"
	return "Good evening"
}

function toNumber(value: number | string | null | undefined): number | null {
	if (value === null || value === undefined || value === "") return null
	const n = typeof value === "number" ? value : Number(value)
	return Number.isFinite(n) ? n : null
}

/** Frappe sends "2026-11-13" and "2026-11-13 09:30:00"; both are local times. */
function toDate(input: Date | string | null | undefined): Date | null {
	if (!input) return null
	if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(input)
	if (match) {
		const [, y, mo, d, h = "0", mi = "0", s = "0"] = match
		return new Date(+y, +mo - 1, +d, +h, +mi, +s)
	}
	const d = new Date(input)
	return Number.isNaN(d.getTime()) ? null : d
}
