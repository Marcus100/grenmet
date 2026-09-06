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
command -v docker >/dev/null
compose=(docker compose --env-file "$BASELINE_ENV_FILE" -f "$BASELINE_COMPOSE_FILE" -p "$BASELINE_PROJECT")
# The profile is deliberately operator-provided; deployment must not import a development database.
container=$("${compose[@]}" ps -q api)
[[ -n "$container" ]] || { echo "API container is not running" >&2; exit 1; }
profile_target=/tmp/approved-gms-profile.json
if [[ "$mode" == preview ]]; then
  echo "Target project: $BASELINE_PROJECT; environment: $BASELINE_ENVIRONMENT"
  echo "Application: seed_production.py preview/apply using the approved profile"
  echo "Weather monitoring/products: migrations only; operational records arrive from real feeds"
  echo "Transport and janitorial: one-time catalogue seeds in the migration image"
  echo "SURFACE and wis2box: separate reference/metadata commands; see production-baseline.md"
  exit 0
fi
docker cp "$BASELINE_PROFILE" "$container:$profile_target"
"${compose[@]}" exec -T api python scripts/seed_production.py --environment "$BASELINE_ENVIRONMENT" --profile "$profile_target" --apply
# The migration image must include seed CSVs and scripts (same release as the application).
"${compose[@]}" run --rm web-migrate sh -c 'node apps/web/gaa-admin/scripts/seed-transport.mjs && node apps/web/gaa-admin/scripts/seed-janitorial.mjs'
