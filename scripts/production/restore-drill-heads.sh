#!/usr/bin/env bash
# Print the code's current Alembic head for every version table as JSON, for
# restore-drill.py --heads. Run from any directory with the API dependencies synced.
set -euo pipefail
api="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/api/fastapi" && pwd)"
cd "$api"
head_of() { uv run --frozen --package fast-back alembic "$@" heads | tail -n1 | awk '{print $1}'; }
printf '{\n  "alembic_version": "%s"' "$(head_of)"
for domain in wxwatch wxproducts janitorial transport eregister events; do
  printf ',\n  "%s_alembic_version": "%s"' "$domain" "$(head_of -c "src/$domain/alembic.ini")"
done
printf '\n}\n'
