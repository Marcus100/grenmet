# bookings domain — agent context

**Owner:** Barrels platform (Barrels Bookings; [ADR-0024](../../../../../docs/adr/0024-bookings-domain.md); plan: B-series in `docs/exec-plans/barrels-foundations-plan.md`). A shared capability for every app and client site, not a GAA/GMS module. Pilot tenant: Babydoll Beauty Bar.

**Clean-room rule:** the model follows Easy!Appointments' concepts (services, providers, weekly working plans, exceptions). It is GPL-3: never copy its code, schema files or text.

**Frontend-agnostic (owner rule):** this is an HTTP/JSON API for any client (web, mobile, kiosk, bot). Times are naive UTC in the database and `Z` UTC on the wire, with the profile's IANA `timezone` for display; money is minor units plus `currency`. No HTML, no framework assumptions, no hard-coded site URLs: links to a business's own pages come from profile settings (`manage_url_template` with `{token}`). Public endpoints are keyed by `public_slug`, never by origin.

- **Tables** (`bookings` schema, main database, migration `bookings20261019`, `bookings` in `_TRACKED_SCHEMAS`): `profile` (one per organisation), `service`, `provider`, `provider_service`, `working_hours`, `availability_exception`, `customer`, `booking`, `booking_event`. Every row is scoped by `organisation_id` (directly or through its provider/booking).
- **No double-booking:** `booking.blocked_from/blocked_until` store the range a booking holds (buffers included); the `booking_no_overlap` exclusion constraint (`btree_gist`, active statuses `pending_payment|pending|confirmed`) rejects overlaps per provider. `service.is_overlap_violation(error)` recognises it: map it to 409.
- **Availability** (`availability.py`) is pure and tested without a database: weekly periods (gaps are breaks), `extra_hours` adds, `time_off` removes, slots on the step grid from local midnight, the service must fit one window, blocked ranges must not overlap, lead time and horizon apply. `service.available_slots` loads rows and calls it; keep business rules in the pure module.
- **Organisation routes** (`/bookings/org/*`, the business's staff; a client site may call its UI "studio") use `OrgContext`: `OrgMember` reads, `OrgAdmin` writes. Another organisation's ids answer 404. **Public routes** (`/bookings/public/{slug}`, `/availability`) need no sign-in, are rate limited, and answer the same 404 for unknown and disabled profiles; availability spans at most 14 days.
- Schema and enum names are prefixed `Booking*` so OpenAPI never renames a clashing name (Events already owns `ProfilePublic`).
- Routers commit; service functions flush.

## Next slices
B3 (paths per ADR-0025: `/bookings/public/{slug}/bookings` to create, `/bookings/public/bookings/{token}` with `/cancel` and `/reschedule` to manage): public create/manage/cancel/reschedule (Turnstile when a browser key is configured, honeypot, `Idempotency-Key`, hashed manage token), ICS, outbox emails and a 24-hour reminder cron, retention. B5: studio actions. B6: deposits via the provider-neutral payment adapter (Stripe, Republic Bank ePay).

## Tests
`tests/bookings/test_availability.py` (pure engine, no database), `tests/bookings/test_bookings_api.py` (studio CRUD, member read-only, cross-organisation denial, slug uniqueness, validation, the exclusion constraint, public storefront and availability, disabled/unknown 404, range limit).
