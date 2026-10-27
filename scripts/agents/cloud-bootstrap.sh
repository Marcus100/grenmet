#!/usr/bin/env bash
# Prepare a Claude Code cloud container so the repo's own gates run unmodified
# (pnpm verify:changed, pre-push, API tests). Registered as a SessionStart hook
# in .claude/settings.json for cloud sessions only; safe to run by hand.
#
#   scripts/agents/cloud-bootstrap.sh            # do the work
#   scripts/agents/cloud-bootstrap.sh --dry-run  # list the steps, change nothing
#
# What it fixes (docs/agents/tool-usage.md, "Cloud sessions"):
#   - uv too old for the pinned Python (.python-version)
#   - Node older than package.json engines.node, and pnpm re-exec'ing into a
#     placeholder tool shim (turbo then fails with "Exec format error") or
#     rewriting pnpm-lock.yaml
#   - `uv sync --package fast-back` without gms-ingest (NHC tests need it)
#   - no running Postgres / Redis for the API tests
#
# Contract: idempotent, non-interactive, never edits tracked files or .env*,
# never starts Redis inside the repo (its dump.rdb must not be committed), and
# always exits 0 so a failed step cannot stop a session from starting. Each step
# prints one "ok", "skip" or "WARN" line; WARN lines say what to do by hand.
set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${BOOTSTRAP_CACHE_DIR:-$HOME/.cache/barrels-bootstrap}"
BIN="$CACHE/bin"
FAILED=0

say() { printf 'bootstrap: %s\n' "$*"; }
warn() { FAILED=$((FAILED + 1)); printf 'bootstrap: WARN %s\n' "$*"; }

# step <name> <function>: run one step in isolation; in dry-run only name it.
step() {
  local name="$1" fn="$2"
  if [ "$DRY_RUN" = 1 ]; then
    say "would: $name"
    return 0
  fi
  if "$fn"; then :; else warn "$name failed; see the output above"; fi
}

json_field() { # json_field <file> <dotted.path>
  python3 - "$1" "$2" <<'PY'
import json, sys
value = json.load(open(sys.argv[1]))
for part in sys.argv[2].split("."):
    value = value.get(part, "") if isinstance(value, dict) else ""
print(value)
PY
}

PY_VERSION="$(tr -d '[:space:]' <"$ROOT/.python-version" 2>/dev/null || true)"
NODE_RANGE="$(json_field "$ROOT/package.json" engines.node)"
NODE_MAJOR="$(printf '%s' "$NODE_RANGE" | grep -oE '[0-9]+' | head -1)"
PNPM_VERSION="$(json_field "$ROOT/package.json" packageManager | sed -E 's/^pnpm@//; s/\+.*$//')"

mkdir -p "$BIN" 2>/dev/null || true
export PATH="$BIN:$PATH"

# ── 1. uv that knows the pinned Python ───────────────────────────────────────
ensure_uv() {
  if uv python find "$PY_VERSION" >/dev/null 2>&1; then
    say "skip uv: Python $PY_VERSION already available"
    return 0
  fi
  if ! uv python install "$PY_VERSION" >/dev/null 2>&1; then
    python3 -m pip install -q -U uv >/dev/null 2>&1 || return 1
    # The upgraded uv lands behind an older one on PATH; shadow it explicitly.
    printf '#!/bin/sh\nexec python3 -m uv "$@"\n' >"$BIN/uv"
    chmod +x "$BIN/uv"
    hash -r
    uv python install "$PY_VERSION" >/dev/null 2>&1 || return 1
  fi
  say "ok uv: Python $PY_VERSION installed ($(uv --version | cut -d' ' -f2))"
}

# ── 2. Node that satisfies engines.node ──────────────────────────────────────
ensure_node() {
  local have
  have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$have" -ge "${NODE_MAJOR:-0}" ]; then
    say "skip node: v$have satisfies $NODE_RANGE"
    return 0
  fi
  local dir="$CACHE/node-$NODE_MAJOR" version
  # Both binaries, so a download killed half way (the setup script's time
  # budget) is redone instead of trusted.
  if [ ! -x "$dir/bin/node" ] || [ ! -x "$dir/bin/npm" ]; then
    version="$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c "
import json, sys
print(next(r['version'] for r in json.load(sys.stdin) if r['version'].startswith('v$NODE_MAJOR.')))")" || return 1
    # Unpack beside the target and move it into place only when complete.
    rm -rf "$dir.partial" && mkdir -p "$dir.partial" \
      && curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" \
        | tar -xJ -C "$dir.partial" --strip-components=1 || return 1
    rm -rf "$dir" && mv "$dir.partial" "$dir" || return 1
  fi
  ln -sfn "$dir/bin/node" "$BIN/node"
  ln -sfn "$dir/bin/npm" "$BIN/npm"
  ln -sfn "$dir/bin/npx" "$BIN/npx"
  hash -r
  say "ok node: $(node --version) from $dir"
}

# ── 3. The pinned pnpm, without pnpm's own version switching ─────────────────
# pnpm 12 re-execs the version named by "packageManager" from its tool directory
# (~/.local/share/pnpm/.tools). In the cloud image that entry is a placeholder
# script, so turbo's child pnpm fails with "Exec format error"; the switch also
# rewrites packageManagerDependencies in pnpm-lock.yaml. Installing the pinned
# version ourselves and turning the switching off avoids both.
export npm_config_manage_package_manager_versions=false

ensure_pnpm() {
  if [ "$(pnpm --version 2>/dev/null)" = "$PNPM_VERSION" ] \
    && pnpm turbo --version >/dev/null 2>&1 \
    && (cd "$ROOT" && pnpm turbo run type-check --dry=json >/dev/null 2>&1); then
    say "skip pnpm: $PNPM_VERSION runs turbo"
    return 0
  fi
  # @pnpm/exe is the build the lockfile records; the JS build rewrites it.
  local prefix="$CACHE/pnpm"
  npm install --silent --no-audit --no-fund --prefix "$prefix" "@pnpm/exe@$PNPM_VERSION" \
    || return 1
  local exe="$prefix/node_modules/.bin/pnpm"
  [ -x "$exe" ] || return 1
  ln -sfn "$exe" "$BIN/pnpm"
  hash -r
  say "ok pnpm: $(pnpm --version)"
}

# The workspace keeps its pnpm store at <repo>/.pnpm-store (pnpm-workspace.yaml).
# The environment setup script (cloud-setup.sh) leaves a filled copy in the
# cache; hard-linking it in first lets pnpm install without downloading, and the
# store stays where every later pnpm command expects it.
seed_pnpm_store() {
  local seed="$CACHE/pnpm-store"
  if [ -d "$ROOT/.pnpm-store" ]; then
    say "skip pnpm store: checkout already has one"
    return 0
  fi
  if [ ! -d "$seed" ]; then
    say "skip pnpm store: no cached store to seed from"
    return 0
  fi
  # Content files are written once and never changed, so sharing them is safe.
  # pnpm edits its SQLite index (index.db and its -wal/-shm files) in place,
  # so each checkout gets its own copy of those instead of a shared inode.
  if cp -al "$seed" "$ROOT/.pnpm-store" 2>/dev/null; then
    find "$ROOT/.pnpm-store" -name 'index.db*' -type f -print0 \
      | while IFS= read -r -d '' linked; do
          cp -p "$seed/${linked#"$ROOT/.pnpm-store/"}" "$linked.copy" \
            && mv -f "$linked.copy" "$linked"
        done
    say "ok pnpm store seeded from $seed (linked)"
  else
    # Another filesystem: cp -al leaves an empty tree behind; copy into it.
    rm -rf "$ROOT/.pnpm-store" && mkdir -p "$ROOT/.pnpm-store" \
      && cp -a "$seed/." "$ROOT/.pnpm-store/" || return 1
    say "ok pnpm store seeded from $seed (copied)"
  fi
}

install_node_deps() {
  (cd "$ROOT" && pnpm install --frozen-lockfile --silent) || return 1
  say "ok pnpm install"
}

# ── 4. Python environment, including gms-ingest ──────────────────────────────
sync_python() {
  (cd "$ROOT/apps/api/fastapi" \
    && uv sync --frozen --package fast-back --package gms-ingest >/dev/null) || return 1
  say "ok uv sync (fast-back + gms-ingest)"
}

# ── 5. Postgres and Redis for the API tests ──────────────────────────────────
ensure_postgres() {
  command -v pg_lsclusters >/dev/null 2>&1 || { say "skip postgres: not installed"; return 0; }
  local ver name
  read -r ver name _ < <(pg_lsclusters --no-header | head -1)
  [ -n "${ver:-}" ] || { say "skip postgres: no cluster"; return 0; }
  pg_lsclusters --no-header | awk '{print $4}' | grep -q online \
    || pg_ctlcluster "$ver" "$name" start || return 1
  local psql_admin=(su postgres -c)
  "${psql_admin[@]}" "psql -Atc \"SELECT 1 FROM pg_roles WHERE rolname='app'\"" | grep -q 1 \
    || "${psql_admin[@]}" "psql -c \"CREATE ROLE app LOGIN SUPERUSER PASSWORD 'changethis'\"" >/dev/null || return 1
  "${psql_admin[@]}" "psql -Atc \"SELECT 1 FROM pg_database WHERE datname='app'\"" | grep -q 1 \
    || "${psql_admin[@]}" "psql -c \"CREATE DATABASE app OWNER app\"" >/dev/null || return 1
  say "ok postgres $ver/$name running, role and database 'app' present"
}

ensure_redis() {
  command -v redis-server >/dev/null 2>&1 || { say "skip redis: not installed"; return 0; }
  if redis-cli ping >/dev/null 2>&1; then
    say "skip redis: already running"
    return 0
  fi
  # --dir keeps dump.rdb out of the repository; --save "" disables snapshots.
  redis-server --daemonize yes --dir /tmp --save "" >/dev/null || return 1
  say "ok redis running (no snapshots, working dir /tmp)"
}

# ── 6. Persist environment for the rest of the session ───────────────────────
write_env() {
  local lines
  lines="$(cat <<EOF
export PATH="$BIN:\$PATH"
export npm_config_manage_package_manager_versions=false
export POSTGRES_SERVER="\${POSTGRES_SERVER:-localhost}"
export REDIS_URL="\${REDIS_URL:-redis://localhost:6379/0}"
export WXPRODUCTS_DATABASE_URL="\${WXPRODUCTS_DATABASE_URL:-postgresql://app:changethis@localhost:5432/app}"
EOF
)"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    printf '%s\n' "$lines" >>"$CLAUDE_ENV_FILE"
    say "ok environment appended to \$CLAUDE_ENV_FILE"
  else
    say "no \$CLAUDE_ENV_FILE; add these to your shell:"
    printf '%s\n' "$lines"
  fi
}

# BOOTSTRAP_ONLY=<function> runs one step (tests, or by hand).
if [ -n "${BOOTSTRAP_ONLY:-}" ]; then
  step "$BOOTSTRAP_ONLY" "$BOOTSTRAP_ONLY"
  exit 0
fi

step "uv: install Python $PY_VERSION (upgrade uv if it is too old)" ensure_uv
step "node: provide v$NODE_MAJOR (engines.node $NODE_RANGE)" ensure_node
step "pnpm: provide @pnpm/exe $PNPM_VERSION; turn off pnpm version switching" ensure_pnpm
step "pnpm store: seed <repo>/.pnpm-store from the cache" seed_pnpm_store
step "pnpm install --frozen-lockfile" install_node_deps
step "uv sync --package fast-back --package gms-ingest" sync_python
step "postgres: start the cluster; create role and database 'app'" ensure_postgres
step "redis: start without snapshots outside the repo" ensure_redis
step "env: PATH, pnpm switching off, POSTGRES_SERVER, REDIS_URL, WXPRODUCTS_DATABASE_URL" write_env

[ "$DRY_RUN" = 1 ] || say "done ($FAILED warning(s))"
exit 0
