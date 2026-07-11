#!/usr/bin/env bash
# Dry-run: upload the test observation CSV into wis2box's incoming bucket,
# exactly the way SURFACE's publisher does (S3 PUT under the topic prefix).
# Reads MinIO credentials from wis2box.env at runtime — no secrets in the repo.
#
# Usage:
#   ./dryrun-upload.sh                  # host (MinIO at localhost:9000)
#   MINIO_HOST=host.docker.internal ./dryrun-upload.sh   # from the devcontainer
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${WIS2BOX_ENV:-$HERE/../../wis2box/wis2box.env}"
MINIO_HOST="${MINIO_HOST:-localhost}"
TOPIC="origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop"
FILE="$HERE/test-data/wmo_data_0-20000-0-78958.csv"

ACCESS="$(grep -E '^WIS2BOX_STORAGE_USERNAME=' "$ENV_FILE" | cut -d= -f2)"
SECRET="$(grep -E '^WIS2BOX_STORAGE_PASSWORD=' "$ENV_FILE" | cut -d= -f2)"
[ -n "$ACCESS" ] && [ -n "$SECRET" ] || { echo "could not read storage creds from $ENV_FILE" >&2; exit 1; }

# Refresh the observation timestamp to the current UTC hour so wis2box treats it as fresh
python3 - "$FILE" <<'PY'
import csv, sys, datetime
path = sys.argv[1]
rows = list(csv.DictReader(open(path)))
now = datetime.datetime.now(datetime.timezone.utc)
for r in rows:
    r.update(year=now.year, month=now.month, day=now.day, hour=now.hour, minute=0)
w = csv.DictWriter(open(path, "w", newline=""), fieldnames=rows[0].keys())
w.writeheader(); w.writerows(rows)
PY

KEY="$TOPIC/wmo_data_0-20000-0-78958.csv"
echo "PUT s3://wis2box-incoming/$KEY via $MINIO_HOST:9000"
curl -sf --aws-sigv4 "aws:amz:us-east-1:s3" --user "$ACCESS:$SECRET" \
  -T "$FILE" "http://$MINIO_HOST:9000/wis2box-incoming/$KEY" \
  && echo "UPLOADED — watch: docker logs wis2box-management --tail 30"
