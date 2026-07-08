# Port allocation

Canonical port map for the monorepo. **This file is the single source of truth** —
when a port changes, update it here first, then propagate to the locations listed
under "Where each port lives" below.

## Allocation strategy

Ports are grouped by tier and assigned contiguously within each tier. Each web app
uses **one port across local dev and its container** (no dev/prod skew).

| Range | Tier |
|---|---|
| `3000–3099` | Next.js web apps |
| `4000–4099` | Node APIs (Hono) |
| `8000–8099` | Python API (FastAPI) + web-facing dev tools |
| fixed | Infrastructure (Postgres, Redis, mail) |

## Web apps (`30xx`)

| App | Package | Port | Deployed |
|---|---|---|---|
| auth | `@grenmet/web-auth` | 3000 | yes |
| admin-gms | `@grenmet/web-admin` | 3001 | yes |
| hurricaneplan | `@grenmet/web-hurricaneplan` | 3002 | yes |
| spicewx | `@grenmet/web-spicewx` | 3003 | yes |
| signal | `@grenmet/web-signal` | 3004 | dev only (no Dockerfile yet) |

Run a single app with `pnpm dev:web:<name>`; run all in parallel with `pnpm dev`.

## APIs

| Service | Port | Source of default |
|---|---|---|
| HonoAPI | 4000 | `apps/api/honoapi/src/env.ts` (`PORT`) |
| FastAPI | 8000 | `apps/api/fastapi/docker-compose.yml` |

## Infrastructure & dev tools

| Service | Port |
|---|---|
| Postgres | 5432 |
| Redis | 6379 |
| Adminer (DB browser) | 8080 |
| Traefik dashboard | 8090 |
| MailCatcher (web UI / SMTP) | 1080 / 1025 |

## Vendored ops apps (host Docker stacks — see `VENDORED.md`)

| Service | Port(s) | Source |
|---|---|---|
| SURFACE web (nginx) | 8081 | `surface/.env` (`NGINX_PORT`) |
| SURFACE postgres (timescaledb) | 5433 | `surface/docker-compose.yml` |
| wis2box nginx | 80 | `wis2box/docker-compose.override.yml` |
| wis2box UI (direct) | 9999 | same |
| wis2box minio (S3 / console / sftp) | 9000 / 9001 / 8022 | same |
| wis2box mosquitto (MQTT / WS) | 1883 / 8884 | same |
| wis2box mqtt metrics collector | 8001 | `wis2box/docker-compose.monitoring.yml` (prometheus itself is internal-only, 9090) |
| wis2box grafana | 3100 | same |

SURFACE originally shipped on 8080 and 5432; both were remapped to coexist with
Adminer and grenmet-postgres.

## Where each web-app port lives

Changing a web app's port means editing **all** of these so they agree:

1. `apps/web/<app>/package.json` — `dev` and `start` (`--port`)
2. `apps/web/<app>/Dockerfile` — `EXPOSE` and `ENV PORT=` (deployed apps only)
3. `infra/docker/docker-compose.prod.yml` — Traefik `loadbalancer.server.port`
4. `infra/docker/docker-compose.staging.yml` — same
5. `.github/workflows/build-web-images.yml` — `matrix.port` (documentation only)
6. `apps/web/<app>/CLAUDE.md` — the "Port **N**" header
7. This file

## Auth return-host / CORS allowlists (env files — edit manually)

These live in `.env.local` / `.env.local.example` and reference `localhost:<port>`:

- `apps/web/auth/.env.local` — `AUTH_ALLOWED_RETURN_HOSTS` must list every web app
  that redirects back to auth: `localhost:3001,localhost:3002,localhost:3003,localhost:3004`
- Each delegating app's `.env.local` — `AUTH_ALLOWED_RETURN_HOSTS=localhost:<its-own-port>`
- `apps/api/fastapi/.env.local` — `BACKEND_CORS_ORIGINS` includes the web-app origins
- `apps/api/honoapi/.env.local` — `CORS_ORIGINS` (code default in `src/env.ts`)

In staging/production these use real `*.barrels.gd` subdomains, not localhost ports.
