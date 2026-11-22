# ADR-0027: Payments core with provider adapters

## Status

Accepted for the test-mode core; implemented in `apps/api/fastapi/src/payments` (PF4, migration `payments20261020`). On 2026-10-20 the owner approved the provider-neutral layer plus a **Stripe test-mode** adapter. The owner also decided to use the owner's existing Stripe account registered in New Zealand on a platform (Connect-style) model where each business is a connected account that receives its own payouts. Who is merchant of record depends on the Stripe charge model, which is an open decision for the accountant and legal review. **Live mode stays off** until the items under "Open before live money" are settled.

**Note, 2026-11-13 (direction under discussion; this decision is not rewritten).** Research on 13 November 2026 found that Stripe Connect cannot onboard a business in a country Stripe does not support, so the connected-account model above does not work for Grenada businesses as written. The direction the owner gave that day (issue #1372, no code yet): try both Stripe and Republic Bank's e-commerce service; each business is paid directly through its own merchant account, and Barrels charges a subscription and does not hold client funds; online payment for bookings is optional, and customers may pay in the salon. Until a new ADR or an amendment records the outcome, the test-mode core here stays as built and live mode stays off.

**Consumers (2026-10-20):** Bookings deposits (B6) and Events paid ticket tiers (N4b, `events_0010`, source type `events.order`) run on this core in test mode only: pending order, held stock, intent keyed by the order, ticket issue on `events.order_paid`, hold expiry sweeper, full refund of a late payment, and `events.order_refunded` cancelling the tickets. The live gate below is unchanged.

## Amendment, 2026-11-21: one provider per country, the business is the seller

Owner decision, 21 November 2026. This amendment overrides the sections above where they conflict: the Barrels-held merchant account model and the Stripe Connect payout model are **not** the live model. The test-mode core stays as built.

**Decisions**

1. **One provider per country, behind the payments core.** Grenada: WiPay (integrated; `providers/wipay.py`) and Republic Bank ePay (the business's own e-commerce link, used through the manual payment link until an integration is approved). New Zealand: Stripe Connect with the business as seller, using direct charges (a separate track, not built here). CARICOM later, one provider per country again.
2. **The business is the seller and the merchant of record for its own sales.** Barrels never holds funds. A customer pays the business's own provider account directly. Barrels charges its own subscription and holds no client money. Refunds and disputes are the business's. The ledger keeps the business's sales record for reconciliation; it is not a balance Barrels owes or holds for online rails.
3. **Live money is gated per provider and per business:**
   - credentials are the business's own, stored encrypted under the organisation keys (`payments.merchant_account`; 503 when the keys are unset);
   - a sandbox test payment must verify first (the sandbox proof is recorded automatically);
   - the owner switches live on (`POST /payments/admin/merchant-accounts/{organisation_id}/{provider}/live-approval`, superuser only), and can switch it off at once;
   - the existing gate still applies: an accountant and legal sign-off, and a reconciliation exercise, before the first live sale.
4. **Barrels platform fee on Grenada payments: off.** No fee is charged. The legal reading of Grenada's Payment System and Services Act 2025 is in progress. `PAYMENTS_GRENADA_PLATFORM_FEE_ENABLED` exists, defaults to false, and is refused at startup while true, because nothing implements it.
5. **Bookings deposit route** (`bookings/deposit_payments.deposit_route`): the business's WiPay account when ready; else the Stripe test rail when configured (test mode, as before); else the business's own payment link when it has one (staff confirm the payment with method `payment_link`); else no online deposit, and the booking is paid in the salon. A business with a Stripe connected account (Connect, New Zealand) is not WiPay-ready: its card payments stay on Connect (`wipay._has_connected_account`).
6. **Refunds of WiPay payments are not recorded here.** WiPay's Payments API has no refund call; a refund is made in the WiPay dashboard and the API answers 409 (`ManualRefundRequiredError`). Recording a dashboard refund is a follow-up.

**Facts about Stripe and Grenada** (owner statement and the research of 13 November 2026; not re-verified in this change): Stripe does not offer Grenada businesses a Stripe account, so a Grenada business cannot be onboarded as a connected account; a New Zealand platform cannot pay out cross-border to Grenada. Stripe therefore stays test-mode only for this product. The New Zealand track depends on Stripe Connect's own country rules and is not affected by this decision.

**WiPay (Grenada platform, public docs read 21 November 2026):** hosted checkout via `POST {host}/plugins/payments/request` with `account_number`, `country_code` (GD), `currency`, `environment` (`sandbox` or `live`), `fee_structure`, `method`, `order_id`, `origin`, `response_url`, `total`. The redirect is verified with `hash = md5(transaction_id + total + api_key)` using the total we sent, to two decimal places. Webhooks are verified with `X-WiPay-Webhook-Signature: sha256=` HMAC of `timestamp.body` using the endpoint's secret. The return and the webhook both credit the same ledger key (`wipay:<transaction_id>`), so each payment is recorded once.

**Open before live money (additions, review round 2):** WiPay must confirm in writing (sandbox merchant) whether the hash is sent on failed results and how webhook delivery and retries behave; until then the browser return never credits a live payment (only the signed webhook does), and the owner's live approval waits for that confirmation. The sandbox proof is self-asserted by the business's own test checkout (documented; WiPay's sandbox is not a merchant's account). In production the WiPay sandbox takes no customer deposit (`wipay.production`). Also listed: the WiPay variables are not yet wired into the deployment (`deploy.yml`, `docker-compose.deploy.yml`, `render-env.py` are owner-merge files; a follow-up); WiPay sandbox credentials for the business (WiPay's public sandbox account is shared and is not a merchant's account); the webhook endpoint registered in WiPay's dashboard; Grenada legal reading (fee, licence); a WiPay refund procedure; Republic Bank ePay approval, if it is wanted as an integration rather than a link.

**Consequences:** Barrels' own money exposure for online rails is nil under this model, so the old "Funds sit on Barrels' merchant account" statements in `src/payments/AGENTS.md` are superseded. The manual payout route stays for manual rails and the test core.

## Context

Events paid tiers, Bookings deposits (ADR-0024, B6) and online invoice payment all need the same things: payment intents, provider callbacks, refunds and reconciliation.

Earlier decisions parked card checkout until a provider onboards Barrels:
- Events pilot: owner decision, 2026-10-18.
- Deposits through a neutral adapter: owner decision, 2026-10-19.

The owner has now asked for the core to be built ahead of that.

## Evidence

**Facts (2026-10-20):**
- `src/billing/gateway.py` is a `StripeGateway` protocol with only `create_subscription_checkout` and webhook verification. There is no Republic Bank ePay code. (high)
- Money already moves through manual records:
  - invoice manual payments (`src/billing/invoices.py`)
  - Events outlet cash and manual refunds (`src/events/service/outlet.py`, `cancellation.py`)
  (high)
- At the time of writing, Events refused paid tiers and Bookings had `deposit_minor` and `pending_payment` with nothing behind them; both now run on this core in test mode (see Consumers above; `src/events/order_payments.py`, `src/bookings/deposit_payments.py`). (high)

**Interpretation:**
- One ledger across manual and online payments makes settlement and reconciliation a single report rather than one per domain. (best practice, high)

**Uncertainty (see "Open before live money"):**
- Whether Stripe, from a New Zealand account, can pay out to Grenadian bank accounts in XCD. Unverified, low confidence. If it can't, Stripe stays test-only and Republic Bank ePay becomes the live rail.
- Chargeback, refund, tax and licensing duties, which depend on who is merchant of record. An accountant and legal review are needed. (medium)

## Options considered

1. **Wait for a provider.** No speculative code, but Events, Bookings and Pay all stay blocked, and each may later build its own integration.
2. **Payments core with adapters (chosen).**
   - A `payments` domain: `intent`, `attempt`, an append-only `ledger_entry`, and `refund`.
   - A `PaymentProvider` protocol: create, verify callback, refund, fetch status.
   - Adapters: `manual` (cash, bank, cheque; covers today's records) and `stripe` (test mode).
3. **Barrels holds all funds in its own account and pays out by hand.** No onboarding for businesses, but Barrels would hold client money, with possible trust-account duties. Rejected as the live model; the manual payout record remains for cash and bank payments.

## Decision

Build option 2 in PF4.
- Amounts are integer minor units, with the currency stated on every row.
- The ledger is append-only, following the rewards ledger pattern: a trigger rejects deletes and amount updates.
- Provider callbacks go through the PF2 idempotency and outbox primitives.
- Payments run on the owner's Stripe account (registered in New Zealand). Each business is a connected account (Connect-style platform model) and receives its own payouts. The ledger records what each organisation is owed; manual payouts for cash and bank payments appear in settlement reports.
- The first consumer is an Events paid tier or a Bookings deposit in Stripe test mode, whichever is ready first.

**Live gate:**
- the owner enables a live provider;
- every item under "Open before live money" is settled;
- an accountant and legal sign-off exist;
- a reconciliation exercise passes.

### Open before live money

- Confirm that Stripe NZ can pay out to Grenadian bank accounts, in XCD or another currency (Connect cross-border payout limits).
- Decide chargeback and refund handling, and who bears a lost dispute.
- Decide the Stripe charge model (direct, destination, or separate charges and transfers), which sets who is merchant of record. The accountant and legal review decide it.
- Decide what tax records Barrels keeps under that model.
- Check whether Grenada requires any licence for this activity.
- Per-transaction fees. Stripe charges them, so this is an exception to the free/open-source-only preference. The cost per transaction and any currency-conversion fee must be stated before live mode.

Live mode stays off until the payout route is confirmed.

**Connect scope (2026-11-21, owner review):** Stripe Connect in this codebase is for New Zealand businesses only (a New Zealand platform account, New Zealand connected accounts, NZD charges). Businesses outside New Zealand are not onboarded through Connect in this code. A connected business's money is not Barrels' money and is kept out of the platform balances and payouts.

## Consequences

- Events, Bookings and Pay stop needing payment code of their own.
- Depending on the charge model chosen, Barrels may take on refund, dispute, tax and reconciliation duties when it goes live.
- `billing/gateway.py` moves onto the protocol, and its Stripe subscription checkout becomes one adapter use.
