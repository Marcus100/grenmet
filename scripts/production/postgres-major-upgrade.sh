#!/usr/bin/env bash
# Moves one environment's core database to a new PostgreSQL major by dump and restore
# into a new volume (docs/operations/postgres-18-upgrade.md, steps 7 to 13).
#
#   scripts/production/postgres-major-upgrade.sh --environment staging|production \
#     --confirm <environment> [--dry-run | --clear-marker]
#
# Source: the running db container (its image and volume). Target: what the next deploy
# will run, CORE_POSTGRES_IMAGE and CORE_PGDATA_VOLUME, checked as one set by
# render-env.py from the same secrets and environment file as core.sh deploy. Set both
# GitHub variables first: until the new volume exists, a deploy fails on the missing
# external volume before it touches the running database.
#
# Markers in PG_UPGRADE_DIR (default /var/backups/grenmet/pg-major-upgrade):
#   <env>.in-progress  written before the database switch; core.sh refuses to deploy or
#                      back up while it exists. Removed after the restart and smoke
#                      checks pass, or by --clear-marker after a rollback.
#   <env>.verified     the restored data matched the old server; a rerun then only
#                      restarts the services and runs the smoke checks.
#   <env>.completed    everything passed; a rerun does nothing.
#
# The old volume is never written or deleted. Until the services reopen, rollback is
# setting both variables back, --clear-marker, and Deploy.
# Run by .github/workflows/postgres-major-upgrade.yml.
set -euo pipefail
umask 077

usage() {
  echo "usage: scripts/production/postgres-major-upgrade.sh --environment staging|production --confirm <environment> [--dry-run | --clear-marker]"
}
refuse() {
  echo "postgres-major-upgrade: $*" >&2
  usage >&2
  exit 2
}

environment="" confirm="" mode=upgrade
while (($# > 0)); do
  case "$1" in
    --environment | --confirm)
      (($# >= 2)) || refuse "$1 needs a value"
      if [[ "$1" == --environment ]]; then environment=$2; else confirm=$2; fi
      shift 2 ;;
    --dry-run | --clear-marker)
      [[ "$mode" == upgrade ]] || refuse "--dry-run and --clear-marker cannot be combined"
      mode=${1#--}
      shift ;;
    -h | --help) usage; exit 0 ;;
    *) refuse "unknown argument '$1'" ;;
  esac
done
[[ "$environment" == staging || "$environment" == production ]] ||
  refuse "--environment must be staging or production"
[[ "$confirm" == "$environment" ]] ||
  refuse "--confirm must repeat the environment name ('$environment') before anything runs"
dry_run=false
[[ "$mode" != dry-run ]] || dry_run=true
expected_project=grenmet-staging
[[ "$environment" != production ]] || expected_project=grenmet
COMPOSE_PROJECT=${COMPOSE_PROJECT:-$expected_project}
[[ "$COMPOSE_PROJECT" == "$expected_project" ]] ||
  refuse "COMPOSE_PROJECT must be $expected_project for $environment"
max_backup_age=${PG_UPGRADE_MAX_BACKUP_AGE_HOURS:-6}
margin_gb=${PG_UPGRADE_FREE_MARGIN_GB:-2}
[[ "$max_backup_age" =~ ^[1-9][0-9]?$ && "$margin_gb" =~ ^[0-9]{1,3}$ ]] ||
  refuse "PG_UPGRADE_MAX_BACKUP_AGE_HOURS must be 1 to 99 and PG_UPGRADE_FREE_MARGIN_GB 0 to 999"
# core.sh, backup-database.yml and monitoring-maintenance.yml read the same default.
work_root=${PG_UPGRADE_DIR:-/var/backups/grenmet/pg-major-upgrade}
[[ "$work_root" == /* ]] || refuse "PG_UPGRADE_DIR must be an absolute path"
in_progress="$work_root/$environment.in-progress"
verified_marker="$work_root/$environment.verified"
completed_marker="$work_root/$environment.completed"

cd "$(dirname "$0")/../../infra/docker"
config_file="$environment.env"
rendered=runtime/.env.pg-upgrade
mkdir -p runtime
exec 9>"${CORE_LOCK_DIR:-/var/lock}/grenmet-core-$environment.lock"
flock -w "${PG_UPGRADE_LOCK_WAIT:-60}" 9 || {
  echo "A deploy or backup of $environment holds the core maintenance lock; nothing was changed. Run again when it finishes." >&2
  exit 1
}

# What has changed so far decides what a failure means (see finish).
stage=preflight
source_image="" source_volume="" source_major="" source_db="" target_db=""
target_image="" target_volume="" target_mount="" target_major=""
run_dir="" writers_file="" dumps_started=false
current_phase="" phase_started=$(date +%s) phase_timings=""

end_phase() {
  [[ -n "$current_phase" ]] || return 0
  phase_timings+="| $current_phase | $(($(date +%s) - phase_started))s | $1 |"$'\n'
  echo "::endgroup::"
}
phase() {
  end_phase ok
  current_phase=$1
  phase_started=$(date +%s)
  echo "::group::[$(date -u +%H:%M:%SZ)] $1"
}
# Stops the run at the first failed check. The finish trap prints what to do next.
fail() {
  echo "::error::$*" >&2
  exit 1
}
marker_value() {
  sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1
}

# The stopped services, one line each: <container id> <service> <restart policy>. While
# the data moves their restart policy is "no", so a host reboot cannot start them on an
# unchecked database; it is restored before they start again.
writer_ids() {
  [[ -n "$writers_file" && -s "$writers_file" ]] || return 0
  cut -d' ' -f1 "$writers_file" | tr '\n' ' '
}
restore_policies() {
  [[ -n "$writers_file" && -s "$writers_file" ]] || return 0
  local id service policy
  while read -r id service policy; do
    [[ -n "$id" ]] || continue
    docker update --restart="${policy:-no}" "$id" >/dev/null || return 1
  done < "$writers_file"
}
restart_writers() {
  local ids
  ids=$(writer_ids)
  [[ -n "$ids" ]] || return 0
  restore_policies || return 1
  # shellcheck disable=SC2086
  docker start $ids >/dev/null
}

rollback_steps() {
  echo "Deploys and backups of $environment are refused while $in_progress exists."
  echo "Roll back (the old volume $source_volume was never written by PostgreSQL $target_major):"
  echo "  1. In the GitHub environment '$environment', set CORE_POSTGRES_IMAGE back to $source_image"
  echo "     and delete CORE_PGDATA_VOLUME (or set it to $source_volume)."
  echo "  2. Run the PostgreSQL major upgrade workflow for $environment with mode clear-marker"
  echo "     (it checks step 1, restores the services' restart policies and removes the marker)."
  echo "  3. Run Deploy for $environment. It recreates db on the old volume and starts the services."
  echo "The new volume $target_volume is kept for diagnosis; remove it by hand once the cause is known."
}

# Dumps are staged in the database containers' /tmp (never in a data volume); remove any
# a failed or cancelled run left there.
remove_container_dumps() {
  $dumps_started || return 0
  local container
  for container in "$source_db" "$target_db"; do
    [[ -n "$container" ]] || continue
    docker exec "$container" sh -c 'rm -f /tmp/pg-upgrade-*.dump' >/dev/null 2>&1 || true
  done
}

finish() {
  local status=$?
  set +e
  if ((status == 0)); then end_phase ok; else end_phase failed; fi
  rm -f "$rendered"
  remove_container_dumps
  if ((status != 0)); then
    echo "::error::PostgreSQL major upgrade of $environment stopped in phase '${current_phase:-arguments}'."
    case "$stage" in
      preflight)
        echo "Nothing was changed: the database and the services are as they were." ;;
      writers-stopped)
        echo "The database was not switched: PostgreSQL $source_major on $source_volume is unchanged."
        if restart_writers; then
          echo "The stopped services were started again."
        else
          echo "Starting the stopped services failed: run Deploy for $environment to start them."
        fi ;;
      switched)
        echo "The services stay stopped so nothing writes to the unchecked PostgreSQL $target_major database."
        rollback_steps ;;
      reopened)
        echo "PostgreSQL $target_major passed every data check ($verified_marker); restarting the services or the smoke checks failed."
        echo "Fix the cause and run the workflow again in upgrade mode: it only restarts the services and repeats the smoke checks."
        echo "Deploys and backups stay refused until then ($in_progress). Writes may already exist only on $target_volume:"
        echo "fix forward, or ask the owner before any rollback (docs/operations/postgres-18-upgrade.md, Rollback)." ;;
    esac
    [[ -z "$run_dir" ]] || echo "Run directory on this host: $run_dir"
  fi
  {
    printf "\n### PostgreSQL major upgrade (%s, %s) %s\n\n| Phase | Duration | Result |\n| --- | --- | --- |\n" \
      "$environment" "$mode" "$( ((status == 0)) && echo succeeded || echo failed)"
    printf "%s" "$phase_timings"
  } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT TERM

# psql inside a database container, tab-separated and unaligned. POSTGRES_USER and its
# password stay inside the container; nothing here prints a credential. No -i: callers
# read lists on stdin, which an attached exec would swallow.
sql() {
  docker exec "$1" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -tA -F "	" -c "$2"' sh "$2" "$3"
}
# Lines of the first file missing from the second, whatever order psql returned.
missing_lines() {
  LC_ALL=C comm -23 <(LC_ALL=C sort "$1") <(LC_ALL=C sort "$2")
}
rendered_value() {
  sed -n "s/^$1=\"\\(.*\\)\"\$/\\1/p" "$rendered" | tail -n 1
}
config_value() {
  sed -n "s/^$1=//p" "$config_file" | tail -n 1
}
major_of_image() {
  [[ "$1" =~ ^(postgres:|postgis/postgis:)([0-9]+) ]] && echo "${BASH_REMATCH[2]}"
}
db_container() {
  docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "label=com.docker.compose.service=db"
}
compose() {
  docker compose --env-file "$config_file" --env-file "$rendered" -f docker-compose.deploy.yml -p "$COMPOSE_PROJECT" "$@"
}
existing_parent() {
  local path=$1
  while [[ ! -e "$path" && "$path" != / ]]; do path=$(dirname "$path"); done
  echo "$path"
}
# "<available KB> <filesystem> <mount point>" for a path, or its nearest existing parent.
disk_of() {
  df -Pk "$(existing_parent "$1")" | awk 'NR == 2 {print $4, $1, $6}'
}
databases_of() {
  sql "$1" postgres "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY 1"
}
# Exact row count of every table, so the check after the restore compares like with like.
COUNT_SQL="SELECT n.nspname || '.' || c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%' ORDER BY 1"
EXTENSION_SQL="SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1"
EXTENSION_VERSION_SQL="SELECT coalesce(string_agg(extname || ' ' || extversion, ', ' ORDER BY extname), 'none') FROM pg_extension WHERE extname <> 'plpgsql'"
EMPTY_SQL="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%'"
ROLE_SQL="SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 1"
MEMBERSHIP_SQL="SELECT r.rolname || ' ' || m.rolname FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member WHERE m.rolname !~ '^pg_' ORDER BY 1"
alembic_of() {
  local present
  present=$(sql "$1" "$2" "SELECT to_regclass('public.alembic_version') IS NOT NULL")
  if [[ "$present" == t ]]; then
    sql "$1" "$2" "SELECT string_agg(version_num, ',' ORDER BY version_num) FROM public.alembic_version"
  else
    echo "-"
  fi
}
# State of a server, written to <directory>: databases, roles, and per database the row
# counts, Alembic revisions and extensions. Role and owner names stay in files only.
record_state() {
  local container=$1 directory=$2 database
  mkdir -p "$directory"
  databases_of "$container" > "$directory/databases"
  sql "$container" postgres "SELECT datname || ' ' || pg_get_userbyid(datdba) FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY 1" > "$directory/owners"
  sql "$container" postgres "$ROLE_SQL" > "$directory/roles"
  sql "$container" postgres "$MEMBERSHIP_SQL" > "$directory/memberships"
  while IFS= read -r database; do
    sql "$container" "$database" "$COUNT_SQL" > "$directory/counts.$database"
    alembic_of "$container" "$database" > "$directory/alembic.$database"
    sql "$container" "$database" "$EXTENSION_SQL" > "$directory/extensions.$database"
  done < "$directory/databases"
}
# Waits for a started container to be healthy (or running, without a healthcheck).
wait_healthy() {
  local id=$1 state deadline=$(($(date +%s) + ${PG_UPGRADE_START_TIMEOUT:-300}))
  while (($(date +%s) < deadline)); do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id") || return 1
    case "$state" in
      healthy | running) return 0 ;;
      starting | created | restarting) ;;
      *) return 1 ;;
    esac
    sleep "${PG_UPGRADE_POLL_SECONDS:-3}"
  done
  return 1
}
# Restart the stopped services, wait until healthy, run the smoke checks, then record
# the upgrade as complete and drop what it no longer needs.
reopen_and_smoke() {
  phase reopen
  stage=reopened
  restart_writers || fail "Restoring the restart policies or starting the stopped services failed"
  local id service _
  while read -r id service _; do
    [[ -n "$id" ]] || continue
    wait_healthy "$id" || fail "$service did not become healthy after the restart"
  done < "$writers_file"
  echo "Started $(grep -c . "$writers_file" || true) containers again."

  phase smoke
  if [[ "${PG_UPGRADE_SKIP_SMOKE:-}" == 1 ]]; then
    echo "Smoke checks skipped (PG_UPGRADE_SKIP_SMOKE=1, local rehearsal only)."
  else
    node ../../scripts/production/smoke.mjs "$(config_value BASE_DOMAIN)"
  fi
  printf 'volume=%s\nimage=%s\nrun=%s\ncompleted=%s\n' "$target_volume" "$target_image" "$run_dir" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$completed_marker"
  rm -f "$in_progress"
  # Role definitions with password hashes are not needed once the upgrade is complete.
  # The dumps stay as a second copy for the rollback window (no off-host write key on
  # this runner; the nightly backup covers production).
  rm -f "$run_dir/globals.sql" "$run_dir/missing-roles.sql" "$run_dir/memberships.sql"
  echo "PostgreSQL $target_major serves $environment. Run Database Backup now."
  echo "Keep ${source_volume:-the old volume} and the dumps in $run_dir/dumps for at least 14 days, then remove both with the owner's go:"
  echo "  rm -rf '$run_dir'"
}

# ── Preflight: read-only, in every mode ─────────────────────────────────────────────
phase preflight
echo "Environment $environment, Compose project $COMPOSE_PROJECT, mode $mode"
[[ -f "$config_file" ]] || fail "infra/docker/$config_file is missing"
python3 ../../scripts/production/render-env.py "$config_file" "$rendered" ||
  fail "render-env.py rejected the target configuration (message above). Fix the GitHub environment and run again."
target_image=$(rendered_value CORE_POSTGRES_IMAGE)
target_volume=$(rendered_value PGDATA_VOLUME)
target_mount=$(rendered_value CORE_POSTGRES_DATA_MOUNT)
target_major=$(major_of_image "$target_image") || fail "Cannot read the PostgreSQL major of the target image"
compose config --quiet || fail "docker compose rejected the deployment model (message above)"

marked_volume="" marked_run="" verified_volume=""
if [[ -f "$in_progress" ]]; then
  marked_volume=$(marker_value "$in_progress" volume)
  marked_run=$(marker_value "$in_progress" run)
fi
[[ ! -f "$verified_marker" ]] || verified_volume=$(marker_value "$verified_marker" volume)

# ── Clear the in-progress marker (after a rollback, or to accept verified data) ─────
if [[ "$mode" == clear-marker ]]; then
  if [[ -z "$marked_volume" ]]; then
    echo "No unfinished upgrade is recorded for $environment ($in_progress): nothing to clear."
    exit 0
  fi
  if [[ "$verified_volume" == "$marked_volume" ]]; then
    echo "The data on $marked_volume passed every check ($verified_marker); deploys may use it again."
  elif [[ "$target_volume" == "$marked_volume" ]]; then
    fail "CORE_PGDATA_VOLUME still names $marked_volume, whose data was never verified. Roll back first: set CORE_POSTGRES_IMAGE back to $(marker_value "$in_progress" source_image) and delete CORE_PGDATA_VOLUME, then clear the marker."
  else
    echo "The variables name $target_volume (PostgreSQL $target_major) again, not $marked_volume: rolling back."
  fi
  writers_file="$marked_run/stopped-containers"
  restore_policies || fail "Restoring the restart policies of the stopped services failed; the marker was kept"
  rm -f "$in_progress"
  echo "Cleared $in_progress. Next: run Deploy for $environment; it starts the services on $target_volume (PostgreSQL $target_major)."
  exit 0
fi

source_db=$(db_container)
[[ -n "$source_db" && "$source_db" != *$'\n'* ]] ||
  fail "Expected exactly one running db container in project $COMPOSE_PROJECT; found ${source_db:-none}. Deploy $environment first."
source_image=$(docker inspect --format '{{.Config.Image}}' "$source_db")
source_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{.Destination}}{{println}}{{end}}{{end}}' "$source_db" |
  awk '$2 == "/var/lib/postgresql/data" || $2 == "/var/lib/postgresql" {print $1}' | head -n 1)
[[ -n "$source_volume" ]] || fail "The running db container has no data volume at /var/lib/postgresql(/data)"
source_version=$(sql "$source_db" postgres "SHOW server_version_num")
[[ "$source_version" =~ ^[0-9]{6}$ ]] || fail "Could not read the running server's version"
source_major=$((source_version / 10000))
echo "Source: PostgreSQL $source_major ($source_version), image $source_image, volume $source_volume"
echo "Target: PostgreSQL $target_major, image $target_image, volume $target_volume mounted at $target_mount"

if [[ "$source_volume" == "$target_volume" ]]; then
  if ((source_major == target_major)) && [[ "$(marker_value "$completed_marker" volume)" == "$target_volume" ]]; then
    echo "Already upgraded: $environment runs PostgreSQL $source_major on $target_volume ($completed_marker). Nothing to do."
    exit 0
  fi
  if ((source_major == target_major)) && [[ "$verified_volume" == "$target_volume" ]]; then
    # The data was checked; restarting the services or the smoke checks did not finish.
    run_dir=$(marker_value "$verified_marker" run)
    writers_file="$run_dir/stopped-containers"
    [[ -f "$writers_file" ]] || fail "The run directory of the verified upgrade is missing ($run_dir)"
    source_volume=$(marker_value "$in_progress" source_volume)
    if $dry_run; then
      end_phase ok
      current_phase=""
      echo "Dry run: the data on $target_volume passed every check; an upgrade run would start the $(grep -c . "$writers_file" || true) stopped containers again and run the smoke checks."
      echo "Dry run: nothing was changed."
      exit 0
    fi
    reopen_and_smoke
    exit 0
  fi
  if ((source_major == target_major && target_major >= 18)); then
    fail "db already runs PostgreSQL $source_major on $target_volume, but its data was never verified: an earlier run stopped after the switch. Roll back (set CORE_POSTGRES_IMAGE and CORE_PGDATA_VOLUME back, clear-marker, Deploy), check and remove the volume $target_volume by hand, then run again."
  fi
  fail "CORE_POSTGRES_IMAGE and CORE_PGDATA_VOLUME still name the running PostgreSQL $source_major database. Set them to the $((source_major + 1)) image digest and a new volume (<project>_pgdata$((source_major + 1))) first."
fi
((target_major > source_major)) ||
  fail "The target PostgreSQL $target_major is not newer than the running $source_major; this script only upgrades."
[[ -z "$marked_volume" ]] ||
  fail "An unfinished upgrade is recorded ($in_progress, volume $marked_volume). Roll back and clear it (mode clear-marker) before starting again."

# The new volume: absent (created during the switch), or present, empty and unused.
if docker volume inspect --format '{{.Name}}' "$target_volume" >/dev/null 2>&1; then
  users=$(docker ps -aq --filter "volume=$target_volume")
  [[ -z "$users" ]] || fail "The volume $target_volume is in use by container(s) $(tr '\n' ' ' <<<"$users"). Choose another CORE_PGDATA_VOLUME."
  contents=$(docker run --rm --network none -v "$target_volume:/target:ro" --entrypoint sh "$source_image" -c 'ls -A /target | head -n 3')
  [[ -z "$contents" ]] || fail "The volume $target_volume already holds data. Check it and remove it by hand, or choose another CORE_PGDATA_VOLUME."
  echo "Volume $target_volume exists, is empty and unused: it will be used as it is."
else
  echo "Volume $target_volume does not exist yet: it is created during the switch."
fi

# Disk: the new cluster and the one dump staged at a time in the container's /tmp live
# under the Docker root, the dumps in the run directory. A margin on top, once per disk.
size_bytes=$(sql "$source_db" postgres "SELECT sum(pg_database_size(datname))::bigint FROM pg_database")
[[ "$size_bytes" =~ ^[0-9]+$ ]] || fail "Could not read the database size"
data_kb=$((size_bytes / 1024))
margin_kb=$((margin_gb * 1024 * 1024))
docker_root=$(docker info --format '{{.DockerRootDir}}')
writable=$(existing_parent "$work_root")
[[ -d "$writable" && -w "$writable" ]] ||
  fail "This runner cannot write $work_root (nearest existing directory: $writable). Make it writable for the runner user, or run with PG_UPGRADE_DIR set to a writable directory with room for the dumps."
read -r docker_free docker_fs docker_mount <<<"$(disk_of "$docker_root")"
read -r work_free work_fs work_mount <<<"$(disk_of "$work_root")"
[[ "$docker_free" =~ ^[0-9]+$ && "$work_free" =~ ^[0-9]+$ ]] || fail "Could not read the free disk space"
if [[ "$docker_fs $docker_mount" == "$work_fs $work_mount" ]]; then
  checks=("$docker_root and $work_root (one disk)|$docker_free|$((3 * data_kb + margin_kb))")
else
  checks=("$docker_root|$docker_free|$((2 * data_kb + margin_kb))" "$work_root|$work_free|$((data_kb + margin_kb))")
fi
for check in "${checks[@]}"; do
  IFS='|' read -r where have_kb need_kb <<<"$check"
  echo "Free disk on $where: $((have_kb / 1024)) MB (need $((need_kb / 1024)) MB for $((data_kb / 1024)) MB of data plus $margin_gb GB)"
  ((have_kb >= need_kb)) || fail "Not enough free disk on $where for a second copy of the data and the dumps. Free space and run again."
done

# Backup recency: the nightly backup covers production only; staging relies on the
# final dumps this script takes.
if [[ "$environment" == production ]]; then
  gate_code=0
  DEPLOY_BACKUP_MAX_AGE_HOURS="$max_backup_age" timeout 120 python3 ../../scripts/production/backup-gate.py production || gate_code=$?
  ((gate_code == 0)) ||
    fail "The newest production backup is older than ${max_backup_age}h or could not be checked (backup-gate.py exit $gate_code). Run Database Backup and wait for it to pass, then run again."
else
  echo "Backup: staging has no scheduled backup; the final dumps below are kept on this host."
fi

if docker image inspect --format '{{.Id}}' "$target_image" >/dev/null 2>&1; then
  echo "Target image is on this host."
elif $dry_run; then
  echo "Target image is not on this host yet: an upgrade pulls it before stopping anything."
else
  docker pull --quiet "$target_image" >/dev/null || fail "Could not pull $target_image"
fi

databases=$(databases_of "$source_db")
[[ -n "$databases" ]] || fail "The running server lists no databases"
writers=$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --format '{{.ID}} {{.Label "com.docker.compose.service"}}' |
  awk '$2 != "db" && $2 != "redis" && $2 != "proxy" && $2 != "traefik-socket-proxy"')
echo "Databases: $(tr '\n' ' ' <<<"$databases")"
echo "Services to stop while the data moves: $(awk '{print $2}' <<<"$writers" | sort -u | tr '\n' ' ')"

if $dry_run; then
  end_phase ok
  current_phase=""
  cat <<PLAN

Dry run: an upgrade of $environment would
  1. set the restart policy of $(grep -c . <<<"$writers" || true) service containers to "no" and stop them (db, redis and the proxy
     stay up), then wait for client connections to close;
  2. record row counts of every table, Alembic revisions, extensions and roles of: $(tr '\n' ' ' <<<"$databases");
  3. dump each database (pg_dump --format=custom --compress=9) and the roles (pg_dumpall --globals-only) to $work_root/$environment-<time>/;
  4. write $in_progress (deploys and backups refuse to run while it exists), stop db (PostgreSQL $source_major,
     volume $source_volume, which is never written again), create $target_volume and start db on $target_image
     with the volume at $target_mount;
  5. create the databases and roles as a deploy does (init-databases.sh), and the runtime role and any other role
     only the old server had from globals.sql, with their old password hashes;
  6. pg_restore --exit-on-error each database, run vacuumdb --all --analyze-in-stages and the runtime grants again;
  7. check the server version, row counts, Alembic revisions, extensions and roles against step 2 ($verified_marker);
  8. restore the restart policies, start the stopped services, wait until they are healthy and run the smoke checks,
     then remove the marker and the roles dump ($completed_marker).
Until step 8 the rollback is: set CORE_POSTGRES_IMAGE back to $source_image, delete CORE_PGDATA_VOLUME,
run this workflow with mode clear-marker, then run Deploy.
Dry run: nothing was changed.
PLAN
  exit 0
fi

# ── Upgrade ─────────────────────────────────────────────────────────────────────────
run_dir="$work_root/$environment-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$run_dir/dumps" "$run_dir/before" "$run_dir/after"
writers_file="$run_dir/stopped-containers"
while read -r id service; do
  [[ -n "$id" ]] || continue
  policy=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}{{if .HostConfig.RestartPolicy.MaximumRetryCount}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}{{end}}' "$id")
  echo "$id $service ${policy:-no}"
done <<<"$writers" > "$writers_file"
printf 'environment=%s\nsource_image=%s\nsource_volume=%s\ntarget_image=%s\ntarget_volume=%s\n' \
  "$environment" "$source_image" "$source_volume" "$target_image" "$target_volume" > "$run_dir/plan"

phase stop-writers
stage="writers-stopped"
ids=$(writer_ids)
if [[ -n "$ids" ]]; then
  # shellcheck disable=SC2086
  docker update --restart=no $ids >/dev/null
  # shellcheck disable=SC2086
  docker stop --time 60 $ids >/dev/null
fi
echo "Stopped $(grep -c . "$writers_file" || true) containers: $(cut -d' ' -f2 "$writers_file" | sort -u | tr '\n' ' ')"
connections=""
for _ in $(seq 1 20); do
  connections=$(sql "$source_db" postgres "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()")
  [[ "$connections" != 0 ]] || break
  sleep 3
done
[[ "$connections" == 0 ]] ||
  fail "$connections client connection(s) are still open after the services stopped (another host or tool?). Close them and run again."

phase record
record_state "$source_db" "$run_dir/before"
echo "Recorded $(grep -c . "$run_dir/before/databases") databases, $(grep -c . "$run_dir/before/roles") roles and $(cat "$run_dir"/before/counts.* | grep -c .) tables."

phase dump
dumps_started=true
while IFS= read -r database; do
  # In the container's /tmp, not the data volume; copied out and removed.
  docker exec "$source_db" sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom --compress=9 -d "$1" -f "/tmp/pg-upgrade-$1.dump"' sh "$database"
  docker exec "$source_db" sh -c 'pg_restore --list "/tmp/pg-upgrade-$1.dump" > /dev/null' sh "$database" ||
    fail "The dump of $database cannot be read back"
  docker cp "$source_db:/tmp/pg-upgrade-$database.dump" "$run_dir/dumps/$database.dump"
  docker exec "$source_db" rm -f "/tmp/pg-upgrade-$database.dump"
  [[ -s "$run_dir/dumps/$database.dump" ]] || fail "The dump of $database is empty"
  echo "$database: $(du -h "$run_dir/dumps/$database.dump" | cut -f1)"
done <<<"$databases"
# Roles with their password hashes: kept in the run directory (mode 600) until the
# upgrade completes, never printed.
docker exec "$source_db" sh -c 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$run_dir/globals.sql"
[[ -s "$run_dir/globals.sql" ]] || fail "The roles dump is empty"
# Nothing may have written while dumping: the counts must still match.
record_state "$source_db" "$run_dir/during"
diff -r -q "$run_dir/before" "$run_dir/during" >/dev/null ||
  fail "The data changed while it was being dumped, so something still writes. Find it and run again."

phase switch
stage=switched
# Before anything changes on the database side: from here on core.sh refuses to deploy
# or back up, until the upgrade completes or the marker is cleared after a rollback.
printf 'volume=%s\nrun=%s\nsource_image=%s\nsource_volume=%s\nstarted=%s\n' \
  "$target_volume" "$run_dir" "$source_image" "$source_volume" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$in_progress"
rm -f "$verified_marker"
docker stop --time 120 "$source_db" >/dev/null
docker volume inspect "$target_volume" >/dev/null 2>&1 ||
  docker volume create --label "gd.barrels.pg-upgrade.source=$source_volume" "$target_volume" >/dev/null
compose up -d --no-deps --wait --wait-timeout 300 db
target_db=$(db_container)
[[ -n "$target_db" && "$target_db" != *$'\n'* ]] || fail "The new db container did not start"
# On a new volume the entrypoint first runs a socket-only server for the init scripts,
# which the healthcheck already counts as ready; TCP answers only once the real one runs.
ready=false
for _ in $(seq 1 60); do
  if docker exec "$target_db" sh -c 'pg_isready -q -h 127.0.0.1 -U "$POSTGRES_USER"'; then ready=true; break; fi
  sleep 2
done
$ready || fail "The new server did not accept connections within two minutes"
target_version=$(sql "$target_db" postgres "SHOW server_version_num")
if ! [[ "$target_version" =~ ^[0-9]{6}$ ]] || ((target_version / 10000 != target_major)); then
  fail "The new server reports version ${target_version:-unknown}, not PostgreSQL $target_major"
fi
echo "PostgreSQL $target_major ($target_version) runs on $target_volume."

phase roles
# The domain databases and roles, as a deploy creates them. The runtime role and any
# other role only the old server had come from globals.sql with their old attributes and
# password hashes; grant-api-runtime.sh needs the restored tables, so it runs after.
docker exec "$target_db" bash /docker-entrypoint-initdb.d/init-databases.sh > "$run_dir/init-databases.log"
grep -E '^[A-Z]+: ' "$run_dir/init-databases.log" || true
sql "$target_db" postgres "$ROLE_SQL" > "$run_dir/after/roles"
missing_roles=$(missing_lines "$run_dir/before/roles" "$run_dir/after/roles")
if [[ -n "$missing_roles" ]]; then
  # CREATE and ALTER ROLE lines of only the missing roles, quoted or not.
  awk 'NR == FNR { want[$0] = 1; next }
    /^(CREATE|ALTER) ROLE / { name = $3; sub(/;$/, "", name); gsub(/^"|"$/, "", name); if (name in want) print }' \
    <(printf '%s\n' "$missing_roles") "$run_dir/globals.sql" > "$run_dir/missing-roles.sql"
  # Output suppressed: the statements carry password hashes.
  docker exec -i "$target_db" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' < "$run_dir/missing-roles.sql" >/dev/null 2>&1 ||
    fail "Creating $(grep -c . <<<"$missing_roles") role(s) that only the old server had failed (see missing-roles.sql in the run directory)"
  sql "$target_db" postgres "$ROLE_SQL" > "$run_dir/after/roles"
fi
still_missing=$(missing_lines "$run_dir/before/roles" "$run_dir/after/roles")
[[ -z "$still_missing" ]] ||
  fail "Roles of the old server are missing on the new one (compare before/roles and after/roles in the run directory)"
sql "$target_db" postgres "$MEMBERSHIP_SQL" > "$run_dir/after/memberships"
if [[ -n "$(missing_lines "$run_dir/before/memberships" "$run_dir/after/memberships")" ]]; then
  # Re-granting a membership that exists is a no-op, so every GRANT line is replayed.
  grep -E '^GRANT .* TO .*;$' "$run_dir/globals.sql" > "$run_dir/memberships.sql" || true
  docker exec -i "$target_db" sh -c 'psql -X -q -U "$POSTGRES_USER" -d postgres' < "$run_dir/memberships.sql" >/dev/null 2>&1 || true
  sql "$target_db" postgres "$MEMBERSHIP_SQL" > "$run_dir/after/memberships"
  still_missing=$(missing_lines "$run_dir/before/memberships" "$run_dir/after/memberships")
  [[ -z "$still_missing" ]] ||
    fail "Role memberships of the old server are missing on the new one (before/memberships, after/memberships)"
fi
while read -r database owner; do
  # Databases a deploy does not provision (for example one created by hand) get their old owner.
  docker exec -i "$target_db" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres --set=db="$1" --set=owner="$2"' sh "$database" "$owner" >/dev/null <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
done < "$run_dir/before/owners"
echo "Roles: $(grep -c . "$run_dir/before/roles") before, $(grep -c . "$run_dir/after/roles") now."

phase restore
while IFS= read -r database; do
  objects=$(sql "$target_db" "$database" "$EMPTY_SQL")
  [[ "$objects" == 0 ]] ||
    fail "$database already holds $objects relations on the new server; refusing to restore over it"
  docker cp "$run_dir/dumps/$database.dump" "$target_db:/tmp/pg-upgrade-$database.dump"
  started=$(date +%s)
  # The log can quote restored rows, so only pg_restore's own error lines are printed.
  if ! docker exec "$target_db" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error "/tmp/pg-upgrade-$1.dump"' sh "$database" \
    > "$run_dir/restore-$database.log" 2>&1; then
    grep '^pg_restore: error:' "$run_dir/restore-$database.log" | cut -c1-300 | head -n 5 >&2
    fail "Restoring $database failed (full log: restore-$database.log in the run directory)"
  fi
  docker exec "$target_db" rm -f "/tmp/pg-upgrade-$database.dump"
  echo "$database restored in $(($(date +%s) - started))s"
done <<<"$databases"
docker exec "$target_db" bash /opt/grenmet/grant-api-runtime.sh

phase analyze
docker exec "$target_db" sh -c 'vacuumdb -U "$POSTGRES_USER" --all --analyze-in-stages --quiet'

phase verify
record_state "$target_db" "$run_dir/after"
problems=0
while IFS= read -r database; do
  if ! diff -q "$run_dir/before/counts.$database" "$run_dir/after/counts.$database" >/dev/null; then
    echo "$database: row counts differ (table, before, after):" >&2
    LC_ALL=C join -t $'\t' -a 1 -a 2 -e missing -o 0,1.2,2.2 \
      <(LC_ALL=C sort "$run_dir/before/counts.$database") <(LC_ALL=C sort "$run_dir/after/counts.$database") |
      awk -F '\t' '$2 != $3' | head -n 20 >&2
    problems=1
  fi
  if ! diff -q "$run_dir/before/alembic.$database" "$run_dir/after/alembic.$database" >/dev/null; then
    echo "$database: Alembic revisions differ ($(cat "$run_dir/before/alembic.$database") before, $(cat "$run_dir/after/alembic.$database") after)" >&2
    problems=1
  fi
  if ! diff -q "$run_dir/before/extensions.$database" "$run_dir/after/extensions.$database" >/dev/null; then
    echo "$database: extensions differ ($(tr '\n' ' ' < "$run_dir/before/extensions.$database")before, $(tr '\n' ' ' < "$run_dir/after/extensions.$database")after)" >&2
    problems=1
  fi
  versions=$(sql "$target_db" "$database" "$EXTENSION_VERSION_SQL")
  echo "$database: $(grep -c . "$run_dir/after/counts.$database" || true) tables, Alembic $(cat "$run_dir/after/alembic.$database"), extensions: $versions"
done <<<"$databases"
# A deploy may provision a database the old server lacked; only a lost one is an error.
lost=$(missing_lines "$run_dir/before/databases" "$run_dir/after/databases")
[[ -z "$lost" ]] || { echo "Databases missing on the new server: $(tr '\n' ' ' <<<"$lost")" >&2; problems=1; }
((problems == 0)) || fail "The restored data does not match the old server (details above)"
echo "Every database matches: row counts, Alembic revisions and extensions."
printf 'volume=%s\nimage=%s\nrun=%s\nverified=%s\n' "$target_volume" "$target_image" "$run_dir" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$verified_marker"

reopen_and_smoke
