# ADR-0060: Printix ticket registry and gate pairing authentication

## Status

Accepted. The owner chose pairing QR codes for gate staff on 15 Nov 2026. Built
as the API side of the Printix registry (`apps/api/fastapi/src/printix/`); the
scanner app and offline mode are later work. Revised after the security review of
PR #1463 (typed numbers off by default, scan caps, log and retention rules,
audit trail).

## Context

Printix is a client's product (Barrels Grenada builds and runs the software; the
name, look and address are the client's). Its event tickets are security-printed
before any registry exists: a hologram, a three-digit printed number that is unique
only within one event, and a long linear barcode whose encoded value is not yet
known. The registry must import the printer's list, and a gate must admit tickets
on Sat 26 Dec 2026.

Gate staff are promoters, not employees with accounts. The owner ruled out staff
accounts and PINs. An administrator creates a pairing for one event and one gate;
a staff phone scans the pairing QR code and may scan that event until it ends.

Owner decisions that bind this design:

- First version: one event, one ticket type, entry only.
- No personal data exists on a ticket. A ticket is a number and a barcode value.
- No Barrels marks in anything a gate or promoter sees.

## Evidence

- **Facts:** the existing scanner (`apps/pwa/printix/`) reads a barcode and sends
  nothing. Its AGENTS.md says the registry and sign-in belong in FastAPI. (high)
- **Facts:** the Events door (`src/events/service/admission.py`) locks the ticket
  row with `FOR UPDATE` and uses a unique `admissions.ticket_id`. (high)
- **Facts:** superuser admin routes use `require_superuser_mfa` and the
  `MfaAdminUser` dependency (`src/auth/superuser_mfa.py`, `src/dependencies.py`). (high)
- **Facts:** the CORS allow-list for the API is `Authorization`, `Content-Type` and
  the organisation header (`src/main.py`). The pairing secret therefore travels in
  `Authorization`. (high)
- **Facts:** the repo's audit listener records flushed ORM changes with the actor
  set by `audit.service.set_actor`; bulk writes need `audit.service.record_change`
  (`src/audit/listener.py`, `src/audit/service.py`). (high)
- **Interpretation:** a 256-bit random secret cannot be guessed, so the threats that
  matter are theft, sharing and misuse by someone who legitimately holds a secret.
  (medium)
- **Uncertainty:** how the printed barcode encodes the ticket. (high that it does
  not block the design)

## Options considered

1. **Staff accounts with sign-in.** Rejected by the owner.
2. **A short PIN per gate.** Rejected by the owner: shared on the door, easier to
   guess or pass on than a QR.
3. **Pairing QR (chosen).** One pairing per event and gate; a 32-byte secret shown
   once, stored as SHA-256, checked on every call, with expiry and revocation.
4. **Pairing bound to a device on first use.** Stronger against a photographed QR,
   but needs device registration and a recovery path. Not built in v1.

## Decision

1. **Secret.** `secrets.token_urlsafe(32)`. The API returns it once, in the
   creation response. Only `sha256(secret)` is stored (`printix.pairing.token_hash`).
2. **Presentation.** `Authorization: Bearer <secret>` on the scanner routes
   (`/api/v1/printix/public/...`, zone `public` by ADR-0025). No account, no cookie,
   no bearer JWT. A user JWT presented here is refused as an unknown pairing (401).
3. **Checks on every call.** Hash lookup, then revocation (403) and expiry (403). An
   unknown or malformed secret is 401 and says nothing about why.
4. **Expiry.** Default six hours after the event closes. An explicit expiry must be
   in the future and at most a day after close.
5. **Revocation.** `POST /printix/admin/pairings/{id}/revoke` takes effect on the next
   call; nothing is cached. Revoking stays allowed after the event closes.
6. **Typed numbers (owner decision, review).** `allow_typed_numbers` is a pairing
   flag, **default false**, set at creation. With it false, a scan that is not an
   exact barcode match is `unknown`; the printed-number lookup never runs. With it
   true, a short all-digit value may also match a printed number, under the typed cap.
7. **Scan caps.** Every scan takes the pairing's transaction advisory lock
   (`pg_advisory_xact_lock(hashtextextended(pairing_id))`), so caps are counted and
   the scan logged without a race. Counted from `scan_log` over a rolling 60 s:

   | Cap | Limit | Behaviour past the cap |
   | --- | --- | --- |
   | Scans per pairing | 120 | 429, `Retry-After: 60`, nothing logged |
   | Typed-number lookups (only when the flag is on) | 20 | 429 |
   | `unknown` outcomes per pairing | 20 | 429 for the unknown scan; valid barcodes still admit |

   A refused scan is not logged, so a flood cannot fill the log.
8. **Other limits (Redis-backed, `src/rate_limit.py`).** `GET /summary`: 30 a minute
   per pairing, keyed on a hash of the presented secret (never the secret). Every
   scanner route: 600 a minute per client address, since gate wifi shares one address.
   The per-address cap runs after authentication, so it does not stop a flood of
   bad secrets; each costs one indexed hash lookup (see follow-ups).
9. **Admin routes.** Superuser with an enrolled authenticator and an MFA session,
   plus the `printix.manage` permission key. A role holder without superuser status
   is refused by the MFA superuser gate before the key is checked.
10. **Outcome codes.** `admitted`, `already_admitted` (with the first admission's
    time and gate), `void`, `unknown`, `event_closed`. `unknown` is returned both for
    a value that is not on the event and for one that is on another event.
11. **Admission.** A conditional `UPDATE ... WHERE status = 'valid' AND admitted_at
    IS NULL RETURNING`. Voiding uses the same shape, so a void and an admission
    cannot both win. Tests hold one transaction open and race a second session
    against it.
12. **Status moves.** The moves are declared in `src/printix/transitions.py`, and
    the guard is checked there before a write: `move_event` (open to closed, one way)
    and `check_ticket_move` (valid to void and back; an admitted ticket cannot be
    voided). Inserts set status in the insert, and the void and admission UPDATE
    statements write it themselves. Their `WHERE` clauses (`status = 'valid'`,
    `admitted_at IS NULL`) settle races, and tests hold a transaction open to prove
    it. The inventory test lists both columns.
13. **Ticket values.** A barcode never leaves the server in an API response (the admin
    list omits it), and it is never written to history. A row with no barcode uses
    its printed number as its barcode, which is three digits. A real import refuses
    that unless the operator sets `allow_number_as_barcode`, so a stolen pairing
    cannot walk 000 to 999 by barcode without the operator's choice.
14. **Audit trail.** Creating an event or pairing, closing an event, revoking a
    pairing, voiding and restoring a ticket, and importing tickets are recorded with
    the acting administrator (`src/printix/audit.py` tracks the models, and the bulk
    writes are recorded explicitly with `record_change`). History holds no token
    hash and no barcode values; import history holds the count only. Printix history
    is readable through the audit history API by superusers only
    (`registry.register_entity`).
15. **Logs.** Application logs and Sentry never carry a secret, a scanned value or a
    barcode. Log lines carry the outcome and the pairing or event id.
16. **Scan-log retention.** The `scan_log` table keeps up to 128 characters of each
    scanned value, because a duplicate or a dispute needs the value. Rows are purged
    nightly (job `purge_scan_log`, 03:40) once their event's `closes_at` is more than
    90 days past. The test `test_retention.py` proves the cut-off.

### Scanner section (for the scanner app)

The scanner must carry the pairing secret from the QR code in the URL **fragment**
(`#secret`), never a query string. A fragment is not sent to servers, not written to
access logs, and not sent in `Referer`. The app clears the fragment from the address
bar after reading it and keeps the secret only in its own storage. The app is not
built in this PR.

### Threat model for the pairing secret

| Threat | What happens | Controls | Residual risk |
| --- | --- | --- | --- |
| **Phone stolen, unlocked or unprotected** | The thief scans for the pairing's event and gate until revocation or expiry. | Revoke. Six-hour default expiry. Scan cap (120 a minute), unknown cap (20), and typed numbers off by default. Every admission logged with pairing and gate. | Until revoked, a stolen phone admits tickets for its gate by barcode. Typed numbers, if allowed on a pairing, widen this. Detection is after the fact. |
| **QR shared by mistake** (photographed, posted, forwarded) | Anyone holding the QR can scan for that gate. | Show the QR once. One pairing per phone. Fragment-only transport in the scanner. Revoke and re-pair. | A photographed QR is as good as the phone that scans it, until revoked. |
| **Brute force of the secret** | Guessing 256 random bits is not feasible. | 32 random bytes; implausible secrets rejected before lookup. | Flooding with bad secrets costs a hash lookup each; the per-address cap runs after auth. A pairing holder can burn their own gate's caps (120 scans, 20 unknown, 20 typed a minute); revoking that pairing is the control. |
| **Expiry** | An old pairing keeps working. | Checked on every call; default six hours after close; at most a day after close. | A late explicit expiry lengthens the window. |
| **Revocation** | A revoked pairing keeps working. | `revoked_at` checked on every call; no cache. | Only as fast as the administrator acts. |
| **Database read or backup leak** | Hashes and ticket barcodes are read. | Secret: SHA-256 only. Barcodes: stored plaintext (see follow-ups). | A leaked barcode list allows forged tickets until the printer's list is reissued. |
| **Timing attack on the lookup** | Learning the hash byte by byte. | Lookup by hash of a 256-bit value. | None meaningful. |
| **Cross-event probing** | A pairing for event A learns whether event B's ticket exists. | `unknown` for both; every lookup scoped to the pairing's event. | Barcode lookups on event A reveal which barcodes exist on A, the intended purpose. |
| **Secret or value in logs** | The secret or a scanned value leaks into logs or Sentry. | Never logged; tests check the log text and the stored rows. | The scan log keeps values for 90 days after close (rule 16). |
| **Admin acts without a trace** | A pairing or ticket change has no owner. | Acting administrator recorded in audit history (rule 14). | The history is only as trustworthy as the superuser account. |

## Consequences

- Gate access works without any staff account. Revocation is the main control, so
  the admin screen must make it one tap.
- The scanner app must keep the secret in its own storage and never show it again
  after the QR is read. The app's CORS origin must be on the API's allow-list.
- Typed numbers are off unless the administrator enables them per pairing.
- Admission history keeps values for 90 days after close, then purges them.
- Adding device binding or a pre-auth address limit later is additive.

## Follow-ups (not in this PR)

- **Pairing `valid_from`:** an optional start time; admissions before it refused as
  `not_yet_valid`. Adds an outcome code, so it is a separate, additive change.
- **Idempotency key on admissions:** lost responses cannot yet be retried safely
  (a retry answers `already_admitted`, which is correct but looks like a duplicate
  to the promoter).
- **Keyed barcodes:** store an HMAC of each barcode and look up by HMAC, so a
  database leak does not give forgeable values. The reviewer advised against
  requiring it while typed numbers exist. If typed numbers are removed, make this
  the next change.
- **Pre-auth address limit:** move the per-address cap ahead of the pairing lookup,
  so a flood of bad secrets is refused before any database work.
- **CORS** for the scanner origin: an owner deployment item.

## Questions for the owner

1. Should typed numbers be allowed on pairings at all, or removed? They are off by
   default now; the flag and its cap are the only way to turn them on.
2. Is six hours after close the right default expiry, and a day after close the right
   maximum?
3. Should the QR bind to the first phone that reads it (device binding)?
4. Is 90 days after close the right retention for the scan log and its values?
5. Should a ticket be voidable after admission (for refunds)? Refused now.
6. Is the import all-or-nothing rule right, or should valid rows be imported with the
   bad ones reported?
