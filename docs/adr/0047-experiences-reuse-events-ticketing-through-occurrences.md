# ADR-0047: Experiences reuse Events ticketing through occurrences

## Status

Accepted (2026-10-22, owner); rules that reference ADR-0050 are conditional on
ADR-0050 being accepted. Owner direction: launch with events **and**
bookable experiences. Nothing in this ADR is built. Read with [ADR-0046](0046-barrels-events-catalogue-model.md) (catalogue
model) and [ADR-0048](0048-catalogue-provenance-and-curation.md). Builds on
[ADR-0024](0024-bookings-domain.md), [ADR-0027](0027-payments-core-and-providers.md),
[ADR-0044](0044-organisation-scoped-permissions-via-membership-grants.md) and
[ADR-0050](0050-barrels-staff-operations-access-to-organisations.md).

## Context

An experience is something a visitor books for a date and time: a snorkel trip, a
spice tour, a yoga class, a private boat charter. It has the same needs as a
ticketed event: capacity, a price per kind of participant, online payment, a QR
confirmation, someone checking people in, settlement and refunds. It differs in
three ways: it **repeats** (the same trip every day), capacity is **per
session**, and some are **private** (one party takes the whole boat).

Two engines exist. Events has tiers, orders, holds, tickets, QR, door,
settlement, refunds and the payments-core integration. Bookings has providers,
services, working hours and an exclusion constraint that stops one provider
being double-booked. The decision is which one experiences use, and how the
repeat and the per-session inventory are modelled.

Constraints: additive migrations; no new Python dependency without approval
(`AGENTS.md` ask-first); the payments core (ADR-0027) and its idempotent order
flow stay the only money path; a free/open-source stack.

## Evidence

- **Facts**
  - Events inventory is a count: valid tickets per tier plus unpaid-order items
    (`service/holds.py`), under `claim_tickets`, which takes a shared lock on the
    listing row and then locks the requested tier rows `FOR UPDATE` in id order
    (`service/ticketing.py`). Cancelling an event takes the exclusive listing
    lock (`service/cancellation.py`). `ticket_tiers.allocation` is one number
    per tier for the whole listing; `per_account_limit` is per tier. (high)
  - Orders hold `payment_intent_id`, `payment_expires_at`, `collected_minor`,
    `refunded_minor`; paid orders go through `order_payments.ensure_intent`,
    outbox topics `events.order_paid` and `events.order_refunded`, and the
    sweeper `expire_unpaid_event_orders`. Refunds are `full | none |
    follow_policy` (`order_refunds.py`). Admission has a unique `ticket_id`.
    Settlement compares orders to the payments ledger summed by
    `metadata.listing_id`. (high, from `events/AGENTS.md` and `models.py`)
  - Bookings is one booking per provider per time range: `booking_no_overlap` is
    a GiST exclusion constraint on `(provider_id =, tsrange(blocked_from,
    blocked_until) &&)` for active statuses (`bookings/models.py`, uses
    `btree_gist`). Its model is service, provider, working hours, exceptions,
    customer, with `price_minor` and `deposit_minor`. ADR-0024 records that
    Events "models fixed-capacity listings" and Bookings models appointments.
    (high)
  - `recurrence` today is an 80-character display label; nothing generates dates
    from it (`schemas.py`, `discover.py`). (high)
  - Grenada has no daylight saving (`events/AGENTS.md`); `src/utils/timezones.py`
    already provides `zone`, `local_to_utc` and `utc_to_local` over the standard
    library `zoneinfo`. `python-dateutil` is only a transitive entry in
    `uv.lock`. (high)
  - `rewards_hook.credit_admission` runs in the admission transaction and
    credits a stamp per admission (`events/AGENTS.md`). (high)
  - The Events times are stored as naive UTC; `when` windows use Grenada days.
    (high)
- **Interpretation**
  - Experience inventory is "seats left in this session", which is the Events
    shape with one more key; it is not "this provider is busy", which is the
    Bookings shape (heuristic, medium).
  - A shared-pool capacity (a boat with 12 seats sold as adult and child bands)
    is the one inventory feature Events lacks and experiences need (medium).
  - Generalising the Bookings exclusion constraint to counted capacity would
    mean replacing a database-enforced invariant by application counting inside
    the one domain that currently has the stronger guarantee (medium).
- **Uncertainty**
  - Real operator needs: Phase 0 discovery never ran, and no experience operator
    has been asked how they sell (private charters, deposits, weather rules).
    The design assumes common practice and must be confirmed with the first
    operators.
  - Whether provider-bound private experiences (one guide, one client at a
    time) are common enough to need the Bookings bridge at all.

## Options considered

- **A. Bridge experiences to Bookings.** Each experience is a Bookings service;
  a session is a booking. Correct for one-to-one appointments, with the
  exclusion constraint for free. Cost: Bookings has no counted capacity, no
  tiers, no QR or door, no settlement, and its payment flow differs; group trips
  would need all of those added, duplicating Events. Two catalogues to search.
  Rejected for group experiences; **kept as the later bridge for private,
  appointment-shaped bookings**.
- **B. Generalise the Bookings engine** (capacity instead of the provider
  exclusion). Removes the duplication on paper. Rejected: it weakens the only
  database-enforced no-double-booking guarantee, turns a small stable domain
  into a general one, and forces a rewrite of Events ticketing, door and
  settlement on top of it. Never do this.
- **C. Events-side occurrences (chosen).** An experience is a listing with
  occurrences; tiers, holds, orders, tickets, QR, door, settlement and refunds
  are reused with one extra key. Cost: every inventory and settlement query
  gains `occurrence_id`, and shared-pool capacity is new.

Compared: correctness (C keeps today's tested locking and adds one more lock
level; B weakens a guarantee), complexity (C is the smallest new surface; A
duplicates; B rewrites), maintainability (C keeps one ticketing engine),
performance (counts are indexed per tier and occurrence; negligible at this
scale), cost (none), operational risk (C is additive and backfillable; B is not).

## Decision

Choose C.

Slice mapping to ADR-0046's implementation slices (X-slices are backend
unless marked web; W-slices are the web app, numbered with ADR-0046's L slices
by the web plan):

| This ADR | ADR-0046 slice | Content |
| --- | --- | --- |
| X1 | L5 | Occurrences, backfill, nullable `occurrence_id` plumbing |
| X2 | L6 | Pool, bands (`seats_per_unit`), per-occurrence allocation, new lock order |
| X3 | L8 | Generator and extension job |
| X4 | L6 / L7 | Session cancel and refund |
| X5 (backend part) | L7 | Door, outlet and manifest per occurrence |
| X5 (web part) | W-slices | Session picker, band quantities, door per session |
| X6 | L7 | Settlement breakdown per occurrence |

### 1. Occurrences

`events.occurrences`: `id`, `listing_id`, `starts_at`, `ends_at` (naive UTC, as
today), `status` (`scheduled | cancelled`), `capacity` (nullable shared pool),
`venue_id` (nullable override), `min_participants` (nullable), `note`, plus a
unique `(listing_id, starts_at)`. A check requires `ends_at > starts_at`. Every
listing has at least one occurrence (existing listings are backfilled with one,
copied from the listing's times). `listings.starts_at`/`ends_at` stay and are
the derived next occurrence (ADR-0046); structural changes recompute them under
the exclusive listing lock, and time passing is handled by the scheduled job
(an occurrence ending does not take a lock on the listing row).

### 2. Inventory per tier and occurrence

- `order_items`, `orders` and `tickets` gain `occurrence_id`. **One order covers
  exactly one occurrence**; a basket never spans sessions, which keeps
  settlement, refunds and the door simple. Admission is already per ticket and
  inherits the occurrence.
- Allocation: `ticket_tiers.allocation` applies **per occurrence** (a weekly
  class with allocation 12 has 12 seats every week). An optional override table
  `events.occurrence_tier_allocations(occurrence_id, tier_id, allocation)` lets
  one session differ. For an event with one occurrence nothing changes.
- Shared pool: `occurrences.capacity` caps the **sum over tiers** of `quantity
  x seats_per_unit`. A tier gains `seats_per_unit` (default 1, `CHECK seats_per_unit >= 0`). Participant bands
  are tiers: Adult, Child, Infant (0 seats if infants sit free), Resident,
  Visitor. A private charter is a tier "Private boat (up to 8)" with
  `seats_per_unit = 8`, so one order consumes the whole pool and the same
  counting rule applies; there is no separate private engine. `capacity` null
  means only tier allocations apply (today's behaviour).
- Counting: valid tickets plus `pending_payment` items, grouped by `(tier_id,
  occurrence_id)`, and the pool sum over the occurrence, computed under the
  locks below. `holds.held_by_tier` gains the occurrence parameter.
- `per_account_limit` applies per tier per occurrence.

### 3. Lock order

Everywhere, in this order and never reversed:

1. Listing row: shared (`FOR SHARE`) for claims, outlet sales, admissions; exclusive
   for cancelling the whole event and for any change that adds, moves or
   cancels an occurrence (it also rewrites the derived `starts_at`).
2. Occurrence row `FOR UPDATE` (the pool and its status).
3. Tier rows `FOR UPDATE` in ascending id (unchanged rule).
4. Then orders, then intent or tickets (unchanged: "listing, then order, then
   intent or tickets").

Cancelling one session takes the listing lock exclusively (briefly) because it
may change the derived start. `ticketing.is_deadlock` keeps treating a Postgres
deadlock victim as a lost race (409). Tests must include concurrent claims
against one occurrence (shared pool and per tier), a claim racing a session
cancel, and a claim racing a recurrence extension.

### 4. Schedules and recurrence generator

- Stored on the listing as `recurrence_rule` (JSON, validated by Pydantic):
  `frequency` (`daily | weekly | monthly_nth_weekday`), `interval`, `weekdays`,
  `nth` (1-4 or last, for monthly), `start_time` and `duration_minutes` (local
  Grenada), `starts_on`, `until` or `count`, `exceptions` (local dates skipped),
  `additions` (extra dates). Anything richer (multiple times per day) is several
  rules or several listings.
- **In-house generator**, a pure function `generate(rule, window)` in
  `events/service/recurrence.py`, using only the standard library (`datetime`,
  `zoneinfo`, and the existing `src/utils/timezones.py` helpers). No
  `python-dateutil` and no other new dependency: dependencies are ask-first, the
  needed subset is small and Grenada has no DST, so local-to-UTC conversion is a
  fixed offset (the helper still goes through `zoneinfo`). Property tests cover
  month ends, leap years, week starts and the Grenada day boundary (a 22:00 local
  start is the next UTC day).
- **Materialisation:** occurrences are real rows, created ahead for a horizon of
  120 days by an ARQ job (ADR-0038) run daily and at rule save; the unique
  `(listing_id, starts_at)` makes it idempotent. At most 400 rows per listing per
  run (a run only creates rows missing inside the 120-day horizon; the cap is not
  a lifetime limit). A one-per-day rule produces at most 120 rows, so only rules
  with many `additions` or several times a day expressed as one rule can hit it;
  such a rule is rejected on save. Each run also refreshes the derived
  `listings.starts_at` with the short per-listing `FOR UPDATE` described in
  ADR-0046 section 8.
- **Editing a rule** affects future occurrences only: occurrences with any order
  or ticket are never deleted or silently moved; they are kept, or cancelled
  through the cancellation path (section 5). A time change on a booked session
  is a postponement (existing notify and carry-over behaviour).

### 5. Cancellation, weather and minimums

- A session can be cancelled by the organiser (or, with `events.ops.listings`,
  by staff) with a reason code `weather | safety | low_numbers | other` and the
  existing refund choice `full | none | follow_policy`. Default for experiences
  is `full`. It reuses `cancellation.py` / `event_cancel.py` scoped to the
  occurrence: valid tickets of that occurrence are cancelled, online-paid
  orders refunded through the payments core, unpaid orders stopped, outbox
  `listing.cancelled` carries the occurrence time. Other sessions are untouched.
- `min_participants`: informational plus a visible decision time ("runs if 4
  book by ..."). No automatic cancel at launch; the organiser or staff decides,
  so no refund happens without a person.
- **Moving a booking** to another session of the same listing (same tier,
  capacity permitting) is a later endpoint; until then the organiser cancels
  with refund and the buyer rebooks.
- **Customer cancellation:** unchanged for launch (an online-paid ticket is
  refunded by the organiser through the order desk). A policy-driven self-cancel
  with automatic refund (a cutoff in hours before start) is an open decision
  below because it moves money without a person.
- Weather is an operator decision, not a data feed.

### 6. Group and private bookings

- **Group:** a public occurrence, shared pool, participant-band tiers, any
  number of different buyers.
- **Private on Events:** a whole-pool charter tier (`seats_per_unit` equal to the
  pool) sold with `booking_mode = tickets`, or an outlet / manual-payment sale
  recorded by the organiser after agreeing it. Never `enquiry`: `enquiry`
  takes no payment and belongs to the services marketplace (ADR-0049).
- **Appointment-shaped private bookings** (one guide, one client, calendar of
  one person) are **not** built on occurrences. Later, a thin bridge may let a
  listing with `booking_mode = slots` (reserved; refused by the API until then) read availability from a Bookings service
  and create a Bookings booking; it needs its own ADR. The Bookings exclusion
  engine is not generalised.

### 7. Door, settlement, refunds and the rest

- Door: scanning a ticket checks `ticket.occurrence_id` against the console's
  selected occurrence; a ticket for another session is refused with
  "wrong session" (and names the correct time). The printable manifest is per
  occurrence.
- Settlement: the report keeps its per-listing totals and adds an occurrence
  breakdown; the payments-ledger comparison keeps `metadata.listing_id` and adds
  `occurrence_id` to the intent metadata. Till sessions stay per staff, listing
  and Grenada day; outlet sales record the occurrence they sold.
- Refunds, payment handlers, the sweeper and the outbox are unchanged apart from
  carrying the occurrence in payloads (ids only).
- Rewards: **no stamps for experience or recurring-class admissions at
  launch**. The existing hook remains on single-occurrence events only (see open
  decisions).
- Permissions: authoring and operating use the existing ADR-0044 keys and the
  ADR-0050 staff counterparts; no new keys are needed for occurrences.

### 8. Migration plan (expand then contract, all additive)

1. Create `occurrences`, the override table, `ticket_tiers.seats_per_unit`,
   nullable `occurrence_id` columns and indexes; backfill one occurrence per
   existing listing.
2. Ship code that writes and reads `occurrence_id` everywhere (dual-safe: falls
   back to the listing's only occurrence when null).
3. Backfill orders, items and tickets from the listing's sole occurrence; verify
   no nulls; then add `NOT NULL` and foreign keys in a separate migration.

## Open owner decisions

1. **Customer self-cancel with automatic refund** for experiences (cutoff in
   hours), or keep "ask the organiser" at launch? Recommendation: keep manual
   at launch.
2. **Deposits and part payment** for expensive charters. Not built; the payments
   core supports one charge per order. Needed at launch?
3. **Stamps / rewards** for experience and recurring-class admissions: none at
   launch (proposed); confirm.
4. **Participant data**: only a lead booker name and phone; no per-participant
   names, ages, allergies or waivers at launch (proposed, avoids special-category
   data under the Data Protection Act 1/2023). Operators may demand waivers.
5. **Minimum participants** stays a manual decision (proposed).
6. **Is the Bookings bridge for private appointment-shaped experiences wanted**
   at all, and when?
7. **Operator validation**: the first experience operators must confirm the
   shared-pool and band model matches how they sell before the build.

## Consequences

- One ticketing engine for events, classes and group experiences; no second
  catalogue, no second money path, no second door app.
- The largest cost is touching every inventory, hold, settlement and door query
  with the occurrence key. Plan it as one slice behind the backfill, with
  concurrency tests, before any experience listing ships.
- Recurring listings create many rows (a daily trip for 120 days is 120
  occurrences); discovery queries date windows on occurrences and groups to the
  listing, while the derived listing start serves sorting and cards.
- Shared-pool counting adds a second invariant (pool sum) beside per-tier
  allocation; both are checked under the same locks.
- The in-house generator is a small piece of code to own and test; if the
  recurrence needs outgrow it (exotic RRULEs), propose `python-dateutil` or
  `rrule` support through the ask-first route.
- Files owned elsewhere that need edits (**not made here, no `AGENTS.md`
  edited**): `apps/api/fastapi/src/events/AGENTS.md` (occurrences, pool,
  lock order) and `apps/web/events/AGENTS.md`; listed in the pull request body.
- **Revisit triggers:** an operator needs one-to-one appointment calendars
  (build the Bookings bridge); groups of experiences need multi-session
  baskets (a package of several days); deposits or part payment are required;
  occurrence counts per listing regularly exceed the 400-row cap; recurrence
  rules the generator cannot express are requested; automatic refunds become
  acceptable to the owner.
- **Slices (no code in this PR):** X1 occurrences, backfill and key plumbing
  (ADR-0046 L5); X2 pool, bands and per-occurrence allocation; X3 generator and
  job; X4 session cancel and refund; X5 web: session picker, band quantities,
  door per session; X6 settlement breakdown.
