#!/usr/bin/env bash
# Core deployment and optional recovery tooling; scheduled backups retain their existing workflow.
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
# Checked before anything changes: a typo must not silently skip rolling starts.
case "${ROLLING_DEPLOY:-}" in
  "" | 0 | false) rolling=false ;;
  1 | true) rolling=true ;;
  *) echo "ROLLING_DEPLOY must be 1, true, 0, false or unset; got '$ROLLING_DEPLOY'" >&2; exit 2 ;;
esac
umask 077
cleanup() {
  rm -f runtime/.env.local runtime/deploy.lock.yml runtime/bootstrap-result runtime/images.txt
  docker logout ghcr.io >/dev/null 2>&1 || true
}

# Each phase is a collapsible, timestamped log group; durations go to the step summary.
current_phase=""
completed_phase="none"
phase_started=$(date +%s)
phase_timings=""
migrations_started=false
end_phase() {
  [[ -n "$current_phase" ]] || return 0
  phase_timings+="| $current_phase | $(($(date +%s) - phase_started))s | $1 |"$'\n'
  echo "::endgroup::"
}
phase() {
  end_phase ok
  completed_phase=${current_phase:-none}
  current_phase=$1
  phase_started=$(date +%s)
  [[ "$1" != migrations ]] || migrations_started=true
  echo "::group::[$(date -u +%H:%M:%SZ)] $1"
}

# Read-only and bounded: prints container state, health-probe output and recent logs of
# failing services. Never prints full `docker inspect` (it contains the environment).
diagnose() {
  local ids id name status health code
  ids=$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT")
  [[ -n "$ids" ]] || { echo "No containers found for project $COMPOSE_PROJECT"; return 0; }
  echo "Container state (project $COMPOSE_PROJECT):"
  # shellcheck disable=SC2086
  docker inspect --format '{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' $ids
  for id in $ids; do
    read -r name status health code < <(docker inspect --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.ExitCode}}' "$id")
    if [[ "$health" == unhealthy || "$health" == starting || "$status" == restarting || "$status" == dead || ("$status" == exited && "$code" != 0) ]]; then
      echo "::group::Diagnostics for ${name#/} ($status, health=$health, exit=$code)"
      echo "Recent health probes:"
      docker inspect --format '{{if .State.Health}}{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{end}}{{else}}(no healthcheck){{end}}' "$id"
      echo "Last ${DIAGNOSTIC_LOG_LINES:-200} log lines:"
      docker logs --tail "${DIAGNOSTIC_LOG_LINES:-200}" "$id" 2>&1
      echo "::endgroup::"
    fi
  done
}

finish() {
  local status=$?
  set +e
  if (( status == 0 )); then
    end_phase ok
  else
    end_phase failed
    if [[ -n "$rollout_new" ]]; then
      echo "Removing unfinished rollout container $rollout_new; the previous one keeps serving."
      docker rm -f "$rollout_new" >/dev/null 2>&1
    fi
    echo "::error::Core delivery failed in phase '$current_phase' (last completed: $completed_phase) for revision $GITHUB_SHA"
    if [[ "$current_phase" == databases ]]; then
      echo "Database services were starting; migrations did not run."
    elif [[ "$migrations_started" == false ]]; then
      echo "No container was changed; the previous release should still be serving."
    elif [[ "$current_phase" == migrations || "$current_phase" == grants ]]; then
      echo "Migrations started; previous application containers are still running against the new schema."
    elif [[ "$current_phase" == start ]]; then
      echo "New application containers were starting; a partial release may be running."
    else
      echo "The new release is running but failed external acceptance."
    fi
    if [[ "$current_phase" == databases || "$migrations_started" == true ]]; then
      # Per-service groups below; Actions log groups cannot nest.
      echo "Failure diagnostics:"
      timeout "${DIAGNOSTIC_TIMEOUT:-30}" bash -c "$(declare -f diagnose); diagnose" ||
        echo "Diagnostics incomplete (failed or exceeded ${DIAGNOSTIC_TIMEOUT:-30}s)."
    fi
  fi
  {
    printf "\n### Core delivery %s\n\n| Phase | Duration | Result |\n| --- | --- | --- |\n" "$( ((status == 0)) && echo succeeded || echo failed)"
    printf "%s" "$phase_timings"
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  cleanup
  exit "$status"
}
trap finish EXIT

# Returns once a container is healthy (or running, when it has no healthcheck);
# fails as soon as it is unhealthy, stopped or gone, or after ROLLOUT_TIMEOUT seconds.
wait_healthy() {
  local id=$1 state deadline=$(($(date +%s) + ${ROLLOUT_TIMEOUT:-300}))
  while (($(date +%s) < deadline)); do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id") || return 1
    case "$state" in
      healthy | running) return 0 ;;
      starting | created | restarting) ;;
      *) return 1 ;;
    esac
    sleep "${ROLLOUT_POLL_SECONDS:-3}"
  done
  return 1
}

# The new container of an unfinished rollout; finish() removes it if the deploy
# fails or is cancelled mid-rollout, so two releases are never left serving.
rollout_new=""

# Replaces one routed service without a gap: start the new container beside the
# old one, wait until it is healthy (Traefik only routes to healthy containers),
# then retire the old one. If the new container never becomes healthy it is
# removed and the old one keeps serving, and the deploy fails.
rollout() {
  local service=$1 old new stale
  local compose=(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT")
  # Stopped containers count towards --scale, and --no-recreate would restart one
  # on its old image instead of creating a new container. Remove them first.
  stale=$("${compose[@]}" ps -aq --status exited --status created --status dead "$service")
  # shellcheck disable=SC2086
  [[ -z "$stale" ]] || docker rm $stale >/dev/null
  old=$("${compose[@]}" ps -q "$service")
  if [[ -z "$old" ]]; then
    # First start: nothing is serving yet, so there is no gap to avoid.
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 300 "$service"
    return
  fi
  # Always roll, even for an unchanged image: a changed environment or label
  # also recreates the container, and recreating stops the old one first.
  echo "Rolling $service"
  "${compose[@]}" up -d --no-deps --no-recreate --scale "$service=$(($(wc -l <<<"$old") + 1))" "$service"
  new=$(comm -13 <(sort <<<"$old") <("${compose[@]}" ps -q "$service" | sort))
  if [[ -z "$new" || "$new" == *$'\n'* ]]; then
    echo "::error::Rolling start of $service expected one new container, found: ${new:-none}" >&2
    return 1
  fi
  rollout_new=$new
  if ! wait_healthy "$new"; then
    echo "::error::New $service container did not become healthy; the previous one is still serving" >&2
    docker logs --tail "${DIAGNOSTIC_LOG_LINES:-200}" "$new" 2>&1 || true
    docker rm -f "$new" >/dev/null
    rollout_new=""
    return 1
  fi
  # Give Traefik's Docker provider time to add the new backend before the old one goes.
  sleep "${ROLLOUT_SETTLE_SECONDS:-5}"
  rollout_new=""
  # shellcheck disable=SC2086
  docker stop --time 30 $old >/dev/null
  # shellcheck disable=SC2086
  docker rm $old >/dev/null
}

# Fails before any change to the running stack when a disk is too full.
require_free_space() {
  local path=$1 required_gb=$2 purpose=$3 free_kb
  free_kb=$(df -Pk "$path" | awk 'NR==2 {print $4}')
  printf "Free disk space on %s: %s GB (need %s GB)\n" "$path" "$((free_kb / 1024 / 1024))" "$required_gb"
  if (( free_kb < required_gb * 1024 * 1024 )); then
    echo "Not enough free disk space $purpose: $((free_kb / 1024 / 1024)) GB free on $path, ${required_gb} GB required. Free space on this host and re-run the deploy; the running stack was not touched." >&2
    exit 1
  fi
}

phase render-config
python3 ../../scripts/production/render-env.py "$DEPLOY_ENV.env" runtime/.env.local
docker compose --env-file "$DEPLOY_ENV.env" --env-file runtime/.env.local -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" config --quiet
docker compose --env-file "$DEPLOY_ENV.env" --env-file runtime/.env.local -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" config --format json | node ../../scripts/ci/check-release-scope.mjs --compose
# Resolved before anything changes: service lists come from the release registry, so scope and delivery cannot drift.
data_services=$(node ../../scripts/ci/check-release-scope.mjs --print data)
migration_services=$(node ../../scripts/ci/check-release-scope.mjs --print migration)
app_services=$(node ../../scripts/ci/check-release-scope.mjs --print app)

phase auth
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin

phase disk
# The runner writes logs and step summaries under its temp directory; a full disk
# there fails the job without a useful error (staging, 2026-10-07).
require_free_space "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" "${RUNNER_MIN_FREE_GB:-2}" "for the runner"
# Nothing else prunes old release images, and a full pull needs several GB. Only
# images no container uses and that are older than IMAGE_PRUNE_AGE (default 72h)
# are removed, so the running stack and the last release's rollback window stay.
docker image prune --all --force --filter "until=${IMAGE_PRUNE_AGE:-72h}" | tail -n 1
require_free_space "$(docker info --format '{{.DockerRootDir}}')" "${DEPLOY_MIN_FREE_GB:-6}" "to pull images"

phase pull-verify
docker compose --env-file "$DEPLOY_ENV.env" --env-file runtime/.env.local -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" config --resolve-image-digests --output runtime/deploy.lock.yml
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" pull
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images > runtime/images.txt
[[ -s runtime/images.txt ]] || { echo "Empty image manifest" >&2; exit 1; }
while IFS= read -r image; do
  case "$image" in
    ghcr.io/*)
      revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
      [[ "$revision" == "$GITHUB_SHA" ]] || { echo "Artifact revision mismatch: $image"; exit 1; }
      image_environment=$(docker image inspect --format '{{index .Config.Labels "gd.barrels.environment"}}' "$image")
      [[ "$image_environment" == "$DEPLOY_ENV" ]] || { echo "Artifact environment mismatch: $image"; exit 1; }
      ;;
  esac
done < runtime/images.txt
# Images only: the full resolved Compose file contains secrets.
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

phase databases
# shellcheck disable=SC2086
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --wait $data_services
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db bash /docker-entrypoint-initdb.d/init-databases.sh

phase migrations
for service in $migration_services; do
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" run --rm --no-deps "$service"
done

phase grants
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db bash /opt/grenmet/grant-api-runtime.sh

phase start
# Allow the admin's 120s start period and five 30s probe intervals to finish.
# Staging's worker recovered just after the former 180s deadline on 2026-10-06.
# --remove-orphans retires containers of services no longer in the deployment file.
if [[ "$rolling" == true ]]; then
  # Recreating a routed service stops its only container first, so Traefik has no
  # backend and every route 404s until the new one is healthy (staging run
  # 37131928180). Roll those services instead; start the rest as before.
  routed_services=$(node ../../scripts/ci/check-release-scope.mjs --print routed)
  for service in $routed_services; do
    rollout "$service"
  done
  remaining_services=$(for service in $app_services; do
    [[ " $routed_services " == *" $service "* ]] || printf '%s ' "$service"
  done)
  # shellcheck disable=SC2086
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --no-deps --remove-orphans --wait --wait-timeout 300 $remaining_services
else
  # shellcheck disable=SC2086
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --no-deps --remove-orphans --wait --wait-timeout 300 $app_services
fi

phase smoke
domain=$(python3 -c 'import sys; from pathlib import Path; print(next(line.split("=", 1)[1] for line in Path(sys.argv[1]).read_text().splitlines() if line.startswith("BASE_DOMAIN=")))' "$DEPLOY_ENV.env")
node ../../scripts/production/smoke.mjs "$domain"
