#!/bin/bash
# Setup script for the Claude Code cloud environment (paste it into the
# environment's "Setup script" box, or load this file there).
#
# The cloud runs it once, as root, before the first session, then snapshots the
# filesystem and starts later sessions from that snapshot (rebuilt about every
# seven days or when this script changes; docs/agents/tool-usage.md, "Fast cloud
# starts"). So it does the slow, downloadable part of cloud-bootstrap.sh here:
# the pinned uv Python and uv cache, Node and pnpm when the image's are too old,
# and a filled pnpm store. The SessionStart hook still runs cloud-bootstrap.sh
# every session; it seeds the checkout's pnpm store from this copy and links
# instead of downloading.
#
# Contract: needs no repository checkout (it makes a shallow copy of the public
# repo beside the cache and deletes it), stays under the five-minute snapshot
# limit, leaves no server running, and always exits 0 so a slow or failed step
# cannot stop a session from starting.
set -uo pipefail
export GIT_TERMINAL_PROMPT=0

REPO_URL="${GRENMET_REPO_URL:-https://github.com/Marcus100/grenmet.git}"
BRANCH="${GRENMET_BRANCH:-dev}"
CACHE="${BOOTSTRAP_CACHE_DIR:-$HOME/.cache/barrels-bootstrap}"
# Total budget, kept under the platform's roughly five-minute snapshot limit.
BUDGET="${GRENMET_SETUP_SECONDS:-270}"
CLONE_SECONDS="${GRENMET_CLONE_SECONDS:-60}"

say() { printf 'cloud-setup: %s\n' "$*"; }

mkdir -p "$CACHE" || { say "WARN cannot create $CACHE; skipping"; exit 0; }
# Beside the cache, not in /tmp: the store moves into the cache without a copy,
# and nothing lands in /tmp when it is a small RAM disk.
WORK="$(mktemp -d "$CACHE/setup.XXXXXX")" || { say "WARN mktemp failed; skipping"; exit 0; }
[ -d "$WORK" ] || { say "WARN no working directory; skipping"; exit 0; }

finish() {
  rm -rf "$WORK"
  exit 0
}

if ! timeout "$CLONE_SECONDS" git clone --quiet --depth 1 --branch "$BRANCH" \
  "$REPO_URL" "$WORK/repo"; then
  say "WARN could not clone $REPO_URL; sessions will bootstrap from scratch"
  finish
fi

MIN_BOOTSTRAP="${GRENMET_MIN_BOOTSTRAP_SECONDS:-30}"
remaining=$((BUDGET - SECONDS))
[ "$remaining" -ge "$MIN_BOOTSTRAP" ] || remaining="$MIN_BOOTSTRAP"
# Stop afterwards only the servers this run started, never ones already up
# (a machine running the tests, or a session that already started them).
pg_online() { pg_lsclusters --no-header 2>/dev/null | awk '$4 == "online" {print $1, $2}'; }
pg_before=""
command -v pg_lsclusters >/dev/null 2>&1 && pg_before="$(pg_online)"
redis_before=0
redis-cli ping >/dev/null 2>&1 && redis_before=1
log="$WORK/bootstrap.log"
# The same idempotent bootstrap the hook runs; it fills the caches under $HOME.
timeout "$remaining" bash "$WORK/repo/scripts/agents/cloud-bootstrap.sh" >"$log" 2>&1
status=$?
cat "$log"
if [ "$status" -eq 124 ]; then
  say "WARN bootstrap stopped after ${remaining}s; caches are partial"
elif grep -q 'done (0 warning(s))' "$log"; then
  say "ok caches warmed from $BRANCH"
else
  say "WARN bootstrap reported warnings; caches may be partial"
fi

# Keep the filled store for sessions to seed from; replace an older copy.
if [ -d "$WORK/repo/.pnpm-store" ]; then
  rm -rf "$CACHE/pnpm-store" && mv "$WORK/repo/.pnpm-store" "$CACHE/pnpm-store" \
    && say "ok pnpm store kept at $CACHE/pnpm-store"
fi

# A snapshot keeps files, not processes: stop the servers the bootstrap started
# so their data directories are captured shut down cleanly.
if command -v pg_lsclusters >/dev/null 2>&1; then
  pg_online | while read -r ver name; do
    grep -qxF "$ver $name" <<<"$pg_before" && continue
    pg_ctlcluster "$ver" "$name" stop </dev/null || true
  done
fi
if [ "$redis_before" = 0 ] && redis-cli ping >/dev/null 2>&1; then
  redis-cli shutdown nosave >/dev/null 2>&1 || true
fi

rm -rf "$WORK"
exit 0
