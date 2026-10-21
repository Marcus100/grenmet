# ADR-0024: Barrels Bookings, a shared organisation-scoped appointments domain

## Status

Accepted — 2026-10-19 by the project owner. Build plan: the B-series in the
[Barrels foundations plan](../exec-plans/barrels-foundations-plan.md#bookings).

## Context

Service businesses (salons, garages, car washes, clinics) need online booking,
and it is listed under "Appointments" in the
[integration opportunities](../strategy/integration-opportunities.md). The first
client, Babydoll Beauty Bar (`apps/web/babydoll`, live at `babydoll.barrels.gd`),
sends visitors to a third-party Acuity page. The owner wants one FastAPI booking
API that every Barrels app can use, with Babydoll as the first tenant. Backend
logic belongs in Python ([ADR-0015](0015-retire-hono-python-backend.md)), and
tenant data is scoped by platform organisation
([ADR-0022](0022-platform-organisations-and-memberships.md)).

## Evidence

- **Facts:**
  - No booking domain exists. Events ticketing (`src/events`) models
    fixed-capacity listings. The HR, janitorial and transport rosters model
    staff shifts, not customer appointments. (high)
  - `OrgContext` (`X-Barrels-Organisation`, `OrgMember`/`OrgAdmin`) and the
    rewards domain give a tested organisation-scoped pattern. (high)
  - The email outbox (`enqueue_email_once`), ARQ cron jobs, Turnstile and the
    rate limiter already back public forms and reminders. (high)
  - Easy!Appointments is GPL-3 (PHP and MySQL, one business per install). It has
    a proven model of services, providers, weekly working plans, breaks and
    exceptions. (high)
  - Cal.com's public repository is now "Cal.diy". It is MIT, recommended for
    non-production use only, and has no organisations or teams. (high)
  - `src/billing` has only a user-scoped Stripe subscription checkout. The
    provider-neutral adapter (Events E6) was blocked on Republic Bank ePay.
    (high)
- **Interpretation:**
  - A native domain fits the monolith, tenancy, audit and generated client.
    Running an external engine would add a second language, database engine and
    one install per tenant. (best practice, high)
- **Uncertainty:**
  - Whether Stripe will onboard Barrels as a Grenada business. (low)
  - The Republic Bank ePay integration terms. (unknown)
  - Either one changes only which payment provider ships first, not this design.

## Options considered

1. **Self-host Easy!Appointments behind a FastAPI adapter.** Proven engine and
   admin panel, but PHP and MySQL, one instance per tenant, and two sources of
   truth.
2. **Self-host Cal.diy.** Rejected: its maintainers mark it non-production, and it
   has no tenancy.
3. **Native FastAPI and Postgres domain porting Easy!Appointments' model (chosen).**
   One stack, real multi-tenancy, database-enforced overbooking guards, and full
   control of the public and studio APIs. The cost is more code to own.

## Decision

1. **New `bookings` domain** (`apps/api/fastapi/src/bookings/`) in the main
   database, `bookings` schema. Every row carries `organisation_id`, and studio
   routes run behind `OrgContext` with cross-organisation denial tests.
2. **Clean-room port.** We reimplement Easy!Appointments' concepts and behaviour:
   - booking profile, services with durations and buffers;
   - providers and the services they perform;
   - weekly working plans with breaks, and dated exceptions;
   - customers, bookings and a booking event log.

   No GPL code, schema files or text are copied, so the result stays Barrels IP.
3. **No double-booking, enforced by Postgres.** An exclusion constraint
   (`btree_gist`) covers each provider's active bookings, including buffers. A
   concurrent second booking for the same slot gets 409.
4. **Availability is a pure function.** It takes working plan, breaks,
   exceptions and existing bookings, and returns slots in the organisation's
   timezone. It has no database access and is tested in isolation. A shared
   timezone helper replaces the repeated `ZoneInfo("America/Grenada")`.
5. **Public and studio surfaces.**
   - Public, unauthenticated routes are keyed by the profile's `public_slug`:
     services, availability, create, and manage by a hashed single-purpose
     token. They use Turnstile, a honeypot, rate limits and idempotency keys.
   - Studio routes are organisation-scoped.
   - Client sites call the API directly, so their origins go in
     `BACKEND_CORS_ORIGINS`. Next.js route handlers only proxy.
6. **Payments on Barrels' merchant account through one adapter.** *Superseded by ADR-0027 (separate `src/payments` core); the billing gateway does not become the adapter.* Customer model: see ADR-0028 (party/role: contacts hold personal data). The billing
   gateway becomes the provider-neutral adapter (create hosted payment, verify
   callback, refund, status), with Stripe and Republic Bank ePay as providers.
   - Deposits hold a booking as `pending_payment` until the payment callback
     confirms it.
   - Barrels pays clients out through settlement and invoicing.
   - Payments are built only after a provider has onboarded Barrels.

7. **Frontend-agnostic API** (owner rule, 2026-10-19). Any client can use it:
   web, mobile, kiosk or bot.
   - Plain HTTP and JSON described by OpenAPI. Times are UTC, alongside the
     business's IANA timezone. Money is in minor units with a currency. No
     HTML or framework assumptions.
   - Links to a business's own pages come from profile settings
     (`manage_url_template`), never a hard-coded site.
   - Public endpoints are keyed by slug, not origin. Bot protection on booking
     creation must not depend on a single browser widget. Trusted server and
     mobile clients get a key-based path when they need one.
   - Schema names carry a `Booking` prefix so they never collide in the shared
     OpenAPI document.

## Consequences

- Any Barrels app can add booking with a booking profile and a few pages. The
  second tenant needs no new backend code.
- "Card checkout, payouts" leaves "Do not build yet" for booking deposits only,
  through the adapter.
- Barrels holds client money once deposits are on. Settlement, refunds and
  reconciliation become Barrels duties.
- Customer contact data is organisation-scoped personal data. It follows the
  email-hash and retention rules (`src/utils/email_hash.py`,
  `src/worker/retention.py`).
- Acuity stays in use for Babydoll until the owner switches over.
