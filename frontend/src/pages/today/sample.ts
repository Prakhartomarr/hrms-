/**
 * Placeholder figures for the Today sheet until leave (T30) and home (T51) wire real
 * data. Shown with a "sample figures" note so nobody mistakes them for their balance.
 * Each footnote is the working: parts that add up to the figure.
 */
export type Working = { text: string; figure?: string }[]

export type Balance = { label: string; days: number; working: Working }
export type Pending = { label: string; detail: string; needsYou?: boolean }

export const SAMPLE_BALANCES: Balance[] = [
	{
		label: "Earned leave",
		days: 12.5,
		working: [
			{ text: "Opening balance on 1 Apr 2026", figure: "8.75" },
			{ text: "Credited, 1.25 a month for 7 months", figure: "+ 8.75" },
			{ text: "Taken this year", figure: "− 5.00" },
		],
	},
	{
		label: "Casual leave",
		days: 4,
		working: [
			{ text: "Granted for 2026", figure: "8.00" },
			{ text: "Taken this year", figure: "− 4.00" },
		],
	},
	{
		label: "Sick leave",
		days: 6,
		working: [
			{ text: "Granted for 2026", figure: "7.00" },
			{ text: "Taken this year", figure: "− 1.00" },
		],
	},
	{
		label: "Comp-off",
		days: 1,
		working: [
			{ text: "Worked Saturday 1 Nov 2026 for 9h 10m (8h minimum)", figure: "1.00" },
			{ text: "Expires on 31 Jan 2027" },
		],
	},
]

export const SAMPLE_PENDING: Pending[] = [
	{ label: "Submit your timesheet for 3–9 Nov", detail: "Due today by 6:00 pm", needsYou: true },
	{ label: "Acknowledge the updated leave policy", detail: "Published 10 Nov 2026" },
	{ label: "Upload rent receipts for HRA", detail: "Proofs due by 15 Jan 2027" },
]

/** Sum of the signed figures in a working, to check the footnote adds up. */
export function workingTotal(working: Working): number {
	return working.reduce((sum, w) => {
		if (!w.figure) return sum
		const n = Number(w.figure.replace("−", "-").replace(/[+\s]/g, ""))
		return sum + n
	}, 0)
}
