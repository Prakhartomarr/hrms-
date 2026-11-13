/**
 * "One primary button per view" (CLAUDE.md UI rules), checked at runtime.
 *
 * Every mounted primary UiButton registers here. When more than one is mounted at once,
 * a warning names them in development, so a page that breaks the rule is caught on
 * first render. Sheets count as their own view and use their own scope.
 */
const scopes = new Map<string, Set<string>>()
let counter = 0

export type Warn = (message: string) => void

export function registerPrimary(scope: string, label: string, warn: Warn = defaultWarn): () => void {
	const id = `${label}#${++counter}`
	const set = scopes.get(scope) ?? new Set<string>()
	set.add(id)
	scopes.set(scope, set)
	if (set.size > 1) {
		const labels = [...set].map((x) => x.split("#")[0])
		warn(`More than one primary button in view "${scope}": ${labels.join(", ")}. Keep one.`)
	}
	return () => {
		set.delete(id)
		if (!set.size) scopes.delete(scope)
	}
}

export function primaryCount(scope: string): number {
	return scopes.get(scope)?.size ?? 0
}

function defaultWarn(message: string) {
	if (import.meta.env?.DEV) console.warn(`[gamcs-ui] ${message}`)
}
