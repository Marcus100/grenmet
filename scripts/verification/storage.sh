#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${STORAGE_TEST_POSTGRES_URL:?Set an explicit disposable PostgreSQL admin URL}"
command -v psql >/dev/null || { echo 'Install the PostgreSQL client (psql) before storage verification.' >&2; exit 1; }
export RUNTIME_ROLE_TEST_REQUIRED=true
pnpm --filter @barrelsgd/api-client build
node --test apps/web/gaa-admin/scripts/storage.integration.test.mjs apps/web/cms/scripts/storage.integration.test.mjs scripts/production/runtime-role.integration.test.mjs
