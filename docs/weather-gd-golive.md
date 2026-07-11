# weather.gd go-live runbook

Decision (2026-07-11): `weather.gd` and `barrels.gd` **coexist** — no cutover of
the whole stack. `weather.gd` is the public Met Service face; `barrels.gd` keeps
auth, admin, staging, ops tools, and the non-GMS apps. Both domains are served
by the same production droplet and Traefik; apps share data via FastAPI.

## Domain assignment

| Host | App | Notes |
|---|---|---|
| `weather.gd`, `www.weather.gd` | spicewx | public weather dashboard (root) |
| `api.weather.gd` | FastAPI | canonical public API host |
| `hurricane.weather.gd` | hurricaneplan | public docs |
| everything else | unchanged on `*.barrels.gd` | auth/admin/signal/shop/… + all staging |

Rule: **authenticated apps stay on barrels.gd** (session cookies cannot cross
registrable domains); weather.gd stays public/no-auth.

## Current blockers

- We do NOT control weather.gd DNS. It points at `34.206.237.50` (AWS) and
  serves the existing GMS WordPress site (checked 2026-07-11). Go-live requires
  access to the weather.gd registration/DNS, coordinated with whoever runs it.
- Flipping DNS takes the old WordPress site offline at that name — the DNS
  change is the launch button; spicewx content must be ready to replace it.

## Already prepared (dormant) in the repo

- Auth return-host allowlist accepts both domains: `EXTRA_RETURN_HOSTS=,.weather.gd`
  in `infra/docker/production.env` (new stack) and
  `AUTH_ALLOWED_RETURN_HOSTS: .barrels.gd,.weather.gd` in `docker-compose.prod.yml`
  (legacy stack). Leading-dot suffix matching implemented + tested in
  `apps/web/auth/src/lib/return-to.ts` (was an exact-match bug, fixed 2026-07-11).
- `BACKEND_CORS_ORIGINS` in `production.env` already includes the weather.gd origins.
- Traefik rules take dormant aliases: `${*_EXTRA_HOSTS_RULE:-}` interpolation in
  `docker-compose.deploy.yml`, with the cutover values commented in
  `production.env`. Legacy `docker-compose.prod.yml` carries equivalent
  commented replacement lines.

## Go-live steps (in order — DNS first, then labels)

1. Obtain DNS control. Record the old A records (rollback path).
2. If possible, lower TTL on existing weather.gd records to 300 the day before.
3. Point DNS at the prod droplet `134.122.119.220`:
   `weather.gd A`, `www.weather.gd A` (or CNAME), `api.weather.gd A`,
   `hurricane.weather.gd A` (or wildcard `*.weather.gd A`).
4. Verify from outside: `nslookup weather.gd` returns the droplet IP.
5. Uncomment the three `*_EXTRA_HOSTS_RULE` lines in
   `infra/docker/production.env` (double quotes required — they preserve the
   leading space in ` || Host(...)`). Legacy stack: apply the commented
   replacement rule lines in `docker-compose.prod.yml` instead.
6. Ship through the normal train (dev → staging → main, publish release).
   The deploy workflow's `docker compose config` validation gates syntax.
7. Verify: `curl -sI https://weather.gd` → spicewx with a valid certificate
   (Let's Encrypt issues on first traffic; DNS must already point here or
   issuance fails and retries — rate limit: 5 failed validations/hour).
   Also check `https://api.weather.gd/api/v1/utils/health-check/` → `true`.
8. Watch `docker compose logs proxy` for ACME errors on launch day.

Rollback: restore the old A records (back to `34.206.237.50`); the old site
returns as TTL expires. Optionally re-comment the rule vars at next release.

## Deferred / later

- Email from `@weather.gd` (SPF/DKIM/Resend domain verification) — separate task
  before anything sends as e.g. `cap@weather.gd`.
- `www.weather.gd` → `weather.gd` canonical redirect middleware (both are served
  initially; add a redirectregex middleware if SEO canonicalization matters).
- No staging environment for weather.gd hostnames — staging stays entirely on
  `*.staging.barrels.gd`.
