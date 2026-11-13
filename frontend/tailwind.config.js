// Tailwind is here so frappe-ui components render correctly when later pages use them.
// Our own components style themselves from src/ui/tokens.css, not from Tailwind classes.
import frappeUIPreset from "frappe-ui/src/tailwind/preset"

export default {
	presets: [frappeUIPreset],
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts}",
		"./node_modules/frappe-ui/src/components/**/*.{vue,js,ts}",
	],
	theme: { extend: {} },
	plugins: [],
}
