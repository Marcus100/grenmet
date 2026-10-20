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

- Organisation routes (`/bookings/org/*`) require the `bookings` entitlement (`require_org_app`, PF1); the B4 tenant seed must grant it. Tests use `make_org(..., apps=("bookings",))`.

## B3: public create, manage, cancel, reschedule (built on PF2, ADR-0026)
Logic is in `public.py` (service.py keeps studio config and availability); routes are in `router.py`.
- `POST /bookings/public/{slug}/bookings`: needs an `Idempotency-Key` header (400 without), runs through `idempotency.run_idempotent` (scope `bookings.create`; same key and body replays with `Idempotency-Replayed: true`, same key with another body is 409; the hash leaves out `turnstile_token` and `website`). Order: profile and `bookings` entitlement (404 for unknown, disabled or unentitled) then Turnstile (`public.turnstile_policy`: the organisation's public site named like the slug, else its only site, else the global setting) then the honeypot `website` (a filled one gets a decoy 201 and nothing is stored) then the idempotent handler. The handler re-runs `service.available_slots` inside the transaction, picks the first free provider (or the named one), inserts inside a savepoint and treats `is_overlap_violation` as "try the next provider, else 409". Status is `pending` when `profile.requires_confirmation`, else `confirmed`. Customers are upserted by `hash_email`.
- **Manage token:** `secrets.token_urlsafe(32)`; only its SHA-256 is in `booking.manage_token_hash`. The plaintext is in the 201 body and therefore in the idempotency row for 24 hours (purged by retention), and in the confirmation email's outbox payload until the row is done. Never log or persist it elsewhere. Retention clears `manage_token_hash` 90 days after the booking ends.
- Manage routes `/bookings/public/bookings/{token}` (`GET`), `/cancel`, `/reschedule`, `/ics`: unknown, cleared and unentitled tokens answer one 404. Cancel and reschedule both honour `profile.cancel_cutoff_hours` (409 inside it); a repeated cancel is a no-op; reschedule keeps provider, service, status and token, re-validates availability with `exclude_booking_id` (the booking's own range does not block itself) and writes a `BookingEvent` with equal from/to status. The slug `bookings` is reserved so it cannot shadow the manage path.
- **Status machine:** `transitions.py` table; `public.transition` is the only place that changes status and it writes a `BookingEvent`. Studio actions (B5) must use it.
- **Emails:** `emails.py` (pure) builds subject and HTML; `public.py` queues them with `notifications.outbox_handlers.enqueue_email` (topic `email.send`, dedupe keys `booking-confirmation|studio-created|cancelled|studio-cancelled|rescheduled:<id>`...). `reminders.enqueue_due_reminders` (job `enqueue_booking_reminders`, hourly at :07) queues `booking-reminder:<id>` for confirmed bookings starting within 24 hours; it has no manage link (the token is only a hash).
- **ICS:** `ics.py` is a pure RFC 5545 writer (CRLF, 75-octet folding, escaping, UTC, `STATUS`, `SEQUENCE` = history length - 1).
- Deposits (`pending_payment`) are not wired until B6.

## Next slices
B5: studio actions (use `public.transition`). B6: deposits via the provider-neutral payment adapter (Stripe, Republic Bank ePay).

## Tests
`tests/bookings/test_availability.py` (pure engine, no database), `tests/bookings/test_ics.py` (ICS format, status table), `tests/bookings/test_bookings_api.py` (studio CRUD, member read-only, cross-organisation denial, slug uniqueness, validation, the exclusion constraint, public storefront and availability, disabled/unknown 404, range limit), `tests/bookings/test_public_bookings.py` (create, replay, 409 reuse, concurrent duplicates, overlap race, honeypot, Turnstile, entitlement 404, cancel cutoff, reschedule, ICS, outbox emails, reminders, token never stored), `tests/worker/test_platform_jobs.py` (job registration, retention of tokens).

- **Turnstile and replays:** the public create route verifies Turnstile *inside* the idempotent handler (`create_once` in `router.py`). Tokens are single-use, so a client retrying after a lost response replays its stored receipt with the same `Idempotency-Key` and body without a second token; a new key must pass the check, and a failed check is not stored and releases the key. Tests: `test_a_replay_does_not_need_a_second_turnstile_token`, `test_a_failed_turnstile_check_releases_the_key`.

