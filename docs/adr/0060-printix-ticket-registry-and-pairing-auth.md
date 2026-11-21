# ADR-0060: Printix ticket registry and gate pairing authentication

## Status

Accepted; amended by [ADR-0064](0064-one-ticket-registry-for-all-tickets.md) (one registry for every ticket). The owner chose pairing QR codes for gate staff on 15 Nov 2026. Built
as the API side of the Printix registry (`apps/api/fastapi/src/printix/`). The
scanner app and offline mode are built (#1529). The organiser-access amendment
(16 Nov 2026) is accepted and built: organiser onboarding from the admin console, organiser screens, recent scans and scan-list export (PR #1569; checked 21 Nov 2026). Revised after the security review of
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
accounts and PINs for **gate phones**; that still holds. (Since 16 Nov 2026,
organisers and gate leads who set up events and make gate codes do have accounts:
see "Amendment: organiser access".) An administrator creates a pairing for one event and one gate;
a staff phone scans the pairing QR code and may scan that event until it ends.

Owner decisions that bind this design:

- First version: one event, one ticket type, entry only.
- No personal data exists on a ticket. A ticket is a number and a barcode value.
- ~~No Barrels marks in anything a gate or promoter sees.~~ Replaced 16 Nov 2026:
  Printix keeps its own name with Barrels shown (see "Amendment: organiser access").

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

1. **Staff accounts with sign-in.** Rejected by the owner for gate phones (still
   true; organisers have accounts since the 16 Nov 2026 amendment).
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

### Amendment: offline scanning (proposed 15 Nov 2026, owner review pending; rules 3, 5, 7 to 9 added 16 Nov 2026)

Gates may lose signal on the night. The API side is built; the scanner app follows
in a separate change.

1. **Ticket list.** `GET /printix/public/offline-tickets` (pairing secret) returns the
   pairing's event and every ticket on it: printed number, state (`valid`, `void`,
   `admitted` with the first admission's time and gate), and a **keyed hash** of the
   barcode: HMAC-SHA256 with a key unique to the pairing (its random id), cut to 128
   bits. The barcode itself still never leaves the server (rule 13). No personal data.
   Limited to 4 reads a minute per pairing, plus the address cap.
2. **On the phone.** While online, the phone keeps the latest list. With no signal it
   hashes what it scans with the list's key, admits a `valid` ticket it has not
   admitted, refuses the rest, and queues each local admission with a reference,
   the scanned value and the phone's time. Offline checks are by barcode only; typed
   numbers are not checked offline. An event whose barcodes are its printed numbers
   has no offline mode (rule 7).
3. **Sync.** `POST /printix/public/offline-admissions` takes up to 100 queued
   admissions. Each is checked like a live scan, by barcode only, and stamped with
   the phone's time kept between the pairing's creation and the time of the sync.
   **The server is the source of truth: the first admission it records wins.** Any
   other answer is a conflict the phone must show: `already_admitted` (with the
   first gate and time), `void`, `unknown`, `event_closed`. A scan before the close
   time is admitted even if it syncs after; an event an administrator has closed
   refuses every later sync (`event_closed`, but the scan log keeps the record).
   **Close time (decided by the owner, 16 Nov 2026):** the close is the earlier of the
   scheduled close time and the administrator's close, which the event records as
   `closed_at`. An offline scan counts only if its time is strictly before both. A
   phone time in the future is taken as server time (the existing bound), so a
   future-dated scan after the close is refused. A closed event with no recorded
   `closed_at` refuses every offline scan. **Grace (16 Nov 2026): phones must sync
   within 12 hours of the gates closing.** A sync that arrives more than 12 hours
   after the close instant is refused as `event_closed` whatever the scan time. This
   bounds how far back a queue can reach. It does not stop a holder from dating a
   scan to a time before the close within those 12 hours (the phone's time is not
   trusted, and nothing the server saw bounds it).
4. **Retries.** Each queued admission carries the phone's reference (`client_ref`),
   unique per pairing in `scan_log`. A retried reference returns its first answer
   and is not scanned again (the idempotency follow-up, for offline sync).
5. **Caps.** The sync carries the raw barcode, not the hash, so holding the list does
   not let anyone admit a ticket without its barcode. Offline rows are logged at the
   server's time and do not count against the live scan cap (120 a minute), so a
   phone coming back online can still scan. Unknown values share the live unknown
   cap (20 a minute): past it, the rest of the batch is returned as `deferred`,
   unanswered and unlogged, for the phone to send again. **Other answers than
   `admitted` (`already_admitted`, `void`, `event_closed`, `unknown`) share one cap of
   60 a minute per pairing (16 Nov 2026).** Each writes a row, so repeats of an admitted
   barcode with fresh references would otherwise write about 1,200 rows a minute. Past
   that cap the rest of the batch is `deferred`. A new admission is never counted
   against it. 12 sync requests a minute per pairing.
6. **Counts.** The summary's `duplicates_refused` counts live refusals only; a new
   `offline_conflicts` counts offline admissions the server could not record.
7. **Weak barcodes (16 Nov 2026).** If any ticket on the event has a barcode equal to
   its printed number (a defaulted barcode, or one typed as the number), or a barcode
   shorter than 12 characters, offline mode is refused for the whole event. The list
   and the sync answer `409` with `code: offline_not_available`, and the sync stores
   nothing. A short value's hash can be reversed by trying every candidate, and a
   three-digit printed number is the worst case. Live scanning and the import rules are
   unchanged.
8. **Scan time bounds (16 Nov 2026).** A phone's `scanned_at` must fall between
   2020-01-01 UTC and a day after the server's time. Anything outside is a `422`. The
   clamp in rule 2 still applies inside those bounds.
9. **What the hash key does and does not do.** The list's hash key is the pairing's id,
   and the phone holds it because it hashes what it scans. The key is therefore known to
   the phone. It only stops one pairing's list being matched against another's. It does
   not stop anyone who holds a list from trying candidate barcodes, so rule 7 is the
   control for weak barcodes.

Threats this adds:

| Threat | What happens | Controls | Residual risk |
| --- | --- | --- | --- |
| **Phone stolen with the list** | The thief holds keyed hashes of every barcode on the event. | HMAC per pairing, so lists cannot be matched across pairings; 128-bit hashes; revocation stops new downloads; events with a printed-number or under-12-character barcode get no list (rule 7). | The key is on the phone, so a list can be attacked by trying candidate barcodes. Barcodes of 12 characters or more are the control; shorter ones are refused. |
| **Queued values on a stolen phone** | Barcodes of tickets admitted offline but not yet synced. | Queue cleared on sync; those tickets are admitted already on the phone and refused once synced. | Until sync, a copy of such a ticket could enter at another gate. |
| **Two gates admit the same ticket offline** | Both let someone in. | First sync wins; the second phone and the summary report a conflict. | Detected after the fact, not prevented. |
| **Wrong phone clock** | Admission times are off. | Kept between pairing creation and sync time. | A phone clock that is wrong within that range is recorded as is. |

### Amendment: organiser access for Printix staff (accepted 16 Nov 2026)

**Framing changed (owner, 16 Nov 2026):** Printix is a collaboration and Barrels
Grenada's main ticket app, not only a client's product. Printix keeps its own name
and look, **with Barrels shown** (for example "Sign in with your Barrels account").
This replaces the rule above that no Barrels marks appear. Barrels Events keeps
selling online tickets; Printix does all gate scanning. Address: `scan.barrels.gd`.

Until now every organiser action (`/printix/admin/*`) needs a Barrels superuser
with an MFA session (`PrintixAdmin`). Printix's own staff must set up their events
for 26 Dec 2026, from an organiser section of the scanner app. This widens who may
use these actions, so it is recorded here.

1. **Printix is an organisation** (kind `client`) entitled to the `printix` app
   (`printix` added to the known entitlements). `printix` is registered in
   `auth/apps.py` as a browser-only app with no client secret and **email-code
   sign-in only** (the authenticator is the second step), signing in as ADR-0061
   describes. Signing in to any app needs its `app.<app>.access` permission
   (`auth/eligibility.py`): `app.printix.access` is registered and comes with
   Printix membership the same way Events and Bookings members get theirs. The
   existing global `printix.manage` key stays a superuser key, outside the
   organisation keys.
2. **Events belong to an organisation:** `printix.event.organisation_id`, nullable,
   additive; existing rows stay empty. The superuser admin routes accept an
   organisation when creating an event and can set it later. Organisers do not see
   an event (or its gate codes) until it has their organisation: to them it does
   not exist (404).
3. **Organisation-scoped keys** (ADR-0044) in `auth/permissions.py`, used like this:

   | What | Key |
   | --- | --- |
   | List events, read an event and its live summary | either key |
   | Create and close an event, import the ticket list, list tickets, void and restore | `printix.events.manage` |
   | Make, list and cancel gate QR codes | `printix.gates.manage` |

   A team key for Printix to add its own staff comes later.
4. **Two role bundles:** `printix-organiser` (both keys) and `printix-gate-lead`
   (`printix.gates.manage` only: makes and cancels gate QR codes on event night).
5. **Routes:** `/printix/org/...` in the `org` zone (ADR-0025), mirroring the admin
   actions through the same service functions with an organisation filter. Each
   route uses `require_org_permission(key, session_app="printix")` and always
   requires an enrolled authenticator (a 6-digit code app) and a session that
   passed it (`privileged_mfa.require_mfa_session(..., app_key="printix")`),
   whatever the global setting: a gate pairing is a key to the gate. Calls name
   the organisation in the `X-Barrels-Organisation` header; the app learns it from
   the signed-in person's memberships. No superuser bypass on org
   routes (ADR-0044). `/printix/admin/*` and `PrintixAdmin` stay as they are.
6. **Who grants access:** a Barrels superuser creates the Printix organisation,
   turns on the `printix` entitlement and invites Printix staff with a role bundle
   (owner, 16 Nov 2026). Order for a new organiser: accept the invitation and add
   an authenticator on the Barrels account site (`account.barrels.gd`, ADR-0057),
   then sign in at `scan.barrels.gd`. Someone who signs in without an authenticator
   is told to add one there first.
7. **Sessions:** organisers sign in again when the tab closes; a session lasts at
   most 12 hours (ADR-0061).
8. **Promoters** (the people running events who buy Printix tickets) get their own
   sign-in later; because every event carries an organisation, each promoter can
   become one without changing this design.
9. **Gate QR codes (owner, 16 Nov 2026):** shown once on the organiser's screen and
   scanned there by the gate phone; never printed, saved or sent as a link by the
   app. By default a code works until 6 hours after the event closes and can be
   cancelled in one tap. Typed printed numbers are off by default; the organiser may
   turn them on for a gate when making its code. Only an Organiser (`printix.events.manage`)
   may turn typed numbers on, and an event has at most 20 active gate codes (not revoked, not
   expired); a gate lead who asks is refused.
10. **Screens:** work on a laptop for setup and ticket import, and on a phone for
    gate codes and counts on event night.

Build order: (1) these records; (2) API read-only (app entry, keys, bundles,
`organisation_id`, event list and summary on org and admin routes); (3) scanner
organiser sign-in and read-only screen; (4) event writes and the CSV import with a
dry run; (5) gate QR codes. Slice 5 is what the 14 Dec rehearsal tests.

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
