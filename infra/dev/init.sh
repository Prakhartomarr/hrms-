#!/bin/bash
# Runs inside the bench container as its command. Idempotent: every block is skipped
# when its result already exists, so an interrupted first run resumes on the next
# `docker compose up`. Ends by exec'ing `bench start` (web 8200, socketio 9200).
set -e
B=/home/frappe/frappe-bench
S=hr.localhost
BRANCH=version-16
export NODE_OPTIONS=--max-old-space-size=3072
git config --global --add safe.directory '*'   # bind-mounted repos are owned by the host uid

cd /home/frappe
if [ ! -d "$B/apps/frappe" ]; then
	bench init --ignore-exist --skip-redis-config-generation --skip-assets \
		--frappe-branch "$BRANCH" --python "$(command -v python3.14)" frappe-bench
	cd "$B"
	bench set-mariadb-host mariadb
	bench set-redis-cache-host redis://redis:6379
	bench set-redis-queue-host redis://redis:6379
	bench set-redis-socketio-host redis://redis:6379
	bench set-config -g webserver_port 8200
	bench set-config -g socketio_port 9200
	# no local redis, no asset watcher (memory); web on 8200
	sed -i '/redis/d;/watch/d;s/--port 8000/--port 8200/' ./Procfile
fi
cd "$B"

[ -d apps/erpnext ] || bench get-app --skip-assets --branch "$BRANCH" erpnext
[ -d apps/hrms ] || bench get-app --skip-assets --branch "$BRANCH" hrms
[ -d apps/india_compliance ] || bench get-app --skip-assets --branch "$BRANCH" https://github.com/resilient-tech/india-compliance

# gamcs_hr is this repo, bind-mounted at apps/gamcs_hr: editable install + register.
# (bench init already lists it in apps.txt because the directory exists, but does not pip-install it.)
env/bin/python -c "import gamcs_hr" 2>/dev/null || uv pip install --python env/bin/python -e apps/gamcs_hr
grep -qx gamcs_hr sites/apps.txt || echo gamcs_hr >> sites/apps.txt

if [ ! -f sites/.gamcs_hr_built ]; then
	bench build
	touch sites/.gamcs_hr_built
fi

# Chromium for v16 PDF printing (salary slips, emails). frappe downloads it lazily but
# leaves headless_shell non-executable on the first download, so fetch + chmod up front.
[ -f chromium/chrome-linux/headless_shell ] || bench setup-chrome || true
[ -f chromium/chrome-linux/headless_shell ] && chmod +x chromium/chrome-linux/headless_shell

if [ ! -d "sites/$S" ]; then
	bench new-site "$S" --force --mariadb-root-password "$DB_ROOT_PASSWORD" \
		--admin-password "$ADMIN_PASSWORD" --mariadb-user-host-login-scope='%'
	bench --site "$S" set-config developer_mode 1
	bench --site "$S" set-config mute_emails 1
	bench --site "$S" set-config allow_tests 1
	bench --site "$S" set-config host_name "http://$S:8200"
	bench use "$S"
fi
for app in erpnext hrms india_compliance gamcs_hr; do
	bench --site "$S" list-apps | grep -q "^$app" || bench --site "$S" install-app "$app"
done

if [ ! -f "sites/$S/.seeded" ]; then
	{ bench --site "$S" execute gamcs_hr.seed.demo.run && touch "sites/$S/.seeded"; } || echo "WARN: demo seed failed; rerun with infra/dev/hr.sh seed"
fi

exec bench start
