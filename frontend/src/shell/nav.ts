/**
 * The five places in the app, shared by the phone bottom bar and the desktop side nav.
 * Pages for these paths arrive with later tasks (T18 inbox, T30 leave, T43 attendance,
 * T52/T53 me); until then the shell shows a "coming soon" sheet for them.
 */
export type NavItem = { label: string; path: string; icon: string }

export const NAV_ITEMS: NavItem[] = [
	{ label: "Today", path: "/", icon: "sun" },
	{ label: "Inbox", path: "/inbox", icon: "inbox" },
	{ label: "Leave", path: "/leave", icon: "calendar" },
	{ label: "Attendance", path: "/attendance", icon: "clock" },
	{ label: "Me", path: "/me", icon: "user" },
]

export function isActive(item: NavItem, currentPath: string): boolean {
	if (item.path === "/") return currentPath === "/"
	return currentPath === item.path || currentPath.startsWith(item.path + "/")
}
