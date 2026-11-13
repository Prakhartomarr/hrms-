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
	test)    x bench --site "$HR_SITE" run-tests --app gamcs_hr "$@" ;;
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
  migrate | build [args] | seed | test [args]
  reset          drop + recreate site $HR_SITE (keeps bench)
  nuke           remove containers, volumes and $HRMS_BENCH
USAGE
	;;
esac
