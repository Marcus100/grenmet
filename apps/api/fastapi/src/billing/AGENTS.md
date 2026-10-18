# billing domain — agent context

**Owner:** Barrels platform/product capability. Stripe groundwork is kept isolated until an approved product consumes it; invoicing (P1-P3) is live in the control plane.

## Stripe groundwork (unchanged)
- Stripe-backed subscriptions. `gateway.py` defines the `StripeGateway` protocol and `StripeSdkGateway` adapter; services depend on the protocol so tests can substitute it.
- Webhooks must verify Stripe signatures (`InvalidStripeWebhookError`). No card rail is wired for invoices; adding another payment provider is an Ask-First change and a portfolio decision.

## Invoicing (P1-P3, `billing` schema in the main database)
- Barrels invoices its own service-line clients. A customer is a platform organisation (`billing.customer.organisation_id`, unique). Routes (`invoice_router.py`, under `/api/v1/billing`) need superuser or `billing.manage` (`BillingManager`); the web console is `apps/web/admin`.
- **Money:** integer minor units (XCD cents), `Decimal` arithmetic in `calc.py`, rounded half-up per line (line subtotal, then line tax on that subtotal). Invoice totals are sums of rounded lines. The API takes `quantity` (3 dp) and `tax_rate` (2 dp) as floats and converts through `Decimal(str(x))`; never compute totals in the client.
- **Numbering:** `billing.invoice_counter` has one row per issue year, locked `FOR UPDATE` in the issuing transaction, so numbers are gapless and unique (a rolled-back issue rolls the counter back). Format `<prefix>-YYYY-NNNN`. Drafts have no number.
- **Status machine:** `draft -> issued -> partially_paid -> paid`; `issued -> void` only while unpaid (reason required, explicit audit entry). Drafts are edited (PUT replaces the lines) or deleted; everything else is immutable. Payments (bank transfer, cash, cheque) lock the invoice row, reject amounts above the balance (422) and future dates, and move the status.
- **Issue:** assigns the number, sets issue and due date (net 30, `issue_date` optional), snapshots the legal entity name, renders the PDF with WeasyPrint (`pdf.py`, in a threadpool), stores it privately at `billing/invoices/<id>.pdf` when `STORAGE_*` is configured, and queues an `OutboundEmail` (pre-rendered HTML, `emails.py`). The outbox has no attachments, so the email holds a 7-day presigned link when a PDF is stored, else it offers another copy on request. `GET .../pdf` always re-renders on demand.
- **Receivables:** `GET /billing/receivables` buckets open invoices (current, 1-30, 31-60, 61-90, 90+ days past due) in SQL with date comparisons; `bucket_for` in `invoices.py` must stay consistent with the SQL CASE.
- **Reminders:** worker job `send_invoice_reminders` (11:00 UTC = 07:00 Grenada) calls `reminders.send_due_reminders`. Stages: 7 days before due, due date, 7 days overdue. A unique `(invoice_id, stage)` row is inserted (ON CONFLICT DO NOTHING) before the email is queued, so a repeat run sends nothing; a stage is still sendable for `INVOICE_REMINDER_GRACE_DAYS` after its trigger day.
- **Audit:** `audit.py` registers invoices, lines and payments under `billing_invoice` and customers under `billing_customer`; history is readable with `billing.manage`.
- **Settings** (`BILLING_INVOICE_*` in `config.py`, `docs/env.md`): legal entity name, default VAT 15%, number prefix and padding are **provisional** until the registration and tax advice are confirmed. Currency XCD and net 30 are owner decisions (2026-10-18).
- Service functions `flush` and never `commit`; routers commit (reminders commit themselves, as the worker owns that transaction).

## Tests
`tests/billing/test_billing.py` (Stripe) and `tests/billing/test_invoicing.py` (totals and rounding, numbering under concurrency and rollback, status machine, payments, receivables, reminder idempotency, permissions, audit).

## Related
`docs/operations/provider-integrations.md`, `docs/exec-plans/barrels-foundations-plan.md` (P1-P3), `src/notifications/AGENTS.md` (outbox), `src/worker/AGENTS.md`.
