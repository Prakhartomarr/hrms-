#!/bin/bash
# Day-to-day wrapper for the hrms-dev stack. Run from anywhere.
set -euo pipefail
. "$(dirname "$0")/env.sh"
x() { docker compose exec -w /home/frappe/frappe-bench bench "$@"; }
confirm() { read -r -p "$1 [y/N] " a; [ "$a" = y ] || [ "$a" = Y ]; }
cmd="${1:-help}"; shift || true
case "$cmd" in
	up)      docker compose up -d ;;
	down)    docker compose stop ;;
	logs)    docker compose logs -f --tail=200 bench ;;
	ps)      docker compose ps ;;
	shell)   x bash ;;
	bench)   x bench "$@" ;;
	migrate) x bench --site "$HR_SITE" migrate ;;
	build)   x bench build "$@" ;;
	seed)    x bench --site "$HR_SITE" execute gamcs_hr.seed.demo.run ;;
	test)    x bench --site "$HR_TEST_SITE" run-tests --app gamcs_hr "$@" ;;
	upstream-test)  # e.g. hr.sh upstream-test hrms.hr.doctype.attendance.test_attendance
		x bench --site "$HR_TEST_SITE" run-tests --module "$@" ;;
	test-site)  # throwaway site for test runs, so hr.localhost demo data stays clean.
		# No india_compliance here: upstream erpnext/hrms test fixtures fail its GST validations
		# (same as upstream CI, which runs frappe+erpnext+hrms only).
		x bench new-site "$HR_TEST_SITE" --force --mariadb-root-password "$DB_ROOT_PASSWORD" \
			--admin-password "$ADMIN_PASSWORD" --mariadb-user-host-login-scope=% --install-app erpnext
		for a in hrms gamcs_hr; do x bench --site "$HR_TEST_SITE" install-app "$a"; done
		x bench --site "$HR_TEST_SITE" set-config allow_tests 1
		x bench --site "$HR_TEST_SITE" set-config mute_emails 1 ;;
	restart) docker compose restart bench ;;
	reset)
		confirm "Drop site $HR_SITE and recreate it with fresh demo data?" || exit 1
		x bench drop-site "$HR_SITE" --force --no-backup --db-root-password "$DB_ROOT_PASSWORD"
		docker compose restart bench   # init.sh recreates the site, installs apps, seeds
		echo "Recreating site; follow with: $0 logs" ;;
	nuke)
		confirm "Delete hrms-dev containers + volumes AND $HRMS_BENCH?" || exit 1
		docker compose down -v
		rm -rf "$HRMS_BENCH"
		echo "Gone. Run infra/dev/setup.sh to start over." ;;
	*) sed -n '1,200p' <<USAGE
usage: infra/dev/hr.sh <command>
  up | down | restart | ps | logs | shell
  bench <args>   any bench command inside the container
  migrate | build [args] | seed
  test-site      (re)create $HR_TEST_SITE (frappe+erpnext+hrms+gamcs_hr, allow_tests)
  test [args]    gamcs_hr tests on $HR_TEST_SITE
  upstream-test <module>   one upstream test module on $HR_TEST_SITE
  reset          drop + recreate site $HR_SITE (keeps bench)
  nuke           remove containers, volumes and $HRMS_BENCH
USAGE
	;;
esac
