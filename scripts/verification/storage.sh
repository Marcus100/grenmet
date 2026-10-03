#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${STORAGE_TEST_POSTGRES_URL:?Set an explicit disposable PostgreSQL admin URL}"
command -v psql >/dev/null || { echo 'Install the PostgreSQL client (psql) before storage verification.' >&2; exit 1; }
export RUNTIME_ROLE_TEST_REQUIRED=true
pnpm --filter @barrelsgd/api-client build
node --test apps/web/cms/scripts/storage.integration.test.mjs scripts/production/runtime-role.integration.test.mjs
# The editorial suite owns a UUID schema on this disposable instance. Override
# inherited CMS configuration and invoke Vitest directly: acceptance cannot cache.
CMS_TEST_DATABASE_URL="$STORAGE_TEST_POSTGRES_URL" \
  pnpm --filter @barrelsgd/web-cms exec vitest run src/editorial.integration.test.ts
