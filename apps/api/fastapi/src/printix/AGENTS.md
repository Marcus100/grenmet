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
- **Rate limit:** 120 scans per pairing per rolling 60 seconds, counted from
  `scan_log`; excess is 429 with `Retry-After: 60`. A 401 is not rate limited here.
- **Admission is one conditional UPDATE** (`service._stamp_if_unadmitted`: `WHERE
  status = 'valid' AND admitted_at IS NULL RETURNING`). Exactly one of two concurrent
  scans wins; the loser reloads the stored first admission. Do not replace it with a
  read-then-write.
- **Lookup order:** exact `barcode_value`, then `printed_number` only for a short
  all-digit value (up to six digits). Both are scoped to the pairing's event.
- **Outcomes are 200 with a stable `outcome` code**, not errors: `admitted`,
  `already_admitted`, `void`, `unknown`, `event_closed`. `unknown` covers a value on
  another event too, so a pairing cannot probe for other events' tickets.
- **Barcodes never leave the server** in an API response (the admin list omits them).
- **Import is dry-run first.** `csv_import.py` parses and reports line-numbered
  problems without touching the database. `service.import_tickets` checks clashes
  with tickets already on the event, locks the event row on apply, and writes every
  row or none. Limits: 2 MB, 20 000 rows, 100 reported problems.
- **Void:** an admitted ticket cannot be voided. Voiding and unvoiding are conditional
  updates, so they cannot race an admission.
- **Errors** are typed `AppException` subclasses in `exceptions.py`.
- **Logs:** pass values as `%s` arguments and use `extra={"subject_id": ...}`.
  Never log a secret, a barcode or a scanned value.

## Tests

`tests/printix/` on the main test database:

- `test_csv_import.py`: the parser alone (no database).
- `test_import.py`: dry run, apply, clashes, closed event, size and error caps.
- `test_admin_routes.py`: superuser and MFA gate, event lifecycle, ticket list and
  void rules, pairing creation, expiry bounds, revocation, summary.
- `test_admission.py`: outcomes, barcode-over-number precedence, cross-event
  isolation, the two-phones race, the 128-character log, the scanner summary.
- `test_pairing_auth.py`: header and secret checks, expiry, revocation, hashing at
  rest, constant-time comparison, no secret in logs or rows, rate limit.

Run: `scripts/agents/api-env.sh uv run --frozen --package fast-back pytest tests/printix`.

## Not built here

Scanner app changes (`apps/pwa/printix`), offline scanning, ticket types, re-entry,
and the Barrels Events connection. The CORS allow-list for the scanner origin is set
in the deployment environment, not in this domain.
