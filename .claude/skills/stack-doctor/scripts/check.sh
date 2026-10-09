#!/usr/bin/env bash
# Read-only dev-environment health check. Prints PASS/WARN/FAIL lines; never
# modifies anything. Port map source of truth: docs/ports.md.
set -u

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd -- "$REPO_ROOT" || exit 1

pass() { echo "PASS $1"; }
warn() { echo "WARN $1"; }
fail() { echo "FAIL $1"; }

# --- Environment detection ---------------------------------------------------
IN_CONTAINER=0
if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
  IN_CONTAINER=1
  echo "INFO environment: devcontainer (services reached via host.docker.internal)"
else
  echo "INFO environment: host"
fi

# --- Toolchain ---------------------------------------------------------------
NODE_V=$(node -v 2>/dev/null || echo missing)
case "$NODE_V" in
  v24.*) pass "node $NODE_V" ;;
  missing) fail "node not found" ;;
  *) warn "node $NODE_V (expected v24.x)" ;;
esac

PNPM_V=$(pnpm -v 2>/dev/null || echo missing)
EXPECTED_PNPM=$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]' 2>/dev/null || echo unknown)
case "$PNPM_V" in
  "$EXPECTED_PNPM") pass "pnpm $PNPM_V (package.json)" ;;
  missing) fail "pnpm not found" ;;
  *) warn "pnpm $PNPM_V (expected $EXPECTED_PNPM from package.json via corepack)" ;;
esac

# --- Docker daemon (host only) ----------------------------------------------
if [ "$IN_CONTAINER" -eq 0 ]; then
  if command -v docker >/dev/null 2>&1; then
    CTX=$(docker context show 2>/dev/null || echo unknown)
    SERVER_OS=$(docker info --format '{{.OperatingSystem}}' 2>/dev/null)
    if [ "$?" -ne 0 ]; then
      fail "Docker daemon is unreachable (context: $CTX)"
    else
      case "$SERVER_OS" in
        *"Docker Desktop"*) pass "docker context: $CTX ($SERVER_OS)" ;;
        *) warn "docker context: $CTX reaches $SERVER_OS; expected Docker Desktop" ;;
      esac
      if UNHEALTHY=$(docker ps --filter health=unhealthy --format '{{.Names}}' 2>/dev/null); then
        [ -n "$UNHEALTHY" ] && fail "unhealthy containers: $UNHEALTHY" || pass "no unhealthy containers"
      else
        fail "could not inspect container health"
      fi
    fi
    if systemctl is-active --quiet docker 2>/dev/null; then
      warn "native dockerd service is ACTIVE — split-brain risk with Docker Desktop"
    fi
  else
    warn "docker CLI not found on host"
  fi
else
  echo "INFO docker checks skipped (no docker CLI in the agent devcontainer — expected)"
fi

# --- Service reachability ----------------------------------------------------
# From the devcontainer, host-published services live on host.docker.internal.
HOST=localhost
[ "$IN_CONTAINER" -eq 1 ] && HOST=host.docker.internal

check_port() { # name port severity(warn|fail)
  if timeout 2 bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$HOST" "$2" 2>/dev/null; then
    pass "$1 listening on $HOST:$2"
  else
    "$3" "$1 not reachable on $HOST:$2"
  fi
}

# Infra: absence is a real problem when working on the stack.
check_port "postgres"    5432 warn
check_port "redis"       6379 warn
check_port "fastapi"     8000 warn
# Web dev servers: not running is often fine — surface as info-grade warns.
while read -r APP PORT; do
  check_port "$APP" "$PORT" warn
done < <(awk -F '|' '/^\| [a-z-]+ \| `@barrelsgd\/web-/ {gsub(/ /, "", $2); gsub(/ /, "", $4); print $2, $4}' docs/ports.md)

# --- Memory (WSL2) -----------------------------------------------------------
MEM_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
MEM_GB=$((MEM_KB / 1024 / 1024))
if [ "$MEM_GB" -ge 8 ]; then
  pass "memory: ${MEM_GB}GB total allocated"
else
  warn "memory: only ${MEM_GB}GB — check .wslconfig on the Windows side"
fi

echo "INFO done — read-only check, nothing was modified"
