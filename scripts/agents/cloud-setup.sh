#!/bin/bash
# Setup script for the Claude Code cloud environment (paste it into the
# environment's "Setup script" box, or load this file there).
#
# The cloud runs it once, as root, before the first session, then snapshots the
# filesystem and starts later sessions from that snapshot (rebuilt about every
# seven days or when this script changes; docs/agents/tool-usage.md, "Cloud
# sessions"). So it does the slow, downloadable part of cloud-bootstrap.sh here:
# the pinned uv Python, Node and pnpm, the pnpm store and the uv cache. The
# SessionStart hook still runs cloud-bootstrap.sh every session; with these
# caches on disk its steps link instead of downloading.
#
# Contract: needs no repository checkout (it makes a shallow copy of the public
# repo in /tmp and deletes it), stays under the five-minute snapshot limit, and
# always exits 0 so a slow or failed step cannot stop a session from starting.
set -uo pipefail

REPO_URL="${GRENMET_REPO_URL:-https://github.com/Marcus100/grenmet.git}"
BRANCH="${GRENMET_BRANCH:-dev}"
WORK="$(mktemp -d /tmp/grenmet-setup.XXXXXX)"
# Leave a margin under the platform's roughly five-minute snapshot limit.
BUDGET="${GRENMET_SETUP_SECONDS:-270}"

say() { printf 'cloud-setup: %s\n' "$*"; }

if ! git clone --quiet --depth 1 --branch "$BRANCH" --filter=blob:limit=5m \
  "$REPO_URL" "$WORK/repo"; then
  say "WARN could not clone $REPO_URL; sessions will bootstrap from scratch"
  rm -rf "$WORK"
  exit 0
fi

# The same idempotent bootstrap the hook runs: it fills ~/.cache/barrels-bootstrap
# (Node, pnpm), the uv Python and cache, and the pnpm store. Its Postgres role
# and database survive in the snapshot; the servers it starts do not.
if timeout "$BUDGET" bash "$WORK/repo/scripts/agents/cloud-bootstrap.sh"; then
  say "ok caches warmed from $BRANCH"
else
  say "WARN bootstrap stopped after ${BUDGET}s or failed; caches are partial"
fi

rm -rf "$WORK"
exit 0
