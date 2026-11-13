/*
 * GAMCS HR service worker: caches the app shell ONLY.
 *
 * - Navigations under /work: network first, falling back to the last good /work page,
 *   so the shell opens on a flaky connection.
 * - Built assets under /assets/gamcs_hr/frontend/ (hashed file names): cache first.
 * - Everything else (API calls, desk, files) is never cached and goes to the network.
 *
 * Served at /work-sw.js by gamcs_hr.work_app.service_worker with Service-Worker-Allowed.
 */
const VERSION = "gamcs-work-shell-v1"
const SHELL_URL = "/work"
const ASSET_PREFIX = "/assets/gamcs_hr/frontend/"

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(VERSION)
			.then((cache) => cache.add(new Request(SHELL_URL, { credentials: "same-origin" })))
			.catch(() => {})
			.then(() => self.skipWaiting())
	)
})

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	)
})

self.addEventListener("fetch", (event) => {
	const request = event.request
	if (request.method !== "GET") return
	const url = new URL(request.url)
	if (url.origin !== self.location.origin) return

	if (request.mode === "navigate" && (url.pathname === SHELL_URL || url.pathname.startsWith(SHELL_URL + "/"))) {
		event.respondWith(
			fetch(request)
				.then((response) => {
					// Only keep a real app page (not a redirect to /login).
					if (response.ok && !response.redirected) {
						const copy = response.clone()
						caches.open(VERSION).then((cache) => cache.put(SHELL_URL, copy))
					}
					return response
				})
				.catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
		)
		return
	}

	if (url.pathname.startsWith(ASSET_PREFIX)) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						if (response.ok) {
							const copy = response.clone()
							caches.open(VERSION).then((cache) => cache.put(request, copy))
						}
						return response
					})
			)
		)
	}
})
