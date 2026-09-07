#!/usr/bin/env bash
# Run on an ISOLATED restore host/container. Never supplies a production URL.
set -euo pipefail
: "${RESTORE_CONTAINER:?Set a dedicated grenmet-restore-* container}"
[[ "$RESTORE_CONTAINER" == grenmet-restore-* ]] || { echo "Refusing non-restore container" >&2; exit 1; }
[[ "$(docker inspect -f '{{index .Config.Labels "grenmet.restore"}}' "$RESTORE_CONTAINER")" == true ]] || {
  echo "Restore container must carry grenmet.restore=true" >&2; exit 1;
}
[[ $# -gt 0 ]] || { echo "Pass one or more downloaded database dump paths" >&2; exit 1; }
for dump in "$@"; do
  [[ -s "$dump" ]] || { echo "Missing or empty dump" >&2; exit 1; }
  database="restore_$(date +%s)_$RANDOM"
  docker exec "$RESTORE_CONTAINER" sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$database"
  docker exec -i "$RESTORE_CONTAINER" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error --no-owner --no-privileges' sh "$database" < "$dump"
  docker exec "$RESTORE_CONTAINER" sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "$2"' sh "$database" "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2"
  echo "Restored to isolated database $database; retain it for migration and representative-record verification"
done
