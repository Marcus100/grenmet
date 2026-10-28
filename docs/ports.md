# Port allocation

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-21

Canonical port map for the monorepo. **This file is the single source of truth** —
when a port changes, update it here first, then propagate to the locations listed
under "Where each port lives" below.

## Rules

- Ports are **never renumbered and never reused**. A retired port stays in the
  table as retired.
- **Claim the port, the host and the reserved name in the same change** that
  plans the app, so the next person does not pick them.
- Each web app uses **one port across local dev and its container** (no
  dev/prod skew).
- Decision record: [ADR-0043](./adr/0043-hostnames-tenancy-and-port-allocation.md)
  (Proposed). `scripts/ci/check-ports.mjs` enforces the tables below.

## Port ranges

Ports 3000-3019 were assigned in arrival order and are frozen. Everything newer
is allocated by category.

| Range | Category | Notes |
| --- | --- | --- |
| `3000–3019` | Legacy, frozen | Arrival-ordered. 3008 shop, 3016 hr, 3017 business, 3018 app, 3019 spare; **3011 was never used and is never assigned** |
| `3020–3029` | Platform surfaces | 3020 developers, 3021 status |
| `3030–3059` | Barrels products | 3030 salesbus POS, 3031 tickets, 3032 passport, 3033 pay, 3034 media, 3035-3041 sector products (education, automotive, delivery, bus, park, taxi, homegrown) |
| `3060–3089` | Client-dedicated apps | 3060 gaa corporate, 3061 janitor PWA, 3062 bus PWA, 3063 gms PWA |
| `3090–3099` | Dev tools | 3090 UI gallery, 3091 email preview |
| `4000–4099` | Retired (Hono API) | Never reuse |
| `8000–8019` | Barrels Python services | 8000 FastAPI, 8010 ai-gateway |
| `8020–8079` | Free | Unassigned |
| `8080–8099` | Ops tools | 8080 Adminer, 8090 Traefik |
| fixed | Infrastructure and vendored | Postgres, Redis, mail, SURFACE, wis2box; see the tables below |

## Web apps

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
| bookings | `@barrelsgd/web-bookings` | 3015 |
| commit | `@barrelsgd/web-commit` | 3019 |

### Reserved and planned

Claimed, not built (no Compose service, Traefik route, image or DNS record).

| Port | App | Status |
| --- | --- | --- |
| 3008 | `@barrelsgd/web-shop` (`shop.barrels.gd`) | Reserved; see `docs/exec-plans/barrelsgd-migration-plan.md` |
| 3016 | `@barrelsgd/web-hr` (`hr.barrels.gd`) | Planned: separate multi-organisation HR app, organisation in the path (decision 2026-10-21) |
| 3017 | `@barrelsgd/web-business` | Reserved |
| 3018 | `@barrelsgd/web-app` | Reserved |
| 3020 | `@barrelsgd/web-developers` (`developers.barrels.gd`) | Reserved (platform) |
| 3021 | `@barrelsgd/web-status` (`status.barrels.gd`) | Reserved (platform) |
| 3030 | `@barrelsgd/web-salesbus` (point of sale; no host yet: `salesbus` and `sales` are retired hosts) | Reserved (product) |
| 3031 | `@barrelsgd/web-tickets` | Reserved (product) |
| 3032 | `@barrelsgd/web-passport` | Reserved (product) |
| 3033 | `@barrelsgd/web-pay` | Reserved (product) |
| 3034 | `@barrelsgd/web-media` | Reserved (product) |
| 3035 | `@barrelsgd/web-education` (`education.barrels.gd`) | Reserved (sector product, not built) |
| 3036 | `@barrelsgd/web-automotive` (`automotive.barrels.gd`) | Reserved (sector product, not built) |
| 3037 | `@barrelsgd/web-delivery` (`delivery.barrels.gd`) | Reserved (sector product, not built) |
| 3038 | `@barrelsgd/web-bus` (`bus.barrels.gd`) | Reserved (sector product, not built) |
| 3039 | `@barrelsgd/web-park` (`park.barrels.gd`) | Reserved (sector product, not built) |
| 3040 | `@barrelsgd/web-taxi` (`taxi.barrels.gd`) | Reserved (sector product, not built) |
| 3041 | `@barrelsgd/web-homegrown` (`homegrown.barrels.gd`) | Reserved (sector product, not built) |
| 3060 | `@barrelsgd/web-gaa` (GAA corporate site) | Reserved (client) |
| 3061 | `@barrelsgd/web-janitor` (janitor PWA) | Reserved (client) |
| 3062 | `@barrelsgd/web-gaa-bus` (bus PWA) | Reserved (client) |
| 3063 | `@barrelsgd/web-gms-pwa` (GMS PWA) | Reserved (client) |
| 3090 | `ui-gallery` (UI gallery, dev only) | Reserved (dev tool) |
| 3091 | `email-preview` (email preview, dev only) | Reserved (dev tool) |

### Retired ports

Never reuse. They stay here as the record.

| Port | What it was | Status |
| --- | --- | --- |
| `3011` | Never used (the transition plan once pencilled in a GAA staff portal here) | Never assign |
| `4000–4099` | The retired Hono API and weather-data proxy | Retired |

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
| admin (Barrels staff / superuser console) | `localhost:3012` | 3012 | `admin.staging.barrels.gd` | `admin.barrels.gd` | `/api/health` |
| gaa-admin (GMS/GAA staff portal, Met office) | `localhost:3001` | 3001 | `gms.staging.barrels.gd` | `gms.barrels.gd` | `/` (redirects to sign-in) |
| docs | `localhost:3002` | 3002 | `docs.staging.barrels.gd` | `docs.barrels.gd` | `/` |
| gms (public weather site) | `localhost:3003` | 3003 | `weather.staging.barrels.gd` | `weather.barrels.gd` | `/` |
| signal | `localhost:3004` | 3004 | `signal.staging.barrels.gd` | `signal.barrels.gd` | `/` |
| mbia | `localhost:3005` | 3005 | `mbia.staging.barrels.gd` | `mbia.barrels.gd` | `/` |
| cms (Payload) | `localhost:3006` | 3006 | `cms.staging.barrels.gd` | `cms.barrels.gd` | `/admin` |
| events | `localhost:3009` | 3009 | `events.staging.barrels.gd` | `events.barrels.gd` | `/` |
| cap (public CAP alert hub) | `localhost:3010` | 3010 | `cap.staging.barrels.gd` | `cap.barrels.gd` | `/api/health` |
| gmsdash (GMS Dashboard) | `localhost:3013` | 3013 | `gmsdash.staging.barrels.gd` | `gmsdash.barrels.gd` | `/api/health` |
| bookings (Barrels Bookings) | `localhost:3015` | 3015 | `bookings.staging.barrels.gd` | `bookings.barrels.gd` | `/api/health` |
| FastAPI | `localhost:8000` | 8000 | `api.staging.barrels.gd` | `api.barrels.gd` | `/api/v1/utils/health-check/` |
| Adminer (password) | `localhost:8080` | 8080 | `adminer.staging.barrels.gd` | `adminer.barrels.gd` | — |
| Traefik dashboard (password) | `localhost:8090` | built in (`api@internal`) | `traefik.staging.barrels.gd` | `traefik.barrels.gd` | — |

Internal only (no hostname): Postgres 5432, Redis 6379, the ARQ `worker`, the
`nhc-worker`, `prestart` (migrations) and `cms-migrate`.

Admin host move (owner decision 2026-10-21): `admin.<domain>` is the Barrels
staff / superuser console (`apps/web/admin`, port 3012) and `gms.<domain>` is the
GMS/GAA staff portal (`apps/web/gaa-admin`, port 3001). `gms.*` is the portal's
hostname only: `apps/web/gms` stays the public weather site at `weather.*`, and
old links to the former public `gms.*` site now land on the portal sign-in. The
move reaches production when this change is promoted to `main`
(`docs/deployment.md`, "Admin host move"). Compose service names follow the
release scope: `web-admin` is the console, `web-gmsadmin` is the portal.

The table above is what Compose routes today. `scripts/ci/check-ports.mjs`
fails when its hostnames disagree with the ``Host(`<label>.${BASE_DOMAIN}`)``
rules in `infra/docker/docker-compose.deploy.yml`.

### Hosted on Vercel (production only, no staging)

| Site | Production |
| --- | --- |
| Barrels company homepage (`apps/web/barrels`) | `barrels.gd` (`www.barrels.gd` redirects) |
| elections (`apps/web/elections`, dev port 3007) | `elections.barrels.gd` |
| babydoll (`apps/web/babydoll`, dev port 3014; Babydoll Beauty Bar client site) | `babydoll.barrels.gd` (explicit DNS record; overrides the DigitalOcean wildcard) |

### Hosted on Cloudflare Pages (production only, no staging)

Static sites (ADR-0036 amendment, 2026-10-27). Each host needs its own DNS
record pointing at Pages, overriding the DigitalOcean wildcard.

| Site | Production |
| --- | --- |
| commit (`apps/web/commit`, dev port 3019; Barrels engineering blog) | `commit.barrels.gd` (planned; not deployed yet) |

### Planned host changes and new hosts

Decisions of 2026-10-21 (ADR-0043). Nothing in this table is routed yet unless
the Status says so. Another branch is doing the staging hostname cutover; this
file records the target, not the live state.

| Hostname | For | Port | Status |
| --- | --- | --- | --- |
| `admin.barrels.gd` | Barrels staff and superuser console (`apps/web/admin`) | 3012 | Planned: cutover in progress. Today `admin.*` still routes to gaa-admin |
| `gms.barrels.gd` | Met office staff portal (today's gaa-admin) | 3001 | Planned: cutover in progress. Today the portal is `gmsadmin.*`. Old `gms.*` links meant the retired public weather site (now `weather.*`); the name is reassigned to the staff portal |
| `hr.barrels.gd` | Barrels HR: separate multi-organisation app, organisation in the path (`hr.barrels.gd/<orgSlug>/...`) | 3016 | Planned, not built (stays in gaa-admin until then) |
| `shop.barrels.gd` | Shopkeeping: the merchant-facing shop and stores app | 3008 | Reserved |
| `education.barrels.gd` | Sector product (Education cluster) | 3035 | Reserved; building is gated on validated demand |
| `automotive.barrels.gd` | Sector product (Automotive cluster) | 3036 | Reserved; building is gated on validated demand |
| `delivery.barrels.gd` | Sector product (Mobility cluster) | 3037 | Reserved; building is gated on validated demand |
| `bus.barrels.gd` | Sector product (Mobility cluster) | 3038 | Reserved; building is gated on validated demand |
| `park.barrels.gd` | Sector product (Mobility cluster) | 3039 | Reserved; building is gated on validated demand |
| `taxi.barrels.gd` | Sector product (Mobility cluster) | 3040 | Reserved; building is gated on validated demand |
| `homegrown.barrels.gd` | Sector product (Commerce cluster) | 3041 | Reserved; building is gated on validated demand |
| `developers.barrels.gd` | Developer portal | 3020 | Reserved |
| `status.barrels.gd` | Status page | 3021 | Reserved |

### Host classes and rules

- **When a new host is justified:** only when a product has a distinct audience,
  auth/session model, branding or deployment. Otherwise it is a module or path
  inside an existing product. Likely clusters: Commerce (shop/shopkeeping,
  salesbus, homegrown), Mobility (bus, taxi, delivery, park; the `transport`
  and `stores` API domains already exist), Education, Automotive. Reserving a
  name costs nothing; building an app is gated on validated demand. All sector
  products stay on `barrels.gd`: no per-sector domains.
- **Salesbus:** the `salesbus` host is retired and never reassigned. The point
  of sale keeps port 3030 and the reserved name, and gets its host (or lives as
  a module of `shop`) when it is built.

- **Audience/control:** `auth` (Barrels ID); `admin` (Barrels staff and
  superuser console, port 3012); `gms` (Met office staff portal, port 3001).
- **Product hosts:** `bookings`, `events`, `hr`, `shop`, `signal`, `elections`,
  `gmsdash`, `cap`, `weather`, `docs`, `cms`, `mbia`.
- **Platform:** `api` (a single host); `status` and `developers` reserved.
- **Ops:** `traefik`, `adminer`. **Target:** basic auth plus an IP allowlist
  on staging; Cloudflare Access only on production. **Today: basic auth only**
  (Traefik `basicauth` middlewares in `docker-compose.deploy.yml`).
- **Single-level hostnames only** (no `docs.weather.*`). Staging uses the
  `.staging.` infix.
- **Tenants are paths** on product hosts, keyed by the organisation slug
  everywhere (`hr.barrels.gd/<orgSlug>/...`, `bookings.barrels.gd/<orgSlug>`;
  bookings' existing `public_slug` stays as an alias). Client sites are
  `<client>.barrels.gd` now; client-owned custom domains come later.
- **Cookies:** host-only, `HttpOnly`, `SameSite=Lax`, `Secure`, `__Host-` prefix
  as the target (the SSO state cookie on `Path=/auth` can only take
  `__Secure-`). `Domain=` is never set.
- **Sign-in return hosts:** exact registry origins only; the app is passed
  explicitly, not guessed from the hostname label. Built (P1): the auth app
  (`apps/web/auth/src/lib/return-to.ts`) ignores `.`-prefixed and wildcard
  entries. Until the owner updates Compose, which still passes
  `.${BASE_DOMAIN}`, only the configured `*_APP_URL` origins are accepted
  (see `docs/env.md`).
- **Second registrable domain:** required before any of uploads served from a
  Barrels hostname, tenants authoring HTML/themes/scripts, a client gaining DNS
  or deploy control of `<client>.barrels.gd`, or a site-builder product. It
  must be a Barrels-owned domain (not the owner's personal `eugine.me`). Until
  then, only the guardrails above.

### Retired hostnames

Not routed (or routed only until a cutover completes). **Never reassigned.**
Old CORS lists in `infra/docker/.env.*.example` still name some of them.

| Hostname | Replaced by | Status |
| --- | --- | --- |
| `gmsadmin.*` | `gms.*` (Met office staff portal) | Retired |
| `gaa-admin.*` | `gms.*` | Retired |
| `wxwatch.*`, `wxproducts.*` | modules inside gaa-admin | Retired |
| `salesbus.*`, `sales.*` | modules inside gaa-admin; the point-of-sale app (port 3030) will choose a new host | Retired |
| `hurricane.*` | docs (redirect-only during the rename) | Retired |
| `spice.*` | retired Spice weather app | Retired |
| `proxy.*` | retired Hono weather-data proxy (port 4000 range) | Retired |
| `grenmet.*` | the old project name | Retired |

`gaa.*` (GAA corporate site plan, not built) is not retired: `gaa` is reserved
and the site is planned on port 3060.

The browser-facing API origins are `BACKEND_CORS_ORIGINS` in
`infra/docker/{staging,production}.env`. cap and gmsdash call FastAPI from
their servers only, so they are not listed there.

## Reserved names

These names cannot be claimed as an organisation slug or a host label by
anyone except the platform. Every hostname in the tables above (live, planned
or retired) must appear here; `scripts/ci/check-ports.mjs` checks it. The API
enforces the list for organisation slugs, booking `public_slug`s and events
organiser addresses from `apps/api/fastapi/src/utils/reserved_names.py`;
`tests/test_reserved_names.py` fails if the two differ or if a top-level route
folder of `apps/web/bookings` (or `apps/web/hr`) is missing from the list.

- **Identity and access:** app, apps, account, accounts, id, login, signin, signout, signup, sso, oauth, auth, admin, root, superuser, staff, internal.
- **Environments:** staging, stg, dev, test, preview, sandbox, demo, beta.
- **Ops:** ops, status, health, metrics, monitor, grafana, traefik, adminer, db, redis.
- **Mail:** mail, smtp, imap, mx, autodiscover, autoconfig, send, bounce, email, notify, news.
- **Files and static:** cdn, static, assets, media, files, uploads, images, storage, s3.
- **Help and legal:** help, support, legal, privacy, terms, security, abuse, postmaster, hostmaster, webmaster.
- **Money:** billing, pay, payments, checkout, invoices.
- **Machine endpoints:** webhooks, hooks, callback, ws, mcp, ai, api, developers.
- **Product and client hosts:** bookings, events, hr, shop, signal, elections, gmsdash, cap, weather, docs, cms, mbia, babydoll, commit, gms.
- **Reserved sector products (not built):** education, automotive, delivery, bus, park, taxi, homegrown, shopkeeping.
- **Retired hosts:** gmsadmin, gaa-admin, wxwatch, wxproducts, salesbus, sales, hurricane, spice, proxy, grenmet.
- **Brand and generic words:** www, barrels, gaa, passport, rewards, contacts, business, tickets, studio, org, me, public, embed, widget, manage, booking, settings, new, search, about.

## APIs

| Service | Port | Source of default |
|---|---|---|
| FastAPI | 8000 | `apps/api/fastapi/docker-compose.yml` |
| ai-gateway (planned, not built) | 8010 | Reserved |

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

### Vendored exceptions inside Barrels ranges

Vendored software keeps its own ports. A vendored port that falls inside a
Barrels range must be listed here, or `check-ports.mjs` fails.

| Port | Service | Inside range |
| --- | --- | --- |
| 8001 | wis2box mqtt metrics collector | `8000–8019` (Barrels Python services) |
| 8081 | SURFACE web (nginx) | `8080–8099` (ops tools) |
| 8022 | wis2box minio sftp | `8020–8079` (free) |

## Where each web-app port lives

Changing a web app's port means editing **all** of these so they agree (and
ports are never renumbered; this list is for adding an app).
`node scripts/ci/check-ports.mjs` (run by `pnpm test:delivery` in CI) fails when
any of them disagrees with this file, when two apps share a port, when an app
uses a port reserved for another or retired, or when ranges overlap:

1. `apps/web/<app>/package.json` — `dev` and `start` (`--port`)
2. `apps/web/<app>/Dockerfile` — `EXPOSE` and `ENV PORT=` (deployed apps only)
3. `infra/docker/docker-compose.deploy.yml` — Traefik `loadbalancer.server.port` label and the health check
4. `scripts/ci/release-scope.mjs` — the image's `port` (the GitHub workflow matrices read it)
5. `apps/web/<app>/AGENTS.md` — the "Port **N**" header
6. This file

## Auth return-host / CORS allowlists (env files — edit manually)

These live in `.env.local` / `.env.local.example` and reference `localhost:<port>`:

- `apps/web/auth/.env.local` — `AUTH_ALLOWED_RETURN_HOSTS` must list every web app
  that redirects back to auth: `localhost:3001,localhost:3002,localhost:3003,localhost:3004`
- Each delegating app's `.env.local` — `AUTH_ALLOWED_RETURN_HOSTS=localhost:<its-own-port>`
- `apps/api/fastapi/.env.local` — `BACKEND_CORS_ORIGINS` includes the web-app origins

In staging/production these use real `*.barrels.gd` hosts, not localhost ports.
Compose currently passes `.${BASE_DOMAIN}` (a suffix rule); the target is exact
origins only (ADR-0043).
