import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "path"
import fs from "fs"

// Built into gamcs_hr/public/frontend (served at /assets/gamcs_hr/frontend/), and the
// built index.html is copied to gamcs_hr/www/work.html by the `build` script.
export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: { "@": path.resolve(__dirname, "src") },
	},
	server: {
		port: 8280,
		proxy: getProxyOptions(),
		allowedHosts: true,
	},
	build: {
		outDir: "../gamcs_hr/public/frontend",
		emptyOutDir: true,
		target: "es2019",
		sourcemap: false,
		commonjsOptions: {
			include: [/tailwind.config.js/, /node_modules/],
		},
	},
	optimizeDeps: {
		include: ["frappe-ui > feather-icons", "showdown", "engine.io-client"],
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
})

// Dev only: proxy Frappe routes to the bench on port 8200 (never 8000, which is taken).
function getProxyOptions() {
	const port = getWebserverPort()
	return {
		"^/(app|login|api|assets|files|private|work-sw.js)": {
			target: `http://127.0.0.1:${port}`,
			ws: true,
			router: (req) => `http://${req.headers.host.split(":")[0]}:${port}`,
		},
	}
}

function getWebserverPort() {
	let dir = path.resolve(".")
	while (dir !== "/") {
		const config = path.join(dir, "sites", "common_site_config.json")
		if (fs.existsSync(config)) return JSON.parse(fs.readFileSync(config)).webserver_port || 8200
		dir = path.resolve(dir, "..")
	}
	return 8200
}
