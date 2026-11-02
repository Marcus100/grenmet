#!/usr/bin/env bash
# A disposable Postgres for the API tests: same image and first-boot scripts as
# the development database, but its data lives in RAM and durability is off
# (fsync, synchronous_commit, full_page_writes), so the test suite's many
# CREATE DATABASE ... TEMPLATE calls are cheap (about 20% faster on the full suite,
# about twice as fast on a single test file). It listens on 127.0.0.1:5433 only,
# so it is for the host, not the agent devcontainer, and it never touches the
# development database on 5432.
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
# up/down may remove this container, so it must never be the development one.
case "$NAME" in
  *-test) ;;
  *) echo "test-db: refusing container name '$NAME': it must end in -test" >&2; exit 2 ;;
esac
# Same pinned image as infra/docker/docker-compose.yml.
IMAGE="postgis/postgis:18-3.6@sha256:4a43e3c3e5d55b9208240fc71db543b79c638766280c625a425bd0a2390989c4"
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
  # Report where it really listens: a container that was already running may
  # have been created with another port.
  local published
  published="$(docker port "$NAME" 5432/tcp 2>/dev/null | head -1)"
  echo "test-db: ready on ${published:-127.0.0.1:$PORT} (user app, password $PASSWORD)"
}

create() {
  local domain name args=()
  # The development database's domain databases and roles, with placeholder passwords.
  for domain in WXWATCH WXPRODUCTS EREGISTER JANITORIAL TRANSPORT; do
    name="${domain,,}"
    args+=(-e "${domain}_DB_NAME=$name" -e "${domain}_DB_USER=$name" -e "${domain}_DB_PASSWORD=$PASSWORD")
  done
  # The development stack names the CMS database and role gms_cms.
  args+=(-e CMS_DB_NAME=gms_cms -e CMS_DB_USER=gms_cms -e "CMS_DB_PASSWORD=$PASSWORD")
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" \
    --tmpfs /var/lib/postgresql:rw,size=3g --shm-size=512m \
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
  down)
    if [ "$(state)" = absent ]; then
      echo "test-db: $NAME is not there"
    else
      docker rm -f "$NAME" >/dev/null && echo "test-db: removed $NAME"
    fi
    ;;
  status)
    s="$(state)"
    echo "test-db: $s"
    [ "$s" = running ] && ready
    ;;
  *) echo "usage: scripts/agents/test-db.sh up|down|status" >&2; exit 2 ;;
esac
