# printix domain — agent context

**Owner:** a client's product (Printix). Barrels Grenada builds and runs the software;
Printix appears under its own name. Never add Barrels, GAA or GMS to anything a gate
or promoter sees. Decision record: `docs/adr/0060-printix-ticket-registry-and-pairing-auth.md`.

- **Tables** live in the `printix` schema of the main database: `event`, `ticket`,
  `pairing`, `scan_log` (migration `2026-11-14_printix_registry.py`, revision
  `printixregistry20261114`). Models are `Printix*` classes in `models.py` because
  `Ticket` and `Event` already exist elsewhere on the shared declarative base.
- **No personal data.** A ticket is a printed number and a barcode value. `pairing`
  keeps only `sha256(secret)`; `created_by` is an auth user id with no foreign key.
- **Two route zones (ADR-0025):**
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

## Not built here

Scanner app changes (`apps/pwa/printix`), offline scanning, ticket types, re-entry,
and the Barrels Events connection. The CORS allow-list for the scanner origin is set
in the deployment environment, not in this domain.
