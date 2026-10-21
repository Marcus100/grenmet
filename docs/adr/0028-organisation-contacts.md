# ADR-0028: Organisation contacts

## Status

Accepted 2026-10-20; implementation pending. The `contacts` domain exists (foundations slice PF3, `src/contacts`). The change below, which makes it the single home for personal data, is not built yet.

## Context

Each domain keeps its own record of the people an organisation serves:
- `billing.customer` (organisation-level, `src/billing/models.py`)
- `bookings.customer` (an organisation-scoped person with name, email, `email_hash` and phone, `src/bookings/models.py`)
- subscription rows
- contact messages
- Events profiles

An organisation cannot see one person across bookings, invoices, rewards and newsletters. Consent and erasure have to be applied in several tables.

## Evidence

**Facts:**
- At least five tables hold contact details for people outside the organisation. Hashing is applied unevenly: bookings and subscriptions use `email_hash` (`src/utils/email_hash.py`); others store plaintext. (high)
- `Customer.contact_id` in `src/bookings/models.py` is a nullable link to `org.contact.id` (`ondelete="SET NULL"`). `link_contact` in `src/bookings/public.py` upserts the contact only when the organisation has the `contacts` product, and logs a warning if linking fails. (high)
- The retention purge (`src/worker/retention.py`) is written table by table. (high)

**Uncertainty:**
- How people are matched across sources: email hash, phone, or a Barrels ID link. Wrong merges are a privacy risk, so matching starts with an exact email hash only. (medium)

## Options considered

1. **Keep per-domain customers.** Simple, but consent, erasure and reporting stay duplicated.
2. **Contacts as a link only (the first PF3 build).** Domains keep their own copy of name, email and phone and add an optional link. Copies drift apart and erasure still has to chase them.
3. **Party/role model (chosen).** `contacts` is the one place for a person's personal data. Domains hold the person's role in that domain.
4. **A global person record across organisations.** One organisation's customers would become visible to another unless isolation is perfect. Rejected.

## Decision

Build option 3.
- `contacts` holds all personal data for a person within an organisation: name, email, phone, consent and channels.
- Domain records (`bookings.customer`, event attendees, rewards members) keep only domain facts, such as a no-show count or notes, plus a required `contact_id`.
- Contacts are always organisation-scoped and read through `OrgContext`.
- Merging is explicit and audited, never automatic beyond an exact email-hash match.
- Erasure goes through one service that every domain's references respect.

**Migration.** Nothing is live, so this is a schema change with no data migration. For `bookings.customer`: remove `name`, `email`, `email_hash`, `phone` and `marketing_consent` (consent moves to the contact), and make `contact_id` NOT NULL. Bookings then needs `contacts` for every organisation that takes bookings, so the optional-entitlement branch in `link_contact` goes away. Event attendees, rewards members and `billing.customer` follow the same shape.

**Why.** There is one place to correct a person's details, one place to record consent, and one erasure that reaches every domain. No domain keeps a stale copy of a name or email.

## Consequences

- Cross-product views of one person, and one place for consent and erasure.
- The bookings public flow must create or find the contact before the customer. Bookings reads names and emails through `contacts`.
- Each domain migrates one at a time. Bookings goes first.
