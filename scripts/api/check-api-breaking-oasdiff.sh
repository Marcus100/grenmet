#!/usr/bin/env bash
# Runs oasdiff's breaking-change rules on apps/api/fastapi/openapi.json against
# a base ref, with the same settings as CI (scripts/api/oasdiff.yaml, fail on ERR).
# Optional local companion to check-api-breaking.mjs; oasdiff is not an npm
# dependency. Install the binary yourself (any directory on PATH, or set OASDIFF):
#   https://github.com/oasdiff/oasdiff/releases (CI uses v1.33.0 via oasdiff-action v0.1.18)
#
# Usage: scripts/api/check-api-breaking-oasdiff.sh [base-ref]   (default origin/dev)
set -euo pipefail

base_ref="${1:-origin/dev}"
spec="apps/api/fastapi/openapi.json"
oasdiff_bin="${OASDIFF:-oasdiff}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

if ! command -v "$oasdiff_bin" >/dev/null 2>&1; then
  echo "oasdiff not found. Download it from https://github.com/oasdiff/oasdiff/releases" >&2
  echo "and put it on PATH, or set OASDIFF=/path/to/oasdiff." >&2
  exit 2
fi

base_file="$(mktemp)"
trap 'rm -f "$base_file"' EXIT
git show "${base_ref}:${spec}" > "$base_file"

OASDIFF_CONFIG="scripts/api/oasdiff.yaml" "$oasdiff_bin" breaking "$base_file" "$spec" --fail-on ERR
