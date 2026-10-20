# ADR-0028: Organisation contacts

## Status

Proposed. The owner approved building it on 2026-10-20 (foundations slice PF3).

## Context

Each domain keeps its own record of the people an organisation serves:
- `billing.customer` (organisation-level, `src/billing/models.py`)
- `bookings.customer` (an organisation-scoped person with `email_hash`, `src/bookings/models.py`)
- subscription rows
- contact messages
- Events profiles

An organisation cannot see one person across bookings, invoices, rewards and newsletters. Consent and erasure have to be applied in several tables.

## Evidence

**Facts:**
- At least five tables hold contact details for people outside the organisation. Hashing is applied unevenly: bookings and subscriptions use `email_hash` (`src/utils/email_hash.py`); others store plaintext. (high)
- The retention purge (`src/worker/retention.py`) is written table by table. (high)

**Interpretation:**
- One organisation-scoped contact record with consent and source is a common CRM-lite core. It simplifies erasure and the cross-product features owners expect. (best practice, medium)

**Uncertainty:**
- How people are matched across sources: email hash, phone, or a Barrels ID link. Wrong merges are a privacy risk, so matching starts with an exact email hash only. (medium)

## Options considered

1. **Keep per-domain customers.** Simple, but consent, erasure and reporting stay duplicated.
2. **`org.contact` referenced by domains (chosen).**
   - Fields: organisation, `email_hash`, encrypted or plaintext email only while it is needed for sending, name, phone, an optional Barrels ID `user_id`, a consent record for each purpose, `source`, timestamps.
   - Shared lookup, upsert and merge service.
3. **A global person record across organisations.** One organisation's customers would become visible to another unless isolation is perfect. Rejected.

## Decision

Build option 2 in PF3.
- Contacts are always organisation-scoped and read through `OrgContext`.
- `bookings.customer` becomes the first consumer, followed by `billing.customer`.
- Merging is explicit and audited, never automatic beyond an exact email-hash match.
- Erasure goes through one service that every domain's references respect.

## Consequences

- Cross-product views and one place for consent and erasure.
- Each domain has to migrate its foreign keys one at a time.
