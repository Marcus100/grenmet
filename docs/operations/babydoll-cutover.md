# Babydoll cutover: checklist and test plan

**Status:** Active checklist. Staging: Babydoll seeded, one test booking made and confirmed (2026-11-14). Production: the bookings app is live, Babydoll's data is not seeded yet  
**Owner:** Barrels Grenada engineering (client decisions: Babydoll Beauty Bar owner)  
**Last updated:** 2026-11-14

This is the go-live checklist and test plan for moving Babydoll Beauty Bar's
booking from its Acuity link onto Barrels Bookings in production. It builds on
[babydoll-bookings-cutover.md](babydoll-bookings-cutover.md) (written 2026-10-20,
superseded 2026-11-13), which holds the long-form detail for the platform
prerequisites (`ORG_SECRET_ENCRYPTION_KEYS`, Resend, reminder crons,
`EMAIL_HASH_PEPPER`). Since that runbook was written the staff booking form
(`POST /bookings/org/bookings`) and the studio screens (`apps/web/bookings`:
agenda, booking detail, settings for profile, services, providers, hours and
time off) were built and released.

**The Babydoll website stays a static site** (owner decision, 13 Nov 2026). It
takes no bookings: `/book`, `/booking/[token]` and the `BABYDOLL_ONLINE_BOOKING`
switch were removed. Customers book on the studio's page on the bookings app,
`bookings.barrels.gd/babydoll-beauty-bar`, and only the bookings app is in
focus here. The site's part of the cutover is two values: `ONLINE_BOOKING_URL`
in `apps/web/babydoll/src/data/site.ts` and the `/book` redirect
(`apps/web/babydoll/AGENTS.md`, "Booking").

## Where things stand (14 November 2026)

| Item | State |
| --- | --- |
| Bookings app (`bookings.barrels.gd`) | Live on production since v1.0.7 |
| Time off per provider in Studio settings (#1378) | In v1.0.8 |
| Babydoll data on production | **Not seeded.** The seed's dry run passed there on v1.0.8 |
| Babydoll data on staging | Seeded on 14 Nov 2026. A test booking was made on the public page, appeared as pending in the Studio agenda and was confirmed |
| Seed gives each service a 15-minute buffer and takes `--notify-email <address>` (#1393) | On `dev`, not released |
| Prices show with the currency, for example `EC$210` (#1394) | On `dev`, not released |
| Book buttons on the Babydoll site | Still open Acuity (`ONLINE_BOOKING_URL` is `null`) |

Confirmed by the studio (recorded 14 Nov 2026):

- The 14 services, their prices and durations. Prices are Eastern Caribbean
  dollars.
- No charge for late cancellations or no-shows. The 24-hour cancellation cutoff
  stays.
- 15 minutes stay free after every appointment.
- No days off to block yet.
- Staff confirm every booking.
- Guests book without an account and are invited to register afterwards.

Still to do for go-live, in this order:

1. Release `dev` (it carries #1393 and #1394).
2. Run the production seed with `--notify-email <address>`.
3. Give the studio owner an account and ownership of the organisation.
4. Make one real test booking.
5. Switch the site's Book buttons: `ONLINE_BOOKING_URL` and the `/book`
   redirect.

Marks: **[agent]** an agent can do it from the repo or read-only access;
**[owner]** needs the owner's secret, dashboard, client decision or an explicit go.
Production writes, merges to `main` and deploys always need the owner's go.

## 0. What changes for customers

Today every Book button opens Acuity (`babydollgnd.as.me`). After cutover every
Book button opens the studio's page on the bookings app,
`bookings.barrels.gd/babydoll-beauty-bar` (service, slot, details, optional
email-code step, manage link by email), in a new tab. The old `/book` address
on the Babydoll site redirects to the same page. Manage links
(`bookings.barrels.gd/babydoll-beauty-bar/booking/<token>`) live on the bookings
app and do not depend on the Babydoll site. Until the studio is seeded on
production its page answers "not found", which is why the Book buttons switch
last.

## 1. Prerequisites (all must be true before the staging dry-run is trusted)

| # | Prerequisite | How to verify | Who |
| --- | --- | --- | --- |
| 1 | `TRUSTED_WEB_SECRET` of at least 32 characters, shared by the API and the bookings app. The deploy requires it: `render-env.py` refuses a shorter value and Compose passes it to `api` and `web-bookings`. It is no longer a Babydoll Vercel setting (the site makes no API calls). | A deploy that passed; API startup log must not show the "shorter than 32" warning | [agent] check the log |
| 2 | **The API container receives `TRUSTED_WEB_SECRET`.** Met: `deploy.yml`, `render-env.py` and `docker-compose.deploy.yml` carry it (this answers Q1). | `grep -rn TRUSTED_WEB_SECRET .github infra scripts/production`; `docker compose -p grenmet exec api printenv TRUSTED_WEB_SECRET \| wc -c` (length only, never print) | [agent] check |
| 3 | `VISITOR_IP_PROXY_HOPS` for the bookings app. The booking flow now runs on the droplet, not on Vercel. `render-env.py` sets it for `api` and `web-bookings`: 1, or 2 when the Cloudflare proxy switch is on. Wrong values rate-limit by the wrong address, or let a visitor choose their own bucket. | Test from two networks on staging; compare the `X-Visitor-IP` the API sees ([Cloudflare proxy runbook](cloudflare-proxy.md), acceptance item 1) | [agent] test |
| 4 | Turnstile for the booking form. Today it is **off** in staging and production (honeypot and rate limits only). To turn on: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a build argument of the bookings app image (inlined at build time; not wired yet, `apps/web/bookings/AGENTS.md`), a Turnstile secret saved on the `babydoll` public site (needs `ORG_SECRET_ENCRYPTION_KEYS`, else 503), and the site's `turnstile_mode` set. | Booking form shows the widget; a create without a token is refused | [owner] keys; [agent] wiring and verify |
| 5 | The Book buttons. There is no environment switch any more. `ONLINE_BOOKING_URL` in `apps/web/babydoll/src/data/site.ts` is `null` today, so every Book button opens Acuity and `/book` redirects there (`public/_redirects`, `vercel.json`). Setting the three values to `https://bookings.barrels.gd/babydoll-beauty-bar` is a normal pull request and a site deploy, done last. | `curl -sI https://babydoll.barrels.gd/book`: the redirect's `Location` | [agent] pull request; [owner] go and deploy |
| 6 | Email-code step (ADR-0018). Needed only when a deposit is due: the customer gets a 6-digit code at the booking email, then a signed proof is sent with the create. Needs Redis (fails closed with 503, so a deposit booking is refused if Redis is down), `EMAIL_HASH_PEPPER`, and Resend sending from `barrels.gd`. A booking with no deposit has no step. | Staging test T3 | [agent] |
| 7 | **Online payment at launch: none.** Customers pay in the salon, and the studio does not charge for late cancellations or no-shows, so every service keeps `deposit_minor = 0`. The Stripe adapter is test mode only and refuses a key that does not start with `sk_test_` (`src/payments/providers/stripe.py`, `require_test_key`, answering 503; `docs/env.md`, ADR-0027). Owner direction of 13 Nov 2026 (issue #1372, no code yet): try both Stripe and Republic Bank's e-commerce service; each business is paid directly through its own merchant account and Barrels charges a subscription; online payment for bookings stays optional. Run deposits in Stripe test mode on staging only (see section 6). | n/a | [owner] decision |
| 8 | Business profile and services entered in the studio settings (`bookings.barrels.gd/studio/<org>/settings`): display name, timezone `America/Grenada`, currency, slot step, lead time, horizon, cancellation cutoff, confirmation on or off, manage-link template; the 14 services with confirmed durations, buffers and prices; provider and weekly hours; time off. The seed (`python -m src.bookings.seed`) provides the services, prices and durations the studio confirmed on 14 Nov 2026, with a 15-minute buffer after each service; the studio may still edit them in Settings. | Public storefront `GET /api/v1/bookings/public/babydoll-beauty-bar` returns 200 with the right menu | [owner] confirm with the salon; [agent] run the dry-run |
| 9 | Hostnames: `babydoll.barrels.gd` (static site, production only, no staging site; on Vercel today, moving to Cloudflare Pages), API `api.barrels.gd`, public booking page and studio on `bookings.barrels.gd`. The client's own `babydollbeautybar.com` is later: moving it means changing `SITE_URL` in `apps/web/babydoll/src/data/site.ts` and `BOOKINGS_BABYDOLL_SITE_URL`. The profile's `manage_url_template` points at the bookings app (`https://bookings.barrels.gd/babydoll-beauty-bar/booking/{token}`) and does not move with the site. | `curl -sI` each host | [owner] DNS; [agent] verify |
| 10 | The `babydoll` organisation exists in production with the `bookings` and `contacts` entitlements (seed). **Not yet: production is not seeded** (dry run passed on v1.0.8, 14 Nov 2026); staging is. `payments` is **not** granted, so any deposit set on a service is ignored (the booking is made without one and one INFO line is logged). The studio owner also needs an account and ownership of the organisation. | Dry-run output; entitlement list | [owner] run seed and grant ownership; [agent] dry-run |
| 11 | Worker running `enqueue_booking_reminders` (hourly :07) and `expire_unpaid_bookings` (every 5 min), Resend verified for `barrels.gd`, `EMAIL_HASH_PEPPER` set. Details: sections 1a-1f of the earlier runbook. | Worker logs; outbox rows reach `done` | [agent] with host access |

## 2. Staged rollout

1. **Staging dry-run [agent].** Babydoll itself is seeded on staging since
   14 Nov 2026: a test booking made on the public page
   (`bookings.staging.barrels.gd/babydoll-beauty-bar`) appeared as pending in
   the Studio agenda and was confirmed. For tests that need a deposit service or
   throwaway data, use the synthetic studio `demo-glow-studio`:
   ```bash
   # from infra/docker on the droplet
   C=(docker compose --env-file staging.env --env-file runtime/.env.local \
      -f docker-compose.deploy.yml -p grenmet-staging)
   "${C[@]}" exec -e DEMO_SEED_ENABLED=true api \
     python scripts/seed_staging_demo.py            # preview
   "${C[@]}" exec -e DEMO_SEED_ENABLED=true api \
     python scripts/seed_staging_demo.py --apply --member-email <your staging account>
   ```
   The script refuses unless `ENVIRONMENT=staging`, `DEMO_SEED_ENABLED=true` and the database name ends with `_staging`,
   is safe to repeat, writes only `demo-*@example.com` data and marks its own outbox rows done before each commit, so no mail is meant to leave (see the script docstring for the one caveat and the `drain_outbox` cadence of every 30 seconds). Bookings are found by their `[demo] <key>` notes; do not edit those notes in the studio.
   Run the section 3 tests against `demo-glow-studio` (storefront
   `/api/v1/bookings/public/demo-glow-studio`, studio host `bookings.staging.barrels.gd`). The demo studio has a
   deposit service (Stripe stays off in the seed; use a staging Stripe **test**
   key by hand for T4). The unpaid demo booking and order expire after about 30
   minutes by design.
2. **Go / no-go [owner].** All section 1 rows true or consciously waived;
   section 3 tests passed on staging; the salon confirmed services (done,
   recorded 14 Nov 2026); a production backup taken (section 5); a quiet window
   chosen.
3. **Seed production, Book buttons unchanged [owner runs, agent dry-runs].**
   First release `dev`, so the seed has the 15-minute buffers and
   `--notify-email` (#1393). Then `python -m src.bookings.seed --dry-run`,
   review, then the real run on the production host (the dry run already passed
   on v1.0.8 on 14 Nov 2026; repeat it on the new release). Add
   `--notify-email <address>` (the studio's address, from
   the owner) so a new profile gets its notification address; an existing
   profile keeps its own value. Check the storefront returns 200. `curl -sI
   https://babydoll.barrels.gd/book` still redirects to Acuity.
4. **Studio owner's account [owner].** Give the studio owner a Barrels account
   and ownership of the `babydoll` organisation, so the studio can sign in to
   `/studio`.
5. **Production smoke [agent].** Studio sign-in works, the agenda loads, public
   storefront and availability answer.
6. **Test booking [owner or agent with go].** One real booking on
   `bookings.barrels.gd/babydoll-beauty-bar` in the owner's own name, noted
   "TEST": "request received" email, the booking pending in the Studio agenda,
   confirm it, manage link, ICS file, then cancel. Confirm the outbox rows reach
   `done`.
7. **Switch the Book buttons [agent pull request, owner go].** Set
   `ONLINE_BOOKING_URL` in `apps/web/babydoll/src/data/site.ts` and the `/book`
   redirect in `public/_redirects` and `vercel.json`
   (`src/pages-files.test.ts` checks the Pages file), then deploy the site.
8. **Salon re-enters upcoming Acuity appointments** with the studio's New
   booking form (no email is sent unless asked) and confirms any pending ones.
9. **Retire Acuity the same day [owner]:** turn off online booking on the
   `babydollgnd` page or leave a notice pointing at the new booking page; the
   salon tells clients. Keep `BOOKING_URL` in code: it is where the Book buttons
   go while `ONLINE_BOOKING_URL` is `null`.
10. **Week one:** watch list in section 4 (Monitoring) and 3.8 of the earlier runbook.

### Rollback

Trigger: sustained 5xx on public create, emails stuck or dead-lettered, a booking
the salon cannot find, or a customer who cannot book.

1. Set `ONLINE_BOOKING_URL` back to `null` and the `/book` redirect back to
   Acuity (revert the step 7 pull request) and deploy the site. All Book links
   return to Acuity; manage links on the bookings app still work.
2. Re-open the Acuity page.
3. Do not delete bookings. Export those made since cutover (read-only query) and
   enter them into Acuity by hand; tell the salon.
4. If data is wrong (not just the page), restore from the pre-cutover backup
   (section 5) only with the owner's decision; prefer fixing forward.

## 3. Test plan summary

Run on staging first (Babydoll and the demo studio), then repeat the starred tests (T1, T2, T6-T9) on production
with the owner's own details. On 14 Nov 2026 the T1 happy path and the T8 confirm
step were done once on staging against Babydoll; the rest of the table has no
recorded run. Record result, date and who ran it.

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
  site has **no Sentry**, and since it became static it makes no API calls. The
  booking flow and the studio (`apps/web/bookings`) report through the shared
  catalogue.
- **Better Stack:** `scripts/monitoring/betterstack.json` has `Production ·
  Bookings health` (`bookings.barrels.gd/api/health`) and the API readiness
  monitors. There is **no monitor for `babydoll.barrels.gd`** (Q5), and none for
  the studio's booking page. Add one for
  `bookings.barrels.gd/babydoll-beauty-bar` (expects 200) once production is
  seeded, plus a heartbeat check on the
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

Decided (studio and owner, recorded 14 Nov 2026):

1. Deposits at launch: **none**. Customers pay in the salon, and there is no
   charge for late cancellations or no-shows. Online payment is optional later
   (issue #1372; live Stripe still needs the ADR-0027 live gate and code
   changes, because the adapter refuses live keys).
2. `requires_confirmation` **stays on**: staff confirm every booking in the
   studio.
3. Cancellation cutoff: **24 hours stays**. Lead time (24 hours) and horizon
   (60 days) are the seed's values; this page records no decision on them.
4. Currency: **Eastern Caribbean dollars** (XCD), shown as `EC$` (#1394, on
   `dev`).
5. Services, prices and durations: **confirmed**, with 15 minutes free after
   every appointment (#1393, on `dev`). Still open: add-ons and the
   consultation fee as services or not.
6. Guests book without an account and are invited to register afterwards.
   No days off need blocking yet.

Still open:

7. Turnstile on at launch, or honeypot and rate limits only for week one.
8. Cutover date and quiet window; who sits with the salon for the first day.
9. When Acuity is switched off, and the client domain move (`babydollbeautybar.com`).

## 7. Open questions (not answered by the repository)

- **Q1.** Answered (checked 14 Nov 2026): `TRUSTED_WEB_SECRET` is passed to the
  API and the bookings app by `deploy.yml`, `render-env.py` and the deploy
  Compose file, and a value under 32 characters fails the deploy.
- **Q2.** No longer a Vercel question: the booking flow runs on the droplet.
  `render-env.py` sets `VISITOR_IP_PROXY_HOPS` to 1, or 2 behind the Cloudflare
  proxy; confirm with a header check on staging.
- **Q3.** Partly answered: the bookings app has been live on production since
  v1.0.7. Whether the two booking crons run there was not checked; only the code
  registration was read.
- **Q4.** Is `EMAIL_HASH_PEPPER` set in production (the session log conflicts)?
  A missing pepper makes a public create fail with a 500 once the `contacts`
  link runs; confirm with the staging test.
- **Q5.** No uptime monitor covers `babydoll.barrels.gd`; add one before
  switching on?
- **Q6.** Answered in code: the studio booking detail has "Record deposit
  received" for owners and admins (`apps/web/bookings/AGENTS.md`, Studio). Not
  checked on staging.
- **Q7.** Exact log line format of the arq jobs; copy one success and one failure
  line from the staging worker into the earlier runbook.
- **Q8.** Partly answered: staging has the bookings host
  (`bookings.staging.barrels.gd`), used for the 14 Nov 2026 test booking. Whether
  its emails reached a real inbox was not recorded (the demo seed
  uses unreachable `example.com` addresses and silences its own outbox rows).
