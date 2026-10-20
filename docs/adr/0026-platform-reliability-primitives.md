# ADR-0026: Shared idempotency and outbox primitives

## Status

Proposed. Built on branch (PF2: `src/idempotency.py`, `src/outbox.py`, Bookings B3). The owner approved building it on 2026-10-20 (foundations slice PF2). It becomes Accepted when PF2 merges with Bookings B3 as its first consumer.

## Context

Every Barrels app retries requests. That includes mobile apps on weak networks, kiosks, partner servers and webhook senders. Every app also has side effects that must happen once: an email, a stamp, a payment capture, an outbound webhook. Today each domain builds its own version of these rules.

## Evidence

**Facts (2026-10-20):**
- Idempotency is solved separately in at least six places (high):
  - `bookings.booking_idempotency_key` (`src/bookings/models.py`)
  - Events admissions and outlet sales (`src/events/service/admission.py`, `outlet.py`)
  - `dedupe_key` on notifications and `OutboundEmail`
  - billing reminders (unique `invoice_id`, `stage`)
  - rewards transaction references
  - push job results
- Outbox and retry loops are separate too, each with its own attempt limits and backoff (high):
  - `src/events/outbox.py`
  - notifications deliveries and the email outbox
  - CAP dispatch (`src/worker/dispatch.py`)
  - `eregister_send`
- The worker rule is already "jobs are idempotent; state lives in the database" (`src/worker/AGENTS.md`). (high)

**Interpretation:**
- Shared primitives remove a class of bugs, such as double charges, double stamps and duplicate emails, and make new domains cheaper. (best practice, high)
- Moving every existing loop at once carries regression risk without a matching gain. (heuristic, medium)

**Uncertainty:**
- How long stored responses must be kept. 24 hours is proposed and is a guess. (low)
- Whether Events, which uses a separate database, can use a main-database outbox. That depends on ADR-0003 and needs a design check. (medium)

## Options considered

1. **Keep a pattern per domain (status quo).** No migration work, but every new domain keeps reinventing it and behaviour drifts.
2. **Shared primitives in the monolith (chosen).**
   - `src/idempotency.py`: a table keyed by (scope, organisation, key), storing a request hash and the response, with replay and a 409 on mismatch.
   - A generic `outbox` table plus one worker runner: typed handlers, a single exponential backoff policy, dead-lettering, and metrics.
3. **External queue (Redis streams or a managed queue).** This needs new infrastructure, and transactional enqueue gets harder. ADR-0014 limits the platform to Postgres, S3 and ARQ.

## Decision

Build option 2 in PF2.
- `Idempotency-Key` is accepted on every public and organisation write that creates something. A repeat with the same body replays the stored response; a repeat with a different body is a 409.
- Side effects are written to the outbox in the same transaction as the change that causes them, and only the runner performs them.
- New domains must use both primitives.
- Existing loops move one domain per PR, after Bookings B3 proves the design. Events moves only after a separate-database design check.

## Consequences

- One place to observe delivery health and retries.
- Each write path pays a small database cost.
- Handlers must be idempotent. The runner guarantees at-least-once delivery, not exactly-once.
