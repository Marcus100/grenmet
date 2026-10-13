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
# NHC acceptance exercises the existing collector as well as the API. Keep both
# frozen workspace packages installed while running pytest in this owned env.
uv sync --frozen --package fast-back --package gms-ingest
uv run --no-sync --package fast-back pytest \
  -n "${TEST_WORKERS:-2}" --dist load \
  --cov=src --cov-context=test --cov-report=term-missing \
  --cov-report=xml --cov-report=html --junitxml=reports/pytest.xml \
  --tb=short --durations=20 --durations-min=0.1 "$@"
