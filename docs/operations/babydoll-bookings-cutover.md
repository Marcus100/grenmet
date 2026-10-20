# Babydoll bookings cutover

**Status:** Active runbook; not yet executed  
**Owner:** Barrels Grenada engineering (client decisions: Babydoll Beauty Bar owner)  
**Last updated:** 2026-10-20

This runbook moves Babydoll Beauty Bar from its Acuity booking link to Barrels
Bookings (`babydoll.barrels.gd/book`). It is the checklist for handoff items
A1.3 and A1.4 in [product-and-hardening-handoff.md](../exec-plans/product-and-hardening-handoff.md).
Nothing here has been run. The switch stays off, the seed has not been run in
any environment by this document, and no secret has been written.

**Legend.** Each step is marked **Agent can do** (an agent can run it from the
repository or with read-only access, or write code through a normal PR) or
**Owner-blocked** (needs a person with the secret, dashboard, client or provider
account, or a decision). Production writes, merges to `main`, and anything in
the "Ask first" list of `AGENTS.md` still need the owner's explicit go, even
when marked Agent can do.

## Gaps found while writing this (read first)

These were checked against `origin/dev` on 2026-10-20 and change the cutover
order:

1. **Salon re-entry is blocked.** `POST /bookings/org/bookings` is not on dev
   (the org routes end at `POST /org/bookings/{id}/complete`). The `apps/web/bookings`
   app (the `/studio` agenda and "New booking" form) does not exist. Until both
   land, the salon cannot re-enter upcoming appointments.
2. **Confirmation is API-only.** The seed sets `requires_confirmation=True`, so
   every public booking starts `pending`. Confirming needs
   `POST /bookings/org/bookings/{id}/confirm` with a member session or an API key.
   The owner chooses: keep confirmation (and confirm through the API until
   `/studio` exists) or set it to false in the profile before go-live.
3. **Retiring Acuity is a code change too.** The BookBar, service menu and header
   still link to `BOOKING_URL` (`https://babydollgnd.as.me`) in
   `apps/web/babydoll/src/data/site.ts` and its components. Switching
   `BABYDOLL_ONLINE_BOOKING` only changes `/book`. The links must point at `/book`
   (see `apps/web/babydoll/AGENTS.md`, "Not yet").
4. **`EMAIL_HASH_PEPPER` is a hard prerequisite for public booking**, not only
   for subscriptions. The seed grants the `contacts` entitlement. On a public
   create, `public._link_contact` calls `contacts.service.upsert_contact`, which
   calls `hash_email`. A missing pepper raises `EmailHashPepperMissingError`
   (a `RuntimeError`). `_link_contact` catches only `SQLAlchemyError`, so the
   create would fail rather than proceed unlinked. Read from the code; confirm
   on staging before production (see 1f).
5. **Turnstile is off** in staging and production (SESSION_LOG, 2026-10-19).
   Public create is protected by the honeypot and rate limits only. Expect
   more spam in week one.
6. **Currency is unconfirmed.** The seed stores XCD (`currency="XCD"`). The
   site shows `$`, and the SESSION_LOG lists currency as open with the client.
7. **Two booking jobs are not in Redis telemetry.** The `JOBS` set in
   `src/operational_metrics.py` lists only four jobs. Neither
   `enqueue_booking_reminders` nor `expire_unpaid_bookings` appears there, and
   neither is wrapped in Sentry cron `@monitored`. Worker logs are the only
   runtime signal (see 1c).
8. **Babydoll's web app has no Sentry** (`apps/web/babydoll/AGENTS.md`, and
   `analytics-monitoring.md`). Customer-side errors surface only as failed API
   calls.

## 1. Production prerequisites

| # | Prerequisite | Verify | Who |
| --- | --- | --- | --- |
| a | `ORG_SECRET_ENCRYPTION_KEYS` set in production and staging | `gh secret list --env production` (names only) | Owner-blocked (set); Agent can do (presence check) |
| b | Resend sends from a verified domain (`barrels.gd`) | Resend dashboard, Domains; optional read-only API check | Owner-blocked |
| c | `enqueue_booking_reminders` (:07) and `expire_unpaid_bookings` (every 5 min) registered and running on staging, then production | Static grep; worker logs; read-only SQL | Agent can do (grep, once host access exists); Owner-blocked (host SSH) |
| d | `BABYDOLL_ONLINE_BOOKING` semantics and Vercel setting | Read `src/env.ts`; `curl -I` on `/book` after the flip | Agent can do (read, curl); Owner-blocked (Vercel) |
| e | Seed run in production; services confirmed | `--dry-run` output; `GET /api/v1/bookings/public/babydoll-beauty-bar` | Owner-blocked (confirm with salon, run seed); Agent can do (run dry-run with owner go) |
| f | `EMAIL_HASH_PEPPER` set in production | `gh secret list --env production`; staging test booking | Owner-blocked (set); Agent can do (presence, staging test with owner go) |

### 1a. `ORG_SECRET_ENCRYPTION_KEYS`

**What it does.** A JSON array of Fernet keys. The first key encrypts; every
key decrypts. It protects organisation secrets: per-site Turnstile secrets
(`src/organisations/sites.py`), webhook endpoint secrets
(`src/webhooks_out/service.py`), and rewards venue secrets. The key is read
through `src/utils/secret_box.py` and `src/organisations/config.py`.

**Pipeline.** GitHub environment secret, read in `.github/workflows/deploy.yml`
(line 99), validated and rendered by `scripts/production/render-env.py` (line
71), and passed to `prestart`, `api`, `worker` and `nhc-worker` in
`infra/docker/docker-compose.deploy.yml` (lines 104, 150, 300, 389). Web apps
never receive it.

**Important nuance.** Babydoll's public booking path does not use `secret_box`.
The key matters for Babydoll only when per-site Turnstile is switched on (the
owner step after launch). Without it, the Turnstile admin save returns 503.
Treat it as a prerequisite for the platform, not a blocker for the first
booking, unless Turnstile is turned on at the same time.

**Verify (read-only).**

```bash
gh secret list --env production -R Marcus100/grenmet
gh secret list --env staging -R Marcus100/grenmet
```

These show names and update dates, never values. An empty value passes
`render-env.py` (empty is allowed there) but fails at runtime (`SecretBoxError`).
The repository cannot show whether the stored value is a valid non-empty array.
The owner confirms that from the password manager copy.

**Generate and store (owner; the key is never printed).** Run this on a machine
with `cryptography` installed, in a directory only the owner can read:

```bash
umask 077
python3 -c 'import json; from cryptography.fernet import Fernet; print(json.dumps([Fernet.generate_key().decode()]))' | tr -d '\n' > ~/org-secret-keys-production.json
gh secret set ORG_SECRET_ENCRYPTION_KEYS --env production -R Marcus100/grenmet < ~/org-secret-keys-production.json
# Copy the file into the password manager now, then delete the local copy:
shred -u ~/org-secret-keys-production.json
```

Use a separate key for staging (repeat with `--env staging`). Do not reuse
`AUTH_TOTP_ENCRYPTION_KEYS` or `SECRET_KEY`.

**Rotation (owner).** Put the new key first and keep the old one after it. Deploy.
Re-save every stored secret (each Turnstile secret re-encrypts under the first
key) until none depends on the old key. Then remove the old key in a later
deploy. Losing every key makes stored secrets unreadable, so keep the password
manager copy.

### 1b. Resend sends from a verified domain

**Sender config.** `apps/api/fastapi/src/email_config.py` reads
`EMAILS_FROM_EMAIL` (required) and `EMAILS_FROM_NAME` (defaults to the project
name). `apps/api/fastapi/src/email.py` builds `Name <address>`. Emails are
enabled only when both `EMAILS_FROM_EMAIL` and `RESEND_API_KEY` are set
(`emails_enabled`). Production and staging both use `noreply@barrels.gd`
(`infra/docker/production.env` line 36, `infra/docker/staging.env` line 37).
`docker-compose.deploy.yml` line 419 (`cms-migrate`) makes `EMAILS_FROM_EMAIL` mandatory at deploy time.
Provider context: `docs/operations/provider-integrations.md` (Resend uses an
existing verified sending domain and a restricted sending key).

**Verify.**

- Owner: Resend dashboard, Domains. `barrels.gd` must show verified (SPF and
  DKIM). Confirm the runtime `RESEND_API_KEY` is restricted to sending.
- Optional, read-only: `GET https://api.resend.com/domains` with the management
  key `RESEND_READ_TOKEN`. Never use the runtime sending key for this.
- Behaviour check: after the first real booking, the `platform.outbox` row for
  `booking-confirmation:<id>` should reach `done`. A row stuck in `pending` with
  a `last_error` means sending is not working.

**Who.** Owner-blocked (dashboard and any management key).

### 1c. Reminder and expiry crons

**Registration (code).**

- `apps/api/fastapi/src/worker/main.py` line 605:
  `cron(enqueue_booking_reminders, minute={7}, run_at_startup=False)`. Hourly at
  :07. Queues `booking-reminder:<id>` for confirmed bookings starting within 24
  hours.
- Lines 608-611: `cron(expire_unpaid_bookings, minute=set(range(2, 60, 5)), ...)`.
  Every 5 minutes (:02, :07, :12, ...). Cancels `pending_payment` holds older
  than `BOOKINGS_DEPOSIT_HOLD_MINUTES` (default 30).
- Both are in `WorkerSettings.functions` (lines 561-562). The worker runs
  `arq src.worker.main.WorkerSettings` (service `worker` in
  `infra/docker/docker-compose.deploy.yml`, line 270). Its `startup` imports
  `src.bookings.reminders` and `src.bookings.outbox_handlers`, so a broken import
  stops the worker from starting.

**Verify, static (Agent can do, now).**

```bash
cd apps/api/fastapi && grep -n "enqueue_booking_reminders\|expire_unpaid_bookings" src/worker/main.py
```

**Verify, on the host (read-only; Owner-blocked for SSH, then Agent can run it).**

```bash
docker compose -p grenmet-staging ps worker
docker compose -p grenmet-staging logs worker --since 2h | grep -E "enqueue_booking_reminders|expire_unpaid_bookings"
docker compose -p grenmet-staging logs worker --since 2h | grep -iE "traceback|failed" | head
```

Use `grenmet` for production. Expected in each two-hour window: about 24
`expire_unpaid_bookings` runs and 2 `enqueue_booking_reminders` runs, with no
traceback naming either job. **The exact arq log line format is not confirmed
here.** The first staging run should copy one real success line and one real
failure line into this section.

**Database evidence (read-only, owner runs `psql` on the database host).**

- Reminders: `platform.outbox` rows with `dedupe_key LIKE 'booking-reminder:%'`
  for confirmed bookings starting within 24 hours, at most one per booking.
- Expiry: no `bookings.booking` row in `pending_payment` older than 30 minutes
  while `deposit_minor = 0` everywhere (section 4 keeps it at zero).

**Gap.** Neither job appears in Redis telemetry (`JOBS`) or Sentry cron
monitors. Adding both is a small follow-up PR (Agent can do; owner merges).

### 1d. `BABYDOLL_ONLINE_BOOKING` switch

**Semantics (code).** `apps/web/babydoll/src/env.ts` is the only place that
reads `process.env`. The value is trimmed and lower-cased. Only `on` enables
it. Anything else, including unset, is `off`.

- Off (default): `/book` redirects to `BOOKING_URL` (Acuity) and calls nothing.
- On: `/book` (`src/app/book/page.tsx`, `force-dynamic`) shows the booking flow.
  It also redirects to Acuity if the studio's public booking page answers 404
  (for example, before the seed). A missing seed therefore fails safe.
- `/booking/[token]` works whatever the switch says, so existing manage links
  keep working.

**Also set on Vercel (Production).** `BABYDOLL_API_URL` must be the production
API origin, `https://api.barrels.gd` (see `docs/operations/domain-configuration.md`).
The default in `env.ts` is `http://localhost:8000`, which is wrong on Vercel.
`BABYDOLL_BOOKING_SLUG` defaults to `babydoll-beauty-bar`, which matches the seed.
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` stays empty while Turnstile is off.

**Where to flip.** Vercel project `babydoll-beauty-bar` (production only; there is
no staging for this site). Settings, Environment Variables, Production: set
`BABYDOLL_ONLINE_BOOKING=on`, then redeploy, because env changes apply to new
deployments. The Vercel connector can do this, but **do not call it from this
runbook**; use the dashboard, or the connector only with the owner's explicit go.

**Verify (read-only, Agent can do after the flip).**

```bash
curl -sI https://babydoll.barrels.gd/book | head -5
```

With the switch on, expect `200`. With it off, expect a redirect whose
`Location` is `https://babydollgnd.as.me`.

**Rollback.** Set the variable to `off` (or delete it) and redeploy. The page
redirects to Acuity again. Existing bookings are not deleted.

### 1e. Seed, services and durations

**Command.** From `apps/api/fastapi`, in a shell with the production image
(`PATH` includes `/app/.venv/bin`, per `Dockerfile.prod`):

```bash
docker compose -p grenmet exec api python -m src.bookings.seed --dry-run
docker compose -p grenmet exec api python -m src.bookings.seed
```

`--dry-run` prints the JSON of what would be created and rolls back. The real
run is create-only and idempotent. It creates the `babydoll` organisation, the
`bookings` and `contacts` entitlements, the profile `babydoll-beauty-bar`
(`requires_confirmation=True`, 24-hour lead time, 60-day horizon, 30-minute
slots), 14 services, provider "Jeriann" with the published hours, and the
`babydoll` public site. It grants no `payments` entitlement, so deposits stay a
no-op even if a deposit is set.

**The seed's durations are guesses.** The site publishes no durations. The
services and the confirmed values go in section 2. Prices in the seed are whole
XCD and mirror `SERVICE_MENU`; currency is still open with the client (gap 6).

**After the seed.** The salon maintains services, prices, hours and time off in
`/studio/settings`. **That page is not built** (`apps/web/bookings` does not
exist). Until it is, the owner edits through the organisation API with a
`bookings.write` API key, or asks an agent to make the change. Creating keys is
an organisation admin action.

**Verify.** `GET https://api.barrels.gd/api/v1/bookings/public/babydoll-beauty-bar`
returns the storefront (200) once seeded and 404 before (the same 404 for
unknown and disabled profiles, by design).

**Who.** Owner-blocked (confirm services with the salon; run the real seed).
Agent can do the dry-run with the owner's go.

### 1f. `EMAIL_HASH_PEPPER` (from SESSION_LOG)

- SESSION_LOG 2026-10-19 15:05 said the pepper was set for staging only and
  production had to be set before release.
- SESSION_LOG 2026-10-19 23:59 says it "is now set in production".
- The repository reads it in `src/config.py` (line 73, default empty) and
  `src/utils/email_hash.py`. Empty elsewhere than `ENVIRONMENT=local` raises
  `EmailHashPepperMissingError`. Deploy wiring: `.github/workflows/deploy.yml`
  line 151 and `docker-compose.deploy.yml` lines 110, 202, 313.
- It matters for bookings through the `contacts` link (gap 4).
- The value must be single-line and must never be reused as `SECRET_KEY`.
  Rotating or losing it makes stored hashes unmatchable. Keep a copy with the
  other backed-up secrets.

**Verify.**

```bash
gh secret list --env production -R Marcus100/grenmet | grep EMAIL_HASH_PEPPER
gh secret list --env staging -R Marcus100/grenmet | grep EMAIL_HASH_PEPPER
```

Then, on staging with the seed applied, create one test booking with a test
customer and confirm it returns 201 (not 500). Cancel it afterwards. This is
the only way to confirm gap 4 in practice.

**Who.** Owner-blocked (set and confirm the production value); Agent can do the
presence check and, with the owner's go, the staging test.

## 2. Seeded services (confirm with the salon)

Source: `apps/api/fastapi/src/bookings/seed.py` (`_MENU`) and
`apps/web/babydoll/src/data/site.ts` (`SERVICE_MENU`). Minutes are the seed's
assumptions. Prices are XCD in the seed and `$` on the site, pending the
currency answer. Fill the last three columns with the salon.

| # | Category | Service | Seeded min | Seeded price (XCD) | Site note | Confirmed duration (min) | Confirmed buffer (min) | Confirmed price | Salon confirmed (initials, date) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Lashes | Luxe Classic | 120 | 210 | Consultation required | | | | |
| 2 | Lashes | Hybrid | 135 | 225 | | | | | |
| 3 | Lashes | Volume | 150 | 245 | | | | | |
| 4 | Lashes | Lash touch-up | 45 | 65 | At one week | | | | |
| 5 | Lashes | Refill, 2–3 weeks | 90 | 130 | Book while 40%+ of extensions remain | | | | |
| 6 | Lashes | Professional removal | 30 | 45 | | | | | |
| 7 | Brows | Signature brow sculpt & wax | 30 | 40 | | | | | |
| 8 | Brows | Hybrid brow tint / stain | 30 | 60 | | | | | |
| 9 | Brows | Hybrid brow tint & wax | 45 | 100 | | | | | |
| 10 | Brows | Brow lamination | 75 | 180 | | | | | |
| 11 | Brows | Lamination maintenance | 45 | 100 | At 2–3 weeks | | | | |
| 12 | Facials & waxing | Custom facial | 75 | 180 | | | | | |
| 13 | Facials & waxing | Upper lip | 15 | 15 | | | | | |
| 14 | Facials & waxing | Chin | 15 | 25 | | | | | |

**Not seeded (owner decision).** Add-ons are booked with another service and
are left out of the seed: "Deluxe brow add-on" (50) and "Brow treatment add-on"
(20). The "Consultation" fee (`CONSULTATION_PRICE` = 50) is not a bookable
service. Decide whether either becomes a service before go-live.

**Also confirm with the salon.** Provider hours (Mon–Fri 09:30–17:30, Sat
09:00–17:30, from the site), whether the salon wants `requires_confirmation`
(gap 2), the 24-hour cancellation cutoff, and the 24-hour lead time.

## 3. Cutover runbook

Run in order. Stop at the first failed gate and do not continue.

### 3.0 Go / no-go gate

- [ ] Section 1 items a to f verified and recorded. **Owner-blocked** (decision and sign-off).
- [ ] Staff "New booking" endpoint `POST /bookings/org/bookings` merged and deployed to production. **Agent can do** (separate PR, with the `api-change` skill: OpenAPI and client regenerated, overlap tests). **Owner-blocked** to merge to `main`.
- [ ] Salon re-entry path available. `/studio` is not built, so the interim is the owner or an agent calling the endpoint for each upcoming appointment. **Owner-blocked** (decide the interim).
- [ ] Services and durations confirmed (section 2). **Owner-blocked** (salon).
- [ ] Currency confirmed. **Owner-blocked** (client).
- [ ] Repoint PR merged (step 3.3). **Agent can do** (code); **Owner-blocked** to release.
- [ ] Cutover date and time chosen, with a quiet window. **Owner-blocked.**

### 3.1 Seed production

- [ ] `--dry-run` reviewed; then the real seed. **Owner-blocked** (run on the host); **Agent can do** the dry run with the owner's go.
- [ ] `GET /api/v1/bookings/public/babydoll-beauty-bar` returns 200. **Agent can do** (read-only).

### 3.2 Smoke test with the switch still off

- [ ] `curl -sI https://babydoll.barrels.gd/book` shows the Acuity redirect. **Agent can do.**

### 3.3 Repoint the Acuity links to `/book` (code)

- [ ] BookBar, service menu, header and any other `BOOKING_URL` links point at `/book`, with tests updated (`apps/web/babydoll`, `pnpm vitest run`). **Agent can do** (PR into `dev`; owner merges and promotes).
- [ ] Keep `BOOKING_URL` as the fallback for `/book` when the switch is off. Do not delete it.

### 3.4 Enable the switch

- [ ] Set `BABYDOLL_ONLINE_BOOKING=on` and `BABYDOLL_API_URL=https://api.barrels.gd` on Vercel production; redeploy. **Owner-blocked** (dashboard, or the connector with explicit go).
- [ ] `curl -sI https://babydoll.barrels.gd/book` shows `200`. **Agent can do.**

### 3.5 Test booking

- [ ] Create one test booking with a test customer (the owner's own details, note "TEST"), check the confirmation email arrives, open the manage link, download the ICS, then cancel. **Owner-blocked** (writes production data; the owner performs or approves each step).
- [ ] Check `platform.outbox` for the test booking's emails reaching `done`. **Agent can do** (read-only, with host access).

### 3.6 Salon re-enters upcoming appointments

- [ ] The salon enters every upcoming Acuity appointment through the staff form (or the interim path in 3.0). Acuity data is a fresh start: no import. **Owner-blocked** (salon work).
- [ ] Each entered booking is `pending` or `confirmed` as the profile says. Confirm the pending ones through `POST /bookings/org/bookings/{id}/confirm`, or through `/studio` when built. **Owner-blocked** (decision); **Agent can do** (API calls with an API key, owner go).

### 3.7 Retire the Acuity link (same day)

- [ ] Code: any remaining Acuity link removed (the constant may stay for the redirect fallback). **Agent can do** (PR).
- [ ] Acuity: turn off online booking on the `babydollgnd` page, or put a notice pointing to `https://babydoll.barrels.gd/book`. **Owner-blocked** (Acuity account).
- [ ] The salon tells clients (Instagram DM, in-salon). **Owner-blocked.**

### 3.8 Week-one watch list

Check each morning for seven days. Read-only queries; the owner runs `psql`
on the database host, and an agent can write the queries and summarise results.

| What | How | Act if |
| --- | --- | --- |
| Bookings per day, by status | `bookings.booking` grouped by status and created day | No bookings after the second day, or a sudden spike (spam; see 5 in gaps) |
| Emails | `platform.outbox` with `topic = 'email.send'` and `dedupe_key LIKE 'booking-%'`, grouped by `status`; show `last_error` for anything not `done` | Any `failed` or stuck `pending` older than 15 minutes; check 1b |
| Reminder sends | `dedupe_key LIKE 'booking-reminder:%'` vs confirmed bookings starting within 24 hours | Count differs by more than one per booking, or none at all |
| Worker | `docker compose -p grenmet logs worker --since 24h` for the two job names | Traceback naming either job |
| Sentry (API and worker projects) | Issues mentioning `bookings` or `src/bookings` | Any new issue on the public create or manage routes |
| Public API errors | 5xx on `/api/v1/bookings/public/*` in API logs | More than a handful in a day |
| Double bookings | Should be impossible (exclusion constraint); a 409 is correct | Any two confirmed bookings overlapping for one provider |
| Acuity | Acuity dashboard: no new appointments after retirement | New appointments appearing |
| Customer messages | Salon inbox and Instagram DMs | Complaints about slots, emails or the manage link |

Babydoll's web app has no Sentry. Customer-side errors show only through API
failures and the page's `error.tsx`, so ask the salon directly.

### 3.9 Rollback

Trigger on any of: sustained 5xx on the public create, emails dead-lettered or
stuck, a booking the salon cannot find, or a customer who cannot pay or book.

1. Set `BABYDOLL_ONLINE_BOOKING=off` on Vercel production and redeploy. `/book`
   redirects to Acuity. **Owner-blocked** (or the connector with explicit go).
2. Re-open the Acuity page (3.7). **Owner-blocked.**
3. Restore the BookBar and other links only if they were repointed (revert the
   3.3 PR, through the normal `dev` merge). **Agent can do** (PR); **Owner-blocked** to merge.
4. Do not delete bookings. Reconcile anything booked in the new flow into Acuity
   by hand, and tell the salon. **Owner-blocked** (salon) with **Agent can do**
   (list of bookings created since cutover, read-only).
5. Manage links in emails still work with the switch off, because `/booking/[token]`
   ignores the switch.

## 4. Deposits later

Keep `deposit_minor = 0` on every service until a payment provider is approved in
writing (A2 in the handoff). The seed already sets zero. Today a deposit only
applies when the organisation holds the `payments` entitlement, which the seed
does not grant, so a non-zero value is a no-op for Babydoll. The manual provider
exists in code (`src/payments/providers/manual.py`) and would let the studio
record bank or cash deposits. That is an owner decision, not a default. Keep
zero unless the owner decides otherwise in writing.

**Per-service switch-on steps (when a provider is approved).**

1. Owner: written approval from the provider (Stripe or Republic Bank ePay) for
   taking deposits for a Grenada business. **Owner-blocked.**
2. Agent: the provider adapter in `src/payments/` with signed-callback tests
   (A2). **Agent can do** (once docs and sandbox exist).
3. Owner: per-organisation credentials in place (secret store, not `.env`). **Owner-blocked.**
4. Owner: grant the `payments` entitlement to `babydoll`. **Owner-blocked** (admin).
5. Owner: set `deposit_minor` on one service only (for example, Luxe Classic)
   through the organisation API or `/studio/settings`. **Owner-blocked** (decision);
   **Agent can do** (API call, with the owner's go).
6. Verify with a staging test booking: status `pending_payment`, a payment intent
   created, the slot held, the booking confirmed when paid, and expired after 30
   minutes if unpaid. **Agent can do** on staging.
7. Repeat per service only after a week of clean bookings on the previous step.

## 5. What this document did not verify

- The arq log line format and whether the worker runs in production today. Only
  the code registration was read.
- Whether production `ORG_SECRET_ENCRYPTION_KEYS` is a valid non-empty array
  (only presence is checkable, and only by the owner).
- Whether the Resend domain is verified (dashboard only).
- Whether `EMAIL_HASH_PEPPER` is set in production today (SESSION_LOG conflicts
  with the earlier entry) and whether a public create returns 500 without it.
  Read from code; not run.
- Whether the production API is serving the bookings routes at
  `https://api.barrels.gd/api/v1/bookings/...`. The prefix is `settings.API_V1_STR`
  (`src/main.py` line 455); the value was not read.
- Whether the Vercel project's env vars match this document. The Vercel connector
  was not called, by design.
- Whether the CI suite for the bookings tests passes on dev. Not run here.
