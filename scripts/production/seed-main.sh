#!/usr/bin/env bash
# Operator command: explicit environment and prepared deployment configuration.
# No reset, secret writing, image promotion or historical-data generation.
set -euo pipefail
mode=${1:-preview}
[[ "$mode" == preview || "$mode" == apply ]] || { echo "Usage: seed-main.sh [preview|apply]" >&2; exit 1; }
: "${BASELINE_ENVIRONMENT:?Set local, staging or production}"
: "${BASELINE_COMPOSE_FILE:?Set the reviewed Compose file path}"
: "${BASELINE_ENV_FILE:?Set the existing runtime environment file path}"
: "${BASELINE_PROJECT:?Set the exact Compose project}"
: "${BASELINE_PROFILE:?Set the approved GMS profile path on the host}"
: "${BASELINE_ACTOR:?Set an existing active administrator username}"
command -v docker >/dev/null
compose=(docker compose --env-file "$BASELINE_ENV_FILE" -f "$BASELINE_COMPOSE_FILE" -p "$BASELINE_PROJECT")
# The profile is deliberately operator-provided; deployment must not import a development database.
container=$("${compose[@]}" ps -q api)
[[ -n "$container" ]] || { echo "API container is not running" >&2; exit 1; }
profile_target=/tmp/approved-gms-profile.json
docker cp "$BASELINE_PROFILE" "$container:$profile_target"
args=(--environment "$BASELINE_ENVIRONMENT")
if [[ "$mode" == apply ]]; then args+=(--apply); fi
# Both modes use real record-level previews, not a static list of intended targets.
"${compose[@]}" exec -T api python scripts/seed_production.py "${args[@]}" --profile "$profile_target"
"${compose[@]}" exec -T api python scripts/seed_gaa_organisation.py "${args[@]}" --actor "$BASELINE_ACTOR"
seed_flag=--preview
if [[ "$mode" == apply ]]; then seed_flag=--apply; fi
"${compose[@]}" run --rm web-migrate node apps/web/gaa-admin/scripts/seed-transport.mjs "$seed_flag"
"${compose[@]}" run --rm web-migrate node apps/web/gaa-admin/scripts/seed-janitorial.mjs "$seed_flag"
