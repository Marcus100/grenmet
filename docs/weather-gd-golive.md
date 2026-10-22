# weather.gd go-live runbook

**Status:** Superseded (2026-07-25)  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-10-21

> **Superseded on 2026-07-25** by the
> [Barrels Grenada Migration Plan](exec-plans/barrelsgd-migration-plan.md).
> Two assignments below are no longer correct: `api.barrels.gd` is the canonical
> API host, not `api.weather.gd`; and Hurricane Plan folds into GMS `/sops`
> rather than serving from `hurricane.weather.gd`. GMS goes live on
> `weather.barrels.gd`, which `weather.gd` later masks as the public GMS face.
> The cookie constraint recorded here still holds and is carried forward:
> authenticated surfaces cannot span registrable domains, so `/admin`,
> `/signin`, and `/auth/*` stay canonical on `*.barrels.gd`. Keep this file for
> the DNS blocker history and the WordPress coordination notes.

Decision (2026-07-11): `weather.gd` and `barrels.gd` **coexist** — no cutover of
the whole stack. `weather.gd` is the public Met Service face; `barrels.gd` keeps
auth, admin, staging, ops tools, and the non-GMS apps. Both domains are served
by the same production droplet and Traefik; apps share data via FastAPI.

## Domain assignment

| Host | App | Notes |
|---|---|---|
| `weather.gd`, `www.weather.gd` | gms | public weather dashboard (root) |
| `api.weather.gd` | FastAPI | canonical public API host |
| `hurricane.weather.gd` | docs | public docs |
| everything else | unchanged on `*.barrels.gd` | auth/admin/signal/shop/… + all staging |

Rule: **authenticated apps stay on barrels.gd** (session cookies cannot cross
registrable domains); weather.gd stays public/no-auth.

## Current blockers

- We do NOT control weather.gd DNS. It pointed at `34.206.237.50` (AWS, last seen
  2026-07-11; third party's public record, re-check in step 1) and
  serves the existing GMS WordPress site (checked 2026-07-11). Go-live requires
  access to the weather.gd registration/DNS, coordinated with whoever runs it.
- Flipping DNS takes the old WordPress site offline at that name — the DNS
  change is the launch button; gms content must be ready to replace it.

## Already prepared (dormant) in the repo

Verified against `infra/docker/production.env` and `docker-compose.deploy.yml`
on 2026-10-21; an earlier version of this section claimed more than exists.

- Auth return-host allowlist: `docker-compose.deploy.yml` passes
  `AUTH_ALLOWED_RETURN_HOSTS: .${BASE_DOMAIN}${EXTRA_RETURN_HOSTS:-}` to auth,
  docs and gms. `EXTRA_RETURN_HOSTS` is **not set** in `production.env`, so
  `.weather.gd` is not accepted yet; add `EXTRA_RETURN_HOSTS=,.weather.gd` at
  cutover. Leading-dot suffix matching is implemented in
  `apps/web/auth/src/lib/return-to.ts`. ADR-0043 plans to replace suffix rules
  with exact origins, so the cutover would then list exact `weather.gd` origins.
- `BACKEND_CORS_ORIGINS` in `production.env` has **no** `weather.gd` origins
  (only `*.barrels.gd`); add them at cutover.
- Traefik alias hook: only the API router has it
  (`${API_EXTRA_HOSTS_RULE:-}` in `docker-compose.deploy.yml`). There is no
  `*_EXTRA_HOSTS_RULE` for gms or docs, and `production.env` carries no
  commented cutover values; for `weather.gd` itself, the gms router needs a
  new alias line.
- The legacy `docker-compose.prod.yml` carries `.barrels.gd,.weather.gd` return
  hosts and commented replacement rule lines for its old services
  (hurricaneplan, spicewx); they do not map onto the current stack.

## Go-live steps (in order — DNS first, then labels)

1. Obtain DNS control. Record the old A records (rollback path).
2. If possible, lower TTL on existing weather.gd records to 300 the day before.
3. Point DNS at the prod droplet (IP: see the DigitalOcean dashboard):
   `weather.gd A`, `www.weather.gd A` (or CNAME), `api.weather.gd A`,
   `hurricane.weather.gd A` (or wildcard `*.weather.gd A`).
4. Verify from outside: `nslookup weather.gd` returns the droplet IP.
5. Set ``API_EXTRA_HOSTS_RULE=" || Host(`api.weather.gd`)"`` (double quotes
   required to keep the leading space), `EXTRA_RETURN_HOSTS` and the CORS
   origins in `infra/docker/production.env`, and add a `weather.gd` alias to
   the gms router in `docker-compose.deploy.yml`. The legacy stack is not
   the target.
6. Ship through the normal train (dev → staging → main, publish release).
   The deploy workflow's `docker compose config` validation gates syntax.
7. Verify: `curl -sI https://weather.gd` → gms with a valid certificate
   (Let's Encrypt issues on first traffic; DNS must already point here or
   issuance fails and retries — rate limit: 5 failed validations/hour).
   Also check `https://api.weather.gd/api/v1/utils/health-check/` → `true`.
8. Watch `docker compose logs proxy` for ACME errors on launch day.

Rollback: restore the old A records (recorded in step 1; last seen 2026-07-11: `34.206.237.50`); the old site
returns as TTL expires. Optionally re-comment the rule vars at next release.

## Deferred / later

- Email from `@weather.gd` (SPF/DKIM/Resend domain verification) — separate task
  before anything sends as e.g. `cap@weather.gd`.
- `www.weather.gd` → `weather.gd` canonical redirect middleware (both are served
  initially; add a redirectregex middleware if SEO canonicalization matters).
- No staging environment for weather.gd hostnames — staging stays entirely on
  `*.staging.barrels.gd`.
