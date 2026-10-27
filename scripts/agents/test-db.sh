#!/usr/bin/env bash
# A disposable Postgres for the API tests: same image and first-boot scripts as
# the development database, but its data lives in RAM and durability is off
# (fsync, synchronous_commit, full_page_writes), so the test suite's many
# CREATE DATABASE ... TEMPLATE calls are about twice as fast. It listens on
# 127.0.0.1:5433 only and never touches the development database on 5432.
#
#   scripts/agents/test-db.sh up       # start (or restart) it and wait until ready
#   scripts/agents/test-db.sh down     # remove it; everything in it is discarded
#   scripts/agents/test-db.sh status   # running / stopped / absent, exit 0 only when ready
#
# scripts/agents/api-env.sh picks it up automatically while it is running.
# Never point anything but tests at it: a crash loses all data by design.
set -euo pipefail

NAME="${TEST_DB_CONTAINER:-grenmet-postgres-test}"
PORT="${TEST_DB_PORT:-5433}"
# Same pinned image as infra/docker/docker-compose.yml.
IMAGE="postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
PASSWORD="changethis"

state() {
  docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null || echo absent
}

ready() {
  docker exec "$NAME" pg_isready -U app -q 2>/dev/null
}

wait_ready() {
  local i
  for i in $(seq 1 60); do
    ready && return 0
    sleep 1
  done
  echo "test-db: $NAME did not become ready in 60 s" >&2
  return 1
}

start() {
  command -v docker >/dev/null 2>&1 || { echo "test-db: docker is not available" >&2; exit 1; }
  case "$(state)" in
    running) ;;
    absent) create ;;
    *) docker rm -f "$NAME" >/dev/null && create ;;
  esac
  wait_ready
  echo "test-db: ready on 127.0.0.1:$PORT (user app, password $PASSWORD)"
}

create() {
  local domain args=()
  # The development database's domain databases and roles, with placeholder passwords.
  for domain in CMS WXWATCH WXPRODUCTS EREGISTER JANITORIAL TRANSPORT; do
    args+=(-e "${domain}_DB_NAME=$(printf '%s' "$domain" | tr 'A-Z' 'a-z')")
    args+=(-e "${domain}_DB_USER=$(printf '%s' "$domain" | tr 'A-Z' 'a-z')")
    args+=(-e "${domain}_DB_PASSWORD=$PASSWORD")
  done
  # The development stack names the CMS database and role gms_cms.
  args+=(-e CMS_DB_NAME=gms_cms -e CMS_DB_USER=gms_cms)
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" \
    --tmpfs /var/lib/postgresql/data:rw,size=3g --shm-size=512m \
    -v "$ROOT/infra/postgres/init-databases.sh:/docker-entrypoint-initdb.d/01-init.sh:ro" \
    -v "$ROOT/infra/postgres/init-cms.sh:/docker-entrypoint-initdb.d/02-cms.sh:ro" \
    -e POSTGRES_DB=app -e POSTGRES_USER=app -e "POSTGRES_PASSWORD=$PASSWORD" \
    "${args[@]}" "$IMAGE" \
    -c fsync=off -c synchronous_commit=off -c full_page_writes=off \
    -c max_connections=300 -c shared_buffers=512MB -c max_wal_size=2GB \
    -c checkpoint_timeout=30min >/dev/null
}

case "${1:-}" in
  up) start ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 || true; echo "test-db: removed $NAME" ;;
  status)
    s="$(state)"
    echo "test-db: $s"
    [ "$s" = running ] && ready
    ;;
  *) echo "usage: scripts/agents/test-db.sh up|down|status" >&2; exit 2 ;;
esac
