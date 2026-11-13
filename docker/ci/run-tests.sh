#!/bin/bash
# Runs inside the CI bench container (see docker-compose.yml next to this file).
# Builds a bench at the pinned refs, installs gamcs_hr from /src (read-only checkout),
# creates a test site and runs the gamcs_hr test suite. Exit code = test result.
set -euo pipefail
: "${FRAPPE_REF:?}" "${ERPNEXT_REF:?}" "${HRMS_REF:?}" "${DB_ROOT_PASSWORD:?}" "${ADMIN_PASSWORD:?}"

SITE=test.localhost
B=/home/frappe/frappe-bench
export NODE_OPTIONS=--max-old-space-size=3072
git config --global --add safe.directory '*'
git config --global advice.detachedHead false

cd /home/frappe
echo "::group::bench init (frappe $FRAPPE_REF)"
bench init --skip-redis-config-generation --skip-assets \
	--frappe-branch "$FRAPPE_REF" --python "$(command -v python3.14)" frappe-bench
cd "$B"
bench set-mariadb-host mariadb
bench set-redis-cache-host redis://redis:6379
bench set-redis-queue-host redis://redis:6379
bench set-redis-socketio-host redis://redis:6379
echo "::endgroup::"

echo "::group::get-app erpnext $ERPNEXT_REF, hrms $HRMS_REF"
bench get-app --skip-assets --branch "$ERPNEXT_REF" erpnext
bench get-app --skip-assets --branch "$HRMS_REF" hrms
echo "::endgroup::"

echo "::group::install gamcs_hr from the checkout"
# Copy rather than bind-mount: /src is read-only and owned by the runner's uid.
mkdir -p apps/gamcs_hr
tar -C /src --exclude=.git --exclude=node_modules --exclude='__pycache__' -cf - . | tar -C apps/gamcs_hr -xf -
uv pip install --python env/bin/python -e apps/gamcs_hr
grep -qx gamcs_hr sites/apps.txt || printf '\ngamcs_hr\n' >> sites/apps.txt
sed -i '/^$/d' sites/apps.txt
echo "::endgroup::"

echo "::group::new-site $SITE"
bench new-site "$SITE" --mariadb-root-password "$DB_ROOT_PASSWORD" --admin-password "$ADMIN_PASSWORD" \
	--mariadb-user-host-login-scope=% --install-app erpnext
bench --site "$SITE" install-app hrms
bench --site "$SITE" install-app gamcs_hr
bench --site "$SITE" set-config allow_tests 1
bench --site "$SITE" set-config mute_emails 1
echo "::endgroup::"

# Upstream test bootstrap (before_tests) runs here, the same as on hrtest.localhost.
bench --site "$SITE" run-tests --app gamcs_hr
