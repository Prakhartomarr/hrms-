import { createRouter, createWebHistory } from "vue-router"
import { collectRoutes, type RouteModule } from "@/lib/routes"
import { sessionUser, redirectToLogin } from "@/data/session"

// Each page folder adds src/pages/<area>/route.ts; nobody edits this file to add a page.
const modules = import.meta.glob<RouteModule>("./pages/**/route.ts", { eager: true })

const router = createRouter({
	history: createWebHistory("/work"),
	routes: [
		...collectRoutes(modules),
		{
			path: "/:pathMatch(.*)*",
			name: "not-found",
			component: () => import("@/shell/NotFound.vue"),
			meta: { title: "Not found" },
		},
	],
	scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

router.beforeEach(() => {
	if (!sessionUser()) {
		redirectToLogin()
		return false
	}
})

router.afterEach((to) => {
	const title = to.meta?.title as string | undefined
	document.title = title ? `${title} · GAMCS HR` : "GAMCS HR"
})

export default router
