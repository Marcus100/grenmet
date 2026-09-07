#!/usr/bin/env bash
# Test the exact runtime image before allowing deployment. Never use live credentials.
set -euo pipefail
image=${1:?Expected image}
kind=${2:?Expected web, auth, api, cms-migrate or admin-migrate}
case "$kind" in
  api)
    docker run --rm --network none --entrypoint /app/.venv/bin/python \
      -e PROJECT_NAME=ci -e SECRET_KEY=ci-secret-key-min-32-characters-long \
      -e POSTGRES_SERVER=db -e POSTGRES_PORT=5432 -e POSTGRES_USER=app \
      -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=app \
      -e FIRST_SUPERUSER=ci@example.test -e FIRST_SUPERUSER_PASSWORD=changethis-ci \
      "$image" -c 'from src.main import app; print("boot-ok: app + routers imported")'
    ;;
  cms-migrate)
    docker run --rm --network none --entrypoint node "$image" --input-type=module \
      -e "await import('payload'); await import('@payloadcms/db-postgres'); import {createRequire} from 'node:module'; createRequire(import.meta.url).resolve('@barrelsgd/tsconfig/tsconfig.nextjs.json')"
    ;;
  admin-migrate)
    docker run --rm --network none --entrypoint node "$image" --input-type=module \
      -e "await import('./apps/web/gaa-admin/scripts/migrate-domain.mjs')"
    ;;
  web|auth)
    port=${3:?Expected port}
    health=${4:-/api/health}
    container=""
    cleanup() {
      if [[ -n "$container" ]]; then
        docker logs "$container" || true
        docker rm -f "$container" || true
      fi
    }
    trap cleanup EXIT
    container=$(docker run -d -p "127.0.0.1::$port" \
      -e RESEND_API_KEY=ci-placeholder -e EMAILS_FROM_EMAIL=ci@example.test \
      -e PAYLOAD_SECRET=ci-only-placeholder-not-for-runtime-use \
      -e DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/gms_cms "$image")
    address=$(docker port "$container" "$port/tcp")
    for attempt in {1..30}; do
      if curl --fail --silent --max-time 5 "http://$address$health"; then
        if [[ "$kind" == auth ]]; then
          node --input-type=module - "$address" <<'JS'
import { check } from './scripts/production/smoke.mjs';
await check(`http://${process.argv[2]}/`, '<form');
JS
        fi
        exit 0
      fi
      sleep 2
    done
    echo "Image failed health check: $image" >&2
    exit 1
    ;;
  *) echo "Unknown image smoke kind: $kind" >&2; exit 2 ;;
esac
