#!/usr/bin/env bash
# Run from the host. Host web servers and existing service ports are unchanged.
set -euo pipefail
cd "$(dirname "$0")/../.."
# Fail before provisioning or migration when any required local configuration is missing.
python3 scripts/production/check-local-env.py
command -v docker >/dev/null
command -v flock >/dev/null
exec 9>"${TMPDIR:-/tmp}/grenmet-storage-init.lock"
flock -n 9 || { echo "Another local initializer is running" >&2; exit 1; }
compose=(docker compose -p grenmet --env-file infra/docker/.env.local -f infra/docker/docker-compose.yml)
docker info >/dev/null
"${compose[@]}" up -d --wait postgres
"${compose[@]}" exec -T postgres bash /docker-entrypoint-initdb.d/01-init.sh
# Same prestart/Alembic runner used by deployment. Existing pnpm start remains available.
docker compose -p grenmet-api --env-file apps/api/fastapi/.env.local -f apps/api/fastapi/docker-compose.yml run --rm --build prestart
for domain in wxwatch wxproducts janitorial transport; do
  pnpm --filter @barrelsgd/web-gaa-admin "db:$domain:migrate"
done
pnpm --filter @barrelsgd/web-gaa-admin db:transport:seed
pnpm --filter @barrelsgd/web-gaa-admin db:janitorial:seed
pnpm --filter @barrelsgd/web-cms db:migrate
node --env-file=apps/web/gaa-admin/.env.local apps/web/gaa-admin/scripts/verify-databases.mjs
echo "Local storage initialized; start host web apps with the existing pnpm dev:web commands"
