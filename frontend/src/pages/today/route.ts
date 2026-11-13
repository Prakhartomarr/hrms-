export default [
	{
		path: "/",
		name: "today",
		component: () => import("./TodayPage.vue"),
		meta: { title: "Today" },
	},
]
