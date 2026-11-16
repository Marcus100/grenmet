#!/usr/bin/env bash
# The API that the browser journeys talk to (.github/workflows/e2e.yml, and
# locally: docs/web/development.md, "Browser journeys").
#
#   scripts/verification/e2e-api.sh prepare   # migrate, then seed what the journeys need
#   scripts/verification/e2e-api.sh serve     # run uvicorn in the foreground on :8000
#
# `prepare` runs the same prestart script the API container runs (migrations,
# the sign-in catalogue, the first superuser) and then the Babydoll bookings
# seed, so the journeys use the repository's own seed data and nothing else.
# Values already in the environment win. The defaults are placeholders for a
# local database, never real credentials, and this script writes no env file.
set -euo pipefail

: "${PROJECT_NAME:=Barrels Grenada (browser journeys)}"
: "${ENVIRONMENT:=local}"
: "${SECRET_KEY:=test-secret-key-min-32-characters-long}"
: "${FIRST_SUPERUSER:=admin@example.com}"
: "${FIRST_SUPERUSER_PASSWORD:=changethis}"
: "${POSTGRES_SERVER:=127.0.0.1}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=app}"
: "${POSTGRES_PASSWORD:=changethis}"
: "${POSTGRES_DB:=app}"
: "${REDIS_URL:=redis://127.0.0.1:6379/0}"
: "${EMAILS_FROM_EMAIL:=test@example.com}"
: "${SMTP_HOST:=smtp.example.invalid}"
# The manage link in the seeded profile points at the bookings app under test.
: "${BOOKINGS_APP_URL:=http://localhost:3015}"
export PROJECT_NAME ENVIRONMENT SECRET_KEY FIRST_SUPERUSER FIRST_SUPERUSER_PASSWORD \
  POSTGRES_SERVER POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB \
  REDIS_URL EMAILS_FROM_EMAIL SMTP_HOST BOOKINGS_APP_URL

cd "$(dirname "$0")/../../apps/api/fastapi"
run=(uv run --frozen --package fast-back)

case "${1:-}" in
  prepare)
    "${run[@]}" bash scripts/prestart.sh
    "${run[@]}" python -m src.bookings.seed
    ;;
  serve)
    exec "${run[@]}" uvicorn src.main:app --host 127.0.0.1 --port "${E2E_API_PORT:-8000}"
    ;;
  *)
    echo "usage: scripts/verification/e2e-api.sh prepare|serve" >&2
    exit 2
    ;;
esac
