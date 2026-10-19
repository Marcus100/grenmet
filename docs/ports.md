# Port allocation

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-18

Canonical port map for the monorepo. **This file is the single source of truth** —
when a port changes, update it here first, then propagate to the locations listed
under "Where each port lives" below.

## Allocation strategy

Ports are grouped by tier and assigned contiguously within each tier. Each web app
uses **one port across local dev and its container** (no dev/prod skew).

| Range | Tier |
|---|---|
| `3000–3099` | Next.js web apps |
| `4000–4099` | Reserved (formerly the retired Hono API) |
| `8000–8099` | Python API (FastAPI) + web-facing dev tools |
| fixed | Infrastructure (Postgres, Redis, mail) |

## Web apps (`30xx`)

| App | Package | Port |
| --- | --- | --- |
| auth | `@barrelsgd/web-auth` | 3000 |
| gaa-admin | `@barrelsgd/web-gaa-admin` | 3001 |
| docs | `@barrelsgd/web-docs` | 3002 |
| gms | `@barrelsgd/web-gms` | 3003 |
| signal | `@barrelsgd/web-signal` | 3004 |
| mbia | `@barrelsgd/web-mbia` | 3005 |
| cms | `@barrelsgd/web-cms` | 3006 |
| elections | `@barrelsgd/web-elections` | 3007 |
| events | `@barrelsgd/web-events` | 3009 |
| cap | `@barrelsgd/web-cap` | 3010 |
| admin | `@barrelsgd/web-admin` | 3012 |
| gmsdash | `@barrelsgd/web-gmsdash` | 3013 |
| babydoll | `@barrelsgd/web-babydoll` | 3014 |

### Reserved and planned

Ports are **never reused** after an app is retired. Claim a port here, in the same
change that plans the app, so the next person does not pick it.

| Port | App | Status |
| --- | --- | --- |
| 3008 | `@barrelsgd/web-shop` (`shop.barrels.gd`) | Reserved; see `docs/exec-plans/barrelsgd-migration-plan.md` |

In production only Traefik's entry points are published to the host; app ports stay
on the Docker network and Traefik routes by hostname using an explicit
`loadbalancer.server.port` label.

The static `apps/web/barrels` homepage has no assigned Next.js port. Port
allocation does not indicate deployment status; see the
[deployment guide](./deployment.md) and environment-specific release evidence.

Run a single app on the host with `pnpm dev:web:<name>`; run all in parallel
with `pnpm dev`.

## Domains by environment

Every hostname, in one place. Staging and production share one Traefik
config (`infra/docker/docker-compose.deploy.yml`) with `BASE_DOMAIN` set to
`staging.barrels.gd` or `barrels.gd` (`infra/docker/{staging,production}.env`).
DNS is a wildcard, so a new subdomain needs only its Traefik router. App
metadata (Sentry, analytics, health) lives in
`packages/ui/src/lib/service-catalogue.json`; a deployed web app must have an
entry there or its image build fails.

### Served by the DigitalOcean stack (Traefik)

| Service | Local dev | Container port | Staging | Production | Health check |
| --- | --- | --- | --- | --- | --- |
| auth (Barrels ID) | `localhost:3000` | 3000 | `auth.staging.barrels.gd` | `auth.barrels.gd` | `/` |
| gaa-admin (GAA/GMS staff portal) | `localhost:3001` | 3001 | `gmsadmin.staging.barrels.gd` and `admin.staging.barrels.gd` | `gmsadmin.barrels.gd` and `admin.barrels.gd` | `/` (redirects to sign-in) |
| docs | `localhost:3002` | 3002 | `docs.staging.barrels.gd` | `docs.barrels.gd` | `/` |
| gms (public weather site) | `localhost:3003` | 3003 | `weather.staging.barrels.gd` | `weather.barrels.gd` | `/` |
| signal | `localhost:3004` | 3004 | `signal.staging.barrels.gd` | `signal.barrels.gd` | `/` |
| mbia | `localhost:3005` | 3005 | `mbia.staging.barrels.gd` | `mbia.barrels.gd` | `/` |
| cms (Payload) | `localhost:3006` | 3006 | `cms.staging.barrels.gd` | `cms.barrels.gd` | `/admin` |
| events | `localhost:3009` | 3009 | `events.staging.barrels.gd` | `events.barrels.gd` | `/` |
| cap (public CAP alert hub) | `localhost:3010` | 3010 | `cap.staging.barrels.gd` | `cap.barrels.gd` | `/api/health` |
| gmsdash (GMS Dashboard) | `localhost:3013` | 3013 | `gmsdash.staging.barrels.gd` | `gmsdash.barrels.gd` | `/api/health` |
| FastAPI | `localhost:8000` | 8000 | `api.staging.barrels.gd` | `api.barrels.gd` | `/api/v1/utils/health-check/` |
| Adminer (password) | `localhost:8080` | 8080 | `adminer.staging.barrels.gd` | `adminer.barrels.gd` | — |
| Traefik dashboard (password) | `localhost:8090` | built in (`api@internal`) | `traefik.staging.barrels.gd` | `traefik.barrels.gd` | — |

Internal only (no hostname): Postgres 5432, Redis 6379, the ARQ `worker`, the
`nhc-worker`, `prestart` (migrations) and `cms-migrate`.

`admin.<domain>` serves the GAA/GMS staff portal until the gmsadmin cutover;
it then moves to the Barrels control plane (`apps/web/admin`, port 3012),
which is built but not deployed and has no catalogue entry yet.

### Hosted on Vercel (production only, no staging)

| Site | Production |
| --- | --- |
| Barrels company homepage (`apps/web/barrels`) | `barrels.gd` (`www.barrels.gd` redirects) |
| elections (`apps/web/elections`, dev port 3007) | `elections.barrels.gd` |
| babydoll (`apps/web/babydoll`, dev port 3014; Babydoll Beauty Bar client site) | `babydoll.barrels.gd` (explicit DNS record; overrides the DigitalOcean wildcard) |

### Planned (no app yet)

| Hostname | For | Port |
| --- | --- | --- |
| `hr.barrels.gd` | Barrels HR (stays in gaa-admin for now) | not claimed |
| `shop.barrels.gd` | Barrels Shop | 3008 reserved |

### Retired hostnames

Not routed any more. Old CORS lists in `infra/docker/.env.*.example` still
name some of them.

| Hostname | Replaced by |
| --- | --- |
| `gms.*`, `gaa-admin.*` | `weather.*`, `gmsadmin.*` |
| `wxwatch.*`, `wxproducts.*`, `salesbus.*`, `sales.*` | modules inside gaa-admin |
| `hurricane.*` | docs (redirect-only during the rename) |
| `spice.*` | retired Spice weather app |
| `proxy.*` | retired Hono weather-data proxy (port 4000 range) |
| `gaa.*` | GAA corporate site plan, not built |

The browser-facing API origins are `BACKEND_CORS_ORIGINS` in
`infra/docker/{staging,production}.env`. cap and gmsdash call FastAPI from
their servers only, so they are not listed there.

## APIs

| Service | Port | Source of default |
|---|---|---|
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

Changing a web app's port means editing **all** of these so they agree.
`node scripts/ci/check-ports.mjs` (run by `pnpm test:delivery` in CI) fails when any of them
disagrees with this file, when two apps share a port, or when an app uses a port reserved for another:

1. `apps/web/<app>/package.json` — `dev` and `start` (`--port`)
2. `apps/web/<app>/Dockerfile` — `EXPOSE` and `ENV PORT=` (deployed apps only)
3. `infra/docker/docker-compose.deploy.yml` — Traefik `loadbalancer.server.port` and health checks
4. `.github/workflows/build-web-images.yml` — `matrix.port` (documentation only)
5. `.github/workflows/ci-web.yml` — container smoke-test ports
6. `apps/web/<app>/AGENTS.md` — the "Port **N**" header
7. This file

## Auth return-host / CORS allowlists (env files — edit manually)

These live in `.env.local` / `.env.local.example` and reference `localhost:<port>`:

- `apps/web/auth/.env.local` — `AUTH_ALLOWED_RETURN_HOSTS` must list every web app
  that redirects back to auth: `localhost:3001,localhost:3002,localhost:3003,localhost:3004`
- Each delegating app's `.env.local` — `AUTH_ALLOWED_RETURN_HOSTS=localhost:<its-own-port>`
- `apps/api/fastapi/.env.local` — `BACKEND_CORS_ORIGINS` includes the web-app origins

In staging/production these use real `*.barrels.gd` subdomains, not localhost ports.
