/**
 * Session and current employee. Auth is the Frappe session cookie: no tokens here.
 * work.py redirects guests to /login before the app loads and embeds the context in
 * window.frappe.boot.gamcs; in vite dev (no boot) it is fetched instead.
 */
import { reactive } from "vue"
import { call } from "@/lib/api"

export type Employee = {
	name: string
	employee_name: string
	first_name?: string
	designation?: string
	department?: string
	company?: string
	branch?: string
	image?: string
}

export type ShellContext = {
	user: { name: string; full_name: string; first_name: string; image?: string }
	employee: Employee | null
	is_manager: boolean
	unread_notifications: number
}

declare global {
	interface Window {
		frappe?: { boot?: { gamcs?: ShellContext } & Record<string, unknown> }
		csrf_token?: string
	}
}

export function sessionUser(): string | null {
	const cookies = new URLSearchParams(document.cookie.split("; ").join("&"))
	const user = cookies.get("user_id")
	return user && user !== "Guest" ? user : null
}

export function loginUrl(path = window.location.pathname + window.location.search): string {
	return `/login?redirect-to=${encodeURIComponent(path)}`
}

export function redirectToLogin() {
	window.location.href = loginUrl()
}

export const session = reactive({
	user: sessionUser(),
	context: (window.frappe?.boot?.gamcs ?? null) as ShellContext | null,
	loading: false,
	error: "" as string,
	async load() {
		if (this.context) return
		this.loading = true
		try {
			this.context = (await call("gamcs_hr.work_app.api.get_context")) as ShellContext
		} catch (e) {
			if (!sessionUser()) return redirectToLogin()
			this.error = "We couldn't load your account. Check your connection and try again."
		} finally {
			this.loading = false
		}
	},
	async logout() {
		try {
			await call("logout")
		} finally {
			window.location.href = "/login"
		}
	},
})
