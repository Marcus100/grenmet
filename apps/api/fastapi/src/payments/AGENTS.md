# payments domain — agent context

**Owner:** Barrels platform (PF4; ADR-0027; plan: `docs/exec-plans/barrels-foundations-plan.md`). Not a GAA/GMS module. Consumers (Events paid tiers, Bookings deposits, invoice payment) are wired by their own domains later; this domain imports none of them.

## Hard rule: no live card rail
Stripe runs in **test mode only**. `providers/stripe.py` refuses (503) any `PAYMENTS_STRIPE_SECRET_KEY` that does not start with `sk_test_` before a request is made, refuses callbacks while `PAYMENTS_STRIPE_WEBHOOK_SECRET` is unset or not `whsec_...`, and is disabled while the key is unset. `tests/payments/test_providers.py` asserts a live key sends nothing. Going live needs the ADR-0027 gate (owner decision, accountant and legal sign-off, reconciliation exercise); do not weaken the guard without it.

## Model (schema `payments`, migration `payments20261020`)
- `intent`: amount (integer minor units) + 3-letter currency (default XCD), status `requires_payment/processing/succeeded/failed/cancelled`, `provider` (`manual`/`stripe`), `provider_ref` (Checkout Session), `provider_payment_ref` (Stripe PaymentIntent, set on capture), `source_type`/`source_id` (what is sold, e.g. `bookings.deposit`), `customer_email_hash` (SHA-256 only, the address is never stored or sent to Stripe), `metadata` JSONB (no personal data), `idempotency_key` unique per organisation.
- `attempt`: one try per online checkout. `refund`: amount, reason, status. `ledger_entry`: the money record.
- **`ledger_entry` is append-only.** A trigger rejects DELETE and any UPDATE (only `created_by_user_id` may be nulled when a user is removed). Signed `amount_minor`: charge +, refund/fee/payout -, adjustment either. Check constraints enforce the signs. Unique `(provider, provider_event_id)` is the callback idempotency key (manual charges use `manual:<intent>`, refunds `refund:<id>`, payouts `payout:<uuid>`). Balances are SUMs in SQL, never stored. Test cleanup (`tests/conftest.py`) disables the trigger inside its own transaction.

## Flows
- Funds sit on Barrels' merchant account; the ledger says what each organisation is owed. Payouts are manual `payout` entries created by a superuser and cannot exceed the balance (advisory lock per organisation).
- **Manual rail** (cash, bank, cheque): create an intent with `provider=manual`, then staff `POST .../manual-payments`; it succeeds immediately and writes the charge.
- **Stripe rail**: create returns a hosted Checkout URL (intent `processing`); the webhook `POST /payments/public/webhooks/stripe` maps `checkout.session.completed` (charge), `payment_intent.payment_failed` (failed attempt) and `charge.refunded`. A callback locks the intent row, checks the ledger key, and answers 2xx for anything already processed. A captured amount that differs from the intent is logged and not credited. `charge.refunded` records only the difference between the provider's refunded total and what the app already recorded (a dashboard refund), so an app refund is not counted twice.
- **Refunds** lock the intent and refuse more than captured minus already refunded (pending + succeeded) with 422. A provider failure rolls back (502).
- Webhook signatures are verified in-house (HMAC-SHA256 over `t.payload`, `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` window, constant-time compare, any `v1` may match for rotated secrets). The adapter talks to `api.stripe.com` over httpx; tests swap `providers.stripe._transport` with `httpx.MockTransport` (see `tests/payments/conftest.py`). `fetch_status` exists on the protocol and adapter but no route calls it yet.

## Routes (`/api/v1/payments`, ADR-0025 zones)
- `org/*`: OrgAdmin with the `payments` entitlement (`require_org_app`): create/list/get intents, record manual payment, refund, balance. Other organisations' ids answer 404.
- `public/webhooks/{provider}`: signature-authenticated, hidden from OpenAPI (like the billing webhook).
- `admin/*`: superuser only: all intents, ledger, balances, payouts, reconciliation JSON and `reconciliation.csv` (Events settlement CSV style, formula-neutralised cells). Periods are Grenada days, both ends inclusive.

## Settings
`PAYMENTS_STRIPE_SECRET_KEY`, `PAYMENTS_STRIPE_WEBHOOK_SECRET`, `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` (all unset by default = Stripe off), `PAYMENTS_STRIPE_API_BASE`, `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS`, `PAYMENTS_REQUEST_TIMEOUT_SECONDS` (`config.py`).

## Known gaps
No audit-log registration for payments tables yet (the ledger itself is the record). A refund the provider later marks failed is not reversed automatically. Stripe Connect is deferred (ADR-0027, option 3).

## Tests
`tests/payments/`: `test_payments.py` (manual flow, idempotent create, refund limits, cross-organisation denial, ledger trigger and signs, webhook replay/signature/mismatch/failure/refund, admin, payouts, reconciliation and CSV), `test_providers.py` (live-key refusal, signature valid/invalid/stale, Stripe client over a mock transport, manual provider), `test_payments_migration.py`.
