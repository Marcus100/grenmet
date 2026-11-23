# ADR-0065: Barrels app subscriptions

## Status

Accepted 22 November 2026 for **test mode only**. Built in slices: slice 1 (API:
plans, prices, subscriptions, Stripe reports) is in `src/billing`. The entitlement
link is decided here but **not built**: it needs its own slice and an owner go.
Live money stays gated by ADR-0027 ("Open before live money").

Amended 22 November 2026 (issue #1723, follow-ups to the slice 1 review): access is
the organisation role alone, not a global key; a repeat checkout resumes an open
Checkout instead of being refused for 24 hours; webhook rows are locked; live-mode
events are refused; an event for a row not yet written is retried by Stripe for two
hours rather than recorded; and same-second events are applied in order, not dropped. The amendments are in
the Decision section below.

## Context

Barrels sells per-app subscriptions, Bookings first (owner direction, 22 November
2026). Organisations pay Barrels for an app, so Barrels is the seller of its own
subscriptions. The payments direction of 21 November keeps each business as the
seller of its own bookings and events, with the provider chosen per country, and
ADR-0027's 13 November note records that Stripe cannot onboard Grenada businesses.
Subscriptions are Barrels' own revenue, so they do not depend on that onboarding.

The existing billing code (`src/billing`) has Stripe Checkout for one configured
Price tied to a user, with no persistence, and the invoicing control plane. The
payments core (ADR-0027) is test-mode only and is built for bookings deposits and
events tickets, not for Barrels' subscriptions.

## Evidence

- **Facts:** `src/billing/gateway.py` has a Stripe Checkout adapter with no test-key
  guard; `src/payments/providers/stripe.py` refuses any non-`sk_test_` key before a
  request (high).
- **Facts:** owner decisions on 22 November 2026: Bookings XCD 30 a month; XCD only,
  with USD shown only as a converted note; Babydoll's first month free (high).
- **Facts:** the organisation routes gate app access with `org.organisation_app`
  (`src/organisations/entitlements.py`). A subscription must not change that until the
  entitlement link is approved (high).
- **Interpretation:** a separate `billing.app_subscription` table keeps the seller
  relationship apart from the payments ledger, which tracks money for other businesses.
  (heuristic, medium)
- **Uncertainty:** whether Stripe presents XCD prices on a New Zealand account for
  Grenadian customers. Unverified. The first check is creating the XCD price in test
  mode. If Stripe refuses XCD, the live rail is Republic Bank ePay or another
  provider, and this ADR is amended. (low)
- **Uncertainty:** whether Stripe's current API still returns `current_period_end` on
  the subscription or only on its items. The webhook reads both. (medium)

## Options considered

1. **Stripe Billing, subscription Checkout, separate app subscription table (chosen).**
   Uses the SDK already pinned, hosted payment pages (no card data here), and Stripe's
   own retries and dunning. Cost: Stripe fees per transaction, which ADR-0027 already
   requires stating before live mode.
2. **Reuse the payments ledger for subscriptions.** Would mix Barrels' revenue with
   money held for other businesses, and the ledger is append-only per intent. Rejected.
3. **Invoice-only billing through the invoicing control plane.** No card; slower cash.
   Kept as the second channel (`channel = invoice`), not built.
4. **Build our own recurring charge.** Needs card storage or a tokenisation scheme we
   do not have. Rejected.

## Decision

- **Seller:** Barrels sells its own app subscriptions. The Stripe account is Barrels'
  NZ account, and it is used for Barrels' subscriptions only. Businesses' own sales
  (bookings deposits, events tickets) stay on the payments core under ADR-0027.
- **Channels:** `stripe` (card, hosted Checkout, built) or `invoice` (column present,
  not built).
- **Test mode:** every Stripe call is refused with 503 unless the secret key starts
  with `sk_test_`. The refusal happens before any request. Live mode starts only when
  the owner says so and the ADR-0027 live gate is met. Webhook events that Stripe
  marks `livemode: true` are refused with 503 before anything is written or recorded,
  so a live event is never applied by accident and can be delivered again later.
- **Access:** the checkout and listing routes are gated by the organisation role
  alone (`OrgAdmin`: owner or admin of the organisation). A superuser who is not a
  member gets 404 (no bypass). No global permission key is used; see ADR-0044 for
  why organisation-bound keys would need a product entitlement that this slice does
  not have.
- **Resume:** a repeat checkout while a pending row exists returns that row's open
  Checkout Session (same id and URL). A session Stripe reports as expired cancels the
  pending row (`incomplete` to `canceled`), and a new row replaces it. A session
  Stripe reports as complete is refused (409) until the webhook moves the row. The
  session id is stored on the row (`checkout_session_id`, additive).
- **Currency:** XCD only for now. USD may appear as a converted note, never as a
  charge.
- **Prices:** `BILLING_STRIPE_PRICES` maps `plan_key:currency` to a Stripe price id.
  The plan's amount lives in `billing.plan_price` in minor units. Bookings is
  `bookings-monthly` at XCD 3000.
- **Trials:** optional per plan (`BILLING_APP_TRIAL_DAYS`). Babydoll's first month
  free is an owner decision for its plan, to be configured when the Babydoll plan is
  added.
- **Entitlement link (not built):** a later slice may switch an organisation's
  `org.organisation_app` entitlement on an active subscription, behind an
  off-by-default flag. Until then no subscription changes app access.
- **States:** `incomplete`, `active`, `past_due`, `canceled`, `unpaid`, moved only
  through `src/billing/app_subscription_transitions.py`. A canceled subscription stays
  canceled. One live subscription per organisation and app (partial unique index).
- **Idempotency:** Stripe event ids are recorded in `billing.stripe_event` in the same
  transaction as their effect; repeats change nothing. An event strictly older than
  the last applied event is ignored. Stripe times are whole seconds, so a same-second
  event is applied in delivery order and is not treated as stale: a subscription's
  created and updated events often share a second, and dropping the later one would
  leave a paid subscription incomplete. The transition table settles the rest: a
  backward move is refused (a canceled row stays canceled) and a repeat status is a
  no-op. An event that names one of our rows (`app_subscription_id` metadata) when
  that row does not exist yet is not recorded and is answered 503, so Stripe sends it
  again, for up to two hours after Stripe created it; an older event is recorded and
  ignored with 200 so that rows from another environment do not retry for days. The row lookups for webhook events
  take a row lock (`FOR UPDATE`), so a concurrent pair for one subscription waits
  instead of hitting the unique index on `stripe_subscription_id`.
- **Naming:** the domain is `billing`. The word "subscriptions" in routes is the
  product name; it does not belong to `src/subscriptions` (mailing lists).

## Consequences

- Barrels can take recurring XCD payments in test mode and see subscription status
  per organisation. Nothing grants access yet.
- Stripe test dashboard steps are required before the flow works end to end (listed in
  the PR and in `docs/api/contracts.md`).
- Live mode needs: the ADR-0027 gate, the XCD presentment check, the fee statement,
  the tax treatment for Barrels' own sales (accountant), and a reconciliation exercise.
- The older `POST /billing/checkout-sessions` route (the invoicing-era one-off
  Checkout for the signed-in user, `src/billing/service.py`) is **guarded now**: it
  goes through the same `_require_test_key` check in `gateway.py`, so a live key is
  refused with 503 before any request (test in `tests/billing/test_app_subscriptions.py`).
  It is not an app subscription: it creates no row and no `app_subscription_id`
  metadata, so its webhook events are not applied here. It stays for compatibility
  and must be removed or moved onto the app subscription flow before live mode.
