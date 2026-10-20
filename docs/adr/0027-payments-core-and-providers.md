# ADR-0027: Payments core with provider adapters

## Status

Accepted for the test-mode core; implemented in `apps/api/fastapi/src/payments` (PF4, migration `payments20261020`), live rail still gated. On 2026-10-20 the owner approved the provider-neutral layer plus a **Stripe test-mode** adapter now (foundations slice PF4), with funds held on Barrels' merchant account. No live card rail ships until the owner approves it separately.

**Consumers (2026-10-20):** Bookings deposits (B6) and Events paid ticket tiers (N4b, `events_0010`, source type `events.order`) run on this core in test mode only: pending order, held stock, intent keyed by the order, ticket issue on `events.order_paid`, hold expiry sweeper, full refund of a late payment, and `events.order_refunded` cancelling the tickets. The live-rail gate above is unchanged.

## Context

Events paid tiers, Bookings deposits (ADR-0024, B6) and online invoice payment all need the same things: payment intents, provider callbacks, refunds and reconciliation.

Earlier decisions parked card checkout until a provider onboards Barrels:
- Events pilot: owner decision, 2026-10-18.
- Deposits on Barrels' merchant account through a neutral adapter: owner decision, 2026-10-19.

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

**Uncertainty:**
- Whether Stripe pays out to a Grenadian business: unverified, low confidence. If it doesn't, Stripe stays test-only and Republic Bank ePay becomes the live rail.
- Holding client funds on Barrels' account may count as regulated activity or create trust-account duties. An accountant and legal review are needed before going live. (medium)
- XCD support and the cost of currency conversion with each provider. (low)

## Options considered

1. **Wait for a provider.** No speculative code, but Events, Bookings and Pay all stay blocked, and each may later build its own integration.
2. **Payments core with adapters (chosen).**
   - A `payments` domain: `intent`, `attempt`, an append-only `ledger_entry`, and `refund`.
   - A `PaymentProvider` protocol: create, verify callback, refund, fetch status.
   - Adapters: `manual` (cash, bank, cheque; covers today's records) and `stripe` (test mode).
3. **Stripe Connect, one connected account per organisation.** Barrels would never hold the funds, but Connect support for Grenada is unverified and every organisation would need an onboarding UI. Deferred; the protocol must not rule it out.

## Decision

Build option 2 in PF4.
- Amounts are integer minor units, with the currency stated on every row.
- The ledger is append-only, following the rewards ledger pattern: a trigger rejects deletes and amount updates.
- Provider callbacks go through the PF2 idempotency and outbox primitives.
- Barrels' merchant account receives funds. The ledger records what each organisation is owed. Payouts stay manual and appear in settlement reports.
- The first consumer is an Events paid tier or a Bookings deposit in Stripe test mode, whichever is ready first.

**Live gate:**
- the owner enables a live provider;
- an accountant and legal sign-off exist;
- a reconciliation exercise passes.

## Consequences

- Events, Bookings and Pay stop needing payment code of their own.
- Barrels takes on custody and reconciliation duties when it goes live.
- `billing/gateway.py` moves onto the protocol, and its Stripe subscription checkout becomes one adapter use.
