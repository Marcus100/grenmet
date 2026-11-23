# ADR-0065: Barrels app subscriptions

## Status

Accepted 22 November 2026 for **test mode only**. Built in slices: slice 1 (API:
plans, prices, subscriptions, Stripe reports) is in `src/billing`. The entitlement
link is decided here but **not built**: it needs its own slice and an owner go.
Live money stays gated by ADR-0027 ("Open before live money").

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
  the owner says so and the ADR-0027 live gate is met.
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
  transaction as their effect; repeats change nothing. Events older than the last
  applied event for a subscription are ignored.
- **Naming:** the domain is `billing`. The word "subscriptions" in routes is the
  product name; it does not belong to `src/subscriptions` (mailing lists).

## Consequences

- Barrels can take recurring XCD payments in test mode and see subscription status
  per organisation. Nothing grants access yet.
- Stripe test dashboard steps are required before the flow works end to end (listed in
  the PR and in `docs/api/contracts.md`).
- Live mode needs: the ADR-0027 gate, the XCD presentment check, the fee statement,
  the tax treatment for Barrels' own sales (accountant), and a reconciliation exercise.
- The older `POST /billing/checkout-sessions` route has no test-key guard. It is
  unchanged here and should be guarded or removed before live mode (see the PR).
