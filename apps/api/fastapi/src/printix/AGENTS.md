# printix domain — agent context

**Owner:** a Barrels–Printix collaboration and Barrels Grenada's main ticket app
(owner, 16 Nov 2026). Barrels Grenada builds and runs the software; Printix keeps its
own name, with Barrels shown. Never add GAA or GMS to anything a gate or promoter
sees. Organiser access for Printix staff (org zone, two role bundles) is the
amendment of ADR-0060, built. Decision record: `docs/adr/0060-printix-ticket-registry-and-pairing-auth.md`.

- **Tables** live in the `printix` schema of the main database: `event`, `ticket`,
  `pairing`, `scan_log` (migration `2026-11-14_printix_registry.py`, revision
  `printixregistry20261114`). Models are `Printix*` classes in `models.py` because
  `Ticket` and `Event` already exist elsewhere on the shared declarative base.
- **No personal data.** A ticket is a printed number and a barcode value. `pairing`
  keeps only `sha256(secret)`; `created_by` is an auth user id with no foreign key.
- **Four route zones (ADR-0025), the first two here, `org` and `me` under "Organiser access":**
  - `/printix/admin/*` (zone `admin`): superuser with an enrolled authenticator and
    an MFA session (`PrintixAdmin` = `MfaAdminUser` + `printix.manage`).
  - `/printix/public/*` (zone `public`): no account. The pairing secret is sent as
    `Authorization: Bearer <secret>` (`PairingDep`, read in `dependencies.py`).
- **Pairing secret:** `secrets.token_urlsafe(32)`, shown once in the create response,
  never stored, never logged. Checked on every call: hash lookup, then
  `hmac.compare_digest`, then revocation, then expiry. Unknown and malformed secrets
  are 401 with no reason given.
- **Typed numbers are off by default.** `allow_typed_numbers` is set per pairing at
  creation (default false). Off: only an exact barcode match admits, and the
  printed-number lookup never runs. On: a short all-digit value that is not a barcode
  falls through to the printed-number lookup, and that fall-through is capped.

## Rate limits

Counted from `scan_log` over a rolling 60 seconds, under the pairing's transaction
advisory lock (`service._lock_pairing`), so two concurrent scans cannot both read a
count under the cap. Refused scans are not logged.

| Limit | Value | Past it |
| --- | --- | --- |
| Scans per pairing (`SCANS_PER_WINDOW`) | 120 a minute | 429, `Retry-After: 60` |
| `unknown` outcomes per pairing (`UNKNOWN_SCANS_PER_WINDOW`) | 20 a minute | 429 for the unknown scan; valid barcodes still admit |
| Typed printed-number lookups (`TYPED_NUMBER_SCANS_PER_WINDOW`, only when enabled) | 20 a minute | 429 for the fall-through |
| `GET /summary` per pairing (Redis limiter, keyed on a hash of the secret) | 30 a minute | 429 |
| `GET /offline-tickets` per pairing (Redis limiter) | 4 a minute | 429 |
| `POST /offline-admissions` per pairing (Redis limiter) | 12 a minute | 429 |
| Every scanner route per client address (Redis limiter, `visitor_address`) | 600 a minute | 429 |

The per-address cap runs after authentication, so a flood of bad secrets still costs
one indexed lookup each. The cap is a string slowapi reads at import, so a test
cannot lower it on the gate routes; `test_hardening.py` proves the mechanism on a
probe route and checks the route limits.

- **Admission is one conditional UPDATE** (`service._stamp_if_unadmitted`: `WHERE
  status = 'valid' AND admitted_at IS NULL RETURNING`). Exactly one of two concurrent
  scans wins; the loser reloads the stored first admission. Do not replace it with a
  read-then-write.
- **Lookup order:** exact `barcode_value` first. Only when that misses, and the
  pairing allows typed numbers, and the value is at most six digits, the printed-number
  lookup runs (scoped to the pairing's event). A valid barcode is never refused by the
  typed cap.
- **Outcomes are 200 with a stable `outcome` code**, not errors: `admitted`,
  `already_admitted`, `void`, `unknown`, `event_closed`. `unknown` covers a value on
  another event too, so a pairing cannot probe for other events' tickets.
- **Barcodes never leave the server** in an API response (the admin list omits them).

## Import

- **Dry run first.** `csv_import.py` parses and reports line-numbered problems
  without touching the database. `service.import_tickets` checks clashes with tickets
  already on the event (`= ANY(array)` lookups, so large files stay under the driver's
  bind limit), locks the event row on apply, and writes every row or none. Limits: 2 MB,
  20 000 rows, 100 reported problems.
- **Barcode defaults.** A row with no barcode (blank cell, or no barcode column) uses its
  three-digit printed number as its barcode. The dry run warns; a real import is refused
  unless `allow_number_as_barcode=true` is passed. A header error reports no
  missing-column warning.
- **Barcode/number collisions** are refused in both directions, within the file and
  against the event: a barcode may not equal another ticket's printed number.

## Void

An admitted ticket cannot be voided. Voiding and unvoiding are conditional updates, so
they cannot race an admission. Nothing changes once the event is closed (409).

## Status moves

`transitions.py` holds the moves: `move_event` (open to closed, one way) and
`check_ticket_move` (valid to void and back; admitted cannot be voided). Inserts and the
void and admission UPDATE statements write status themselves; their `WHERE` clauses
settle races. The inventory test (`tests/test_state_machine_inventory.py`) lists both
columns.

## Audit, retention and the purge job

- **Audit.** `audit.py` tracks events, pairings and tickets; the acting administrator is
  set in each admin write (`audit.service.set_actor`), and the bulk writes (void, unvoid,
  import) are recorded with `record_change`. History never holds a token hash or a barcode
  value. Printix history is readable through the audit history API by superusers only
  (`registry.register_entity("printix_event", ...)`).
- **Retention.** `scan_log` keeps up to 128 characters of each scanned value. The worker
  job `purge_scan_log` (`jobs.py`, nightly at 03:40, registered in `register.py` and in
  `operational_metrics.JOBS`) deletes rows of events whose `closes_at` is more than 90
  days past.

- **Errors** are typed `AppException` subclasses in `exceptions.py`.
- **Logs:** pass values as `%s` arguments and use `extra={"subject_id": ...}`.
  Never log a secret, a barcode or a scanned value.

## Tests

`tests/printix/` on the main test database:

- `test_csv_import.py`: the parser alone (no database), including control characters,
  barcode/number collisions and defaulted barcodes.
- `test_import.py`: dry run, apply, clashes, barcode defaults and the flag, warnings,
  closed event, size and error caps, a 9,000-row file.
- `test_admin_routes.py`: superuser and MFA gate, event lifecycle, ticket list and
  void rules, pairing creation, expiry bounds, revocation, summary.
- `test_admission.py`: outcomes, barcode-over-number precedence, cross-event
  isolation, the 128-character log, the scanner summary.
- `test_pairing_auth.py`: header and secret checks, expiry, revocation, hashing at
  rest, no secret in logs or rows, the per-pairing scan cap.
- `test_hardening.py`: control characters, typed numbers, the caps (including a
  concurrent cap test), the Redis limits, authentication classes, void after close,
  attribution in the audit log, summary scoping, ticket order, the typed cap against a
  valid barcode, history readability, the purge job.
- `test_races.py`: held-transaction races (admission against admission, void against
  admission, two concurrent imports).
- `test_retention.py`: the 90-day purge rule and the job's registration.

Run: `scripts/agents/api-env.sh uv run --frozen --package fast-back pytest tests/printix`.

## Offline scanning (ADR-0060 amendment)

- `GET /printix/public/offline-tickets`: the event's tickets with `barcode_hash` =
  HMAC-SHA256(key = `offline_hash_key(pairing)`, the pairing id's hex; message = the
  barcode), hex, 32 characters. Never the barcode. 4 reads a minute per pairing.
- `POST /printix/public/offline-admissions`: up to 100 queued admissions (`client_ref`,
  raw `value`, `scanned_at`). Barcode only. One transaction under the pairing's lock.
  `scan_log.scanned_at` is server time (so caps stay honest); the phone's time, kept
  between pairing creation and now, goes to `offline_scanned_at` and the ticket's
  `admitted_at`. A known `client_ref` (unique per pairing) is answered from its row.
- Offline rows are excluded from the live scan cap; unknowns share the live unknown
  cap, and past it the rest of the batch is `deferred` (not logged). 12 syncs a minute.
- **Close time.** `move_event` records `event.closed_at`. An offline scan counts only if
  its time is before both `closes_at` and `closed_at` (`_offline_refused_as_closed`). A
  closed event with no `closed_at` refuses every offline scan. A future phone time is
  clamped to server time, so it cannot pass the close.
- **Weak barcodes.** If any ticket's `barcode_value` equals its `printed_number`, or is
  shorter than `OFFLINE_MIN_BARCODE_LENGTH` (12), the list and the sync answer 409 with
  `code: offline_not_available` (`PrintixOfflineUnavailable`). No flag is stored; the rows
  are the record. A sync stores nothing. Online scanning is unchanged. The hash key is on
  the phone, so it only stops cross-pairing correlation.
- **Non-admission cap.** `already_admitted`, `void`, `event_closed` and `unknown` offline
  rows share `OFFLINE_NON_ADMISSIONS_PER_WINDOW` (60) per 60 seconds per pairing. Past it,
  the rest of the batch is `deferred`. New admissions are never counted against it.
- **Grace.** A sync more than `OFFLINE_SYNC_GRACE_AFTER_CLOSE` (12 h) after the close
  instant (the earlier of `closes_at` and `closed_at`) is `event_closed`, whatever the scan
  time.
- **Scan time bounds.** `scanned_at` must be between 2020-01-01 UTC and a day ahead
  (schema validator, 422). Inside those bounds the clamp still applies.
- Summary: `duplicates_refused` is live only; `offline_conflicts` counts offline rows
  whose outcome is not `admitted`.
- Tests: `tests/printix/test_offline.py`.

## Organiser access (ADR-0060 organiser amendment)

- **Ownership:** `event.organisation_id` (nullable FK to `org.organisation.id`, migration
  `printixorganisation20261116`). Existing and admin-made events stay NULL and are
  invisible to organisers. An administrator sets it with `POST /admin/events` (optional
  `organisation_id`) or `POST /admin/events/{id}/organisation`.
- **App and keys:** the `printix` app is registered in `auth/apps.py` (browser-only, no
  client secret, `email_code` only, `self_signup=False`, default role `printix-member`
  granting `app.printix.access`). Access is by that role only: a Barrels admin grants it
  like the other staff-granted roles, and it is not derived from membership. Organisation
  keys `printix.events.manage` and `printix.gates.manage` are `binding="organisation"`
  product keys; `printix.manage` stays the global admin key and is not a product key.
  Bundles: `printix-organiser` (both), `printix-gate-lead` (gates only).
- **Routes:** `/printix/org/*` (`org_router.py`, zone `org`). `GET /events` and
  `GET /events/{id}/summary` accept either key, through
  `organisations.dependencies.require_org_any_permission` (one dependency, so membership,
  entitlement and the 404 or 403 rules run once), then
  `privileged_mfa.require_mfa_session(..., app_key="printix")` on every call
  (`printix/dependencies.py: require_printix_organiser`). MFA runs after membership, so a
  non-member with an authenticator gets the same 404 as any other. Since ADR-0061, a
  token whose person has no authenticator is refused by `user_for_app` first (403, body
  `code` `authenticator_required`), before membership, so that refusal depends only on the
  caller's own authenticator state.
- **Self route (zone `me`):** `GET /printix/me/organisations` (`me_router.py`) lists the
  organisations where the caller is an active member, the organisation is active and
  entitled to `printix`, and the effective keys (`grants.effective_keys`, the same helper the
  org routes use) include a Printix key. Each item carries `can_manage_events` and
  `can_manage_gates` so the screen can hide what the person cannot do. Needs a `printix`
  app session that passed the authenticator (`require_printix_app_user`). No organisation
  header; a non-member gets an empty list.
- **Shared service:** `service.list_events` and `service.event_summary` take
  `organisation_id`; `get_event` filters in SQL when it is given. The admin routes pass
  `None`, which means no filter, and their behaviour is unchanged.
- **Sign-in safeguards (ADR-0061): on.** The `printix` app is registered with
  `max_session_hours=12`, `require_authenticator=True` and `privileged_members=True`, so a
  Printix session lasts at most 12 hours from its original sign-in, a person without an
  authenticator cannot sign in (403, body `code` `authenticator_required`), and a
  `printix-member` holder follows the privileged enrolment rules (emailed code for the first
  authenticator; a new enrolment ends their other sessions). Tests:
  `tests/auth/test_app_session_safeguards.py`. Details: `docs/api/app-session-safeguards.md`.
- **Who can use the organiser routes (ADR-0044).** An organisation owner or admin holds every
  organisation key of every entitled product, so both Printix keys, implicitly. Anyone made
  owner or admin of an entitled organisation who also holds the `printix-member` app role can
  therefore use the organiser routes; the app role is still required.
- **Team key.** `printix.team.manage` is the Printix team-management key (organisation-bound,
  so `grants.product_keys` includes it, and `team.managed_products` and `_team_manage_keys` pick
  it up). Owners and admins hold it implicitly. A bundle grant needs it: `grants.required_keys`
  adds `printix.team.manage` to every Printix bundle. No staff bundle carries it; Barrels adds
  staff, not this key.
- **Ineligible target organisation.** Setting or creating an event's organisation needs an
  active organisation entitled to `printix`; otherwise `PrintixOrganisationIneligible` (422).
  An unknown id is 422 "Organisation not found". An unknown event is 404, checked first.
- **Deleting an organisation.** The event foreign key has no `ON DELETE` rule, so an
  organisation that owns events cannot be deleted until its events are moved or cleared
  (`POST /admin/events/{id}/organisation` with null).
- **Writes and gate QR codes (`org_router.py`).** Events: create, close,
  import, list tickets, void and restore need `printix.events.manage`. Gate QR codes (a
  pairing is the QR code; the secret is shown once) need `printix.gates.manage`, so a gate
  lead can make and cancel them but not write events. Every route goes through
  `require_printix_organiser`, which runs the authenticator step and then a per-user limit
  (`ORGANISER_READS_PER_MINUTE` 120, `ORGANISER_WRITES_PER_MINUTE` 30, a Redis bucket per
  user id; the limit is counted after the key and authenticator checks). The organisation
  is always the caller's; the service functions take `organisation_id` and filter in SQL
  (`get_event`, and the ticket and pairing lookups through their event). The admin routes
  pass `None` and are unchanged.
- **Import report.** `short_barcodes` counts rows whose barcode is under
  `OFFLINE_MIN_BARCODE_LENGTH` (12) characters, and `barcode_equals_number` counts rows whose
  barcode equals the printed number (defaulted barcodes included). Either above zero means
  offline scanning is off for the event (rule 7). Both fields are additive on the shared
  report, so the admin import response gains them too.
- **Review fixes (PR #1542).** Typed numbers need `printix.events.manage` (checked in the
  router with `organisations.grants.has_org_permission`, so a gate lead gets
  `PrintixTypedNumbersNotAllowed`, 403). `MAX_ACTIVE_PAIRINGS_PER_EVENT` (20) caps active
  pairings per event, counted in SQL under the event row lock in `create_pairing`; the admin
  create uses the same service function, so the admin route is capped too. Organiser-made
  events: `event_date` at most 365 days ahead, `closes_at` at most seven days after the event
  date (`PrintixOrgEventCreate`, dates compared as the admin schema compares them). A ticket
  or pairing is looked up with its event's organisation in one query (`_ticket_for`,
  `_pairing_for`), so a foreign and a missing id answer the same 404. Weak-barcode counts are
  event-wide (`_event_barcode_weakness`, taken before any write). `create_pairing` answers
  `Cache-Control: no-store`, on the organiser and admin routes. The organiser limiter fails
  open: if `limiter.limiter.hit` raises, the request is allowed and a warning is logged with no
  ids.
- **Pairing defaults (owner, 16 Nov 2026).** Expiry six hours after the event closes, at most a
  day after; typed printed numbers off unless the request sets `allow_typed_numbers`.
- **Migration debt:** the foreign key `event_organisation_id_fkey` was added `NOT VALID`
  (migration `printixorganisation20261116`). A later migration must run
  `ALTER TABLE printix.event VALIDATE CONSTRAINT event_organisation_id_fkey` once the existing
  rows are known to reference real organisations (all are NULL today).
- **Onboarding order (first version, owner decision: Barrels adds people):** an organiser
  gets access in this order, and each step is a separate action by a Barrels superuser or
  the organiser:
  1. create the Printix organisation (`org.organisation`, kind `client`);
  2. turn on its `printix` entitlement;
  3. invite the person with a role bundle (`printix-organiser` or `printix-gate-lead`);
  4. grant the `printix-member` role (`app.printix.access`) to the person's account. This
     is a separate step: the organisation invitation does not grant app access;
  5. the person adds an authenticator on account.barrels.gd (required for every organiser route);
  6. they sign in at scan.barrels.gd (the `printix` app, email code).
  Steps 3 and 4 are one action now (`onboarding.py`, #1554): `PUT
  /admin/organisations/{id}/members/{membership_id}/access` and `POST
  /admin/organisations/{id}/members` (admin zone, `PrintixAdmin`, reason, audited) set the
  bundle and give or remove `printix-member` in one transaction. The grant has `granted_by` NULL
  (a non-member superuser's grant would otherwise count as inactive, `grants._granter_is_active`);
  `printix-member` goes only when no other Printix access remains. An email with no account is
  404 (no new invitation flow). Screen: admin `organisations/[id]` "Printix access". Guide:
  `docs/operations/printix-onboarding.md`. Tests: `tests/printix/test_onboarding.py`.
- **Tests:** `tests/printix/test_org_routes.py`.

## Organiser dashboard (#1555, `analytics.py`)

- **Routes (zone `org`, either Printix key, the reader limit; `Cache-Control: no-store`):**
  `GET /org/events/{id}/analytics` (arrivals per five minutes, entry rate over ten minutes, busiest
  five and fifteen minutes, per gate and per phone, refusals by reason, offline, totals, no-show
  rate), `GET /org/events/{id}/scans` (newest first, `size` at most 100) and
  `GET /org/events/{id}/scans/export` (CSV stream, its own `exports` bucket of 6 a minute).
  Another organisation's event is 404 before any query runs.
  The export has a 60 s statement timeout, refuses events over 200,000 scans (413) and ends with
  `# end,<rows> rows`; the screen treats a file without it as cut short. The scans page reads each
  gate phone's newest rows from `scan_log_pairing_id_happened_at_idx` (migration
  `printixscanlogorder20261118`) through a lateral subquery.
- **Rules:** aggregates are SQL (four queries for analytics, one pass for the CSV with `yield_per`).
  Buckets use `date_bin` on the Grenada clock; a gate phone's last scan is the phone's own time
  for an offline scan. Arrivals count `ticket.admitted_at` (the truth); gates and refusals count
  `scan_log`. The arrivals list is zero-filled and cut to the latest 288 periods. A scan shows
  its ticket's `printed_number`, never `scan_log.value`: do not add that column to any
  response or CSV. CSV cells starting (after any spaces) `=`, `+`, `-`, `@`, tab or return get a leading `'`.
  Typed-off scans are never logged, so they cannot be counted; "unknown" also covers another
  event's barcode. Tests: `tests/printix/test_org_analytics.py`.

## Not built here

Ticket types, re-entry and the Barrels Events connection. The CORS allow-list for the
scanner origin is set in the deployment environment, not in this domain.
