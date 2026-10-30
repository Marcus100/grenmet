# payments domain — agent context

**Owner:** Barrels platform (PF4; ADR-0027; plan: `docs/exec-plans/barrels-foundations-plan.md`). Not a GAA/GMS module. Consumers (Events paid tiers, Bookings deposits, invoice payment) are wired by their own domains; this domain imports none of them.

## Hard rule: no live card rail
Stripe runs in **test mode only**. `providers/stripe.py` refuses (503) any `PAYMENTS_STRIPE_SECRET_KEY` that does not start with `sk_test_` before a request is made, refuses callbacks while `PAYMENTS_STRIPE_WEBHOOK_SECRET` is unset or not `whsec_...`, and is disabled while the key is unset. `tests/payments/test_providers.py` asserts a live key sends nothing. Going live needs the ADR-0027 gate (owner decision, accountant and legal sign-off, reconciliation exercise); do not weaken the guard without it.

## Model (schema `payments`, migration `payments20261020`)
- `intent`: amount (integer minor units) + 3-letter currency (default XCD), status `requires_payment/processing/succeeded/failed/cancelled`, `provider` (`manual`/`stripe`), `provider_ref` (Checkout Session), `provider_payment_ref` (Stripe PaymentIntent, set on capture), `source_type`/`source_id` (what is sold, e.g. `bookings.deposit`), `customer_email_hash` (SHA-256 only, the address is never stored or sent to Stripe), `metadata` JSONB (no personal data), `idempotency_key` unique per organisation.
- `attempt`: one try per online checkout. `refund`: amount, reason, status. `ledger_entry`: the money record.
- **`ledger_entry` is append-only.** A trigger rejects DELETE and any UPDATE (only `created_by_user_id` may be nulled when a user is removed). Signed `amount_minor`: charge +, refund/fee/payout -, adjustment either. Check constraints enforce the signs. Unique `(provider, provider_event_id)` is the callback idempotency key (manual charges use `manual:<intent>`, refunds `refund:<id>`, payouts `payout:<uuid>`). Balances are SUMs in SQL, never stored. Test cleanup (`tests/conftest.py`) disables the trigger inside its own transaction.

## Flows
- Funds sit on Barrels' merchant account; the ledger says what each organisation is owed. Payouts are manual `payout` entries created by a superuser and cannot exceed the balance (advisory lock per organisation).
- **Manual rail** (cash, bank, cheque): create an intent with `provider=manual`, then staff `POST .../manual-payments`; it succeeds immediately and writes the charge.
- **Stripe rail**: create returns a hosted Checkout URL (intent `processing`); the webhook `POST /payments/public/webhooks/stripe` maps `checkout.session.completed` (charge), `payment_intent.payment_failed` (failed attempt) and `charge.refunded`. A callback locks the intent row, checks the ledger key, and answers 2xx for anything already processed. A captured amount that differs from the intent is logged and not credited. `charge.refunded` reconciles the refunds the provider lists on the charge: each succeeded refund is matched to our row by our refund id (echoed in the refund's `metadata.refund_id`, which every core refund sends) and then by the provider refund id; a refund we did not record (our call lost before commit, or a dashboard refund) is written once, under our id when it has one. Only when the list is complete is the remainder taken from `amount_refunded` minus what is recorded; a truncated list (`has_more`) is not guessed from the total.
- **Refunds** lock the intent and refuse more than captured minus already refunded (pending + succeeded) with 422. A provider failure rolls back (502).
- Webhook signatures are verified in-house (HMAC-SHA256 over `t.payload`, `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` window, constant-time compare, any `v1` may match for rotated secrets). The adapter talks to `api.stripe.com` over httpx; tests swap `providers.stripe._transport` with `httpx.MockTransport` (see `tests/payments/conftest.py`). `fetch_status` exists on the protocol and adapter but no route calls it yet.

## Routes (`/api/v1/payments`, ADR-0025 zones)
- `org/*`: OrgAdmin with the `payments` entitlement (`require_org_app`): create/list/get intents, record manual payment, refund, balance. Other organisations' ids answer 404.
- `POST org/intents` refuses `source_type` values owned by another domain (`RESERVED_SOURCE_TYPES`: `bookings.deposit`, `events.order`, from `PAID_TOPICS`/`REFUND_TOPICS`) with 422 (`reject_reserved_source`); those domains create intents through the service. Bookings records a deposit taken by hand with `record_manual_payment` (see `src/bookings/AGENTS.md`). `refund_intent(refund_id=)` is replay-safe: an existing refund with that id on the intent is returned as is, another intent's id is 409, and Stripe uses `refund-<id>` as its idempotency key (used by the Events refund outbox handler).
- `public/webhooks/{provider}`: signature-authenticated, hidden from OpenAPI (like the billing webhook).
- `admin/*`: superuser only: all intents, ledger, balances, payouts, reconciliation JSON and `reconciliation.csv` (Events settlement CSV style, formula-neutralised cells). Periods are Grenada days, both ends inclusive.

## Settings
`PAYMENTS_STRIPE_SECRET_KEY`, `PAYMENTS_STRIPE_WEBHOOK_SECRET`, `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` (all unset by default = Stripe off), `PAYMENTS_STRIPE_API_BASE`, `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS`, `PAYMENTS_REQUEST_TIMEOUT_SECONDS` (`config.py`).

## Known gaps
No audit-log registration for payments tables yet (the ledger itself is the record). A refund the provider later marks failed is not reversed automatically. Stripe Connect is deferred (ADR-0027, option 3).

## Tests
`tests/payments/`: `test_payments.py` (manual flow, idempotent create, refund limits, cross-organisation denial, ledger trigger and signs, webhook replay/signature/mismatch/failure/refund, admin, payouts, reconciliation and CSV), `test_providers.py` (live-key refusal, signature valid/invalid/stale, Stripe client over a mock transport, manual provider), `test_payments_migration.py`.

- **Payout idempotency:** `POST /payments/admin/payouts` requires a client-generated `request_id` (UUID). It becomes the ledger's `provider_event_id` (`payout:<request_id>`), so a double click or retry returns the original entry, and the same id with another organisation, amount or currency is a 409. The admin confirmation page renders one id per page view.
- **Webhooks:** a captured payment emits `payment.succeeded`, a refund emits `payment.refunded` (`_emit_payment_event`): ids, amounts, currency and the source reference only; the refund reason is free text and is never sent.


- **Service actor and consumer hooks (Bookings B6):** `create_intent` and `refund_intent` take `actor: User | None`; `None` means the system acts for an anonymous customer or a rule, and `created_by_user_id` is NULL (the org routes still pass the member). `find_by_source(organisation_id, source_type, source_id)` returns the newest intent with its captured and refunded totals; `cancel_open_intent(...)` locks it and cancels an unpaid one (returns False when it already succeeded). `_capture` enqueues an outbox topic from `PAID_TOPICS` (`bookings.deposit` -> `bookings.deposit_paid`, dedupe key = intent id) in the same transaction as the ledger charge; the consuming domain registers the handler, payments imports nothing of it. Add a source type by adding it to `PAID_TOPICS`. `PAID_TOPICS` now also maps `events.order` -> `events.order_paid` (Events paid tiers, N4b). `REFUND_TOPICS` (`events.order` -> `events.order_refunded`) enqueues a topic for every recorded refund (app refund or a provider-dashboard refund via `charge.refunded`), dedupe key = refund id, payload `intent_id`, `source_id`, `refund_id`; a source type without an entry is not told. Tests: `tests/payments/test_refund_topics.py`.
