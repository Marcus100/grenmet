# ADR-0027: Payments core with provider adapters

## Status

Accepted for the test-mode core; implemented in `apps/api/fastapi/src/payments` (PF4, migration `payments20261020`). On 2026-10-20 the owner approved the provider-neutral layer plus a **Stripe test-mode** adapter. The owner also decided that Barrels Grenada is the merchant of record, using the owner's existing Stripe account registered in New Zealand, on a platform (Connect-style) model where each business is a connected account that receives its own payouts. **Live mode stays off** until the items under "Open before live money" are settled.

**Consumers (2026-10-20):** Bookings deposits (B6) and Events paid ticket tiers (N4b, `events_0010`, source type `events.order`) run on this core in test mode only: pending order, held stock, intent keyed by the order, ticket issue on `events.order_paid`, hold expiry sweeper, full refund of a late payment, and `events.order_refunded` cancelling the tickets. The live gate below is unchanged.

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
- Chargeback, refund, tax and licensing duties for a merchant of record. An accountant and legal review are needed. (medium)

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
- Barrels Grenada is merchant of record on the owner's Stripe account (registered in New Zealand). Each business is a connected account (Connect-style platform model) and receives its own payouts. The ledger records what each organisation is owed; manual payouts for cash and bank payments appear in settlement reports.
- The first consumer is an Events paid tier or a Bookings deposit in Stripe test mode, whichever is ready first.

**Live gate:**
- the owner enables a live provider;
- every item under "Open before live money" is settled;
- an accountant and legal sign-off exist;
- a reconciliation exercise passes.

### Open before live money

- Confirm that Stripe NZ can pay out to Grenadian bank accounts, in XCD or another currency (Connect cross-border payout limits).
- Decide chargeback and refund handling, and who bears a lost dispute.
- Decide what tax records Barrels keeps as merchant of record.
- Check whether Grenada requires any licence for this activity.
- Per-transaction fees. Stripe charges them, so this is an exception to the free/open-source-only preference. The cost per transaction and any currency-conversion fee must be stated before live mode.

Live mode stays off until the payout route is confirmed.

## Consequences

- Events, Bookings and Pay stop needing payment code of their own.
- As merchant of record, Barrels takes on refund, dispute, tax and reconciliation duties when it goes live.
- `billing/gateway.py` moves onto the protocol, and its Stripe subscription checkout becomes one adapter use.
