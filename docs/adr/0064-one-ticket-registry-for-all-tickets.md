# ADR-0064: One ticket registry for every ticket, with Barrels Events as a shop

## Status

Accepted 21 Nov 2026. The owner set the direction ("Printix will be used for all
tickets backend") and delegated the design. Not built. This record amends:

- **ADR-0060:** the binding rule "no personal data exists on a ticket" now reads "no
  name, email or phone; an account id only where an account holds the ticket". The
  organiser amendment's line "Barrels Events keeps selling online tickets; Printix does
  all gate scanning" now means that Events sells, and the registry is the record that
  every gate checks. Pairing sign-in, scan caps, offline rules, retention, the typed
  numbers rule (rule 6) and the threat model are unchanged and still live in 0060.
- **ADR-0044 (permissions widened):** a new organisation key, `events.gates.manage`,
  lets Events organisers make gate codes. It is added to the `events-manager` bundle
  only. Organisation owners and admins hold it implicitly, as with every organisation
  key of an entitled product. `events.door.scan` and the Barrels staff key
  `events.ops.door` (ADR-0050) cannot make gate codes.
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
  session (`src/events/AGENTS.md`). One transaction can write both. Production,
  staging and the verification stack run PostgreSQL 18 (`infra/docker/
  docker-compose.prod.yml`, `docker-compose.staging.yml`, `scripts/verification/
  compose.yml`).
- Registry admission is one conditional `UPDATE ... WHERE status = 'valid' AND
  admitted_at IS NULL RETURNING` under the pairing's advisory lock
  (`printix/service.py: admit, _stamp_if_unadmitted`). Events admission locks the
  ticket row `FOR UPDATE` and relies on a unique `admissions.ticket_id`. It takes no
  lock on the listing (`events/service/admission.py: admit_ticket`).
- `printix.service.admit`, `set_ticket_void` and `sync_offline_admissions` commit
  inside the service. `create_event` needs the `printix` entitlement and commits.
- Events tickets are created in three places: `service/ticketing.py` (free and
  registration claims), `order_fulfilment._issue_tickets` (paid, in the outbox
  handler) and `service/outlet.py` (cash sales).
- Events ticket status is written in five places: `ticketing.cancel_ticket`,
  `ticketing.cancel_valid_tickets`, the organiser order cancel in
  `service/org_orders.py` (a bulk UPDATE), `cancellation.refund_ticket` (moves
  `refund` and `refund_cancelled`) and `order_fulfilment.apply_refund`. Single moves use
  `transitions.move_ticket`; bulk ones use `transitions.bulk_sources` and
  `bulk_target`. `LISTING_MOVES` allows `save_published` from `cancelled`.
- `events.tickets.id` is the foreign key of `events.admissions` and
  `events.refunds`. `rewards/badges.py` reads `Admission`, `Order` and `Ticket`.
  Settlement, the manifest, reminders and `/events/me/tickets` read `events.tickets`.
- The Events QR token is `BT1.<10-char code>.<12-byte HMAC>`, signed with the auth
  `SECRET_KEY` (`events/tickets.py`). `BT1` is a format prefix, not a key version.
  The token is rebuilt from the code whenever it is shown.
- Staff responses carry the 10-character code today: `ManifestRow`,
  `AdmissionPublic`, `RefundPublic`, `OrgOrderTicket` and `OrgAttendee`. `OutletTicket`
  returns `qr_token`, because the outlet prints the ticket (`events/schemas.py`).
  `AdmissionCreate.idempotency_key` is a string of up to 64 characters.
- The registry's `status` check allows only `valid` and `void`. Admission is
  `admitted_at`, `admitted_gate` and `admitted_pairing` on the ticket, and every attempt
  is a `scan_log` row that keeps up to 128 characters of the value. Offline mode is
  refused for a whole event if any barcode is shorter than 12 characters (0060
  offline rule 7). Printix audit history leaves out `barcode_value`
  (`printix/audit.py`).
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
  seconds without harm. Guards that decide money or cancellation cannot use that
  lagging copy. (heuristic, high)
- A 10-character code is about 50 bits: safe to type under a cap, too short to hash
  for offline lists (0060 rule 7). (fact for the rule; heuristic for the margin,
  medium)

**Uncertainty**

- None open on timing. The owner answered on 21 Nov 2026: the 26 Dec event sells no
  tickets through Barrels Events (printed only), and online tickets through Printix
  are piloted at the next event after it.

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
| `void_reason` | `organiser`, `cancelled`, `refunded`, `event_cancelled`, `transferred`. NULL on a void row means `organiser` |
| `code_version` | Starts at 1; goes up when a transfer changes the code |

- `status` keeps its two values, `valid` and `void`, so the admission and void
  statements and their race tests do not change. The API reports a derived
  `state`: `valid`, `admitted`, `cancelled`, `refunded`, `void`.
- Admission records: the first admission stays on the ticket (`admitted_at`,
  `admitted_gate`, `admitted_pairing`). Every attempt stays in `scan_log`. Re-entry
  would need a `printix.admission` table later.
- `printix.event` gains `listing_id`, `occurrence_id` and `admission_authority`
  (`registry` by default; `events` during the switch, section 5). The authority
  applies to tickets Events sold only. **Printed tickets always admit through the
  registry**, so linking a listing never stops printed scanning.
- **One registry event per listing** (later, per occurrence): a unique index on
  `(listing_id, occurrence_id) NULLS NOT DISTINCT` (PostgreSQL 15 or later; we run 18).
  `registry.ensure_event_for_listing` runs `INSERT ... ON CONFLICT DO NOTHING`, then
  reads the row back, because sales hold only a shared listing lock and two can race.
  It does not reuse `create_event`, which needs the `printix` entitlement and commits.
  The event's organisation is the organiser's `organisation_id`. For an event
  created from a listing, `closes_at` is the listing's `ends_at`, updated on postpone.
  For a printed event linked to a listing, Printix owns `closes_at`, and postponing
  the listing never moves it.
- **Linking an existing printed event (admin only).** `POST
  /printix/admin/events/{id}/listing` links a listing to an existing Printix event
  before the listing's first issue or backfill. It is refused (409) if the listing
  already has a registry event or the Printix event already has a listing. The
  organisations must match. A pairing is bound to one event, so this is how printed
  and online tickets share one set of gate codes.
- `printix.pairing` gains `kind` (`gate` by default, or `console`, section 3).
- **Events keeps `events.tickets`** as the shop's line items: tier, price, order,
  refunds and holder for My tickets. It never decides admission once its event is
  switched. `events.admissions` stays as a copy for rewards, badges and settlement,
  written only from the registry.
- Online tickets on the same event as printed ones are normal. Events' allocation
  counts only what Events sells, so the organiser leaves printed stock out of online
  tiers.

### 2. Issuance, voids and transfers

All calls go through one module, `src/printix/registry.py`, the only Printix module
other domains import. Events imports Printix, never the reverse.

- **Issue**, in the same transaction as the Events ticket insert, in the three places
  listed under Evidence: `registry.issue(session, source=..., source_ref=ticket.id,
  order_ref=..., holder_user_id=..., ticket_type=tier.name, payload=token)`. Source
  mapping: a paid online order is `online`, an outlet sale is `outlet`, a free or
  registration claim is `rsvp`. The paid path runs inside the `events.order_paid`
  outbox handler and commits with it.
- **Void**, in the same transaction as each of the five Events status writes:

  | Events write | Reason |
  | --- | --- |
  | `ticketing.cancel_ticket` (holder cancel) | `cancelled` |
  | `org_orders` order cancel (bulk) | `cancelled` |
  | `ticketing.cancel_valid_tickets` (event cancel, bulk) | `event_cancelled` |
  | `cancellation.refund_ticket` (`refund`, `refund_cancelled`) | `refunded` |
  | `order_fulfilment.apply_refund` (full refund, bulk) | `refunded` |

  `registry.void(session, tickets, reason)` takes the Events ticket rows. When a
  registry row is missing (a ticket from before dual-write, not yet backfilled), it
  **inserts a complete row already void**, so a void can never be lost to the
  backfill. On a row that is already void, a later commercial reason
  replaces an earlier commercial one (for example `cancelled` then `refunded`); the
  status stays `void`, so admission is unaffected and repeating the same reason
  changes nothing. It never replaces `organiser`. Postpone calls
  `registry.reschedule`.
- **Guards read the registry.** Once a listing is switched, the "already used" checks
  in `cancel_ticket`, the `org_orders` cancel and `refund_ticket` read `admitted_at`
  from the registry, under the registry row locks taken by
  `registry.lock_for_change`. They never read the lagging `events.admissions` copy.
- **One writer per source.** Organisers may void and restore only printed tickets in
  Printix screens. A ticket from another source answers 409 "Sold through Barrels
  Events: cancel or refund it there". `set_ticket_void` writes `void_reason =
  'organiser'`. `check_ticket_move` allows restore only when the reason is `organiser`
  or NULL (rows voided before this change).
- **One writer for the event's close.** Printix organisers cannot close a
  listing-linked event (409). Events never closes it either: cancelling a listing
  voids only that listing's tickets and leaves the registry event open. Printed
  tickets on a mixed event keep working, and a listing republished after cancel
  (`save_published` from `cancelled`) issues into the same event. The event closes at
  `closes_at`, or by an administrator's emergency close (audited).
- **Void after admission.** A commercial void (`refunded`, `event_cancelled`) is
  allowed on an admitted ticket and keeps `admitted_at`. An organiser void of an
  admitted ticket is still refused (0060 rule 12). This answers 0060 owner question 5
  for sold tickets only.
- **Transfer** (not built). Events changes the holder and calls
  `registry.transfer(session, source, source_ref, new_holder, expected_version)`. This
  swaps in a new payload and raises `code_version`, compare-and-set on the version, so
  the old QR stops working at once.
- **Idempotency keys**

  | Action | Key |
  | --- | --- |
  | Issue | unique `(source, source_ref)`; a repeat returns the existing row |
  | Void | `(source, source_ref)` upsert plus `WHERE status = 'valid'`; repeating changes nothing |
  | Backfill | `INSERT ... ON CONFLICT DO NOTHING`, so a row written by issue or void wins |
  | Transfer | `expected_version` |
  | Admission copy to Events | outbox dedupe `printix.admitted:<registry ticket id>`, plus the unique `admissions.ticket_id` |
  | Door console | `client_ref` = UUID version 5 of the console pairing id and the `idempotency_key` |
  | External sellers | `Idempotency-Key` (ADR-0026) per API key |

- **Lock order.** Events side: listing, tiers, order, Events tickets, then the
  registry event row (`FOR SHARE`, so a long Events transaction never blocks gate
  scans), then registry ticket rows **in id order** (bulk voids
  included). Scanner: pairing advisory lock, registry event row (`FOR SHARE`), then
  one ticket row. Both take the event row before ticket rows, so no cycle is
  expected. A deadlock victim is still retried once and then answered as a lost race.
  The deadlock check moves from `ticketing.is_deadlock` to a shared helper in
  `src/utils/`, because Printix must not import Events.
- **No commits inside.** `registry.py` and new inner functions behind today's `admit`,
  `set_ticket_void` and `sync_offline_admissions` write without committing. The
  Printix routes keep their commit, so their behaviour is unchanged.

### 3. Scanning

- **One endpoint**, `POST /printix/public/admissions`, admits any registry ticket on
  the pairing's event. The outcome codes do not change. The result gains optional
  `source`, `ticket_type`, `reference` and `void_reason`, so the scanner can say
  "Refunded ticket". While an event's authority is `events`, the registry answers
  `unknown` for tickets Events sold (logged as usual) and admits printed ones.
- **Code formats.** Printed tickets: the printer's barcode, plus the printed number
  only when `allow_typed_numbers` is on (0060 rule 6). Online, outlet and RSVP
  tickets: `barcode_value` stores the full signed token given at issue. A scan is an
  exact match, with no signature check at scan time. Until My tickets, the outlet print
  and the console's `code_from_scan` read `registry.payload_for` (phase 2), issue
  stores today's `qr_token(code)`, so the QR a holder is shown always equals the stored
  payload (tested). Only after those three readers have moved are new tokens signed
  with a dedicated ticket signing key list (the first key signs, every live key verifies).
  Typed lookup also tries the old `SECRET_KEY` signature for existing tickets. A
  rotation therefore never breaks a stored token.
- **Typed online codes** follow the same rule as printed numbers. They work only on a
  pairing with `allow_typed_numbers` on, which only an organiser may set (#1542).
  They are live only, under the typed cap (20 a minute), and only on events that hold
  tickets from a source other than printed. The server rebuilds the token with each
  live key and looks it up. Imports refuse barcodes starting with `BT` followed by a
  digit and a dot.
- **Public reference.** Each non-printed ticket gets a random 8-character
  `printed_number` (for example `W7K2-9QX4`). It is not the admission code and never
  admits by itself. It is what the scanner, Printix lists, the offline list and the
  scan views show. Events staff screens still show the code today (Evidence); they
  move to the reference in phase 4. The outlet keeps `qr_token` as a stated
  exception, because it prints the ticket.
- **Offline.** The offline list includes every source, hashed as today. Tokens are
  about 31 characters, so online tickets pass rule 7. A weak printed barcode still
  turns offline mode off for the whole event. Typed codes are never checked offline.
- **Races.** The conditional UPDATE decides, so scanner, offline sync and door console
  share one rule: the first record the server keeps wins.
- **Events door console.** `admit_ticket` takes the listing row `FOR SHARE`, reads the
  authority, then either admits in Events (authority `events`) or calls
  `registry.admit_as_staff(session, event, value, actor, client_ref)`. That finds or
  creates a `console` pairing for that person and event (its hash comes from a secret
  that is never returned) and runs the same admission code, caps and scan log. Console
  pairings do not count toward the 20 active gate codes. A repeated `client_ref`
  returns the first answer, as offline sync does, instead of a unique-index error.
  The existing Events responses and 409 messages stay the same. One change: a console
  scan after the listing's `ends_at` now answers "event closed", as a gate would.
  In phase 4 the door page becomes "Make a gate code" plus a link to the scanner.
- **Back to Events.** Every registry admission, live or offline, queues
  `printix.ticket_admitted` (registry ticket id, `source`, `source_ref`, time, gate).
  The Events handler writes the `events.admissions` copy, credits rewards and records
  the activity row. `admitted_by` becomes nullable and a `gate` column is added,
  because a phone has no user.

### 4. Tenancy and permissions

- A registry event belongs to one organisation: the Printix client organisation for
  printed events, or the organiser's organisation for listing-linked events (null for
  a legacy organiser with no organisation: Events door only). Barrels superusers see
  every event (`PrintixAdmin`, unchanged).
- **Printix staff** keep their organiser screens and keys (`printix.events.manage`,
  `printix.gates.manage`). They see a listing's registry event only if it belongs to
  their organisation.
- **Events organisers** make gate codes from the Events dashboard: `POST
  /events/org/events/{listing_id}/gate-codes` and its list and cancel routes, organiser
  zone only, with the new key `events.gates.manage` (`events-manager` bundle), an
  enrolled authenticator and an MFA session. No staff route exists. The same
  `create_pairing` limits apply. Typed numbers on these codes need the same key.
- **What an organiser sees:** counts, analytics, scans and tickets of their events,
  across all sources, by public reference and type. Never barcodes or tokens (the
  outlet reprint excepted), and never another organisation's event (404).
- **Printix look:** the scanner and Printix screens keep the Printix name, with
  Barrels shown (0060 amendment). The Events dashboard keeps the Barrels Events look.

### 5. Migration plan (expand, dual-write, switch, contract)

| Phase | By | What ships | Reversible by |
| --- | --- | --- | --- |
| 0 | 24 Nov | This record; issues filed | n/a |
| 1 Expand | 30 Nov | Columns above (server defaults or nullable); unique indexes built `CONCURRENTLY` inside an autocommit block; `source` check added `NOT VALID`, with an issue filed for the later `VALIDATE` migration; audit exclusions extended; `registry.py` with tests; admin link route. Scan path unchanged for printed tickets | leaving it unused |
| 2 Dual-write | 7 Dec | Events issues, voids, reschedules and console admissions write the registry in the same transaction; My tickets, the outlet print and the console read `payload_for`; listing-linked events start as authority `events`. Backfill (dry run, then apply) copies tickets of unended listings with their admissions, `ON CONFLICT DO NOTHING`. Nightly `reconcile_ticket_registry` compares **per ticket** by `source_ref` (status and admission) and alerts on any difference | flag `events.registry_write` off; reconcile again before turning it back on |
| 3 Switch per event | staging from 8 Dec; production from 28 Dec, first live listing is the pilot event after 26 Dec | Per listing, under the listing row `FOR UPDATE` (which waits for console scans holding `FOR SHARE`): copy any missing admissions, set authority `registry`. Pairings then admit Events tickets too | under the same lock, copy registry admissions into `events.admissions` synchronously, then set `events` |
| Freeze | 15–27 Dec | No schema or scan-path change in `printix` except fixes. The printed path is identical to the 14 Dec rehearsal. Scanner-side changes for Events tickets (the event-row `FOR SHARE` lock, Events-ticket lookups, typed online codes) land after 27 Dec | n/a |
| 26 Dec | event | Printed tickets only, through Printix (must). The event sells no tickets through Barrels Events (owner, 21 Nov) | n/a |
| 4 Switch all | Jan 2027 | Default `registry` for every listing; manifest, My tickets state and payload, settlement admitted counts and badges read the registry for a week while compared against the copy; staff responses gain an additive `reference` field and `apps/web/events` moves to it; door page moves to gate codes | per listing, as phase 3 |
| 5 Contract | not before 1 Feb 2027 | `CONTRACT` migration and API removal: drop the `events` authority value and the direct Events admission write; remove `code` from `ManifestRow`, `AdmissionPublic`, `RefundPublic`, `OrgOrderTicket` and `OrgAttendee` (`apps/web/events` already moved); retire the console's scan box after one release with no callers. `events.tickets`, `OutletTicket.qr_token` and the `events.admissions` copy stay | none (contract) |
| 6 External API | Q1 2027 | Section 7 | flag off |

### 6. Privacy

- The registry holds no name, email, phone or payment detail. Outlet buyer details
  stay on `events.orders`. `holder_user_id` exists only for account-held tickets, is
  left out of audit history, and is cleared when an account is anonymised (ADR-0058
  deletion path).
- The scanner sees ticket type, public reference and outcome. Holder names are not
  shown. A later, per-event "check name at the gate" setting (off by default) would
  read the display name at scan time, live only, never offline, never logged.
- Tokens are stored at rest in `barcode_value` and, for 90 days after close, in
  `scan_log.value`, exactly like printed barcodes. They are never in responses except
  the holder's own ticket (`me` zone) and the outlet reprint. They are never in
  organiser lists, exports, the offline list, logs or audit history. Storing a keyed
  hash instead is 0060's "keyed barcodes" follow-up and covers both kinds.

### 7. APIs

- **Internal (`src/printix/registry.py`):** `ensure_event_for_listing`, `issue`,
  `void`, `lock_for_change`, `reschedule`, `transfer`, `admit_as_staff`,
  `states_for(source, source_refs)` and `payload_for(source, source_ref)`. Plain
  functions on the caller's session, typed `AppException` errors, no commits.
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
- Events tickets now write two rows. Every new issue or status path must call
  `registry.py`; an inventory test of `move_ticket`, `bulk_sources` and `bulk_target`
  uses and the per-ticket reconcile catch a missed one.
- Rewards, badges and the attendee copy lag admissions by one outbox drain.
- The registry becomes a dependency of Events' sales path: a registry failure fails
  the sale. That is intended (no ticket that cannot scan).
- Console scans after a listing's end are refused, as gate scans are.
- An Events organiser with no organisation cannot use gate codes until linked.
- A new secret (the ticket signing keys) joins each environment (ADR-0035).
- Re-entry, multi-day passes and seat maps still need a later record.

## Risks

| Risk | Control |
| --- | --- |
| A missed issue or status call site | Inventory test over `move_ticket` and the bulk helpers; per-ticket reconcile with alert; backfill can be rerun |
| Backfill overwrites a void | Void inserts a void row when none exists; backfill never updates |
| Console and switch interleave | Listing `FOR SHARE` on scan, `FOR UPDATE` on switch and rollback |
| A guard trusts the lagging copy | Guards read the registry under its row lock once switched |
| Deadlock between a sale, a void and a scan | Event row before ticket rows, ticket rows in id order; one retry |
| Signing key rotated with old tickets live | Tokens stored at issue; every live key tried for typed codes |
| A change lands on the 26 Dec path | Freeze window; printed tickets ignore the authority switch; printed regression run before 14 Dec |
| Online code leaked through a staff screen | Reference field in phase 4, code removed in phase 5; tests assert no token in Printix org or admin responses or CSV |

## Test plan

- `tests/printix/test_registry.py`: issue twice gives one row; void of a missing row
  inserts a void row; reason replacement rules; restore for `organiser` and NULL only;
  commercial void of an admitted ticket keeps `admitted_at`; transfer compare-and-set;
  anonymisation clears `holder_user_id`; two concurrent `ensure_event_for_listing`
  calls give one event.
- `tests/printix/test_admission.py` (extended): online token; typed online code
  refused with typed numbers off, admitted with them on, under the typed cap, and
  never on a printed-only event; every live key tried; `BT` prefix refused on import;
  additive result fields; `unknown` for Events tickets while authority is `events`,
  printed still admitted; console replay of a known `client_ref`.
- `tests/printix/test_races.py` (extended), each with a held transaction: console
  against pairing, refund against scan, bulk void against scan, switch against
  console scan, backfill against void.
- `tests/printix/test_offline.py` (extended): mixed event offline list; online tokens
  pass rule 7; a weak printed barcode still refuses the event.
- `tests/events/test_registry_dual_write.py`: each of the three issue sites and five
  status writes writes the registry in the same transaction (a rollback leaves
  neither row); the "already used" guards read the registry once switched; the
  admission copy and rewards are written once through the outbox, including on replay;
  cancel leaves the registry event open and republish issues into it.
- Permissions: `events.gates.manage` needed for gate codes; `events.door.scan` and
  staff keys refused; console pairings outside the 20 cap.
- Migration tests: backfill dry run and apply on a fixture, rerun changes nothing;
  reconcile reports a planted per-ticket difference; `test_migration_safety.py`
  passes phase 1 with no marker.
- Privacy: no token or barcode in Printix org and admin responses, the CSV, logs or
  audit history; `holder_user_id` not in history.
- Scanner (`apps/pwa/printix`): new fields shown, `void_reason` words, online QR
  scanned in the browser run. Rehearsal checklist (`docs/operations/
  printix-rehearsal-checklist.md`) gains an online-ticket step for the pilot event.

## Blast radius

- **Routes:** `/printix/public/admissions` and `/offline-tickets` (additive fields);
  new `POST /printix/admin/events/{id}/listing`; Printix org close (refused for linked
  events); new `/events/org/events/{listing_id}/gate-codes`;
  `/events/manage/{id}/admissions` (same contract, new internals, retired in phase 5);
  staff responses gaining `reference` in phase 4 and losing `code` in phase 5:
  `/events/manage/{id}/manifest`, `/events/manage/{id}/admissions`,
  `/events/manage/{id}/tickets/{ticket_id}/refund`, `/events/org/orders/{order_id}`
  and the listing order list, `/events/org/events/{listing_id}/attendees`; outlet sale
  routes unchanged; later `/printix/org/events/{id}/tickets`.
- **Models and migrations:** `printix.ticket`, `printix.event` and `printix.pairing`
  (additive); `events.admissions` (`admitted_by` nullable, `gate`); the later
  `VALIDATE` migration; backfill and reconcile jobs registered in
  `operational_metrics.JOBS`.
- **Permission keys:** `events.gates.manage` (phase 3, `events-manager` bundle);
  `printix.tickets.issue` (phase 6, no bundle).
- **Generated client and web:** regenerate after phases 1, 3, 4, 5 and 6;
  `apps/pwa/printix` (scan outcome wording), `apps/web/events` (door page, gate codes,
  reference instead of code, My tickets payload), `apps/web/account` tickets later.
- **Docs:** `src/printix/AGENTS.md`, `src/events/AGENTS.md`, `apps/pwa/printix/AGENTS.md`,
  `docs/api/contracts.md`, `docs/env.md` (signing keys), the ADR index, status notes on
  0060, 0044 and 0047.

## What would change this decision

- If the registry moves to its own database, issuance must go through the outbox,
  with a "not yet scannable" state.
- If re-entry or multi-day passes are needed, add a `printix.admission` table before
  phase 4.
- If organisers need console scans after a listing's end, add a grace period to
  `closes_at` rather than a console exception.
- If Events' line items stop carrying anything the registry lacks, consider
  option 3 (registry replaces `events.tickets`).

## Questions for the owner

None open. Answered 21 Nov 2026: the 26 Dec event is printed only, and the online
pilot is the next event after it.
