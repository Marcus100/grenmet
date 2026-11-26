# ADR-0067: Airport operations modules: organisation-scoped domains linked through the outbox

## Status

Proposed 25 November 2026 (planning only; nothing built). The owner asked for
as many airport-operations features as possible to be built into this
repository and left the product question open. Programme:
`docs/products/airport-operations-programme.md`.

## Context

The programme adds about twenty capabilities: an operations log, incidents, a
case engine for safety and related programmes, work orders, inspections,
passes, public request forms and more. They refer to each other constantly: an
incident writes a log entry, opens a work order and feeds a safety case; a case
links several incidents; an inspection finding opens a work order.

Two things are undecided: whether these are sold to other organisations as
Barrels products or kept for the airport authority, and the price of each.

## Evidence

- **Facts:**
  - The platform already has organisation tenancy with per-app entitlements and
    organisation-bound permission keys (`src/organisations/dependencies.py`
    `require_org_permission`, `entitlements.py` `PRODUCTS`,
    `role_bundles.py`; ADR-0022, ADR-0044). Events and Payments routes use
    `require_org_permission` with Events role bundles; Bookings, Contacts and
    Payments are entitlement keys in `PRODUCTS`. High confidence.
  - The platform outbox delivers messages between domains, at least once, in
    the sender's transaction (`src/outbox.py`, ADR-0026; handlers in
    `src/bookings/outbox_handlers.py`). High.
  - Field-level audit is available to any domain (`src/audit/registry.py`). High.
  - The GAA plan lists GAA-10 to GAA-19 as unbuilt capabilities with the same
    scope. High.
  - Existing names collide: `cap` is the public weather-alert domain;
    `environmental` is forecast data. High.
- **Interpretation:**
  - Organisation-scoped modules cost no more than airport-only ones on this
    platform, and keep both product options open (heuristic, high).
  - Direct imports between a dozen modules would make each one impossible to
    switch off or sell on its own (best practice, high).
- **Uncertainty:** how many organisations besides the airport authority will
  use these modules (low). A real second customer could change the pricing,
  not the structure.

## Options considered

1. **Airport-only modules inside the HR staff platform** (tenancy from HR
   employment, like `stores`). Quick to fit one client; cannot be sold or
   switched on per module without rework; ties every module to HR records.
2. **Organisation-scoped domains, one entitlement per module, linked through
   the outbox and `(kind, id)` references** (chosen). Same cost to build on the
   existing platform; each module can be enabled, priced and removed alone.
3. **One large `airport` domain** with every capability inside. Fewer files;
   one schema grows without bound, no per-module entitlement, and every change
   risks every capability.

## Decision

1. Each capability is its own FastAPI domain with its own schema in the main
   database (ADR-0003), registered through its manifest (ADR-0031).
2. Each domain is organisation-scoped: routes in the `org` zone (ADR-0025)
   guarded by `require_org_permission`; one entitlement key per module in
   `PRODUCTS`; organisation-bound permission keys whose first segment is that
   key; role bundles in `role_bundles.py`. The airport authority is an
   organisation like any other.
3. Domains never import each other's models or services. They send outbox
   messages (for example `opslog.entry_post`) and store references to other
   records as a kind and an id (for example `incidents.incident`,
   `inc_<hex>`). A handler is idempotent and checks that the referenced
   organisation matches the message's organisation.
4. Records that matter in review keep their history: changes are audited,
   closing locks a record, reopening is audited and needs a manager key.
5. Names: "corrective actions", not "CAP"; "environmental management", not
   "environmental".
6. Safety, security, occupational health and safety, and environmental
   management share one case engine. Its data model gets its own ADR before
   that module is built.

## Consequences

- Easier: enabling, pricing or retiring one module for one organisation; a
  second airport or a port needs no code change; modules ship in any order.
- Harder: links across modules are eventually consistent (an automatic log
  entry appears when the outbox runs), and a dangling reference must render as
  "record not available" rather than fail.
- Forbidden: cross-domain foreign keys and imports between these modules;
  superuser access to organisation records without membership (as for every
  `require_org_permission` route).
