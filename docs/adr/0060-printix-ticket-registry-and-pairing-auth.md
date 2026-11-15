# ADR-0060: Printix ticket registry and gate pairing authentication

## Status

Accepted. The owner chose pairing QR codes for gate staff on 15 Nov 2026. Built
as the API side of the Printix registry (`apps/api/fastapi/src/printix/`); the
scanner app and offline mode are later work.

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
  row with `FOR UPDATE` and uses a unique `admissions.ticket_id`. Two devices can
  never both admit one ticket. (high)
- **Facts:** superuser admin routes use `require_superuser_mfa` and the
  `MfaAdminUser` dependency (`src/auth/superuser_mfa.py`, `src/dependencies.py`).
  (high)
- **Facts:** the CORS allow-list for the API is `Authorization`, `Content-Type`
  and the organisation header (`src/main.py`). A custom header would fail the
  preflight from the scanner's own origin, so the pairing secret travels in
  `Authorization`. (high)
- **Interpretation:** a 256-bit random secret cannot be guessed, so the threats
  that matter are theft, sharing and misuse by someone who legitimately holds a
  secret. (medium)
- **Uncertainty:** how the printed barcode encodes the ticket (unknown until the
  printer's sample arrives). The admission code is a value match, so this does
  not block the design. (high)

## Options considered

1. **Staff accounts with sign-in.** Each promoter has a login. Rejected by the
   owner: too heavy for a day of promoters, and it adds account administration.
2. **A short PIN per gate.** Rejected by the owner: a PIN is shared on the door,
   and it is easier to guess or pass on than a QR.
3. **Pairing QR (chosen).** An administrator creates a pairing for one event and
   one gate. The secret is 32 random bytes (43 characters), shown once, stored as
   SHA-256, checked on every call, with an expiry and a revocation switch.
4. **Pairing bound to a device on first use.** Stronger against a photographed QR,
   but it needs device registration and a recovery path when a phone breaks. Not
   built in v1; see the questions for the owner.

## Decision

1. **Secret.** `secrets.token_urlsafe(32)`. The API returns it once, in the
   creation response. Only `sha256(secret)` is stored (`printix.pairing.token_hash`).
2. **Presentation.** `Authorization: Bearer <secret>` on the scanner routes
   (`/api/v1/printix/public/...`, zone `public` by ADR-0025). No account, no
   cookie, no bearer JWT.
3. **Checks on every call.** Lookup by hash, then `hmac.compare_digest` against
   the stored hash. Then `revoked_at` (403) and `expires_at` (403). An unknown or
   malformed secret is 401 and says nothing about why.
4. **Expiry.** Default: six hours after the event closes. An explicit expiry must
   be in the future and at most a day after close.
5. **Revocation.** `POST /printix/admin/pairings/{id}/revoke` takes effect on the
   next call; nothing is cached.
6. **Rate limit.** 120 scans per pairing in a rolling 60 seconds, counted from the
   scan log. Excess is 429 with `Retry-After: 60`. The limit is per pairing, so one
   phone cannot starve another gate.
7. **Admin routes.** Superuser with an enrolled authenticator and an MFA session,
   plus the `printix.manage` permission key (a superuser holds every key; the key
   grants nothing to a role holder, because the MFA superuser gate applies first).
8. **Outcome codes.** `admitted`, `already_admitted` (with the first admission's
   time and gate), `void`, `unknown`, `event_closed`. `unknown` is returned both
   for a value that is not on the event and for one that is on another event.
9. **Admission.** A conditional `UPDATE ... WHERE status = 'valid' AND admitted_at
   IS NULL RETURNING`. PostgreSQL serialises two concurrent updates of one row, so
   exactly one scan is stamped.
10. **Logs.** The secret is never logged. A scan logs its outcome and the pairing
    id, never the scanned value. The scan log table keeps at most 128 characters
    of each value.

### Threat model for the pairing secret

| Threat | What happens | Controls | Residual risk |
| --- | --- | --- | --- |
| **Phone stolen, unlocked or unprotected** | The thief scans for the pairing's event and gate until revocation or expiry. Typed numbers are accepted, so a thief can admit any unadmitted ticket. | Revoke from the admin routes. Default expiry six hours after close. Per-pairing rate limit (120 a minute) slows a bulk run. Every admission is logged with the pairing and gate, and the summary shows admissions by gate. | Until someone revokes, a stolen phone can admit tickets for its gate. Detection is after the fact. |
| **QR shared by mistake** (photographed, posted, forwarded) | Anyone holding the QR can scan for that gate. | Show the QR once on the administrator's screen, never in a list. One pairing per phone. Revoke and re-pair. | A photographed QR is as good as the phone that scans it, until revoked. |
| **Brute force of the secret** | Guessing 256 random bits is not feasible. Flooding the endpoint with wrong secrets costs the server a hash lookup each. | 32 random bytes. Malformed or implausible secrets are rejected before any lookup. | No per-address limit on 401 answers yet. The edge (Cloudflare) rate limit is the first line; see the questions. |
| **Expiry** | An old pairing keeps working. | Expiry checked on every call; default six hours after close; at most a day after close. | The window between close and expiry can be long if an administrator sets a late expiry. |
| **Revocation** | A revoked pairing keeps working. | `revoked_at` checked on every call; no cache. | Revocation is only as fast as the admin who does it. |
| **Database read or backup leak** | An attacker sees the hashes. | Only SHA-256 is stored. The secret is not recoverable from the hash. There is no server key, so rotating `SECRET_KEY` does not end pairings. | A leaked hash cannot be used as a secret, but the leak still shows which pairings exist. |
| **Timing attack on the comparison** | Learning the hash byte by byte. | Lookup by hash, then `hmac.compare_digest`. A timing signal would not reveal a 256-bit secret. | None meaningful. |
| **Cross-event probing** | A pairing for event A learns whether event B's ticket exists. | `unknown` for both, and every lookup is scoped to the pairing's event. | Typed numbers reveal which numbers exist on event A, which is the intended purpose. |
| **Secret in logs or traces** | The secret leaks into Sentry, logs or the scan log. | Never logged; the scan log stores the scanned value, not the secret; tests check the log text and the stored rows. | None known. |

## Consequences

- Gate access works without any staff account. Revocation is the main control, so
  the admin screen must make it one tap.
- The scanner app must keep the secret in its own storage and never show it again
  after the QR is read. The app's CORS origin must be on the API's allow-list.
- Typed-number admission widens the blast radius of a stolen phone. The owner
  should decide whether typed numbers stay on pairings (question below).
- Ticket barcodes never leave the server in an API response, except in an import
  upload. The printed list stays with the administrator.
- Adding device binding or per-address limits later is additive: a new column and
  a new check in `authenticate_pairing`.

## Questions for the owner

1. Should a typed printed number admit a ticket on a pairing, or only a barcode
   scan? Typed numbers help when a barcode is damaged; they also widen what a
   stolen phone can do before it is revoked.
2. Is six hours after close the right default expiry for a gate pairing?
3. Should the QR be bound to the first phone that reads it (device binding)? That
   would stop a shared photograph from working on a second phone.
4. Should the admission audit trail be kept after the event, and for how long?
