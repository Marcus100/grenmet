#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../apps/api/fastapi"
: "${POSTGRES_SERVER:?Set an explicit test PostgreSQL host}"
: "${POSTGRES_USER:?Set the test database role}"
: "${POSTGRES_PASSWORD:?Set the test database password}"
mkdir -p reports
# Verification must not rebuild a host/container-shared development environment.
backend_test_root="$(mktemp -d -t grenmet-backend-tests-XXXXXXXX)"
trap 'rm -rf -- "$backend_test_root"' EXIT
export UV_PROJECT_ENVIRONMENT="$backend_test_root/venv"
# A CI shard measures coverage but defers reports: it writes the data file named
# by COVERAGE_FILE, and one job later combines every shard (ci-api.yml, coverage).
if [ -n "${COVERAGE_DATA_ONLY:-}" ]; then
  coverage_reports=(--cov-report=)
else
  coverage_reports=(--cov-report=term-missing --cov-report=xml --cov-report=html)
fi
# NHC acceptance exercises the existing collector as well as the API. Keep both
# frozen workspace packages installed while running pytest in this owned env.
uv sync --frozen --package fast-back --package gms-ingest
# The Schemathesis fuzz suite is deselected by pyproject addopts; pass `-m fuzz`
# (CI's fuzz job) or `-m 'fuzz or not fuzz'` to include it.
# Workers: TEST_WORKERS overrides. In CI one per CPU (GitHub's standard runners
# have 4; each worker owns its database, so they share no state). On a shared
# developer machine leave two CPUs free so several agents can test at once.
if [ -z "${TEST_WORKERS:-}" ]; then
  cpus=$(nproc)
  if [ "${CI:-}" = "true" ]; then
    TEST_WORKERS=$cpus
  else
    TEST_WORKERS=$((cpus > 2 ? cpus - 2 : 1))
  fi
fi
uv run --no-sync --package fast-back pytest \
  -n "$TEST_WORKERS" --dist load \
  --cov=src --cov-context=test "${coverage_reports[@]}" --junitxml=reports/pytest.xml \
  --tb=short --durations=20 --durations-min=0.1 "$@"
