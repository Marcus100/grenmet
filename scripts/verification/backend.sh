#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../apps/api/fastapi"
: "${POSTGRES_SERVER:?Set an explicit test PostgreSQL host}"
: "${POSTGRES_USER:?Set the test database role}"
: "${POSTGRES_PASSWORD:?Set the test database password}"
mkdir -p reports
uv run --frozen --package fast-back pytest \
  -n "${TEST_WORKERS:-2}" --dist loadfile \
  --cov=src --cov-context=test --cov-report=term-missing \
  --cov-report=xml --cov-report=html --junitxml=reports/pytest.xml \
  --tb=short --durations=20 --durations-min=0.1 "$@"
