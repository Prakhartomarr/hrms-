# 0007: /work app build output is not committed

Date: 2026-11-13. Task: T03.

## Decision

The Vue app in `frontend/` builds into `gamcs_hr/public/frontend/` (served at `/assets/gamcs_hr/frontend/`). The build also copies the built `index.html` to `gamcs_hr/www/work.html`. Both paths are gitignored. A bench builds them with `bench build --app gamcs_hr` (or `infra/dev/hr.sh bench build --app gamcs_hr`).

This follows Frappe HR, which ignores `hrms/public/frontend` and `hrms/www/hrms.html` and builds them with `bench build`. Frappe's build runs `yarn build` in every app whose root `package.json` has a `build` script. Our root `package.json` forwards to `frontend/`, and its `postinstall` installs the frontend's dependencies, the same way hrms does.

## Why

- Hashed bundles would churn on every change and cause merge conflicts between the parallel UI tasks (T18, T30, T43 and others).
- A public repo should not carry minified output that nobody reviews.
- Deployments already run `bench build`.

## Consequences

- On a fresh bench, `/work` returns 404 until the app is built. `infra/dev/init.sh` already runs `bench build` on first start.
- CI does not build the frontend. Server tests in `gamcs_hr/tests/test_work_shell.py` do not depend on built files. UI units run with Vitest (`cd frontend && yarn test`).
- `node_modules/` (root and `frontend/`) is gitignored. `frontend/yarn.lock` is committed. Install inside the bench container (`infra/dev/hr.sh shell`, then `cd apps/gamcs_hr && yarn install`) so the Node version matches the build.

## Related choices made in T03

- **Service worker at `/work-sw.js`.** A worker only controls pages under its own path, so a worker served from `/assets/...` cannot control `/work`. The custom `page_renderer` `gamcs_hr.work_app.service_worker.ServiceWorkerPage` serves the built `sw.js` from the site root with `Service-Worker-Allowed: /work` and `Cache-Control: no-cache`. The worker caches the app shell only: the `/work` page (network first) and the hashed files under `/assets/gamcs_hr/frontend/` (cache first). It never caches API responses.
- **Module `work_app`** (added to `modules_order.py`) holds the route rule `/work/<path:app_path>` → `work`, the renderer, and the session-context API.
- **frappe-ui stays out of the first paint.** The shell calls Frappe through a small `fetch` wrapper (`src/lib/api.ts`), which keeps the entry bundle near 194 kB instead of 610 kB. Pages that import frappe-ui components or `createResource` load it as their own chunk. Its stylesheet and Tailwind preset are still included so its components render correctly.
- **PWA icons are SVG placeholders** until the GA logo file is added. Some install prompts (older Android Chrome, iOS home screen) prefer PNG icons, so add 192 px and 512 px PNGs with the real logo.
