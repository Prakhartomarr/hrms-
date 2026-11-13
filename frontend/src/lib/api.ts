/**
 * Minimal Frappe method call for the shell, so the first paint doesn't load all of
 * frappe-ui. Pages may still import frappe-ui (createResource, components); it then
 * loads as its own chunk with that page.
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public excType?: string
	) {
		super(message)
	}
}

export async function call<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
	const response = await fetch(`/api/method/${method}`, {
		method: "POST",
		credentials: "same-origin",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json; charset=utf-8",
			"X-Frappe-CSRF-Token": window.csrf_token ?? "",
		},
		body: JSON.stringify(args),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new ApiError(data.exception || response.statusText, response.status, data.exc_type)
	}
	return data.message as T
}
