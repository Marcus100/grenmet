#!/usr/bin/env bash
# Sole core deployment/backup entrypoint; operator must provision the lock directory.
set -euo pipefail
operation=${1:?Expected deploy, backup or cleanup}
: "${DEPLOY_ENV:?}" "${COMPOSE_PROJECT:?}"
[[ "$DEPLOY_ENV" == staging || "$DEPLOY_ENV" == production ]] || exit 2
[[ "$operation" == deploy || "$operation" == backup || "$operation" == cleanup ]] || exit 2
cd "$(dirname "$0")/../../infra/docker"
exec 9>"${CORE_LOCK_DIR:-/var/lock}/grenmet-core-$DEPLOY_ENV.lock"
flock -w 1800 9 || { echo "Core maintenance lock timed out" >&2; exit 1; }
if [[ "$operation" == cleanup ]]; then
  rm -f runtime/.env.local runtime/deploy.lock.yml runtime/bootstrap-result runtime/images.txt
  docker logout ghcr.io >/dev/null 2>&1 || true
  exit
fi
if [[ "$operation" == backup ]]; then
  python3 ../../scripts/production/backup-core.py "$DEPLOY_ENV" "$COMPOSE_PROJECT" "$DEPLOY_ENV.env"
  python3 ../../scripts/production/backup-files.py /etc/grenmet/objects.json
  exit
fi
: "${GITHUB_SHA:?}" "${GHCR_TOKEN:?}" "${GITHUB_ACTOR:?}"
umask 077
cleanup() {
  rm -f runtime/.env.local runtime/deploy.lock.yml runtime/bootstrap-result runtime/images.txt
  docker logout ghcr.io >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf "%s\n" "Write and validate private runtime configuration"
set -euo pipefail
umask 077
python3 ../../scripts/production/render-env.py "$DEPLOY_ENV.env" runtime/.env.local
docker compose --env-file "$DEPLOY_ENV.env" --env-file runtime/.env.local -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" config --quiet

printf "%s\n" "Required off-host backup before changing services"
GITHUB_OUTPUT="$PWD/runtime/bootstrap-result" python3 ../../scripts/production/backup-core.py "$DEPLOY_ENV" "$COMPOSE_PROJECT" "$DEPLOY_ENV.env" --before-provisioning
python3 ../../scripts/production/backup-files.py /etc/grenmet/objects.json

printf "%s\n" "Authenticate with GHCR"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin

printf "%s\n" "Resolve and pull exact image digests"
set -euo pipefail
umask 077
docker compose --env-file "$DEPLOY_ENV.env" --env-file runtime/.env.local -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" config --resolve-image-digests --output runtime/deploy.lock.yml
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" pull
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images > runtime/images.txt
[[ -s runtime/images.txt ]] || { echo "Empty image manifest" >&2; exit 1; }
while IFS= read -r image; do
  case "$image" in
    ghcr.io/*)
      revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
      [[ "$revision" == "$GITHUB_SHA" ]] || { echo "Artifact revision mismatch"; exit 1; }
      image_environment=$(docker image inspect --format '{{index .Config.Labels "gd.barrels.environment"}}' "$image")
      [[ "$image_environment" == "$DEPLOY_ENV" ]] || { echo "Artifact environment mismatch"; exit 1; }
      ;;
  esac
done < runtime/images.txt
# Images only: the full resolved Compose file contains secrets.
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images >> "$GITHUB_STEP_SUMMARY"

printf "%s\n" "Provision databases"
set -euo pipefail
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --wait db redis
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db bash /docker-entrypoint-initdb.d/init-databases.sh

printf "%s\n" "Required migrations and catalogue initialization"
set -euo pipefail
for service in prestart web-migrate cms-migrate; do
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" run --rm --no-deps "$service"
done

printf "%s\n" "Provision and verify least-privilege API runtime access"
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db bash /opt/grenmet/grant-api-runtime.sh

printf "%s\n" "Required complete backup after first CMS migration"
bootstrap_result=$(cat runtime/bootstrap-result)
[[ "$bootstrap_result" == cms_missing=true || "$bootstrap_result" == cms_missing=false ]] || { echo "Invalid bootstrap backup result" >&2; exit 1; }
if [[ "$bootstrap_result" == cms_missing=true ]]; then
  python3 ../../scripts/production/backup-core.py "$DEPLOY_ENV" "$COMPOSE_PROJECT" "$DEPLOY_ENV.env"
fi

printf "%s\n" "Start applications only after migration success"
set -euo pipefail
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --no-deps --wait --wait-timeout 180 api worker web-auth web-admin web-cms web-docs web-gms web-signal web-mbia web-events api-hono proxy

printf "%s\n" "Required external readiness and functional smoke"
set -euo pipefail
domain=$(python3 -c 'import sys; from pathlib import Path; print(next(line.split("=", 1)[1] for line in Path(sys.argv[1]).read_text().splitlines() if line.startswith("BASE_DOMAIN=")))' "$DEPLOY_ENV.env")
node ../../scripts/production/smoke.mjs "$domain"
