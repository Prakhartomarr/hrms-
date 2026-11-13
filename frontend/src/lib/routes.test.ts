import { describe, expect, it } from "vitest"
import { collectRoutes } from "./routes"

const Page = { template: "<div />" }

describe("collectRoutes", () => {
	it("flattens modules in file order and accepts single routes", () => {
		const routes = collectRoutes({
			"./pages/zeta/route.ts": { default: { path: "/zeta", name: "zeta", component: Page } },
			"./pages/alpha/route.ts": {
				default: [
					{ path: "/alpha", name: "alpha", component: Page },
					{ path: "/alpha/:id", name: "alpha-detail", component: Page },
				],
			},
		})
		expect(routes.map((r) => r.path)).toEqual(["/alpha", "/alpha/:id", "/zeta"])
	})

	it("rejects a path defined twice", () => {
		expect(() =>
			collectRoutes({
				"./pages/a/route.ts": { default: [{ path: "/x", component: Page }] },
				"./pages/b/route.ts": { default: [{ path: "/x", component: Page }] },
			})
		).toThrow(/\/x is defined in both/)
	})

	it("rejects a name used twice", () => {
		expect(() =>
			collectRoutes({
				"./pages/a/route.ts": { default: [{ path: "/a", name: "n", component: Page }] },
				"./pages/b/route.ts": { default: [{ path: "/b", name: "n", component: Page }] },
			})
		).toThrow(/"n" is used in both/)
	})

	it("finds the real page folders", () => {
		const modules = import.meta.glob<{ default: never }>("../pages/**/route.ts", { eager: true })
		expect(Object.keys(modules)).toContain("../pages/today/route.ts")
	})
})
