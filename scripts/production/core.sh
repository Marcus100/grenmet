#!/usr/bin/env bash
# Core deployment and optional recovery tooling; scheduled backups retain their existing workflow.
set -euo pipefail
operation=${1:?Expected deploy, backup or cleanup}
: "${DEPLOY_ENV:?}" "${COMPOSE_PROJECT:?}"
[[ "$DEPLOY_ENV" == staging || "$DEPLOY_ENV" == production ]] || exit 2
[[ "$operation" == deploy || "$operation" == backup || "$operation" == cleanup ]] || exit 2
# A migration that waits on a lock is retried this many times, pausing between tries
# (release runbook, "Migration lock timeouts"). Checked here so a typo stops the deploy
# before any change.
migration_lock_attempts=${MIGRATION_LOCK_RETRY_ATTEMPTS:-3}
migration_lock_pause=${MIGRATION_LOCK_RETRY_PAUSE_SECONDS:-30}
# Only a deploy runs migrations, so only a deploy needs these to be valid.
if [[ "$operation" == deploy ]]; then
  [[ "$migration_lock_attempts" =~ ^[1-9][0-9]*$ && "$migration_lock_pause" =~ ^[0-9]+$ ]] || {
    echo "MIGRATION_LOCK_RETRY_ATTEMPTS must be a positive integer and MIGRATION_LOCK_RETRY_PAUSE_SECONDS a whole number of seconds." >&2
    exit 2
  }
fi
cd "$(dirname "$0")/../../infra/docker"
exec 9>"${CORE_LOCK_DIR:-/var/lock}/grenmet-core-$DEPLOY_ENV.lock"
flock -w 1800 9 || { echo "Core maintenance lock timed out" >&2; exit 1; }
if [[ "$operation" == cleanup ]]; then
  rm -f runtime/.env.local runtime/deploy.lock.yml runtime/bootstrap-result runtime/images.txt
  rm -rf runtime/rollout
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
# Routed services roll out in batches of this size (1 restores one at a time).
# Production defaults to 2 (one host, no container memory limits); staging to 4.
default_parallel=4
[[ "$DEPLOY_ENV" != production ]] || default_parallel=2
rollout_parallel=${ROLLOUT_PARALLEL:-$default_parallel}
[[ "$rollout_parallel" =~ ^[1-9][0-9]?$ ]] || { echo "ROLLOUT_PARALLEL must be a whole number from 1 to 99; got '$rollout_parallel'" >&2; exit 2; }
pull_parallel=${PULL_PARALLEL:-4}
[[ "$pull_parallel" =~ ^[1-9][0-9]?$ ]] || { echo "PULL_PARALLEL must be a whole number from 1 to 99; got '$pull_parallel'" >&2; exit 2; }
umask 077
# Temporary log of the migration attempt in progress; removed on every exit path.
migration_log=""
cleanup() {
  rm -f runtime/.env.local runtime/deploy.lock.yml runtime/bootstrap-result runtime/images.txt
  rm -rf runtime/rollout
  [[ -z "$migration_log" ]] || rm -f "$migration_log"
  docker logout ghcr.io >/dev/null 2>&1 || true
}

# Each phase is a collapsible, timestamped log group; durations go to the step summary.
current_phase=""
completed_phase="none"
phase_started=$(date +%s)
phase_timings=""
migrations_started=false
project_stopped=false
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
  # Host pressure at the moment of failure: slow probes after a deploy are the
  # usual cause of a proxy 503 while every container still reports healthy.
  # Last and time-boxed, so a slow `docker stats` never hides the report above.
  echo "Host load and memory:"
  uptime
  free -m
  timeout 8 docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null || echo "(docker stats did not answer within 8 s)"
}

finish() {
  local status=$?
  set +e
  if (( status == 0 )); then
    end_phase ok
  else
    end_phase failed
    # Stop rollouts still running in the background before cleaning up after them,
    # so none of them retires an old container afterwards.
    # shellcheck disable=SC2046
    kill $(jobs -p) 2>/dev/null
    wait 2>/dev/null
    for pending in runtime/rollout/*.new; do
      [[ -s "$pending" ]] || continue
      echo "Removing unfinished rollout container $(<"$pending") of ${pending##*/}; the previous one keeps serving."
      docker rm -f "$(<"$pending")" >/dev/null 2>&1
    done
    echo "::error::Core delivery failed in phase '$current_phase' (last completed: $completed_phase) for revision $GITHUB_SHA"
    if [[ "$project_stopped" == true && "$current_phase" != start && "$current_phase" != smoke ]]; then
      echo "The whole project was stopped to recreate its network, so nothing is serving until a deploy succeeds."
    elif [[ "$current_phase" == databases ]]; then
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
# A cancelled run exits through finish(), which stops background rollouts first.
trap 'exit 130' INT TERM

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

# Rollouts run in parallel subshells, so each records its unfinished new container
# in runtime/rollout/<service>.new; finish() removes any left there if the deploy
# fails or is cancelled mid-rollout, so two releases are never left serving.

# Replaces one routed service without a gap: start the new container beside the
# old one, wait until it is healthy (Traefik only routes to healthy containers),
# then retire the old one. If the new container never becomes healthy it is
# removed and the old one keeps serving, and the deploy fails.
rollout() {
  # Runs in a subshell inside `run_batch || ...`, where errexit does not apply,
  # so every step that changes or reads state checks its own result.
  local service=$1 old new stale running_hash wanted_hash pending="runtime/rollout/$1.new"
  local compose=(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT")
  # Stopped containers count towards --scale, and --no-recreate would restart one
  # on its old image instead of creating a new container. Remove them first.
  stale=$("${compose[@]}" ps -aq --status exited --status created --status dead "$service") || return 1
  # shellcheck disable=SC2086
  [[ -z "$stale" ]] || docker rm $stale >/dev/null || return 1
  # A failed lookup must never look like "nothing running": the first-start path
  # below would recreate the service and stop the serving container first.
  old=$("${compose[@]}" ps -q "$service") || { echo "::error::Could not list $service containers" >&2; return 1; }
  if [[ -z "$old" ]]; then
    # First start: nothing is serving yet, so there is no gap to avoid.
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 300 "$service" || return 1
    return 0
  fi
  # Unchanged service: Compose's config hash covers the digest-pinned image, the
  # environment and the labels, so an equal hash on the one running container means
  # recreating it would change nothing.
  if [[ "$old" != *$'\n'* ]]; then
    wanted_hash=$("${compose[@]}" config --hash "$service" 2>/dev/null | awk -v s="$service" '$1 == s {print $2}') || wanted_hash=""
    running_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$old" 2>/dev/null) || running_hash=""
    # Only a healthy (or, without a healthcheck, running) container is kept.
    if [[ -n "$wanted_hash" && ( "$running_hash" == "$wanted_hash healthy" || "$running_hash" == "$wanted_hash running" ) ]]; then
      echo "Unchanged $service: keeping the running container"
      return 0
    fi
  fi
  echo "Rolling $service"
  "${compose[@]}" up -d --no-deps --no-recreate --scale "$service=$(($(wc -l <<<"$old") + 1))" "$service" || return 1
  new=$(comm -13 <(sort <<<"$old") <("${compose[@]}" ps -q "$service" | sort)) || return 1
  if [[ -z "$new" || "$new" == *$'\n'* ]]; then
    echo "::error::Rolling start of $service expected one new container, found: ${new:-none}" >&2
    return 1
  fi
  printf '%s' "$new" > "$pending" || { docker rm -f "$new" >/dev/null; return 1; }
  if ! wait_healthy "$new"; then
    echo "::error::New $service container did not become healthy; the previous one is still serving" >&2
    docker logs --tail "${DIAGNOSTIC_LOG_LINES:-200}" "$new" 2>&1 || true
    docker rm -f "$new" >/dev/null
    rm -f "$pending"
    return 1
  fi
  # Give Traefik's Docker provider time to add the new backend before the old one goes.
  sleep "${ROLLOUT_SETTLE_SECONDS:-5}" || return 1
  rm -f "$pending" || return 1
  # shellcheck disable=SC2086
  docker stop --time 30 $old >/dev/null || return 1
  # shellcheck disable=SC2086
  docker rm $old >/dev/null || return 1
}

# Rolls routed services out in batches of ROLLOUT_PARALLEL. Every service in a batch
# finishes (healthy or rolled back) before the result is checked, and no later batch
# starts after a failure. Output is prefixed with the service name.
rollout_batches() {
  local batch=() service failed=0
  run_batch() {
    local pids=() names=() i
    for service in "${batch[@]}"; do
      ( rollout "$service" ) > >(sed -u "s/^/[$service] /") 2> >(sed -u "s/^/[$service] /" >&2) &
      pids+=("$!"); names+=("$service")
    done
    for i in "${!pids[@]}"; do
      wait "${pids[$i]}" || { echo "::error::Rollout of ${names[$i]} failed" >&2; failed=1; }
    done
    batch=()
    return "$failed"
  }
  for service in "$@"; do
    batch+=("$service")
    if (( ${#batch[@]} >= rollout_parallel )); then run_batch || return 1; fi
  done
  if (( ${#batch[@]} > 0 )); then run_batch || return 1; fi
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

# Never act on unfinished-rollout records left by an earlier, killed deploy.
rm -rf runtime/rollout
mkdir -p runtime/rollout

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
# Versions and memory before the release starts, for comparison with a failure
# snapshot (diagnose) and to confirm healthcheck start_interval support (Engine 25+, #1140).
echo "Docker Engine $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown), $(docker compose version --short 2>/dev/null | sed 's/^/Compose /')"
free -m | awk 'NR <= 3'
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
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images > runtime/images.txt
[[ -s runtime/images.txt ]] || { echo "Empty image manifest" >&2; exit 1; }
# The lock file pins every image by digest, so an image already on this host is
# byte-for-byte the one wanted. Pull only the missing ones, PULL_PARALLEL at a time.
missing_images=$(while IFS= read -r image; do
  docker image inspect "$image" >/dev/null 2>&1 || printf '%s\n' "$image"
done < runtime/images.txt)
echo "Images to pull: $(grep -c . <<<"$missing_images" || true) of $(grep -c . runtime/images.txt)"
if [[ -n "$missing_images" ]]; then
  xargs -r -P "$pull_parallel" -n 1 docker pull --quiet <<<"$missing_images"
fi
# Promoted deploys (issue #1019) pass the exact digests the pipeline verified in
# DEPLOY_IMAGE_DIGESTS; every ghcr.io image must be one of them. Without the list
# (a manual redeploy of an existing tag), an image must carry this commit's label,
# or be a build-once image, which only verified promotion ever tags for a commit.
# A promoted deploy must name its digests: an empty list is an error unless the
# operator asked for a manual redeploy (ALLOW_UNPROMOTED_DEPLOY=true).
if [[ -z "${DEPLOY_IMAGE_DIGESTS// /}" && "${ALLOW_UNPROMOTED_DEPLOY:-}" != true ]]; then
  echo "DEPLOY_IMAGE_DIGESTS is empty: refusing to deploy images no promotion verified (dispatch Deploy with manual_redeploy to redeploy an existing tag)" >&2
  exit 1
fi
expected_digests=" ${DEPLOY_IMAGE_DIGESTS:-} "
while IFS= read -r image; do
  case "$image" in
    ghcr.io/*)
      if [[ -n "${DEPLOY_IMAGE_DIGESTS// /}" ]]; then
        repository=${image%%@*}
        repository=${repository%:*}
        [[ "$image" == *@sha256:* && "$expected_digests" == *" $repository@${image##*@} "* ]] ||
          { echo "Artifact digest is not the promoted one: $image"; exit 1; }
      else
        revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
        build_once=$(docker image inspect --format '{{index .Config.Labels "gd.barrels.build-once"}}' "$image")
        [[ "$revision" == "$GITHUB_SHA" || "$build_once" == true ]] || { echo "Artifact revision mismatch: $image"; exit 1; }
      fi
      ;;
  esac
done < runtime/images.txt
# Images only: the full resolved Compose file contains secrets.
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --images >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

phase backup-gate
# Alembic rollback does not undo migrations (release runbook, "Backup gate"). Every
# deploy that reaches `migrations` runs `alembic upgrade head`, and there is no cheap,
# reliable way here to tell "already at head" across seven Alembic histories plus the
# Payload CMS, so the gate checks on any deploy that has migration services.
# Modes: DEPLOY_BACKUP_GATE=off|warn|enforce (default warn). Only enforce blocks, and
# only on a verified-stale backup; anything it cannot verify fails open, loudly.
# DEPLOY_BACKUP_GATE_OVERRIDE=<reason> lets an enforced deploy continue and is recorded.
gate_note() {
  printf '%s\n' "$1"
  printf '%s\n' "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}
gate_mode=${DEPLOY_BACKUP_GATE:-warn}
gate_max_age=${DEPLOY_BACKUP_MAX_AGE_HOURS:-26}
if [[ "$gate_mode" != off && "$gate_mode" != warn && "$gate_mode" != enforce ]]; then
  gate_note "::warning::DEPLOY_BACKUP_GATE='$gate_mode' is not off, warn or enforce; using warn."
  gate_mode=warn
fi
gate_override=$(printf '%s' "${DEPLOY_BACKUP_GATE_OVERRIDE:-}" | tr -d '\r\n' | cut -c1-200)
if [[ "$gate_mode" == off ]]; then
  gate_note "Backup gate: off (DEPLOY_BACKUP_GATE=off); the newest backup was not checked before migrations."
elif [[ -z "${migration_services// /}" ]]; then
  gate_note "Backup gate: skipped, this release has no migration services."
else
  gate_code=0
  gate_out=$(DEPLOY_BACKUP_MAX_AGE_HOURS="$gate_max_age" timeout 120 python3 ../../scripts/production/backup-gate.py "$DEPLOY_ENV" 2>&1) || gate_code=$?
  printf '%s\n' "$gate_out"
  gate_detail=$(printf '%s' "$gate_out" | tr '\n' ';')
  how_to="Take one: run the Database Backup workflow (backup-database.yml) and wait for it to pass, then re-run this deploy. To proceed anyway, dispatch Deploy with backup_gate_override set to a reason, or set the DEPLOY_BACKUP_GATE variable to warn."
  case "$gate_code" in
    0) gate_note "Backup gate ($gate_mode): $gate_detail" ;;
    10)
      if [[ "$gate_mode" == enforce && -z "$gate_override" ]]; then
        {
          echo "### Backup gate blocked this deploy (enforce)"
          echo "Newest backup is older than ${gate_max_age}h. No migration ran; the previous release is still serving."
          printf '%s\n' "$gate_out" | sed 's/^/- /'
          echo "$how_to"
        } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
        echo "::error::Backup gate (enforce) blocked the deploy before migrations: stale backup (limit ${gate_max_age}h)." >&2
        printf '%s\n%s\n' "$gate_out" "$how_to" >&2
        exit 1
      elif [[ "$gate_mode" == enforce ]]; then
        gate_note "::warning::Backup gate OVERRIDDEN by ${GITHUB_ACTOR}: '$gate_override'. Backup is stale; migrations proceed. $gate_detail"
      else
        gate_note "::warning::Backup gate (warn): backup is stale and migrations will run anyway. $gate_detail $how_to"
      fi ;;
    *) gate_note "::warning::Backup gate could NOT verify the newest backup and is passing OPEN (mode $gate_mode): $gate_detail. Migrations will run without a verified fresh backup." ;;
  esac
  if [[ -n "$gate_override" && "$gate_mode" != enforce ]]; then
    gate_note "Backup gate override recorded by ${GITHUB_ACTOR}: '$gate_override' (mode is $gate_mode, so it changed nothing)."
  fi
fi

phase network
# A changed IPAM block on the project network (the subnet pinned for uvicorn's
# --forwarded-allow-ips) makes Compose recreate the network on the next `up`. That
# `up` can only stop the services it names, so every other container keeps the
# network in use, Docker refuses ("network ... has active endpoints") and db and
# redis are left stopped. When the live subnet differs from the deployment file,
# stop the whole project first so the databases phase creates the network fresh.
# Volumes are kept (no -v). This is a full, one-off outage for that deploy.
pinned_subnet=$(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --format json | grep -oE '"subnet": *"[^"]+"' | head -n 1 | sed -E 's/.*"([^"]+)"$/\1/' || true)
live_subnets=$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "${COMPOSE_PROJECT}_grenmet" 2>/dev/null || true)
if [[ -n "$pinned_subnet" && -n "$live_subnets" && " $live_subnets " != *" $pinned_subnet "* ]]; then
  echo "Network ${COMPOSE_PROJECT}_grenmet uses ${live_subnets% } but the deployment pins $pinned_subnet: stopping the project so Compose can recreate it (volumes are kept)."
  project_stopped=true
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" down --remove-orphans --timeout 60
fi

phase databases
# shellcheck disable=SC2086
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --wait $data_services
docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db bash /docker-entrypoint-initdb.d/init-databases.sh

phase migrations
# A migration service whose exact image and configuration (Compose's config hash)
# already completed against this database has nothing new to apply, so it is
# skipped (#1239). The database side of the key is the volume's creation time,
# every database's OID (a dropped and re-created database gets a new one) and the
# main database's Alembic revision (a backup restored in place brings back an
# older one). Anything unreadable leaves the key empty and the service runs.
# FORCE_MIGRATIONS=1 runs every service.
migration_state="${DEPLOY_STATE_DIR:-$HOME/.local/state/grenmet-deploy}/$COMPOSE_PROJECT/migrated"
mkdir -p "$migration_state" 2>/dev/null || migration_state=""
database_volume=$(docker volume inspect --format '{{.CreatedAt}}' "${COMPOSE_PROJECT}_pgdata" 2>/dev/null) || database_volume=""
database_marker_sql="SELECT (SELECT string_agg(oid::text || ':' || datname, ',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate) || '|' || (SELECT string_agg(version_num, ',' ORDER BY version_num) FROM alembic_version)"
for service in $migration_services; do
  migration_key=""
  service_hash=$(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" config --hash "$service" 2>/dev/null | awk -v s="$service" '$1 == s {print $2}') || service_hash=""
  # Read per service: the previous one may just have changed the revision.
  # shellcheck disable=SC2016
  database_state=$(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$database_marker_sql" 2>/dev/null) || database_state=""
  [[ -z "$migration_state" || -z "$service_hash" || -z "$database_volume" || -z "$database_state" ]] || migration_key="$service_hash $database_volume $database_state"
  if [[ "${FORCE_MIGRATIONS:-}" != 1 && -n "$migration_key" && "$(cat "$migration_state/$service" 2>/dev/null)" == "$migration_key" ]]; then
    echo "Unchanged $service: this image and configuration already migrated this database; skipped (FORCE_MIGRATIONS=1 runs it)"
    continue
  fi
  [[ -z "$migration_state" ]] || rm -f "$migration_state/$service"
  for attempt in $(seq 1 "$migration_lock_attempts"); do
    migration_log=$(mktemp)
    if docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" run --rm --no-deps "$service" 2>&1 | tee "$migration_log"; then
      rm -f "$migration_log"; migration_log=""
      break
    fi
    # Only a lock wait that hit MIGRATION_LOCK_TIMEOUT is retried. A rerun is safe:
    # Alembic commits each autocommit_block and Payload records each applied
    # migration, so the next attempt skips what finished. The previous release keeps
    # serving until the deploy gets past this phase.
    if (( attempt == migration_lock_attempts )) || ! grep -q "canceling statement due to lock timeout" "$migration_log"; then
      rm -f "$migration_log"; migration_log=""
      exit 1
    fi
    rm -f "$migration_log"; migration_log=""
    echo "::warning::Migration $service hit the lock timeout (attempt $attempt of $migration_lock_attempts); retrying in ${migration_lock_pause}s. The previous release keeps serving."
    sleep "$migration_lock_pause"
  done
  # Reached only after a successful run: every failure above exits the deploy.
  # Record the database as this run left it, so the next deploy compares like with like.
  # shellcheck disable=SC2016
  database_state=$(docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$database_marker_sql" 2>/dev/null) || database_state=""
  [[ -z "$migration_state" || -z "$service_hash" || -z "$database_volume" || -z "$database_state" ]] ||
    printf '%s' "$service_hash $database_volume $database_state" > "$migration_state/$service"
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
  # 37131928180). Roll those services instead; start the rest one at a time.
  routed_services=$(node ../../scripts/ci/check-release-scope.mjs --print routed)
  # shellcheck disable=SC2086
  rollout_batches $routed_services
  remaining_services=$(for service in $app_services; do
    [[ " $routed_services " == *" $service "* ]] || printf '%s ' "$service"
  done)
  # One at a time, each healthy before the next. Each worker loads the whole app
  # when it starts; two together on staging's single CPU and 2 GB starved the API,
  # so Traefik dropped it and the smoke saw 80 s of 503s on every deploy
  # (9 to 12 November 2026).
  for service in $remaining_services; do
    docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --no-deps --remove-orphans --wait --wait-timeout 300 "$service"
  done
else
  # shellcheck disable=SC2086
  docker compose -f runtime/deploy.lock.yml -p "$COMPOSE_PROJECT" up -d --no-deps --remove-orphans --wait --wait-timeout 300 $app_services
fi

phase smoke
domain=$(python3 -c 'import sys; from pathlib import Path; print(next(line.split("=", 1)[1] for line in Path(sys.argv[1]).read_text().splitlines() if line.startswith("BASE_DOMAIN=")))' "$DEPLOY_ENV.env")
node ../../scripts/production/smoke.mjs "$domain"
