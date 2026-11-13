import type { RouteRecordRaw } from "vue-router"

/** A page folder's route.ts: `export default [ { path, name, component, meta } ]`. */
export type RouteModule = { default: RouteRecordRaw | RouteRecordRaw[] }

/**
 * Flattens the route.ts modules found by import.meta.glob into one list, sorted by file
 * path so the order is stable. Duplicate paths or names are a programming error.
 */
export function collectRoutes(modules: Record<string, RouteModule>): RouteRecordRaw[] {
	const routes: RouteRecordRaw[] = []
	const seenPaths = new Map<string, string>()
	const seenNames = new Map<string, string>()
	for (const file of Object.keys(modules).sort()) {
		const exported = modules[file]?.default
		if (!exported) throw new Error(`${file} has no default export of routes`)
		for (const route of Array.isArray(exported) ? exported : [exported]) {
			const other = seenPaths.get(route.path)
			if (other) throw new Error(`Route ${route.path} is defined in both ${other} and ${file}`)
			seenPaths.set(route.path, file)
			if (route.name) {
				const name = String(route.name)
				const prev = seenNames.get(name)
				if (prev) throw new Error(`Route name "${name}" is used in both ${prev} and ${file}`)
				seenNames.set(name, file)
			}
			routes.push(route)
		}
	}
	return routes
}
