# Hardening handoff

Owner: Barrels Grenada engineering
Last updated: 2026-10-20

This is the remaining platform-hardening work after the 2026-10-20 session.
The owner is focusing on features, so another agent picks this up. Each item
says what to build, where, how to prove it, and whether the owner must act
first. Work top to bottom inside each section; sections are roughly in
priority order.

## Rules for whoever picks this up

- One PR into `dev` per item. Never push to `dev`, `staging` or `main`
  directly. The owner merges `dev → staging` and `staging → main`.
- Run `pnpm verify:changed` before every push. Discard `pnpm-lock.yaml`
  churn from installs (`git checkout -- pnpm-lock.yaml`); never commit it.
- Deploy files (`infra/docker/docker-compose.deploy.yml`,
  `.github/workflows/deploy.yml`, `scripts/production/*`) are risk tier high:
  add or extend a compose-parsing test (pattern:
  `scripts/production/traefik-edge.test.mjs`, `internal-api-url.test.mjs`).
- Ask first for: new dependencies, `turbo.json`, `biome.jsonc`,
  `tsconfig*.json`, anything that needs a dashboard or a secret.
- Check `git fetch && git log origin/dev` before starting: other sessions
  merge into `dev` too.

## State at handoff

| Item | State |
| --- | --- |
| Merged to `dev` and promoted to staging (#447) | #437–#444, #446, #448, #449 |
| Staging deploy | Staging Pipeline run 98 started 19:27 UTC; confirm it went green |
| #450 quality-pass onto `dev` | Open, conflicts resolved; merge when CI green |
| #417, #418 Dependabot (Python) | Rebase requested; merge when green. #417 bumps pydantic-settings to 2.16 (behaviour changes): needs the full API suite green |
| #445 Traefik hardening | Green; **blocked on owner** adding three staging secrets (`STAGING_BASIC_AUTH_USERS`, `ADMINER_BASIC_AUTH_USERS`, `STAGING_PROBE_CREDENTIALS`). Merging without them stops every staging deploy at render-env |
| #387 GDAL 3.6 → 3.13 | Targets `main`, not `dev`; large native jump. Retarget to `dev` and test the weather/geonetcast images before merging, or close |

## 1. Land the open PRs

1. Merge #450, #418, #417 into `dev` when green (see table).
2. After the owner sets the staging secrets, merge `dev` into
   `harden/traefik-edge`, re-run `node --test scripts/production/*.test.mjs`,
   then merge #445. Before deploying: confirm the socket-proxy image digest
   with `docker buildx imagetools inspect tecnativa/docker-socket-proxy:v0.5.0`
   and that nothing uses host port `127.0.0.1:8080`.
3. Investigate Dependabot's `uv` "No solution found when resolving
   dependencies" error (Dependabot job on 2026-10-20). Find which update
   group fails and either pin or split the group in `.github/dependabot.yml`.

## 2. Follow-ups from merged work (repo-only, small)

1. **Sentry crons switch (from #446).** Forward `SENTRY_CRONS_ENABLED`
   (default `false`) and optionally `OUTBOX_STALE_MINUTES`,
   `OUTBOX_DEAD_WINDOW_HOURS`, `OUTBOX_ALERT_THRESHOLD` to the worker service
   in `infra/docker/docker-compose.deploy.yml`, the render path
   (`scripts/production/render-env.py` + test) and `deploy.yml`; update
   `docs/env.md`. Also reword the stale "Cold starts under ddtrace" comment in
   the compose file (ddtrace was removed). Do this after #445 merges (same file).
2. **Trusted proxy range (from #441).** Narrow uvicorn
   `--forwarded-allow-ips "*"` in `apps/api/fastapi/Dockerfile.prod` to the
   `grenmet` Docker network subnet; define the subnet explicitly in the
   compose `networks:` block so it is stable. Test: compose-parsing test that
   the subnet and the flag agree.
3. **Test email default.** `src/email_config.py` still defaults
   `EMAIL_TEST_USER` to `test@weather.gd`; move it to `test@example.com`
   (#448 moved every other fixture). Check `tests/conftest.py` users.
4. **Stale docs.**
   - Origin IPs remain in `docs/weather-gd-golive.md` and
     `docs/operations/provider-integrations.md`; replace with "see the
     DigitalOcean dashboard".
   - `docs/infrastructure.md` says "nine configured web services";
     recount from the deploy compose (web-cms may be the tenth).
   - `docs/exec-plans/barrels-foundations-plan.md` rows B3, B4, B6 and E6
     still read as unbuilt; check `src/bookings`, `apps/web/babydoll` and
     `src/events/order_payments.py`, then update.
   - `SESSION_COOKIE_DOMAIN` is still listed in per-app `turbo.json` files
     and the retired `docker-compose.{prod,staging}.yml` although ADR-0017
     removed it. Turbo files need owner OK (AGENTS.md "Ask first").
5. **Lint warning.** `findViolations` in
   `scripts/guardrails/check-boundaries.mjs` exceeds the complexity limit
   (warning only, from #450); split it once #450 is merged.

## 3. Cloudflare-ready edge (after #445)

All switchable and off by default; nothing changes until the owner flips a
variable. Owner decisions recorded 2026-10-20: Let's Encrypt via Cloudflare
DNS-01 with a zone-scoped token; dashboard over SSH tunnel; staging behind
basic auth now and Cloudflare Access later.

1. Second ACME resolver `cloudflare` (DNS-01, `CF_DNS_API_TOKEN`) selected by
   a variable; default stays TLS-ALPN. Wire through `deploy.yml`,
   `render-env.py` (+ test) and `docs/env.md`.
2. `--entrypoints.websecure.forwardedHeaders.trustedIPs` set to Cloudflare's
   IPv4/IPv6 ranges, applied only when the proxy variable is on. Check the
   list in as a file with a test and a documented refresh step.
3. Runbook `docs/operations/cloudflare-proxy-cutover.md`: create the token;
   staging first (explicit proxied records replacing `*.staging`, SSL
   Full (strict), test sign-in, a 25 MB upload and a PDF against Cloudflare's
   100 s / 100 MB limits); then production (explicit records replacing the
   `*.barrels.gd` wildcard); then a DigitalOcean Cloud Firewall allowing
   80/443 only from Cloudflare. Vercel records (`@`, `www`, `babydoll`,
   `elections`) stay DNS-only. Rollback: grey-cloud the record.
4. Same hardening for the weather host's own Traefik
   (`infra/weather/docker-compose.proxy.yml`): socket proxy, headers, JSON
   logs, timeouts. Deploys via `deploy-weather.yml`.

## 4. CSP rollout (after docs/signal show reports on staging)

#442 put CSP in Report-Only on `docs` and `signal`, built by
`packages/ui/src/lib/content-security-policy.ts` (`APP_SOURCES` table).

1. Static apps `mbia`, `elections`: add `APP_SOURCES` entries and
   `headers()` in `next.config.ts`; test the exact policy.
2. Dynamic apps `auth`, `admin`, `gmsdash`, `gaa-admin`: per-request nonce in
   `proxy.ts`; give `ThemeBootScript`
   (`packages/theme/src/components/theme-boot.tsx`) a `nonce` prop.
3. Edge-cached `gms`, `cap`, `events`, `cms`: non-nonce policy (cached HTML
   would replay a nonce). Payload admin may need `'unsafe-inline'`; test.
4. `apps/web/babydoll/vercel.json`: add a CSP.
5. Enforce per app only after 7 days, including a weekend, with no
   unexplained violations. Raise HSTS to one year after a clean week
   (separate PR; preload is an owner decision).

## 5. Domain auto-registration (ADR-0031, status Proposed)

Read `docs/adr/0031-self-registering-api-domains.md` first; the owner should
accept it before step 2.

1. Add the `Domain` manifest dataclass, an empty ordered list in
   `src/domains.py`, and golden snapshots: `app.openapi()` JSON, ordered
   routes with operationIds, `OPENAPI_TAGS` order, outbox topics,
   `sorted(Base.metadata.tables)`.
2. Loop over registered domains in `main.py` after the legacy includes;
   update `scripts/guardrails/check-blast-radius.mjs` exemptions if needed.
3. Pilot `webhooks_out`, then `contacts`. `openapi.json` must stay
   byte-identical (`pnpm check:drift`).
4. Derive `_TRACKED_SCHEMAS` and model imports in `alembic/env.py`, and the
   audit/notification registers in `src/database.py`, from manifests.
5. Worker manifests contribute functions, crons, startup and outbox modules;
   job functions stay importable from `src.worker.main`.
6. Migrate the rest in small batches; domains with their own engines
   (events, wxwatch, eregister) and `hr` last, after a spike.

## 6. Consolidation (one domain per PR; design first where noted)

1. Remove the legacy email drain once no rows use it (query in
   `src/worker/AGENTS.md`).
2. Move `billing.customer` and `bookings.customer` onto `contacts`.
3. Move Events' own outbox (`src/events/outbox.py`) onto the platform outbox.
4. Decouple `rewards` from Events' models.
5. Break the `baseline ↔ hr ↔ auth` import cycle (design note first).

## 7. Owner-blocked (prepare docs/config only; never flip)

| Item | Needs from owner | Runbook |
| --- | --- | --- |
| Restore drill first run | Read-only Spaces key in `production-backup`, off-peak dispatch | `docs/operations/restore-drill.md` |
| Backup gate to `enforce` | Read keys visible to the deploy job, `aws` CLI on runner, then set `DEPLOY_BACKUP_GATE=enforce` | `docs/operations/release-runbook.md` |
| Production monitors live | Better Stack plan check, `BETTERSTACK_API_TOKEN`, heartbeat URLs, apply | `docs/operations/analytics-monitoring.md` |
| Sentry release markers, crons, alert rules | `SENTRY_AUTH_TOKEN`, `SENTRY_CRONS_ENABLED`, alert rules | `docs/operations/analytics-monitoring.md`, `sentry-hardening.md` |
| 2FA on all accounts | Owner | `docs/operations/account-2fa-checklist.md` |
| Host hardening, DO Cloud Firewall | Droplet access | `docs/operations/host-hardening.md` |
| Domains and email (barrels.gd inbound via Microsoft 365, DMARC, CAA, DNSSEC; weather.gd, eugine.me) | DNS access | `docs/operations/domain-security.md` |
| Off-provider encrypted backups | Bucket choice and keys | — |
| Container memory/CPU limits | Droplet size and `docker stats` | — |
| Required checks (CodeQL, secret scan, code owners) | Ruleset change; note CodeQL `paths-ignore` would block docs-only PRs if required | `docs/security.md` |
| Privileged-user MFA enforcement | Rollout decision, `AUTH_TOTP_ENCRYPTION_KEYS` | — |
| LICENSE | Licence choice | — |
| Managed Postgres | Revisit before live card payments (24 h RPO accepted while testing) | — |
