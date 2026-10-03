# billing domain — agent context

**Owner:** Barrels platform/product capability. Kept isolated until an approved product (Events, Pay/Invoice) consumes it.

- Stripe-backed subscriptions. `gateway.py` defines the `StripeGateway` protocol and `StripeSdkGateway` adapter; services depend on the protocol so tests can substitute it.
- Settings: `BillingConfig` (`BILLING_` prefix). Webhooks must verify Stripe signatures (`InvalidStripeWebhookError`).
- No other payment provider is integrated yet. Adding one is an Ask-First change and a portfolio decision.
- Tests: `tests/billing/test_billing.py`.
- Related: `docs/operations/provider-integrations.md`, portfolio plan (Pay/Invoice row).
