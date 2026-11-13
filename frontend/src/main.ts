import { createApp } from "vue"
import "@fontsource-variable/inter"
import "@fontsource-variable/plus-jakarta-sans"
import "@fontsource-variable/jetbrains-mono"
import "./main.css"
import App from "./App.vue"
import router from "./router"
import { session } from "./data/session"

const app = createApp(App)
app.use(router)
app.provide("session", session)
app.mount("#app")

// App-shell caching only (see public/sw.js). Served from /work-sw.js so it may control /work.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/work-sw.js", { scope: "/work" }).catch(() => {})
	})
}
