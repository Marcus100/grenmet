#!/usr/bin/env bash
# Run a command with the local-development API settings from
# apps/api/fastapi/AGENTS.md (Testing), so tests, lint and type checks work in a
# fresh worktree that has no gitignored .env.local.
#
#   scripts/agents/api-env.sh uv run --frozen --package fast-back pytest tests/hr -q
#
# Values already in the environment win. These are placeholders for the local
# stack, never real credentials, and this script never writes an env file.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/agents/api-env.sh <command> [args...]" >&2
  exit 2
fi

: "${PROJECT_NAME:=Barrels Grenada}"
: "${FIRST_SUPERUSER:=admin@example.com}"
: "${FIRST_SUPERUSER_PASSWORD:=changethis}"
: "${POSTGRES_SERVER:=host.docker.internal}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=app}"
: "${POSTGRES_PASSWORD:=changethis}"
: "${REDIS_URL:=redis://host.docker.internal:6379/0}"
: "${WXPRODUCTS_DATABASE_URL:=postgresql://wxproducts:changethis@host.docker.internal:5432/wxproducts}"
export PROJECT_NAME FIRST_SUPERUSER FIRST_SUPERUSER_PASSWORD POSTGRES_SERVER \
  POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD REDIS_URL WXPRODUCTS_DATABASE_URL

exec "$@"
