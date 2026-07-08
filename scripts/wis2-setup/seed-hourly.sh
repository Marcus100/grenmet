#!/usr/bin/env bash
# Cron wrapper for seed-hourly.sql — seeds the current hour's synthetic obs
# into SURFACE so the hh:05 WIS2 publish has data (soak test, ADR-0010).
#
# Install (host):  crontab -e
#   1 * * * * /home/eugine/grenmet/scripts/wis2-setup/seed-hourly.sh >> /tmp/wis2-seed.log 2>&1
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

exec 9>/tmp/wis2-seed.lock
flock -n 9 || exit 0

HERE="$(cd "$(dirname "$0")" && pwd)"
echo "[$(date -u +%FT%TZ)] seeding..."
docker exec -i surface-database psql -U dba -d surface_db -v ON_ERROR_STOP=1 \
  < "$HERE/seed-hourly.sql"
