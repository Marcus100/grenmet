#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Each invocation owns its environment: never resync the API's shared .venv.
# These suites use fixtures and temporary files, without live feeds or hardware.
(
  cd scripts/scrapy-wxwatch
  uv run --isolated --frozen --package wxwatch python -m pytest tests
)
(
  cd scripts/sutron-collector
  uv run --isolated --frozen --package sutron-collector python -m pytest tests
)
(
  cd scripts/gms-ingest
  uv run --isolated --frozen --package gms-ingest python -m unittest discover -s tests -v
)
