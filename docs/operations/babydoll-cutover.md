# Babydoll cutover: checklist and test plan

**Status:** Draft checklist; nothing here has been run  
**Owner:** Barrels Grenada engineering (client decisions: Babydoll Beauty Bar owner)  
**Last updated:** 2026-10-22

This is the go-live checklist and test plan for moving Babydoll Beauty Bar's
booking from its Acuity link onto Barrels Bookings in production. It builds on
[babydoll-bookings-cutover.md](babydoll-bookings-cutover.md) (written 2026-10-20),
which holds the long-form detail for the platform prerequisites
(`ORG_SECRET_ENCRYPTION_KEYS`, Resend, reminder crons, `EMAIL_HASH_PEPPER`) and
the per-service confirmation table. Since that runbook was written the staff
booking form (`POST /bookings/org/bookings`) and the studio screens
(`apps/web/bookings`: agenda, booking detail, settings for profile, services,
providers and hours) have landed on `dev`, and the Book links already follow the
`BABYDOLL_ONLINE_BOOKING` switch (`apps/web/babydoll/AGENTS.md`). Treat that
runbook's "Gaps found" 1 and 3 as stale and re-check them at the go/no-go gate.

Marks: **[agent]** an agent can do it from the repo or read-only access;
**[owner]** needs the owner's secret, dashboard, client decision or an explicit go.
Production writes, merges to `main` and deploys always need the owner's go.

## 0. What changes for customers

Today every Book button opens Acuity (`babydollgnd.as.me`). After cutover, with
`BABYDOLL_ONLINE_BOOKING=on`, every Book button opens `babydoll.barrels.gd/book`
(service, slot, details, optional email-code step, manage link by email).
`/booking/[token]` always works, switch or not. `/book` falls back to Acuity if
the studio profile is missing or disabled (404), so a missing seed fails safe.

## 1. Prerequisites (all must be true before the staging dry-run is trusted)

| # | Prerequisite | How to verify | Who |
| --- | --- | --- | --- |
| 1 | `TRUSTED_WEB_SECRET` of at least 32 characters on the **Babydoll Vercel project**, equal to the API's value. Babydoll's env validation (`src/env.ts`) throws below 32; the API ignores a short value and logs a warning, so every visitor then shares one rate-limit bucket (the Vercel server's). | Vercel dashboard names only; API startup log must not show the "shorter than 32" warning | [owner] set; [agent] check the log |
| 2 | **The API container receives `TRUSTED_WEB_SECRET`.** `src/config.py` defines it and `docs/env.md` says to set it for the API, but a search of `.github/`, `infra/` and `scripts/production/` finds no deploy wiring for it. See open question Q1. | `grep -rn TRUSTED_WEB_SECRET .github infra scripts/production`; `docker compose -p grenmet exec api printenv TRUSTED_WEB_SECRET \| wc -c` (length only, never print) | [agent] check; [owner] set |
| 3 | `VISITOR_IP_PROXY_HOPS` on the Babydoll Vercel project. Default 1 (right-most `x-forwarded-for` entry). Vercel appends the client address itself; whether 1 is right for `babydoll.barrels.gd` behind Vercel is not confirmed here (Q2). Wrong values rate-limit by the wrong address, or let a visitor choose their own bucket. | Test from two networks on staging-like traffic; compare the `X-Visitor-IP` the API sees | [agent] test plan; [owner] value |
| 4 | Turnstile for the booking form. Today it is **off** in staging and production (honeypot and rate limits only). To turn on: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the Babydoll Vercel project (build-time, needs a redeploy), a Turnstile secret saved on the `babydoll` public site (needs `ORG_SECRET_ENCRYPTION_KEYS`, else 503), and the site's `turnstile_mode` set. | Booking form shows the widget; a create without a token is refused | [owner] keys; [agent] verify |
| 5 | The bookings switch: `BABYDOLL_ONLINE_BOOKING=on` plus `BABYDOLL_API_URL=https://api.barrels.gd` on the Babydoll Vercel project (Production). Only `on` enables it; static pages read it at build, so redeploy after changing. The PF7 flag `babydoll-online-booking` is **not** wired (no public evaluate endpoint); the env switch stands in for it. | `curl -sI https://babydoll.barrels.gd/book`: `200` on, redirect to Acuity off | [owner] flip; [agent] verify |
| 6 | Email-code step (ADR-0018). Needed only when a deposit is due: the customer gets a 6-digit code at the booking email, then a signed proof is sent with the create. Needs Redis (fails closed with 503, so a deposit booking is refused if Redis is down), `EMAIL_HASH_PEPPER`, and Resend sending from `barrels.gd`. A booking with no deposit has no step. | Staging test T3 | [agent] |
| 7 | **Deposits through Stripe live mode.** Not possible in the code today: the Stripe adapter is test mode only and refuses a key that does not start with `sk_test_` (`src/payments/providers/stripe.py`, `require_test_key`, answering 503; `bookings/deposit_payments.py` and `events/order_payments.py` then fall back to the manual rail; `docs/env.md`, ADR-0027). Live money is gated by ADR-0027 "Live gate" and its "Open before live money" list (payout route, charge model, tax, licence, accountant and legal sign-off) and Stripe's per-transaction fees are a **paid-tier consideration** against the free/open-source-only rule. **Go live with no deposits (`deposit_minor = 0` on every service), or the manual rail**, and run deposits in Stripe test mode on staging only (see section 6). | n/a | [owner] decision |
| 8 | Business profile and services entered in the studio settings (`bookings.barrels.gd/studio/<org>/settings`): display name, timezone `America/Grenada`, currency, slot step, lead time, horizon, cancellation cutoff, confirmation on or off, manage-link template; the 14 services with confirmed durations, buffers and prices; provider and weekly hours; time off. The seed (`python -m src.bookings.seed`) only provides starting guesses. | Public storefront `GET /api/v1/bookings/public/babydoll-beauty-bar` returns 200 with the right menu | [owner] confirm with the salon; [agent] run the dry-run |
| 9 | Hostnames: `babydoll.barrels.gd` (Vercel, production only, no staging site), API `api.barrels.gd`, studio `bookings.barrels.gd`. The client's own `babydollbeautybar.com` is later: moving it means changing `SITE_URL` in `apps/web/babydoll/src/data/site.ts`, `BOOKINGS_BABYDOLL_SITE_URL`, and the profile's `manage_url_template`, or old email links break. | `curl -sI` each host | [owner] DNS; [agent] verify |
| 10 | The `babydoll` organisation exists in production with the `bookings` and `contacts` entitlements (seed). `payments` is **not** granted, so any deposit set on a service is ignored (the booking is made without one and one INFO line is logged). | Dry-run output; entitlement list | [owner] run seed; [agent] dry-run |
| 11 | Worker running `enqueue_booking_reminders` (hourly :07) and `expire_unpaid_bookings` (every 5 min), Resend verified for `barrels.gd`, `EMAIL_HASH_PEPPER` set. Details: sections 1a-1f of the earlier runbook. | Worker logs; outbox rows reach `done` | [agent] with host access |

## 2. Staged rollout

1. **Staging dry-run with the demo seed [agent].** Staging has no Babydoll site,
   so exercise the API and the studio screens on the synthetic studio
   `demo-glow-studio`:
   ```bash
   docker compose -p grenmet-staging exec -e DEMO_SEED_ENABLED=true api \
     python scripts/seed_staging_demo.py            # preview
   docker compose -p grenmet-staging exec -e DEMO_SEED_ENABLED=true api \
     python scripts/seed_staging_demo.py --apply --member-email <your staging account>
   ```
   The script refuses unless `ENVIRONMENT=staging`, `DEMO_SEED_ENABLED=true` and the database name ends with `_staging`,
   is safe to repeat, writes only `demo-*@example.com` data and marks its own outbox rows done before each commit, so no mail is meant to leave (see the script docstring for the one caveat and the `drain_outbox` cadence of every 30 seconds). Bookings are found by their `[demo] <key>` notes; do not edit those notes in the studio.
   Run the section 3 tests against `demo-glow-studio` (storefront
   `/api/v1/bookings/public/demo-glow-studio`, studio host: see `docs/ports.md` and `docs/deployment.md`; not confirmed here, Q8). The demo studio has a
   deposit service (Stripe stays off in the seed; use a staging Stripe **test**
   key by hand for T4). The unpaid demo booking and order expire after about 30
   minutes by design.
2. **Go / no-go [owner].** All section 1 rows true or consciously waived;
   section 3 tests passed on staging; the salon confirmed services (earlier
   runbook section 2); a production backup taken (section 5); a quiet window
   chosen.
3. **Seed production, switch still off [owner runs, agent dry-runs].**
   `python -m src.bookings.seed --dry-run`, review, then the real run on the
   production host. Check the storefront returns 200. `curl -sI
   https://babydoll.barrels.gd/book` still redirects to Acuity.
4. **Production smoke with the switch off [agent].** Studio sign-in works, the
   agenda loads, public storefront and availability answer.
5. **Switch on [owner].** Set `BABYDOLL_ONLINE_BOOKING=on` and
   `BABYDOLL_API_URL` on Vercel Production, redeploy. `/book` returns 200.
6. **Test booking [owner or agent with go].** One booking in the owner's own
   name, noted "TEST": confirmation or "request received" email, manage link,
   ICS file, then cancel. Confirm the outbox rows reach `done`.
7. **Salon re-enters upcoming Acuity appointments** with the studio's New
   booking form (no email is sent unless asked) and confirms any pending ones.
8. **Retire Acuity the same day [owner]:** turn off online booking on the
   `babydollgnd` page or leave a notice pointing at `/book`; the salon tells
   clients. Keep `BOOKING_URL` in code as the `/book` fallback.
9. **Week one:** watch list in section 4 (Monitoring) and 3.8 of the earlier runbook.

### Rollback

Trigger: sustained 5xx on public create, emails stuck or dead-lettered, a booking
the salon cannot find, or a customer who cannot book.

1. Set `BABYDOLL_ONLINE_BOOKING=off` (or delete it) on Vercel Production and
   redeploy. All Book links return to Acuity; `/booking/<token>` still works.
2. Re-open the Acuity page.
3. Do not delete bookings. Export those made since cutover (read-only query) and
   enter them into Acuity by hand; tell the salon.
4. If data is wrong (not just the page), restore from the pre-cutover backup
   (section 5) only with the owner's decision; prefer fixing forward.

## 3. Test plan summary

Run on staging first (demo studio), then repeat the starred tests (T1, T2, T6-T9) on production
with the owner's own details. Record result, date and who ran it.

| # | Area | Steps | Expect |
| --- | --- | --- | --- |
| T1* | Booking create | Pick a service and slot, submit with name and email; submit the same request twice (retry) | 201 with a manage link; `pending` if confirmation is on, else `confirmed`; the retry replays, no second booking; a taken slot gives a clear 409 message |
| T2* | Abuse controls | Fill the hidden `website` field; submit rapidly from one address; with Turnstile on, submit without a token | Honeypot gets a decoy 201 and stores nothing; rate limit answers 429 per visitor, not for everyone at once (proves prerequisites 1-3); missing token refused |
| T3 | Email code | Service with a deposit: request a code, enter a wrong code until locked, enter a right one, reuse the proof for another slot | Code arrives; lockout after the limit; proof works once and only for that email, service and start time; Redis down gives 503 and no booking |
| T4 | Deposit capture and refund (staging, Stripe **test** key) | Book the deposit service, pay with a test card; cancel before the cutoff; cancel inside the cutoff; let one expire unpaid | `pending_payment` holds the slot, becomes `confirmed` or `pending` on payment; refund in full before the cutoff, "Deposit kept" inside it; studio cancel can override; unpaid hold cancelled after 30 minutes |
| T5 | Manual deposit | In the studio, record a cash or bank deposit on a `pending_payment` booking | Ledger entry, booking confirmed, studio detail shows captured amount; a second record is refused |
| T6* | Cancellation policy | Customer cancels outside and inside `cancel_cutoff_hours`; repeat a cancel; reschedule | Outside: cancelled, studio notified; inside: 409; repeat is a no-op; reschedule keeps the booking and re-checks availability |
| T7* | Reminders | A confirmed booking starting within 24 hours | One `booking-reminder:<id>` row, one email, no manage link in it |
| T8* | Studio agenda | Agenda for a date range, by provider and status; confirm, decline (with reason), cancel, no-show, complete; New booking inside the lead time | Counts match; each move writes history; illegal moves give 409; staff entry sends no email by default; double-booking attempt gives 409 |
| T9* | Settings round trip | Edit a service price, hours, time off in settings; reload the public menu | Public storefront reflects the change; bookings already made keep their price |
| T10 | Isolation | Open the manage link; try another organisation's booking id from the studio | One 404 for unknown, cleared and unentitled tokens; cross-organisation ids 404 |

## 4. Monitoring

- **Sentry:** the API and worker report to `grenmet-production`
  (`SENTRY_DSN_PRODUCTION`) / `grenmet-staging`. Watch for issues naming
  `bookings`, the public create and manage routes, and the outbox. The Babydoll
  site has **no Sentry**; customer-side faults show only as failed API calls and
  `error.tsx`. The studio app (`apps/web/bookings`) reports through the shared
  catalogue.
- **Better Stack:** `scripts/monitoring/betterstack.json` has `Production ·
  Bookings health` (`bookings.barrels.gd/api/health`) and the API readiness
  monitors. There is **no monitor for `babydoll.barrels.gd`** (Q5). Add one for
  `/book` (expects 200) after the switch is on, plus a heartbeat check on the
  worker if one exists for the two booking jobs (neither job is in the Redis
  telemetry `JOBS` set or wrapped in a Sentry cron monitor).
- **Daily for seven days (read-only):** bookings per day by status; `platform.outbox`
  rows with `dedupe_key LIKE 'booking-%'` not `done`; reminder counts versus
  confirmed bookings within 24 hours; worker log lines for the two jobs; 5xx on
  `/api/v1/bookings/public/*`; any overlap of confirmed bookings (should be
  impossible); Acuity for stray new appointments.

## 5. Data and backup

- Before switching on in production take a fresh backup and record its id in the
  release notes (`docs/operations/release-runbook.md` "Irreversible data
  migrations need a verified backup first"): dispatch `backup-database.yml` (or
  `scripts/production/core.sh backup`), confirm success, and check
  `backup-freshness.yml`. The `backup-gate` deploy phase only warns by default
  (`DEPLOY_BACKUP_GATE=warn`, `DEPLOY_BACKUP_MAX_AGE_HOURS=26`); this cutover has
  no migration of its own, so the backup is a safety net, not a gate.
- The seed writes only into `bookings.*`, `org.*` (organisation, entitlements,
  public site) and contacts. It is create-only; a restore would remove salon
  edits made after the backup, so prefer a forward fix.
- Manage tokens are stored as hashes only; the plaintext is in the 201 body and
  the idempotency row for 24 hours, and in the confirmation outbox payload until
  done. Do not paste them into tickets or logs. Retention clears hashes 90 days
  after a booking ends.
- Staging demo data stays in staging. Never run `seed_staging_demo.py` against
  production: it refuses, and `DEMO_SEED_ENABLED` must never be set in a GitHub
  environment.

## 6. Decisions the owner needs to make

1. Deposits at launch: none (recommended), manual bank or cash deposits, or wait
   for a live card rail. Live Stripe needs the ADR-0027 live gate, code changes
   (the adapter refuses live keys), and accepts Stripe's fees.
2. Keep `requires_confirmation` (salon confirms each request in the studio) or
   auto-confirm.
3. Cancellation cutoff (seed: 24 hours), lead time (24 hours), horizon (60 days).
4. Currency (seed: XCD; the site shows `$`).
5. Services, durations and buffers (salon to confirm); add-ons and the
   consultation fee as services or not.
6. Turnstile on at launch, or honeypot and rate limits only for week one.
7. Cutover date and quiet window; who sits with the salon for the first day.
8. When Acuity is switched off, and the client domain move (`babydollbeautybar.com`).

## 7. Open questions (not answered by the repository)

- **Q1.** Is `TRUSTED_WEB_SECRET` passed to the production and staging API
  containers? No deploy file mentions it. If not, rate limits key on the Vercel
  server's address and one busy visitor can lock out everyone; the API-side
  wiring (`deploy.yml`, `render-env.py`, compose) is a small PR, but those paths
  are owner-merge.
- **Q2.** What `VISITOR_IP_PROXY_HOPS` is right for a Vercel-hosted site? 1 is
  the default; confirm with a header check on a real deployment.
- **Q3.** Does the production API serve `/api/v1/bookings/...` today and run the
  two booking crons? Only the code registration was read.
- **Q4.** Is `EMAIL_HASH_PEPPER` set in production (the session log conflicts)?
  A missing pepper makes a public create fail with a 500 once the `contacts`
  link runs; confirm with the staging test.
- **Q5.** No uptime monitor covers `babydoll.barrels.gd`; add one before
  switching on?
- **Q6.** Does the studio UI record manual deposits and show the deposit state
  (the API does)? Check on staging; if not, the owner uses the API until it does.
- **Q7.** Exact log line format of the arq jobs; copy one success and one failure
  line from the staging worker into the earlier runbook.
- **Q8.** Whether staging has a bookings studio host and a Resend sender that can
  deliver the code and confirmation emails to a real test inbox (the demo seed
  uses unreachable `example.com` addresses and silences its own outbox rows).
