# Barrels Events: staging bring-up and acceptance runbook

**Status:** Draft checklist; nothing here has been run  
**Owner:** Barrels Grenada engineering (the staging owner runs it)  
**Last updated:** 2026-10-22

A hands-on runbook for the owner to bring Barrels Events up on **staging** and
prove it works, end to end, with Stripe in **test mode**. It follows the format
of [babydoll-cutover.md](babydoll-cutover.md) and relies on, rather than copies,
[release-runbook.md](release-runbook.md), [../deployment.md](../deployment.md),
[../env.md](../env.md), [ADR-0027](../adr/0027-payments-core-and-providers.md),
[ADR-0044](../adr/0044-organisation-scoped-permissions-via-membership-grants.md)
and [events-legacy-manage-routes.md](../exec-plans/events-legacy-manage-routes.md).

Marks: **[agent]** an agent can do it from the repo or read-only access;
**[owner]** needs the owner's secret, dashboard or go. Staging is throwaway
([release-runbook.md](release-runbook.md): no backup gate), but still never paste
a secret into chat, an issue or a commit.

Anything this runbook could not confirm from the repository is marked
**UNVERIFIED: confirm**.

## 0. What this proves

An attendee can find an event, buy a paid ticket with a Stripe test card, get a
receipt and a QR code, RSVP free, and cancel or ask for a refund. An organiser
can be verified by staff, publish an event with tiers and an image, sell at an
outlet, record manual payments, admit people at the door, see orders and
attendees, refund and cancel. Staff can moderate, switch entitlements and
enrol MFA.

## 1. Prerequisites and owner configuration checklist

### 1a. GitHub `staging` environment (Settings, Environments, staging)

> **Stripe key:** it must be the standard `sk_test_` secret key. Restricted
> `rk_test_` keys are rejected by the adapter and by `render-env.py`.
> **Silent fallback:** leaving `PAYMENTS_STRIPE_*` unset still deploys green and
> Events silently uses the manual rail until the in-progress fix lands. Check
> T1 really reaches Stripe Checkout.

Names are exactly what `.github/workflows/deploy.yml` reads and
`scripts/production/render-env.py` renders. Generate random values with
`openssl rand -base64 32`; never reuse a value across apps or environments.

| # | Name | Kind | Value / rule | Checked in code |
| --- | --- | --- | --- | --- |
| 1 | `PAYMENTS_STRIPE_SECRET_KEY` | secret | The **standard** test secret key `sk_test_...`. Not a restricted `rk_test_` key (see 2a). `render-env.py` refuses any value not starting `sk_test_`. | `render-env.py`, `payments/providers/stripe.py` |
| 2 | `PAYMENTS_STRIPE_WEBHOOK_SECRET` | secret | `whsec_...` from the webhook endpoint in 2b. Webhook answers 503 until set and prefixed `whsec_`. | `stripe.py` `verify_callback` |
| 3 | `PAYMENTS_STRIPE_SUCCESS_URL` | variable | HTTPS page on our domain. Suggested: `https://events.staging.barrels.gd/me/tickets` (route exists). One value for every payment source (Bookings deposits share it). | `payments/config.py`; page choice UNVERIFIED: confirm |
| 4 | `PAYMENTS_STRIPE_CANCEL_URL` | variable | HTTPS page on our domain. Suggested: `https://events.staging.barrels.gd/events`. Checkout answers 503 until both URLs are set. | `stripe.py` `create_payment` |
| 5 | `EVENTS_SSO_CLIENT_SECRET` | secret | 32+ characters, unique. Wired for the API and `web-events` in `docker-compose.deploy.yml`. Empty hides "Continue with your Barrels account"; email-code sign-in still works (ADR-0016). | `render-env.py`, `docs/env.md` |
| 6 | `BARRELS_ADMIN_SSO_CLIENT_SECRET` | secret | 32+ characters, unique. Needed for staff to sign in to the console (`admin.staging.barrels.gd`) for moderation, entitlements and the payments page. **Also needs a `deploy.yml` line, see 1c.** | `render-env.py`, compose, [deployment.md](../deployment.md) hostname section |
| 7 | `AUTH_TOTP_ENCRYPTION_KEYS` | secret | JSON array of Fernet keys, e.g. `["<key>"]`; generate with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Without keys, MFA enrolment is unavailable. Not the same as `ORG_SECRET_ENCRYPTION_KEYS`. | `render-env.py` `fernet_keys` |
| 8 | `AUTH_PRIVILEGED_MFA_MODE` | variable | `disabled` (default) or `enforce`. Follow the [privileged MFA gates](privileged-mfa.md) before `enforce`. Moderation decisions need an MFA-enrolled superuser (#511, #523); see 1d. | `render-env.py`, compose |
| 9 | `STORAGE_ENDPOINT_URL`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL` | secrets | S3-compatible bucket for event images. `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` must be set together or the deploy is rejected. `deploy.yml` falls back to the `DO_SPACES_*` secrets. Without storage, image upload answers 503 "Uploads are not configured". | `render-env.py`, `deploy.yml` |
| 10 | `RESEND_API_KEY` | secret | Required by `render-env.py` (deploy fails without it). Sender `noreply@barrels.gd` (`EMAILS_FROM_EMAIL` in `staging.env`) needs a verified Resend domain. | `render-env.py`, `staging.env` |
| 11 | `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS` | variable | Comma-separated domain names, no wildcards or addresses. Blank defaults to `barrels.gd` on staging. Add the domain of every tester address (for example `gmail.com`), or notification mail to them is skipped (they still see in-app notices). | `render-env.py`, `notifications/config.py` |
| 12 | `ORG_SECRET_ENCRYPTION_KEYS` | secret | Optional for Events (only public-site secrets use it). | `render-env.py` |
| 13 | `TRUSTED_WEB_SECRET` | secret | 32+ characters. **Not wired into the deploy today, see 1c.** Without it all visitors share the rate-limit bucket of the web server. | `docs/env.md`; grep of `.github`, `infra`, `scripts/production` finds no wiring |

Already committed and not secret (`infra/docker/staging.env`): `ENVIRONMENT=staging`,
`BASE_DOMAIN=staging.barrels.gd`, `DOMAIN=api.staging.barrels.gd`,
`POSTGRES_DB=app_staging`, `BACKEND_CORS_ORIGINS` (includes
`https://events.staging.barrels.gd` and `https://admin.staging.barrels.gd`).
Events needs no database secret: it lives in the `events` schema of the main
database ([release-runbook.md](release-runbook.md) section 1).

Optional Events tuning (defaults are fine): `EVENTS_ORDER_HOLD_MINUTES` (30) and
`EVENTS_REFUND_CUTOFF_HOURS` (48), see [../env.md](../env.md). They are not
passed by `deploy.yml`, so they stay at the defaults. UNVERIFIED: confirm.

### 1b. Hostnames and DNS

| Host | Serves | Source |
| --- | --- | --- |
| `events.staging.barrels.gd` | Events web (port 3009) | [deployment.md](../deployment.md) table |
| `api.staging.barrels.gd` | FastAPI, including the Stripe webhook | `staging.env` `DOMAIN` |
| `auth.staging.barrels.gd` | Shared sign-in (staff SSO), `FRONTEND_HOST` | `staging.env` |
| `admin.staging.barrels.gd` | Barrels staff console (moderation, payments, entitlements) | [deployment.md](../deployment.md) hostname section |

Cloudflare: the repo says `*.staging.barrels.gd` points at the staging droplet
in **DNS-only** mode ([deployment.md](../deployment.md)). Keep these hosts DNS
only: Traefik issues Let's Encrypt certificates on first request, and a proxied
(orange cloud) record can break that handshake. If you ever proxy
`api.staging`, allow Stripe's webhook traffic through any WAF or bot rule and
keep the request body unmodified (the signature covers the raw body). Whether
the live Cloudflare zone matches is **UNVERIFIED: confirm** (not visible from
the repo).

### 1c. Wiring gaps found in the repository (fix before the first deploy)

Checked against `origin/dev` on 2026-10-22:

1. **`BARRELS_ADMIN_SSO_CLIENT_SECRET` is not in `.github/workflows/deploy.yml`.**
   `render-env.py` reads it and compose passes it, but the workflow's `env:`
   block for the render step does not set it, so the console has no secret and
   staff cannot sign in to it. Add next to `GAA_ADMIN_SSO_CLIENT_SECRET`:
   `BARRELS_ADMIN_SSO_CLIENT_SECRET: ${{ secrets.BARRELS_ADMIN_SSO_CLIENT_SECRET }}`
   (owner-only path; agents do not edit `.github`). Re-check with
   `grep -n BARRELS_ADMIN .github/workflows/deploy.yml`.
2. **`TRUSTED_WEB_SECRET` has no deploy wiring** (`grep -rn TRUSTED_WEB_SECRET
   .github infra scripts/production` returns nothing), and `apps/web/events/src`
   does not send `X-Visitor-IP` at all. Events rate limits in `events/router.py`
   (suggestions 5/min, reports 10/min, RSVP, follow, join group and send message
   30/min, save listing 60/min, ticket ordering 20/min) are therefore shared by
   everyone coming through the Events web server until the visitor-identity
   change lands (sign-in limits live in the auth module, not here). Expect 429s
   if several testers act at once (section 6).
3. `render-env.py` does not read `PAYMENTS_STRIPE_*` as required: leaving them
   unset still deploys, and Events then falls back to the manual rail
   (section 6). So a green deploy does **not** prove Stripe is configured.

### 1d. People and accounts you need

| Account | Purpose | How |
| --- | --- | --- |
| Staff superuser (yours), MFA-enrolled | Moderation approve/reject, entitlements, payments page | The staging `FIRST_SUPERUSER`. Enrol in two-step sign-in on `https://auth.staging.barrels.gd/security` (route exists in `apps/web/auth/src/app/security`); needs `AUTH_TOTP_ENCRYPTION_KEYS` (row 7). |
| Attendee A, attendee B | Buying, RSVP, cancel | Two tester emails on a domain in row 11. Sign in with the email code at `events.staging.barrels.gd/sign-in`. |
| Organiser | Sign up as a new organiser | A third tester email. |
| Demo accounts | Seeded data (section 4) | Random passwords nobody knows; you are added to the demo organiser with `--member-email`. |

### 1e. Unknowns to verify before trusting a result

- Cloudflare mode and the wildcard/explicit records (1b).
- Resend: the `barrels.gd` domain is verified. `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS`
  gates the email of in-app notifications (`notifications/dispatch.py:105`);
  outbox mail, including the T3 receipt, is not domain-gated
  (`dispatch.py:256-262`). Confirm live with T3.
- The worker runs the crons `drain_outbox` (seconds 10 and 40 of every minute)
  and `expire_unpaid_event_orders` (`src/worker/main.py`). Check it is up with `"${C[@]}" logs worker --tail 50`.
- The Stripe account's currency handling for XCD test payments. Events orders
  are priced in the listing currency (EC$); Stripe Checkout accepts `xcd`.
  **UNVERIFIED: confirm** with the first test purchase (T1).
- Which success page is best for Bookings and Events sharing one URL (row 3).

## 2. Stripe TEST mode setup [owner]

Live mode is blocked by design: the adapter refuses any key that does not start
with `sk_test_` (503 "Only Stripe test mode is permitted"), `render-env.py`
rejects it at deploy time, and ADR-0027 "Live gate" lists what must be true
before live money. Do not try to work around this.

### 2a. The API key

Use a test-mode account (the Stripe dashboard with the Test mode toggle on).

**Use the standard test secret key (`sk_test_...`), not a restricted key.** A
restricted test key is `rk_test_...`, which fails the `sk_test_` prefix check in
`require_test_key` and in `render-env.py`, so the adapter would be disabled. If
you want least privilege later, the adapter's code needs a change first (an
ADR-0027 decision; not part of this runbook).

For reference, the calls the adapter makes (`payments/providers/stripe.py`),
useful if a restricted key is ever allowed:

| Call | Stripe API | Permission it implies |
| --- | --- | --- |
| Start checkout | `POST /v1/checkout/sessions` | Checkout Sessions: write |
| Refresh status (`fetch_status`; not called by any flow today) | `GET /v1/checkout/sessions/{id}` | Checkout Sessions: read |
| Refund | `POST /v1/refunds` (by `payment_intent`) | Refunds: write (PaymentIntents read may also be needed: **UNVERIFIED: confirm**) |

Webhook verification uses the signing secret only, not the API key.

### 2b. The webhook endpoint

Dashboard, Developers, Webhooks, Add endpoint (test mode):

- **URL:** `https://api.staging.barrels.gd/api/v1/payments/public/webhooks/stripe`
  (router prefix `/payments`, API base `/api/v1`, route
  `/public/webhooks/{provider}`, `provider` = `stripe`; not in the OpenAPI
  schema by design).
- **Events to send** (the only types `normalise_event` acts on; anything else is
  answered 200 and ignored):
  - `checkout.session.completed` (acted on only when `payment_status` is
    `paid`; marks the payment captured, issues tickets, queues the receipt)
  - `payment_intent.payment_failed` (marks the attempt failed)
  - `charge.refunded` (records money refunded at Stripe that the app did not
    already record, for example from the dashboard)
- Copy the **signing secret** (`whsec_...`) into the GitHub secret
  `PAYMENTS_STRIPE_WEBHOOK_SECRET` and redeploy (secrets are rendered at deploy
  time, so a change needs a new deploy).

The API verifies the signature itself, in `StripeProvider.verify_callback` →
`verify_signature` (`payments/providers/stripe.py`): HMAC-SHA256 over
`<timestamp>.<raw body>`, constant-time compare, refused with 400 when missing,
malformed, wrong or older than `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` (default
300). Replays are safe: the ledger's unique `(provider, provider_event_id)` makes
a repeated event answer 200 and change nothing.

### 2c. Test cards

Use any future expiry, any CVC, any postcode.

| Card | Result | Use for |
| --- | --- | --- |
| `4242 4242 4242 4242` | Succeeds | T1, refunds |
| `4000 0000 0000 0002` | Declined | T2 (failed payment) |
| `4000 0025 0000 3155` | Requires 3D Secure authentication | T2b (complete or fail the challenge) |

These are Stripe's published test numbers; confirm against Stripe's testing
docs if a number is rejected.

### 2d. Replay and inspect

- **Stripe dashboard:** Developers, Webhooks, the endpoint, Event deliveries:
  status code, response body and **Resend**. A 400 means a bad or stale
  signature or a rotated `whsec_`; a 503 means the API has no (or a malformed)
  webhook secret; a 200 with no effect is an unknown or duplicate event.
- **Payments page in the staff console:** `https://admin.staging.barrels.gd/payments`
  (balances per organisation, ledger, reconciliation). API equivalents (superuser
  token): `GET /api/v1/payments/admin/intents`, `/admin/ledger`, `/admin/balances`.
- **API logs:** `"${C[@]}" logs api --tail 100 | grep -i
  "stripe\|callback"` (messages: "callback for an unknown payment", "callback
  amount does not match the payment; not credited", "Stripe webhook secret is
  missing or malformed").
- **Stripe CLI (optional, host only):** `stripe trigger checkout.session.completed`
  creates an event with no `intent_id` metadata, so the API answers 200 and
  ignores it. That proves signature and routing, not a purchase.

## 3. Deploy order after merging release PR #520

PR #520 ("release: dev to staging (Release A)") is open; the owner merges it
into staging in step 2, after the checks in step 1.

**Compose invocation used everywhere below.** On the droplet, from
`infra/docker` (the relative env-file paths need that directory; see the headers
of `docker-compose.deploy.yml` and `staging.env`, and `scripts/production/core.sh`):

```bash
ssh <staging droplet>              # existing SSH key, see docs/deployment.md
cd /path/to/grenmet/infra/docker
C=(docker compose --env-file staging.env --env-file runtime/.env.local \
   -f docker-compose.deploy.yml -p grenmet-staging)
"${C[@]}" ps                       # sanity check
```

Order:

1. **Before merging:** rows 1-11 of section 1a that you intend to use are set,
   and 1c item 1 is done (or consciously skipped). **[owner]**
2. Merge #520 into `staging`. `pipeline-staging.yml` builds and deploys
   ([deployment.md](../deployment.md)). Deploy in a quiet window (the release
   notes warn of network recreation from #485 and short 404s). **[owner]**
3. Health: `curl -fsS https://api.staging.barrels.gd/api/v1/utils/health-check/`
   and `https://api.staging.barrels.gd/api/v1/utils/ready/`;
   `curl -fsS https://events.staging.barrels.gd/api/health`. **[agent]**
4. **Confirm migrations.** On the droplet (project `grenmet-staging`, see
   section 4 for the access pattern):
   ```bash
   "${C[@]}" exec api alembic current
   ```
   Expect head `eventsactivitycapacity20261022` (single head, no branches). The
   four revisions in #520, in order:
   `membershipgrant20261022` (table `org.membership_grant`),
   `eventsentitlement20261022` (inserts missing `events` rows in
   `org.organisation_app` for existing organisers),
   `orgverifystatus20261022` (verification columns on `org.organisation`),
   `eventsactivitycapacity20261022` (adds `actor_capacity`, `member` for every
   existing row, to `events.activity`; additive, ADR-0050).
   Check the entitlement backfill:
   ```bash
   "${C[@]}" exec db psql -U <POSTGRES_USER> -d app_staging \
     -c "select count(*) from org.organisation_app where app_key='events';"
   ```
   (Table `org.organisation_app`, column `app_key`, from
   `src/organisations/models.py`.) The `-U` role and `db` service name follow
   `docker-compose.deploy.yml`: **UNVERIFIED: confirm**. **[agent with host access]**
5. Sign in to Events (`events.staging.barrels.gd/sign-in`, email code) and to the
   console (`admin.staging.barrels.gd`, superuser) to prove the secrets work.
6. **Only after the checks in section 5 pass:** drop the old separate Events
   database `events_staging` (owner follow-up in
   [release-runbook.md](release-runbook.md) section 1; the current Events data
   is in the main `events` schema). **[owner]** Take a look first:
   ```bash
   "${C[@]}" exec db psql -U <POSTGRES_USER> -d postgres -c "\l"
   # only when you are sure it is the retired database:
   "${C[@]}" exec db psql -U <POSTGRES_USER> -d postgres \
     -c 'DROP DATABASE events_staging;'
   ```
   This is destructive; staging is throwaway, so no backup is required, but do
   not run it against `app_staging`.

## 4. The staging demo seed

`apps/api/fastapi/scripts/seed_staging_demo.py` (read its docstring first). It
creates synthetic data through the same service functions the API uses:

- **Events:** the verified organiser `demo-island-events` ("Demo Island Events")
  with the `events` entitlement (from organiser creation, `ensure_events_entitlement`) and `payments` (granted explicitly by the seed); two published, ticketed
  listings ("Demo Sunset Fete", tiers General EC$50 and VIP EC$120; "Demo Night
  Market"); three orders (two paid by a recorded **manual** cash payment, one
  unpaid VIP hold that expires after about 30 minutes by design); a second,
  **pending** organiser `demo-pending-promoters` for the moderation queue; a
  demo moderator user. Accounts use `demo-*@example.com` with random passwords.
- **Bookings:** the synthetic studio `demo-glow-studio` (used by
  [babydoll-cutover.md](babydoll-cutover.md) section 2).

Guards (all must hold or it refuses, exit code 2): `ENVIRONMENT=staging`,
`DEMO_SEED_ENABLED=true` in the environment of the command, and
`POSTGRES_DB` ending in `_staging` (`app_staging` does). Idempotent; safe to
repeat. The seed forces the **manual rail**, so it never calls Stripe, and it
marks its own outbox rows done so no mail leaves.

Run from the droplet (using the `"${C[@]}"` invocation defined in section 3, which
the `cd` to `infra/docker` makes work):

```bash
# Run from infra/docker with the C=(...) array defined in section 3.

# 1. Preview (writes nothing)
"${C[@]}" exec -e DEMO_SEED_ENABLED=true api \
  python scripts/seed_staging_demo.py

# 2. Apply, adding your existing staging account as owner of the demo
#    studio and of Demo Island Events so you can sign in to both
"${C[@]}" exec -e DEMO_SEED_ENABLED=true api \
  python scripts/seed_staging_demo.py --apply --member-email you@example.org
```

The account named by `--member-email` must already exist (sign in once at
`events.staging.barrels.gd`), else it stops with "No account with email ...".
The preview prints JSON naming what it would create; `--apply` prints
`{"dry_run": false, "created": [...]}` (empty `created` on a repeat). 
The script path resolves: the image copies `scripts/` and its working
directory is `/app/apps/api/fastapi` (`Dockerfile.prod`). If it still fails, run
`"${C[@]}" exec api ls scripts`. See also `apps/api/fastapi/scripts/README.md`;
the script docstring is the reference for behaviour.

Note the demo organiser's orders are real rows on the manual rail. The Stripe
tests below use a **new** order that you create, not a demo order.

## 5. Acceptance test script

Run in order. Record the result in the pass/fail table at the end. "Where to
look" abbreviations: **Sentry** (project `grenmet-staging`, Events web and API;
no personal data is sent), **Outbox** (table `outbox`, rows must reach `done`),
**Ledger** (`admin.staging.barrels.gd/payments`), **Logs**
(`"${C[@]}" logs api|worker --tail 100`).

Set up two private browser profiles: one signed in as attendee A, one as the
organiser. Use your own staff session for the console.

### Attendee journeys (host `events.staging.barrels.gd`)

| ID | Step | Expected | Where to look |
| --- | --- | --- | --- |
| A1 | Open `/` and `/events` signed out. Open "Demo Sunset Fete". | Public pages load; tiers and EC$ prices shown; "Sign in to ..." for buying. | Sentry: no new errors |
| A2 | Sign in at `/sign-in` with attendee A's email code. | Code email arrives (check spam; section 1e); you land signed in. | Outbox, Resend dashboard |
| T1 | Buy 1 General (EC$50.00) on a **new** organiser event or the demo event. At Stripe Checkout pay with `4242 4242 4242 4242`. | Redirected to the success URL; `/me/orders/<id>` shows confirmed within about 5 s (page refreshes itself); `/me/tickets` lists the ticket with a **QR code** and printable code. | Ledger: intent `succeeded`, a `charge` entry; Stripe webhook delivery 200; Outbox `events-order-paid:<order id>` done |
| T2 | Buy again and pay with `4000 0000 0000 0002`. | Stripe shows a decline; no ticket issued; order stays awaiting payment, then expires after ~30 min (`EVENTS_ORDER_HOLD_MINUTES`) and stock is released. | Ledger: intent `failed` / no charge; Logs |
| T2b | Buy and use `4000 0025 0000 3155`; complete then (separately) fail the 3DS challenge. | Complete: as T1. Fail: as T2. | Stripe event deliveries |
| T3 | Check your inbox after T1. | Receipt "Your tickets for <title>" with amount and time; **no QR in the email by design** (it says to open My tickets). | Outbox; Resend dashboard; if nothing arrives see section 1e |
| T4 | Reload `/me/tickets/<id>`. | QR is stable and the code matches the door list (O3 check). | none |
| A3 | RSVP / claim a **free** ticket on a free event (create one in O4 or use any free tier). | Ticket issued instantly with QR; no Stripe. | Activity on the listing |
| A4 | Open the free ticket, press Cancel. | Ticket becomes cancelled; stock returns. | Organiser attendees list |
| A5 | Open the paid ticket from T1. | **Cancel is hidden**; page says to ask the organiser for a refund (online-paid tickets cannot be self-cancelled). | none |
| A6 | Ask for a refund: contact the organiser (there is no in-app request, UNVERIFIED: confirm), who refunds in O9. | After O9 the order shows refunded and the ticket stops working. | Ledger: `refund` entry |

### Organiser journeys

| ID | Step | Expected | Where to look |
| --- | --- | --- | --- |
| O1 | As the organiser account, open `/dash/events`, submit "request an organiser account". | Unverified organiser created; `/dash` shows "awaiting verification". Publishing is blocked. | Console moderation queue (S1) |
| O2 | Request verification again / check status. | Status pending. (Resubmit only appears after a rejection.) | `/moderation` |
| S1 | As staff superuser (MFA enrolled): `admin.staging.barrels.gd/moderation`, open the case, **Reject** with a reason, then have the organiser resubmit, then **Approve**. | Reject emails the owners the reason (only to allowed domains); after approval the organiser can publish. Moderators who are not superusers cannot reach the console. | Outbox kind `organiser.approved` / `organiser.rejected`; audit |
| O3 | In `/dash/events/new`, create and **publish** an event: tiers General EC$50 and a free tier, capacity, **upload a cover image**. | Event page public; image loads via `/files/<id>`. 503 "Uploads are not configured" means `STORAGE_*` missing (row 9). | Logs; Sentry |
| S2 | In the console, `/organisations/<id>` for the organiser: confirm entitlements `events` and `payments` are on. | Paid tiers need `payments`; without it the order is refused or falls to manual. A new organiser gets `events` automatically; `payments` is granted by staff (the seed grants it to the demo organiser). | Console |
| O4 | Buy as attendee A (T1) and as attendee B on the organiser's event. | Orders appear. | Next row |
| O5 | `/dash/events/<id>/orders` and `/attendees`. | Lists page and filter (status, tier, ticket status); the order detail shows buyer name, phone, email (owner/admin only), items, tickets, payment totals, `refund_status`. | none |
| O6 | Outlet sale: `/dash/events/<id>/outlet`, open a till with a float, sell 2 tickets for cash (cash received must equal total), close the till with a count. | Slips print with QR; settlement shows the till. Outlet is **admin/owner only**. | `/dash/events/<id>/settlement` |
| O7 | Record a manual payment: create an order that is on the manual rail (any order when Stripe is unset, or a demo unpaid order), open `/dash/events/<id>/orders/<orderId>` and use "Record manual payment" (cash or bank transfer). | Order confirms, tickets issued, receipt queued. Replaying the click does not double-record (Idempotency-Key). | Ledger: manual `charge` |
| O8 | Door: `/dash/events/<id>/door`, scan or type the code of the ticket from T1, then scan it again. | First: admitted. Second: "Already admitted at HH:MM by ...". Door is **admin/owner only**. | Door list counts |
| O9 | Refund the Stripe order from the order page: first a **partial** refund, then the remainder. | Card refunds are queued, not instant: `refund_status` goes `queued` then `partial`/`refunded` after the worker sends them (outbox topic `events.order_refund_requested`); ticket stops working when fully refunded. | Stripe dashboard Payments → Refunds; Ledger `refund` entries; Outbox topic; webhook `charge.refunded` 200 (duplicate, no double count) |
| O10 | Cancel one order with each choice: **follow policy** (refunded when the event is 48+ hours away, kept inside the window), **full**, **none**. | Matches the choice; outlet cash orders allow only `none`. | Ledger; activity |
| O11 | Cancel the whole event with each refund choice on three separate events (follow policy [default], full, none). | Result counts show queued, refunded, released, kept, failed. Holders and savers are notified. Paid online orders are refunded in full for `follow_policy`. | Outbox `events.notify` rows; Stripe refunds; Ledger |
| O12 | Invite a team member (`/dash/team`). | **Not available until PR #538 lands** and an API gap is closed (section 6). | n/a |

### Staff journeys (host `admin.staging.barrels.gd`)

| ID | Step | Expected | Where to look |
| --- | --- | --- | --- |
| S3 | Moderation queue: tabs, a case, approve and reject (S1 above). | Decisions need an MFA-enrolled active superuser; otherwise a refused-decision message. | Audit log |
| S4 | Entitlements: toggle `events`, `payments` for the demo organiser. | With `events` off, organiser desk routes answer 403 "Barrels Events isn't enabled for this organisation". With `payments` off, paid checkout is not started. A staff-disabled row is never re-enabled automatically. | Event pages |
| S5 | Payments page `/payments`. | Balances, ledger, reconciliation (CSV) match T1, O7 and O9 amounts. | `/api/v1/payments/admin/*` |
| S6 | MFA enrolment at `auth.staging.barrels.gd/security`. | Authenticator code accepted; recovery path shown. | [privileged-mfa.md](privileged-mfa.md) |

### Pass/fail table

Copy and fill in; link evidence (Stripe event id, order id, Sentry link).

| ID | Result (pass / fail / skipped) | Date | Evidence or notes |
| --- | --- | --- | --- |
| A1 | | | |
| A2 | | | |
| T1 | | | |
| T2 | | | |
| T2b | | | |
| T3 | | | |
| T4 | | | |
| A3 | | | |
| A4 | | | |
| A5 | | | |
| A6 | | | |
| O1 | | | |
| O2 | | | |
| S1 | | | |
| O3 | | | |
| S2 | | | |
| O4 | | | |
| O5 | | | |
| O6 | | | |
| O7 | | | |
| O8 | | | |
| O9 | | | |
| O10 | | | |
| O11 | | | |
| O12 | | | |
| S3 | | | |
| S4 | | | |
| S5 | | | |
| S6 | | | |

If the **same check fails twice on the same error**, stop, copy the raw output
and the request id, and hand it to an agent (the repository failure budget).

## 6. Known gaps and expected failures today

Facts from `docs/exec-plans/events-legacy-manage-routes.md` and PRs #510, #519,
#538 (read 2026-10-22). These are **not** bugs to file during acceptance.

- **Rate limits are shared.** No visitor-identity wiring yet (1c item 2), so
  concurrent testers can hit 429s on ordering and sign-in. Space out actions or
  use one tester at a time.
- **Stripe not configured means the manual rail.** With no `sk_test_` key, or if
  Stripe fails to start a checkout, `order_payments.start_payment` silently
  falls back to a manual intent (`checkout_url` is null; the organiser records
  the payment). T1 would then show "Reserved, awaiting payment". Confirm the
  key and URLs first.
- **Team screen is not on dev.** `/dash/team` is PR #538 (open). Known API gaps
  there: bundles have no names or descriptions, the roster route is admin/owner
  only so a plain `events.team.manage` holder sees no member list, no bulk grants
  route, no "who am I" role endpoint. O12 is blocked until it merges and these
  are decided.
- **Door and outlet are admin/owner only.** The legacy `/events/manage/*` routes
  (20 of them) still serve door, outlet, settlement, listing editor and postpone
  and do not check the ADR-0044 keys, so an `events-door` or `events-till` grant
  does not yet let plain members work the door or sell cash. Phase 1 made the
  `events` entitlement a kill switch on them (a switched-off organisation gets
  403 and the web app may show "request an organiser account" instead of the
  entitlement message).
- **Legacy cancel defaults to no money.** `POST /events/manage/{id}/cancel` and a
  listing saved as `cancelled` cancel tickets without refunding. The organiser
  desk cancel (org zone) is the refunding path and needs an organisation-linked
  organiser. An unlinked legacy organiser can only use the no-money cancel.
- **Card refunds are queued** (outbox, retries, dead-letter) and may take up to
  a minute or two; the order shows `queued` meanwhile. Known lows in issue #517:
  cancel outcome can report `refunded` when nothing refunded; a "refund already
  pending" label gap; re-arming a dead refund with a changed amount.
  #514: a partial refund followed by a `charge.refunded` webhook after a crash
  can double count. #515: `order_payments.refund_in_full` uses a random refund id.
- **Notification email only reaches `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS`.**
  Staging defaults to `barrels.gd`. Other addresses get in-app notices only.
  Outbox mail such as the receipt is not domain-gated (1e).
- **Receipts carry no QR, by design.** The QR lives behind sign-in in My tickets.
- **Online-paid tickets cannot be self-cancelled**; there is no in-app refund
  request for attendees. They ask the organiser, who refunds from the order.
- **Buyer email visibility:** only owner/admin of the organising organisation
  see it, and the privacy notice still needs a line before launch (#510).
- **Uploads** need an organisation-linked organiser and configured storage.
- **Public pages do not render uploaded images yet** (apps/web/events AGENTS);
  check the image on the organiser's editor, not the public page. UNVERIFIED: confirm.
- **Console sign-in is off until `BARRELS_ADMIN_SSO_CLIENT_SECRET` is wired**
  (1c item 1); moderation and the payments page depend on it.
- **Moderators without superuser** have no screen (ADR-0039).
- **Revocation of a granted role is not passed on** (#527), relevant once the team
  screen is live.
- **Live mode is impossible** by design (section 2).

## 7. Rollback and cleanup

**Reset the demo data.** The seed is idempotent and has no undo flag. To get a
clean demo:

1. Staging is throwaway, so the simplest reset is to delete the demo rows with
   SQL, or to recreate the staging database volume. Do the narrowest thing you
   can: the demo rows are keyed by the slugs `demo-island-events` and
   `demo-pending-promoters`, the studio id `demo-glow-studio`, and addresses
   matching `demo-%@example.com`. There is no supported delete script; delete
   in dependency order with a reviewed SQL transaction, or ask an agent to write
   one. **UNVERIFIED: confirm** (no reset script exists in the repo).
2. Re-run the seed (section 4). Unpaid demo orders are released by the platform
   expiry job after about 30 minutes and are **not** recreated on a re-run
   unless the order rows are gone.

**Clean up your own test data.** Test events, organisers and orders are
ordinary rows; cancel test events with the refund choice (O11) so Stripe test
refunds settle, then leave them. Stripe test data lives only in Stripe test mode
and can be cleared from the Stripe dashboard if you want a clean slate
(UNVERIFIED: confirm the menu location).

**Roll back the app.** On staging, redeploy the previous `staging` image tag (the
pipeline's rollback in [release-runbook.md](release-runbook.md#rollback--redeploy)
and [deployment.md](../deployment.md)). Application rollback does **not**
reverse migrations. The three #520 revisions are additive or data-only and
safe to leave in place (`eventsentitlement20261022` is data only; leaving it
is documented as downgrade-safe in the release body).

**Switch Stripe off.** Clear the `PAYMENTS_STRIPE_*` secrets and variables and
redeploy: Events falls back to the manual rail, nothing breaks, paid orders
then need "Record manual payment". To pause only deliveries, disable the webhook
endpoint in the Stripe dashboard; undelivered events can be resent later (the
ledger deduplicates).

**Rotate if a secret leaks.** Roll the Stripe key in the dashboard, update the
GitHub secret, redeploy. For `whsec_`, roll the signing secret and update
`PAYMENTS_STRIPE_WEBHOOK_SECRET`.
