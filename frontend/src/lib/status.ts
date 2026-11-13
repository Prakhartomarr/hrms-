/** Maps document statuses to the five badge tones. Unknown statuses are neutral. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral"

const TONES: Record<string, Tone> = {
	approved: "success",
	present: "success",
	paid: "success",
	completed: "success",
	active: "success",
	submitted: "info",
	open: "warning",
	pending: "warning",
	"half day": "warning",
	"work from home": "info",
	"on leave": "info",
	draft: "neutral",
	cancelled: "neutral",
	rejected: "danger",
	absent: "danger",
	overdue: "danger",
}

export function statusTone(status: string | null | undefined): Tone {
	if (!status) return "neutral"
	return TONES[status.trim().toLowerCase()] ?? "neutral"
}
