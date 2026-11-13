# Sourced by setup.sh / hr.sh. Loads ~/hrms/.env and points docker at the right
# compose file and project. Also works on a Mac where Docker Desktop's privileged
# helper has not installed /usr/local/bin symlinks (same trick as the CRM's env.sh).
HR_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export HR_REPO
export HRMS_BENCH="${HRMS_BENCH:-$HOME/hrms-bench}"
export COMPOSE_FILE="$HR_REPO/infra/dev/docker-compose.yml"
export COMPOSE_PROJECT_NAME=hrms-dev
export HR_SITE=hr.localhost
if ! command -v docker >/dev/null 2>&1 && [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
	export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
	export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
fi
if [ -f "$HR_REPO/.env" ]; then
	set -a; . "$HR_REPO/.env"; set +a
fi
