# ADR-0064: One ticket registry for every ticket, with Barrels Events as a shop

## Status

Accepted 21 Nov 2026. The owner set the direction ("Printix will be used for all
tickets backend") and delegated the design. Not built. This record amends:

- **ADR-0060:** the binding rule "no personal data exists on a ticket" now reads "no
  name, email or phone; an account id only where an account holds the ticket". The
  organiser amendment's line "Barrels Events keeps selling online tickets; Printix does
  all gate scanning" now means that Events sells, and the registry is the record that
  every gate checks. Pairing sign-in, scan caps, offline rules, retention and the threat
  model are unchanged and still live in 0060.
- **ADR-0047:** when occurrences land, the registry holds one event per occurrence.
- **ADR-0058:** My tickets reads ticket state and the QR payload from the registry.

Why a new record and not a third 0060 amendment: this decision spans two domains,
replaces a binding owner rule and carries a migration programme. 0060 stays the
authority on gate access.

## Context

Tickets live in two stores today. `printix.ticket` holds security-printed tickets
(a printed number plus the printer's barcode), admitted by the Printix scanner at
`scan.barrels.gd` with a gate pairing. `events.tickets` holds online, outlet (box
office) and free or registration tickets, admitted through the Events door console by
signed-in organisers. The owner wants one registry for all of them: Events becomes a
shop that issues into it, and one scanner admits every kind.

A Printix gate must admit printed tickets on Sat 26 Dec 2026, with a rehearsal on
14 Dec. Nothing in this plan may put that at risk.

## Evidence

**Facts (high)**

- Both stores are in the main database, and Events routes use the request's main
  session (`src/events/AGENTS.md`). One transaction can write both.
- Registry admission is one conditional `UPDATE ... WHERE status = 'valid' AND
  admitted_at IS NULL RETURNING` under the pairing's advisory lock
  (`printix/service.py: admit, _stamp_if_unadmitted`). Events admission locks the
  ticket row `FOR UPDATE` and relies on a unique `admissions.ticket_id`
  (`events/service/admission.py`).
- Events tickets are created in three places: `service/ticketing.py` (free and
  registration claims), `order_fulfilment._issue_tickets` (paid, in the outbox
  handler) and `service/outlet.py` (cash sales). Status moves go through
  `events/transitions.py` (`valid`, `cancelled`, `refunded`).
- `events.tickets.id` is the foreign key of `events.admissions` and
  `events.refunds`. `rewards/badges.py` reads `Admission`, `Order` and `Ticket`.
  Settlement, the manifest, reminders and `/events/me/tickets` read `events.tickets`.
- The Events QR token is `BT1.<10-char code>.<12-byte HMAC>`, signed with the auth
  `SECRET_KEY` (`events/tickets.py`). It is rebuilt from the code whenever it is shown.
- The registry's `status` check allows only `valid` and `void`. Admission is
  `admitted_at`, `admitted_gate` and `admitted_pairing` on the ticket, and every attempt
  is a `scan_log` row. Offline mode is refused for a whole event if any barcode is
  shorter than 12 characters (0060 offline rule 7).
- Migrations must be additive to ship; drops, renames and `NOT NULL` need a
  `CONTRACT` marker at least 7 days after the expand (`docs/api/development.md`).
- Events has no ticket transfer today, and occurrences (ADR-0047) are not built.

- The migration safety check flags only `nullable=False` on `alter_column`, so making
  `events.admissions.admitted_by` nullable is an expand step (checked in
  `tests/test_migration_safety.py`).
- The generated Zod schemas use `z.object`, which drops unknown keys, so additive
  fields in the scan result do not break the current scanner.

**Interpretation**

- Issuing and voiding in the same transaction is the only way to make "sold means
  scannable" and "refunded means refused" hold at the door with no gap. (best
  practice, high)
- Admissions flowing back to Events (rewards, badges, settlement counts) can lag by
  seconds without harm. (heuristic, high)
- A 10-character code is about 50 bits: safe to type online under a cap, too short to
  hash for offline lists (0060 rule 7). (fact for the rule; heuristic for the
  margin, medium)

**Uncertainty**

- Whether the 26 Dec event also sells online through Barrels Events (owner question
  1). It decides whether online scanning must pass the 14 Dec rehearsal.

## Options considered

1. **Two stores, Printix scanning both (closest to today).** The scanner sends
   `BT1.` values to the Events admission code and everything else to the registry.
   Nothing to migrate. But there are two admission truths, two outcome vocabularies,
   two offline lists and split analytics, and it contradicts the owner's decision.
   Low risk now, high cost later. Rejected.
2. **Printix replaces Events entirely** (tiers, orders, payments, refunds and outlet
   move into Printix). One domain, but it rewrites the paid-order flow, settlement,
   refunds, the outlet till and ADR-0047, weeks before 26 Dec. Highest risk, hardest
   to undo. Rejected.
3. **Registry replaces `events.tickets`** (Events points at registry ids). One ticket
   table, but every foreign key and reader above has to be rewritten, plus a contract
   migration on live money tables. Rejected for now. It stays possible later, because
   the one-to-one link makes it mechanical.
4. **New brand-neutral `ticketing` domain, renamed from `printix`.** A cleaner name
   for Experiences and future sellers, but it breaks `/printix/public/*`, which the
   live scanner and the generated client use, and needs a schema rename (a contract
   step). Deferred. `printix.registry` is the seam if a rename ever happens.
5. **Extend `printix.ticket`; Events keeps its tickets as line items linked one to
   one (chosen).** Additive columns only, the scan path unchanged for printed tickets,
   Events money flows untouched, one admission truth.

On issuance: **outbox** (Events queues "issue", Printix applies it) was rejected,
because it leaves a window where a sold ticket fails at the gate or a refunded one
still admits. **Same transaction** was chosen. It is cheap because both are in one
database.

## Decision

### 1. Target model

`printix.ticket` is the registry: every admittable ticket, whatever its source. New
columns, all nullable or with a server default:

| Column | Meaning |
| --- | --- |
| `source` | `printed` (default, all existing rows), `online`, `outlet`, `rsvp`, `external` |
| `source_ref` | The seller's id for the ticket (`events.tickets.id` for Events); unique with `source` |
| `order_ref` | The seller's order id (`events.orders.id`). The order item is found from the Events ticket's order and tier |
| `holder_user_id` | Account holding the ticket (online, rsvp); null for printed, outlet and external |
| `ticket_type` | Public label shown at the gate (the tier name), copied at issue |
| `void_reason` | `organiser`, `cancelled`, `refunded`, `event_cancelled`, `transferred` |
| `code_version` | Starts at 1; goes up when a transfer changes the code |

- `status` keeps its two values, `valid` and `void`, so the admission and void
  statements and their race tests do not change. The API reports a derived
  `state`: `valid`, `admitted`, `cancelled`, `refunded`, `void`.
- Admission records: the first admission stays on the ticket (`admitted_at`,
  `admitted_gate`, `admitted_pairing`). Every attempt stays in `scan_log`. Re-entry
  would need a `printix.admission` table later.
- `printix.event` gains `listing_id` and `occurrence_id` (unique together; occurrence
  is null until ADR-0047 lands) and `admission_authority` (`registry` by default,
  `events` during the switch, rule 5). One registry event exists per listing (later,
  per occurrence) and is created on the first issue, under the listing lock that
  Events already holds. Its organisation is the organiser's `organisation_id`.
  `closes_at` is the listing's `ends_at`, updated on postpone.
- `printix.pairing` gains `kind` (`gate` by default, or `console`, rule 3).
- **Events keeps `events.tickets`** as the shop's line items: tier, price, order,
  refunds and holder for My tickets. It never decides admission once its event is
  switched. `events.admissions` stays as a copy for rewards, badges and settlement,
  written only from the registry.
- Online tickets on the same event as printed ones are normal: one registry event
  holds both. Events' allocation counts only what Events sells, so the organiser
  leaves printed stock out of online tiers.

### 2. Issuance, voids and transfers

All calls go through one module, `src/printix/registry.py`, the only Printix module
other domains import. Events imports Printix, never the reverse.

- **Issue**, in the same transaction as the Events ticket insert, in the three places
  listed under Evidence: `registry.issue(session, source=..., source_ref=ticket.id,
  order_ref=..., holder_user_id=..., ticket_type=tier.name, payload=qr_token(code))`.
  Source mapping: a paid online order is `online`, an outlet sale is `outlet`, a free
  or registration claim is `rsvp`. The paid path runs inside the `events.order_paid`
  outbox handler and commits with it.
- **Void**, in the same transaction as the Events status move:
  `registry.void(session, source, source_refs, reason)`. Called from holder cancel
  (`cancelled`), cash refund and full online refund (`refunded`), and event cancel
  (`event_cancelled`, through `cancel_valid_tickets`). Event cancel also closes the
  registry event. Postpone calls `registry.reschedule`.
- **One writer per source.** Organisers may void and restore only printed tickets in
  Printix screens. A ticket from another source answers 409 "Sold through Barrels
  Events: cancel or refund it there". `check_ticket_move` allows restore only when
  `void_reason = 'organiser'`.
- **Void after admission.** A commercial void from Events (`refunded`,
  `event_cancelled`) is allowed on an admitted ticket and keeps `admitted_at`. An
  organiser void of an admitted ticket is still refused (0060 rule 12). This answers
  0060 owner question 5 for sold tickets only.
- **Transfer** (not built). Events changes the holder and calls
  `registry.transfer(session, source, source_ref, new_holder, expected_version)`. This
  swaps in a new payload and raises `code_version`, compare-and-set on the version, so
  the old QR stops working at once.
- **Idempotency keys**

  | Action | Key |
  | --- | --- |
  | Issue | unique `(source, source_ref)`; a repeat returns the existing row (outbox replays and the backfill rely on it) |
  | Void | the conditional `WHERE status = 'valid'`; repeating it changes nothing |
  | Transfer | `expected_version` |
  | Admission mirror to Events | outbox dedupe `printix.admitted:<registry ticket id>`, plus the unique `admissions.ticket_id` |
  | Door console | the console's `idempotency_key` becomes the scan's `client_ref` |
  | External sellers | `Idempotency-Key` (ADR-0026) per API key |

- **Lock order:** listing, tiers, order, Events tickets, then registry rows. Printix
  admission takes the pairing lock and then the registry ticket row only, and never
  locks Events rows, so no cycle exists.

### 3. Scanning

- **One endpoint**, `POST /printix/public/admissions`, admits any registry ticket on
  the pairing's event. The outcome codes do not change. The result gains optional
  `source`, `ticket_type`, `reference` and `void_reason`, so the scanner can say
  "Refunded ticket".
- **Code formats.** Printed tickets: the printer's barcode, plus the three-digit
  printed number only when `allow_typed_numbers` is on (0060 rule 6). Online, outlet
  and RSVP tickets: `barcode_value` stores the full signed token `BT1.<code>.<tag>`
  given at issue. A scan is an exact match, with no signature check needed at scan
  time. The `BT1` prefix is the signing key's version, so a key rotation issues `BT2`
  tokens and old tickets keep scanning. A typed 10-character code is turned back into
  its token with that key and looked up. It is allowed on every pairing, live only,
  under the typed cap (20 a minute; about 50 bits cannot be walked at that rate).
  Imports refuse barcodes starting with `BT` followed by a digit and a dot.
- **Public reference.** Each non-printed ticket gets a random 8-character
  `printed_number` (for example `W7K2-9QX4`). It is not the admission code, it never
  admits by itself, and it is what organiser lists, the offline list and the scan log
  view show. The Events code never appears in a staff list.
- **Offline.** The offline list includes every source, hashed as today. Tokens are
  about 31 characters, so online tickets pass rule 7. A weak printed barcode still
  turns offline mode off for the whole event. Typed codes are never checked offline.
- **Races.** The conditional UPDATE decides, so scanner, offline sync and door console
  share one rule: the first record the server keeps wins.
- **Events door console.** It calls `registry.admit_as_staff(session, event, value,
  actor, client_ref)`. This finds or creates a `console` pairing for that person and
  event (its hash comes from a secret that is never returned) and runs the same
  admission code, caps and scan log. Analytics shows it as a gate named "Door
  console". The existing Events responses and 409 messages stay the same. In phase 4
  the door page becomes "Make a gate code" plus a link to the scanner, and the
  console's scan box goes once no caller remains.
- **Back to Events.** Every admission, live or offline, queues `printix.ticket_admitted`
  (registry ticket id, `source`, `source_ref`, time, gate). The Events handler writes
  the `events.admissions` copy, credits rewards and records the activity row.
  `admitted_by` becomes nullable and a `gate` column is added, because a phone has no
  user.

### 4. Tenancy and permissions

- A registry event belongs to one organisation: the Printix client organisation for
  printed events, or the organiser's organisation for listing-linked events (null for
  a legacy organiser with no organisation: Events door only). Barrels superusers see
  every event (`PrintixAdmin`, unchanged).
- **Printix staff** keep their organiser screens and keys (`printix.events.manage`,
  `printix.gates.manage`). They see an Events listing's registry event only if it
  belongs to their organisation (the Printix organisation holding both the `events`
  and `printix` entitlements).
- **Events organisers** make gate codes from the Events dashboard:
  `POST /events/org/events/{listing_id}/gate-codes` and its list and cancel routes, with
  `events.door.scan` (staff: `events.ops.door`, ADR-0050). An authenticator and an MFA
  session are always required, because a gate code is a key to the gate (0060). The
  same `create_pairing` limits apply. No Printix key or app role is given to Events
  staff, so no permission is widened.
- **What an organiser sees:** counts, analytics, scans and tickets of their events,
  across all sources, by public reference and type. Never barcodes, tokens or codes,
  and never another organisation's event (404).
- **Printix look:** the scanner and Printix screens keep the Printix name, with
  Barrels shown (0060 amendment). The Events dashboard keeps the Barrels Events look.

### 5. Migration plan (expand, dual-write, switch, contract)

| Phase | By | What ships | Reversible by |
| --- | --- | --- | --- |
| 0 | 24 Nov | This record; issues filed | n/a |
| 1 Expand | 30 Nov | Columns above (server defaults or nullable); unique indexes built `CONCURRENTLY`; `source` check added `NOT VALID`; `registry.py` with tests. Scan path unchanged for printed tickets | leaving it unused |
| 2 Dual-write | 7 Dec | Events issues, voids and reschedules into the registry; new listing-linked events start as `admission_authority = 'events'` (no pairings, door console as today). Backfill job (dry run, then apply) copies tickets of unended listings, with their admissions, idempotently. Nightly `reconcile_ticket_registry` compares counts per listing and alerts on any difference (the dual-read check) | flag `events.registry_write` off; reconcile again before turning it back on |
| 3 Switch per event | from 8 Dec (staging first) | Per listing: under the listing lock, copy admissions, set `registry`. The door console and pairings then admit through the registry; Events reads its copy | set back to `events` (registry admissions are mirrored, so nothing is lost) |
| Freeze | 15–27 Dec | No schema or scan-path change in `printix` except fixes. The printed path is identical to the 14 Dec rehearsal | n/a |
| 26 Dec | event | Printed tickets through Printix (must). Online tickets through Printix only if that listing was switched and passed on 14 Dec; otherwise on the Events door console, unchanged | n/a |
| 4 Switch all | Jan 2027 | Default `registry` for every listing; manifest, My tickets state and payload, settlement admitted counts and badges read the registry for a week while compared against the copy; door page moves to gate codes | per listing, as phase 3 |
| 5 Contract | not before 1 Feb 2027 | `CONTRACT` migration: remove the `events` value and the direct Events admission write; retire the console's scan box after one release with no callers. `events.tickets` and the `events.admissions` copy stay | none (contract) |
| 6 External API | Q1 2027 | Section 7 | flag off |

### 6. Privacy

- The registry holds no name, email, phone or payment detail. Outlet buyer details
  stay on `events.orders`. `holder_user_id` exists only for account-held tickets and
  is cleared when an account is anonymised (ADR-0058 deletion path).
- The scanner sees ticket type, public reference and outcome. Holder names are not
  shown. A later, per-event "check name at the gate" setting (off by default) would
  read the display name at scan time, live only, never offline, never logged.
- Payloads leave the server in one place only: the holder's own ticket (`me` zone).
  Organiser lists, exports, the offline list and logs never carry them (0060 rule 13
  holds for every other reader). `scan_log` values keep the 90-day purge.

### 7. APIs

- **Internal (`src/printix/registry.py`):** `ensure_event_for_listing`, `issue`,
  `void`, `reschedule`, `close_for_listing`, `transfer`, `admit_as_staff`,
  `states_for(source, source_refs)` and `payload_for(source, source_ref)`. Plain
  functions on the caller's session, typed `AppException` errors, no commits inside
  (the caller commits).
- **External (phase 6, agent-ready):** organisation API keys (ADR-0029) with a new
  organisation key `printix.tickets.issue` (in no bundle by default):
  `POST /printix/org/events/{id}/tickets` (issue; `source=external`, the seller's
  `external_ref`, optional own barcode of at least 12 characters, `Idempotency-Key`
  required; returns the payload once), `POST .../tickets/{id}/void`, `GET
  .../tickets/{id}`, and signed webhooks `printix.ticket.admitted` and
  `printix.ticket.voided` (versioned payloads, ids only). Documented in
  `docs/api/contracts.md` with examples, stable outcome codes and the retry rules.

## Consequences

- One admission truth and one scanner for every ticket. Events' money flows, holds,
  refunds and settlement keep their tables and tests.
- Events tickets now write two rows. Every new issue or void path must call
  `registry.py`; the reconcile job and a test that lists the call sites catch a
  missed one.
- Rewards, badges and the attendee copy lag admissions by one outbox drain.
- The registry becomes a dependency of Events' sales path: a registry failure fails
  the sale. That is intended (no ticket that cannot scan).
- An Events organiser with no organisation cannot use Printix gates until linked.
- Re-entry, multi-day passes and seat maps still need a later record.

## Risks

| Risk | Control |
| --- | --- |
| A missed issue or void call site | Call-site inventory test; nightly reconcile with alert; backfill can be rerun |
| A deadlock between a sale and a scan | Fixed lock order; deadlock test with held transactions |
| Signing key rotated with old tickets live | Payload stored at issue; prefix gives the key version |
| A change lands on the 26 Dec path | Freeze window; printed path has its own regression run before 14 Dec |
| Online code leaked through a staff screen | Public reference column; tests assert no payload in any org or admin response or CSV |

## Test plan

- `tests/printix/test_registry.py`: issue twice gives one row; void reasons; restore
  only for `organiser`; commercial void of an admitted ticket keeps `admitted_at`;
  transfer compare-and-set; anonymisation clears `holder_user_id`.
- `tests/printix/test_admission.py` (extended): online token, typed online code under
  the typed cap, key-version prefix, `BT` prefix refused on import, additive result
  fields, cross-event `unknown` for online tickets.
- `tests/printix/test_races.py` (extended): console against pairing, refund against
  scan, sale against close, each with a held transaction.
- `tests/printix/test_offline.py` (extended): mixed event offline list; online tokens
  pass rule 7; a weak printed barcode still refuses the event.
- `tests/events/test_registry_dual_write.py`: each issue and void site writes the
  registry in the same transaction (a rollback leaves neither row); the admission copy
  and rewards are written once through the outbox, including on replay.
- Migration tests: backfill dry run and apply on a fixture, rerun changes nothing;
  reconcile reports a planted difference; `test_migration_safety.py` passes phase 1
  with no marker.
- Privacy: no payload, code or barcode in org and admin responses, the CSV, logs or
  audit history.
- Scanner (`apps/pwa/printix`): new fields shown, `void_reason` words, online QR
  scanned in the browser run. Rehearsal checklist (`docs/operations/
  printix-rehearsal-checklist.md`) gains an online-ticket step if question 1 is yes.

## Blast radius

- **Routes:** `/printix/public/admissions` and `/offline-tickets` (additive fields);
  new `/events/org/events/{listing_id}/gate-codes`; `/events/manage/{id}/admissions`
  (same contract, new internals, retired in phase 5 with `apps/web/events` as its only
  consumer); later `/printix/org/events/{id}/tickets`.
- **Models and migrations:** `printix.ticket`, `printix.event` and `printix.pairing`
  (additive); `events.admissions` (`admitted_by` nullable, `gate`); backfill and
  reconcile jobs registered in `operational_metrics.JOBS`.
- **Permission keys:** `printix.tickets.issue` (phase 6). No bundle changes.
- **Generated client and web:** regenerate after phases 1, 3 and 6; `apps/pwa/printix`
  (scan outcome wording), `apps/web/events` (door page, gate codes, My tickets
  payload), `apps/web/account` tickets later.
- **Docs:** `src/printix/AGENTS.md`, `src/events/AGENTS.md`, `apps/pwa/printix/AGENTS.md`,
  `docs/api/contracts.md`, the ADR index, status notes on 0060 and 0047.

## What would change this decision

- If the registry moves to its own database, issuance must go through the outbox,
  with a "not yet scannable" state.
- If re-entry or multi-day passes are needed, add a `printix.admission` table before
  phase 4.
- If Events' line items stop carrying anything the registry lacks, consider
  option 3 (registry replaces `events.tickets`).

## Questions for the owner

1. Does the 26 Dec event also sell tickets online through Barrels Events? If yes,
   that listing is switched and tested at the 14 Dec rehearsal; if no, online scanning
   through Printix starts in January.
