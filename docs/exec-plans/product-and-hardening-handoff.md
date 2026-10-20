# Product and hardening handoff

**Status:** Working plan  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-20

This is the product roadmap the owner agreed on 2026-10-20, followed by the
remaining platform-hardening work. Another agent picks it up. Each item says
what to build, where, how to prove it, and whether the owner must act first.
**Part A (products) comes first**; Part B (hardening) runs alongside when a
product item is blocked.

## Part A: Products

## Owner decisions (2026-10-20 quiz)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Next real pilot | **Babydoll Bookings go-live** |
| 2 | How Babydoll clients pay | Online deposits, eventually; **launch without them** (pay in salon) |
| 3–4 | Deposit provider | Owner has a **Stripe New Zealand** account; Stripe likely does not support Grenada businesses, and taking another business's money on it may break Stripe's terms. Owner will ask Stripe and contact **Republic Bank (ePay)**. Build provider-neutral; no live rail until one is approved in writing |
| 5 | Launch order | **Launch booking now**, deposits later per service |
| 6–7 | Where screens live | New app **`bookings.barrels.gd`**: `/{business}` public booking page for any tenant, `/studio` staff area on Barrels sign-in. Babydoll keeps `babydoll.barrels.gd/book`. One Bookings API behind every frontend |
| 8 | Who maintains services, prices, hours | **The business**, in `/studio` settings |
| 9–10 | Notifications | Email at launch (built). Then a **channel-neutral engagement platform**: WhatsApp first, then newsletter, CMS for business sites, social posting |
| 11 | Acuity data | **Fresh start**: no import; staff re-enter upcoming appointments |
| 12 | Next product after Babydoll + WhatsApp | **Events pilot** |
| 13 | Events pilot shape | **One or two small events first**, Spicemas 2027 later |

Not yet confirmed (recommended order after Events): Rewards organisation
admin UI (pairs with Bookings: a stamp per visit), Pay/Invoice online
collection (reuses the deposit provider), Barrels HR product, corporate hub
and control plane.

## A1. Babydoll Bookings go-live (Now)

API, deposits, public flow and `babydoll.barrels.gd/book` already exist
(`apps/api/fastapi/src/bookings/`, `apps/web/babydoll`, `BABYDOLL_ONLINE_BOOKING`
switch). Missing:

1. **Staff "create booking" endpoint**: org-zone `POST
   /bookings/org/bookings` (phone, walk-in and re-entered Acuity
   appointments), using the same overlap protection as public create; optional
   customer contact; audited; idempotent. Tests for overlap, permissions and
   key callers. Regenerate `openapi.json` and the client (`api-change` skill).
2. **New app `apps/web/bookings`** (`bookings.barrels.gd`; allocate a port in
   `docs/ports.md`; add to the deploy compose, release scope, CSP table,
   service catalogue and monitors; read `docs/playbooks/full-stack-feature.md`
   and the design lane spec first):
   - `/{slug}`: public booking flow (storefront → availability → details →
     confirm → manage link), Turnstile, honeypot and `Idempotency-Key`,
     the same as Babydoll's flow.
   - `/studio`: Barrels sign-in (`@barrelsgd/auth`), organisation selector,
     agenda (day and week), booking detail with confirm, decline, cancel,
     no-show and complete, and a "New booking" form (item 1).
   - `/studio/settings`: services (name, duration, price, deposit, buffer),
     providers, weekly hours, time off. The API exists (B1/B2 org routes);
     add any missing endpoints.
   - Extract the booking widgets into a shared package or `packages/ui`
     so `apps/web/babydoll` and `apps/web/bookings` render the same flow.
     A new workspace package needs owner OK (tsconfig/turbo).
3. **Production prerequisites**:
   - `ORG_SECRET_ENCRYPTION_KEYS` is set (needed for per-site Turnstile secrets).
   - Resend sends from a verified domain.
   - The 24-hour reminder cron runs on staging.
   - Babydoll's real services and durations replace the seeded guesses. The
     owner confirms them with the salon; the salon then maintains them in
     `/studio/settings`.
   - Checklist, verification commands and owner or agent split (A1.3):
     [babydoll-bookings-cutover.md](../operations/babydoll-bookings-cutover.md).
4. **Cutover runbook**: enable `BABYDOLL_ONLINE_BOOKING`, salon re-enters
   upcoming appointments in `/studio`, retire the Acuity link the same day,
   watch the first week's bookings and emails.
   - Runbook, week-one watch list and rollback (A1.4):
     [babydoll-bookings-cutover.md](../operations/babydoll-bookings-cutover.md#3-cutover-runbook).
5. **Deposits later**: keep `deposit_minor = 0` on every service until a
   provider is approved, then switch on per service.

## A2. Payment provider for Grenada (owner-led, then build)

- Owner: written answer from Stripe on whether the NZ account may take
  deposits for a Grenada business (likely only via Connect, which may not
  support Grenada); merchant agreement, API docs and sandbox credentials from
  Republic Bank ePay; accountant/legal sign-off on who is merchant of record.
- Agent, once docs and sandbox exist: a `republic_epay` provider in
  `src/payments/` implementing the existing `PaymentProvider` protocol
  (create, verify callback, refund, status) with signed-callback
  verification, tests against recorded sandbox responses, and per-organisation
  credentials via `src/utils/secret_box.py`. Same provider serves Events and
  Pay/Invoice later.

## A3. Engagement platform (after A1)

One channel-neutral "send this message to this person" service on the
platform outbox (`src/outbox.py`) with per-contact channel preference and
consent (`src/contacts`). Email is the first adapter (wrap the existing
notifications path). Then, in order:

1. **WhatsApp**: Meta Cloud API or Twilio. Business number, Meta business
   verification, approved templates (owner); booking confirmations and
   reminders first, then event tickets and alerts. Webhook for delivery status
   and opt-out; per-message cost tracking.
2. **Newsletter and campaigns**: organisation-scoped audiences from contacts
   with consent, compose and send via Resend, unsubscribe, basic open and
   click stats. Builds on `src/subscriptions`.
3. **CMS for business websites**: organisation-scoped Payload content so a
   business (Babydoll first) edits services, promos and gallery itself.
4. **Social posting**: schedule and post to Instagram and Facebook (Meta app
   review). Last; furthest from current code.

## A4. Events pilot (after A1 and A3.1)

Built: free, registration and paid tiers (test mode), checkout UI, admission,
settlement (`src/events`, `apps/web/events`). Pilot plan: one or two small
events with a trusted organiser, then Spicemas 2027.

1. Organiser onboarding and event setup reviewed end to end with the real
   organiser; fix gaps found.
2. Public event discovery page (listings by date and category).
3. Payments via the A2 provider; until then registration-only or the manual
   rail.
4. WhatsApp ticket delivery (A3.1) alongside email.
5. Door admission rehearsal on real phones, offline; settlement reconciled
   with the ledger after the event; write up evidence.

## Part B: Hardening

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
