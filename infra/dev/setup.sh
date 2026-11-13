#!/bin/bash
# First-time setup (safe to re-run): creates ~/hrms/.env with a random dev password,
# creates the bench directory ~/hrms-bench, and starts the hrms-dev stack. The bench
# container's init.sh then clones frappe/erpnext/hrms/india_compliance (version-16),
# installs gamcs_hr from this repo, creates site hr.localhost and installs all apps.
set -euo pipefail
. "$(dirname "$0")/env.sh"

if [ ! -f "$HR_REPO/.env" ]; then
	gen() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20; }
	umask 077
	cat >"$HR_REPO/.env" <<ENV
# Local dev secrets. Gitignored, never commit.
ADMIN_PASSWORD=$(gen)
DB_ROOT_PASSWORD=$(gen)
ENV
	echo "Created $HR_REPO/.env (Administrator password is ADMIN_PASSWORD)"
	set -a; . "$HR_REPO/.env"; set +a
fi

mkdir -p "$HRMS_BENCH"
case "$HRMS_BENCH" in "$HOME/Desktop"*) echo "Refusing to put the bench under ~/Desktop (iCloud)"; exit 1;; esac

docker compose up -d
echo
echo "Started. First run takes 15-30 minutes. Follow with: infra/dev/hr.sh logs"
echo "Then open http://$HR_SITE:8200/app  (Administrator / ADMIN_PASSWORD from $HR_REPO/.env)"
