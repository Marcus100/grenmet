# ADR-0063: Shop Keeper and Salesbus: a shared Barrels Commerce core with two private apps

## Status

Proposed 21 Nov 2026. The owner's product decisions of 21 Nov 2026 are
requirements, including two made after the first draft: Salesbus lives at
`salesbus.barrels.gd`, and each business controls its own data as fully as
possible (decision 2.9). If accepted, this record amends:

- ADR-0043: adds the `shopkeeper` host, and brings back the retired `salesbus`
  host for this product. This is the owner's exception to the rule that retired
  hosts are never reassigned.
- ADR-0061: a registered till may stay signed in.
- ADR-0033: Commerce business records.

Nothing is built.

## Context

Barrels will build two private apps on one shared backend:

- **Shop Keeper**, for corner shops, at `shopkeeper.barrels.gd`. Built first.
- **Salesbus**, for distributors whose vans sell wholesale to shops.

Both apps sell (the van sells from its own stock) and both keep real stock.
They share code, not data.

**Privacy is the first requirement.** Each business is its own organisation.
Its sales, prices, stock, customers and credit book are private to it:

- A distributor never sees a shop's sales, stock or customers.
- A shop never sees a distributor's other shops or prices.
- Distributors never see each other.
- A shop and a distributor connect only if both agree. Only the orders the
  shop chooses to send cross over, plus the distributor's delivery note and
  invoice coming back.
- Barrels staff do not browse business data. Support needs the owner's consent
  and is logged.

**Scale varies.** There are many distributors with one or many vans each, and a
shop may deal with several distributors.

**Devices.** The app runs on any phone (Android or iPhone, installed from the
browser) and on a laptop for reports, stock lists and imports. One person uses
the till at a time: the owner by default, with helpers later. The pilot uses a
Bluetooth receipt printer.

**Offline first.** Sales, the credit book and the daily cash-up work fully
offline, then sync. Products come in four ways: scanning as you go, a shared
Grenada product list kept by Barrels (name, barcode and size only), a Salesbus
delivery, and a spreadsheet (CSV) import. A product that is out of stock never
blocks a sale. The app is free during the pilot, and the owner has chosen the
pilot businesses.

**Research (owner, Nov 2026):**

- Loyverse, Square and Shopify point-of-sale apps set the pattern: favourites
  grid, scanning, cash with change.
- OkCredit and Khatabook show the credit book on a phone: balances, part
  payments, reminders sent by chat.
- Wasoko and TradeDepot show shop restocking from a distributor.
- Pepperi and Ivy show van sales: load, sell, return, settle.
- In Grenada, cash dominates. Republic Bank's card fee is 1.75%. WiPay's
  Grenada licence was revoked in 2024 (disputed), so we do not depend on it.
  DCash's status is unclear, and Fygaro tap-to-pay is unconfirmed.

## Evidence

**Facts**

- `src/stores` is GAA's internal requisition module. Its organisation and
  department come from the HR employment record, stock can never go negative
  (a database check), and an adjustment *sets* the counted level. The
  gaa-admin screens under `components/salesbus` and `lib/salesbus` are that
  module's interface, not a point of sale (`src/stores/AGENTS.md`,
  `apps/web/gaa-admin/src/components/salesbus/api.ts`).
- ADR-0043 retired the `salesbus` and `sales` hosts and keeps port 3030 for the
  Salesbus point of sale. `shop` (port 3008) is reserved as "shopkeeping";
  `shopkeeper` is not yet recorded.
- Organisations, memberships, organisation-bound permission keys, role bundles
  and the `X-Barrels-Organisation` header exist, with no superuser shortcut on
  organisation routes (ADR-0022, ADR-0044).
- New domains must use the shared `Idempotency-Key` helper and the outbox
  (ADR-0026).
- Money is whole minor units (cents) with the currency on every row, and
  ledgers are add-only, enforced by a trigger (ADR-0027, rewards).
- `org.contact` holds a business's customers (`create_without_email` for walk-in
  customers). `/contacts/admin/contacts` is a superuser read.
- Rewards earn through `rewards.qualifying_action`. Member numbers and points
  programmes are ADR-0058 slices 2 and 3, not built.
- Printix proves the offline pattern: Dexie storage, a service worker, a queue
  with references made on the phone, a secret per device that is hashed and
  revocable, "first record the server keeps wins", and an "N waiting to send"
  badge.
- ADR-0061 keeps the session only in the tab and forbids tokens in IndexedDB,
  so the app needs a connection every time it opens.
- Web Bluetooth works in Chrome on Android, for Bluetooth Low Energy printers
  only. Safari on iPhone has no Web Bluetooth.
- Safari can delete stored data after about 7 days without use, unless the app
  was added to the Home Screen.
- Every PDF is made by FastAPI with WeasyPrint (owner rule).

**Interpretation**

- An add-only record of stock movements, with counts kept as anchors, makes
  offline merging safe: two phones never overwrite each other.
- Corner shops often sell before they record receiving goods, so stock may go
  negative and gets flagged rather than refused.
- Trade documents addressed to two named businesses are the smallest sharing
  surface that still lets them trade.
- Downloading the whole shared product list to the phone means Barrels never
  learns what a shop scans.
- Telling a business "your data is private" while ADR-0033 says Barrels owns it
  is a contradiction. The ADR-0062 split, where the business controls its data
  and Barrels processes it, fits better.

**Uncertainty**

- The VAT registration threshold (EC$300,000 or EC$120,000 a year in different
  sources; Inland Revenue to confirm). The 15% standard rate is medium
  confidence.
- Whether the pilot printers are Bluetooth Low Energy. Many cheap 58 mm
  printers are "classic" Bluetooth only.
- How often pilot phones are shared with family (this drives decision 4.8).
- Whether card acquiring is wanted in the pilot at all.

## Options considered

**A. Where the code lives.**

- Extend `stores`. Rejected: its tenancy comes from HR employment, its stock
  can't go negative and its counts overwrite.
- Separate `shopkeeper` and `salesbus` domains. Rejected: two copies of the
  stock and sales logic.
- **One `commerce` domain with sub-areas (chosen).**

**B. Database.**

- **A `commerce` schema in the main database (chosen):** one backup and one
  restore drill.
- A separate database, as Health has. Revisit if a processor agreement requires
  separate keys or backups, or if volume hurts the main database.

**C. Sharing between a shop and a distributor.**

- **Fixed documents addressed to both, behind an agreed link (chosen).**
- Consented copies into each side's tables. Rejected: double the storage and
  sync work, with no extra privacy.
- A live read grant on the shop's stock. Rejected: it breaks "a distributor
  never sees a shop's stock".

**D. Stock model.**

- Overwritten stock levels. Rejected: entries made offline get lost.
- **An add-only movement record with counts as anchors (chosen).**
- Conflict-free merge structures on every phone. Rejected: too complex for one
  till per shop.

**E. Signing in offline.**

- ADR-0061 unchanged. Rejected: the till could not open without signal.
- **A registered till secret per phone, the ADR-0060 pattern (chosen).**
- A long-lived refresh cookie. Rejected: it still needs signal to open.

**F. Keeping businesses apart.**

- **Organisation filters in the app, plus a tenancy inventory and denial tests
  across two organisations (chosen, the existing pattern).**
- Postgres row-level security now. It would be a new pattern; revisit it before
  Salesbus goes live with several distributors, or after any bug that crosses
  businesses.

**G. Product shape.**

- One app with "shop" and "van" modes. Rejected: it mixes audiences and
  releases.
- Fully separate backends. Rejected: two engines, and a link that crosses
  systems.
- Buy or fork Loyverse or Odoo. Rejected: Loyverse is a closed service (shop
  data would sit with a vendor, and the private link can't be built on it).
  Odoo is a second large stack against ADR-0014 and ADR-0015, and a fork is
  forever. We copy their patterns instead.

## Decision

### 1. Domain boundaries

- **A new domain, `apps/api/fastapi/src/commerce`,** registered by manifest
  (ADR-0031). Its data lives in schema `commerce`; the shared product list
  lives in `commerce_ref`.
- **Sub-areas, each with its own service module:**
  - `catalogue`: products, units, prices, suppliers, the link to the shared list;
  - `inventory`: locations, the movement record, batches, cost, counts,
    transfers, reorder points;
  - `pos`: sales, tenders, receipts, cash-up;
  - `credit`: the credit book;
  - `devices`: the till registry and sync;
  - `b2b`: links and trade documents;
  - `vans`: trips, loads, reconciliation.
- **Only `inventory/ledger.py` writes stock movements.**
- **`stores` and the gaa-admin `/salesbus` screens stay GAA's and are not
  reused.** The repository map's Salesbus row becomes "build fresh in
  `commerce`".
- **Routes follow ADR-0025:**
  - `/commerce/org/...` for signed-in owners and helpers;
  - `/commerce/public/devices/...` for registered tills, authenticated by the
    till secret;
  - `/commerce/me/organisations` for the business picker;
  - `/commerce/admin/...` for the shared product list and technical health
    only.

### 2. Tenancy and privacy

1. **Every commerce table carries `organisation_id NOT NULL`,** except
   `commerce_ref` and the Barrels-side fields of the support log. Every service
   function takes the organisation as a required argument. An object belonging
   to another organisation answers 404, never 403.
2. **Permission keys** (bound to the organisation, ADR-0044):
   - `commerce.sell`
   - `commerce.credit.manage`
   - `commerce.cash.manage`
   - `commerce.stock.manage`
   - `commerce.catalogue.manage`
   - `commerce.reports.view`
   - `commerce.settings.manage`
   - `commerce.devices.manage`
   - `commerce.links.manage`
   - `commerce.vans.manage` (Salesbus)

   Global keys: `commerce.reference.curate` and `commerce.support.act`. App
   access uses `app.shopkeeper.access` and `app.salesbus.access`. In phase 1 the
   owner holds everything; a `shopkeeper-till` bundle (`commerce.sell` only) is
   kept for helpers later.
3. **The link between a shop and a distributor** (`b2b.trade_link`): the shop
   and distributor organisation IDs, a status (`invited → active → ended`), and
   who invited, accepted and ended it, and when.
   - One side's owner issues a one-time invitation code: 10 or more characters,
     stored as a keyed hash, expiring after 14 days, usable once.
   - The other side's owner enters it.
   - Both need a session that passed the authenticator.
   - There is no directory of businesses.
4. **What crosses a link.** Only `b2b.trade_document` rows:
   - `order` (shop to distributor);
   - `delivery_note`, `invoice` and `price_list` (distributor to that one shop);
   - `return_note` (either way).

   A document names its sender, its recipient and its link. It is fixed once
   sent; status changes are added as events. A business reads a document only
   if it is the sender or the recipient. Nothing else of either side can be
   reached through a link. A delivery note changes the shop's stock only when
   the shop accepts it; lines are matched by barcode or by the shop's own
   mapping, and the shop's selling prices stay private.
5. **Ending a link.** Either owner can end it, and it ends at once: no new
   documents. Documents already exchanged stay readable by both sides, because
   they are each side's business records. Nothing else is deleted.
6. **The shared product list.** `commerce_ref.product` holds barcode, name,
   brand, size, unit and category only: no price, no organisation, no sales.
   - The phone downloads the whole list and matches barcodes locally.
   - An unknown barcode can be suggested; the suggestion stores no
     organisation and is rate-limited per organisation.
   - A curator with `commerce.reference.curate` reviews suggestions.
7. **Support access.** No Barrels staff have a standing path, and a superuser
   gets nothing.
   - The owner creates a `commerce.support_grant` with a scope (`read` or
     `read_write`), a reason and an expiry (default 24 hours, at most 72), and
     can revoke it. Creating one needs a session that passed the authenticator.
   - Barrels staff act only while a grant is live. They need
     `commerce.support.act` (resolved from roles) and a session that passed the
     authenticator.
   - Every request writes an add-only `commerce.support_access_log` row, which
     the owner sees in the app.
   - The admin zone shows technical health only: device counts, last sync and
     sync error codes.
8. **Other ways in that must close.**
   - `/contacts/admin/contacts` and the audit history reads refuse
     organisations entitled to `shopkeeper` or `salesbus` unless a support
     grant is live.
   - Logs and Sentry carry IDs and outcome codes only (ADR-0037).
   - Database access for named operators is the remaining risk, controlled by
     restricted production access.
9. **Each business controls its data (owner decision, 21 Nov 2026).** As for
   Health (ADR-0062), each business controls its own records and its customers'
   personal data, and Barrels only processes them to run the service. This
   amends ADR-0033 for Commerce and the business terms.

   The owner holds these controls in Settings:
   - **Export everything at any time.** Products, prices, stock movements,
     sales, credit book, customers, cash-ups, trade documents and the support
     log, as CSV and JSON. No lock-in.
   - **Close the business and delete its data.** After a 30-day undo window,
     everything is erased except trade documents the other party also holds.
     The owner is warned that Grenada tax law may require keeping sales and VAT
     records (period to confirm), and is offered an export first. Barrels keeps
     nothing beyond the backup rotation.
   - **Customers.** The owner can delete or anonymise a customer. Credit-book
     entries stay as amounts, but the name and phone are removed.
   - **Retention.** The owner chooses how long sales and customer details are
     kept, within the legal minimum.
   - **Who and what.** Members and roles, registered tills (revoke any at once),
     and what each till keeps on the phone.
   - **Links.** Which distributors to connect, what the shop's order documents
     show (trading name, chosen contact), and ending any link at once.
   - **Support.** Granting and revoking support access, with the full support
     access log.
   - **No secondary use.** Aggregated or anonymised figures, including the
     shared product list suggestions, are off unless the owner opts in. There
     is no advertising, no selling of data, and no use of business data to
     train AI models.
10. **Tests that prove the isolation,** in `tests/commerce/`, written before the
    routes they guard:
    - a tenancy inventory that fails if a commerce model lacks
      `organisation_id`, or a route lacks a test across organisations;
    - a harness that calls every `/commerce/org` path from the OpenAPI document
      with another organisation's IDs and expects 404;
    - link tests: a third party can't read a document, distributor A can't see
      distributor B's link, nothing can be sent after a link ends, and a price
      list reaches one shop only;
    - support tests: no grant means 404, an expired or revoked grant is refused,
      and every read is logged;
    - a till's secret never reaches another organisation's data.

### 3. Data model

- **Money** is in integer minor units plus `currency` (default `XCD`).
  **Quantities** are decimals with 3 places in the product's base unit, never
  floating point.
- **Catalogue:**
  - `catalogue.product`;
  - `product_unit` (for example "case = 24 singles", each unit with its own
    barcode);
  - `price` per unit, including VAT, with `effective_from` and history;
  - `supplier` and `supplier_price` (cost history);
  - `favourite`;
  - `reorder_point` (per product and location).
- **Locations:** `inventory.location` of kind `shop`, `depot` or `van`.
- **Stock movements:** `inventory.movement` is add-only; a trigger refuses
  updates and deletes. Each row has `occurred_at` (phone time, bounded),
  `recorded_at`, `device_id` and a client ID. The kinds are:
  - `receive`, `sale` and `sale_reversal`;
  - `adjust`, with a reason: `damaged`, `expired`, `theft`, `own_use`,
    `return_to_supplier` or `other`;
  - `transfer_out` and `transfer_in`, paired by `transfer_id`;
  - `convert` (case to singles);
  - `count`.
- **Counts are anchors.**
  - On hand = the latest count plus the movements after it.
  - Variance = the count minus (the previous count plus the movements between
    the two counts).
  - A late entry dated before a count shows up in that count's variance;
    nothing is overwritten.
  - `inventory.on_hand` is a projection rebuilt in the same transaction, never
    the source of truth.
- **Negative stock is allowed.** A sale below zero is accepted and flags that
  product and location for a recount.
- **Batches** are optional per product: `inventory.batch` holds expiry and
  receive cost. When batches are on, a sale takes the earliest expiry first.
- **Cost** is a weighted average per product and organisation, updated on each
  receipt. If stock on hand is zero or less, the receipt cost becomes the cost.
  Each sale line stores a snapshot of the cost, so margins stay stable.
- **Sales:** `pos.sale`, `sale_line` and `tender`.
  - A line holds the product or a custom amount, the unit, quantity, unit price,
    the VAT rate in force and the cost snapshot.
  - Tenders: `cash` (with the amount given and the change), `trust`,
    `card_manual` and `other_manual`. A sale can split across them.
  - Receipt numbers are a till prefix plus a till sequence, so they stay unique
    offline.
  - Sales are never edited: voids and refunds are reversal sales.
- **Credit book:**
  - `credit.account` per customer (an `org.contact`), with an optional limit;
  - `credit.entry` is add-only: `charge`, `payment`, `adjustment` or
    `write_off`;
  - the balance is the sum of entries, and statements and ageing are worked out
    from them.
- **Cash-up:**
  - `pos.till_session` holds the opening float, money in and out with reasons,
    and a blind count at close;
  - expected = float + cash sales − change − money out;
  - a variance needs a note and never blocks the close.
- **Idempotency.** Every write that creates something takes a client ID. A
  repeat with the same body returns the first answer; a repeat with a different
  body is refused (`id_reused`). Online writes also use `Idempotency-Key`.
- **VAT:**
  - settings per organisation: `vat_registered` (default false),
    `standard_rate_bp` (default 1500, meaning 15%) and the registration number;
  - `zero_rated` per product;
  - prices include VAT, and line VAT = round(price × rate ÷ (1 + rate)) in
    integers;
  - receipts show VAT only for registered businesses;
  - the rate in force is stored on each line.
- **State machines.** Status columns join `tests/test_state_machine_inventory.py`,
  with `commerce/transitions.py` for links, documents, till sessions and van
  trips.

### 4. Offline sync

1. **Till registry.** `devices.device` holds:
   - the organisation, location and app;
   - a label and who registered it;
   - `secret_hash`;
   - `last_seen_at` and `last_seq`;
   - `revoked_at` and `revoke_mode`.

   The owner registers the phone while online. The server returns a 32-byte
   secret once and keeps only its SHA-256 hash (the ADR-0060 rules). There is no
   automatic expiry in the pilot, and revoking takes one tap.
2. **An amendment to ADR-0061, for tills only.** The till secret is kept in
   IndexedDB so the app opens and sells offline. It authorises only device
   routes for that organisation and location: selling, credit, cash-up, stock
   entries and the till's snapshot. Reports, exports, settings, links, support
   grants and registering tills need a signed-in owner session, under
   ADR-0061 unchanged.
3. **Snapshot down.** `GET /commerce/public/devices/snapshot?since=<cursor>`
   returns:
   - products, units and prices;
   - favourites;
   - customers (name, phone, balance) and limits;
   - reorder suggestions and settings;
   - the shared product list.
4. **Outbox up.** `POST /commerce/public/devices/sync` takes up to 200 entries,
   oldest first. Each has a UUID made on the phone (version 7), a kind, the
   till's sequence number, `occurred_at` and a body.
   - Each entry answers `accepted`, `duplicate` (the first answer again),
     `rejected` with a code, or `deferred` with a wait.
   - Gaps in the sequence are reported, so lost data is visible.
   - A rejected entry is listed in plain words for the owner.
5. **Conflicts:**
   - stock is always a change or a count, so writers never collide;
   - a sale keeps the price actually charged;
   - credit entries simply add up;
   - an offline sale over a credit limit asks the owner on the till and is
     flagged `over_limit`; the server never refuses it;
   - customers created offline are mapped by client ID.
6. **Not possible offline:**
   - signing in and registering a till;
   - settings and VAT;
   - CSV import;
   - reports;
   - PDF statements;
   - link changes and sending documents (they queue);
   - support grants;
   - loyalty redemption (loyalty earned while offline is sent at sync).
7. **On the phone:**
   - Dexie storage and a service worker, as in Printix;
   - `navigator.storage.persist()`;
   - an "Unsynced N" badge with the last sync time, and a warning when entries
     are older than 24 hours;
   - on iPhone the till must be installed to the Home Screen before it
     registers.
8. **Shared phones.**
   - The phone's own lock and storage encryption are the base.
   - A 4 to 6 digit app PIN locks the till after a few idle minutes. In v1 the
     PIN is a gate, not encryption.
   - The till holds only what selling needs.
   - Revoking a till: "lost" refuses everything and wipes the till on its next
     contact; "retire" accepts one final upload, then wipes.
   - Encrypting local data with the PIN is phase 1b, unless a pilot shop shares
     its phone with people the owner doesn't trust.

### 5. Apps and hosts

- **`apps/pwa/shopkeeper`** at `shopkeeper.barrels.gd`:
  - built on `packages/pwa-kit` and served static on Cloudflare Pages
    (ADR-0036);
  - port 3043 (3042 is Health's);
  - `shopkeeper` is added to ADR-0043's hosts and the reserved names;
  - `shop` (port 3008) stays reserved for a future customer-facing shop;
  - `auth/apps.py` registers `shopkeeper` as a browser-only app with email-code
    sign-in and a 12-hour session cap;
  - the business is picked from the owner's memberships.
- **Laptop view.** The same app with wider layouts for reports, stock lists,
  imports, settings and devices. It is online-only unless the laptop is
  registered as a till.
- **`apps/pwa/salesbus`** (port 3030) at `salesbus.barrels.gd`, by owner
  decision on 21 Nov 2026. The host was retired by ADR-0043; this record brings
  it back for this product only. `sales` stays retired.

```text
 Shop Keeper (shop phones, laptop)     Salesbus (van phones, depot laptop)
              |                                   |
              +-------- FastAPI src/commerce -----+
              |  each business = one organisation  |
              |  shop data   |  link  | distributor data
              |  (private)   |<------>|  (private)
              |      only trade documents cross    |
```

### 6. Sharing and printing

- **Sharing** uses the phone's share sheet (Web Share API) with text plus a
  receipt image drawn on the phone, to any app or person the shopkeeper picks.
  If sharing isn't supported, the text is copied instead.
  - Receipts, credit reminders, statements and reorder lists (to any supplier)
    all go this way.
  - There is no paid messaging service.
  - A PDF statement comes from WeasyPrint when online.
- **Printing on Android:** Chrome sends ESC/POS (the common receipt-printer
  language) over Web Bluetooth to a Bluetooth Low Energy printer, 58 mm by
  default, remembered per till.
- **Printing on iPhone:** the receipt image goes through the share sheet to the
  printer maker's app. A native wrapper is later, with its own ADR.
- The pilot printer must be Bluetooth Low Energy, and its exact model is tested
  before the pilot.

### 7. Phasing

**Phase 1: the Shop Keeper pilot.**

- **Selling:** favourites grid, search, camera barcode, a custom-amount line,
  cash with change, "put on trust", and split tenders (card and other recorded
  by hand).
- **Credit book:** balances, part payments, an optional limit, and statements
  and reminders through the share sheet.
- **Cash-up:** float, money in and out, a blind count, and variance with a note.
- **Inventory:**
  - receiving with cost and weighted-average cost;
  - cases and singles;
  - counts, adjustments with reasons and reorder points;
  - reorder suggestions and a shareable reorder list;
  - supplier price history;
  - optional batches with expiry;
  - valuation, movement, loss and margin reports.
- **Products:** scan as you go, plus CSV import on the laptop.
- **VAT** settings, off by default.
- **Offline:** full offline use with sync, till registration and revoke, and the
  app PIN.
- **Printing:** Bluetooth on Android, with the share fallback on iPhone.
- **Support:** support grants and the support log.

**Phase 1b**, soon after the pilot starts:

- the shared Grenada product list;
- loyalty (after ADR-0058 slice 2, member numbers);
- local encryption with the PIN.

**Out of phase 1:**

- card acquiring;
- several staff;
- Salesbus;
- links;
- an online customer shop.

**Pilot acceptance.** All of these must be true:

1. A pilot shop sells for a full day in airplane mode, then syncs. Every sale
   arrives exactly once, with no sequence gaps, and the totals match the phone.
2. A sale of three favourites with cash and change takes under 10 seconds on a
   low-cost Android phone.
3. Trust, a part payment and a shared statement give the same balance on the
   phone and the laptop.
4. A cash-up with a wrong count records the variance and its note, and isn't
   blocked.
5. A sale below zero stock is accepted and flagged. A count after late entries
   shows the variance, and no row is overwritten.
6. Revoking a "lost" till refuses it and wipes it on its next contact.
7. The tenancy inventory, the harness across two organisations and the support
   tests pass in CI.
8. The pilot printer prints from Android, and the iPhone share fallback works.
9. A restore drill of the main database includes the `commerce` schema
   (ADR-0021).

**Phase 2: Salesbus.**

- The distributor organisation, depots, vans as locations, and van tills.
- Loading (depot to van and back), selling from the van, and returns.
- Trip reconciliation: loaded − sold − returned = counted, with variance notes.
- The distributor's trade customers and a wholesale credit book.
- Cash-up per trip.
- A row-level security review before go-live.

**Phase 3: links and network.**

- Invitation codes and links.
- Orders from a shop's reorder list.
- Delivery notes the shop accepts into its stock.
- Invoices and per-shop price lists.
- Ending a link.
- Optional distributor discovery, only with each distributor's opt-in.

## Consequences

**Easier:**

- one stock and point-of-sale engine serves both apps;
- offline merging is safe by design;
- privacy can be tested route by route;
- payment methods can be added later through the ADR-0027 core.

**Harder:**

- reports derive stock on hand from anchors, so the projection needs careful
  tests;
- till secrets kept on the phone widen the theft risk compared with ADR-0061
  (controlled by revoke modes, the PIN and keeping little data on the phone);
- every route needs its test across organisations, and support needs its own
  dependency.

**Forbidden:**

- overwriting a count;
- blocking a sale because of stock;
- any read across a link other than trade documents;
- a directory of businesses without opt-in;
- Barrels staff access without a live grant;
- prices in the shared list;
- personal data in logs or Sentry.

**Risks:**

- Safari's storage clean-up on iPhones where the app isn't installed;
- printers that aren't Bluetooth Low Energy;
- the ADR-0033 amendment and business terms, which need legal review.

**Blast radius:**

- **API:** `src/commerce/` (manifest, models, one Alembic migration for the
  `commerce` and `commerce_ref` schemas, add-only triggers), the permission
  keys, `auth/apps.py`, role bundles, the contacts references registry, the
  refusals on contacts and audit reads, a worker job that rebuilds the stock
  projection, and the outbox handler for rewards.
- **Contract:** `openapi.json` and the generated client, regenerated.
- **Web:** `apps/pwa/shopkeeper`, later `apps/pwa/salesbus`. `packages/pwa-kit`
  gains Web Share and ESC/POS helpers, kept brand-neutral, with the Printix
  tests run.
- **Docs and config:**
  - `docs/ports.md` and ADR-0043;
  - ADR-0061 (amendment);
  - ADR-0033 (Commerce amendment, decision 2.9);
  - `docs/portfolio/repository-delivery-map.md`;
  - the CORS origins in `infra/docker/*.env`;
  - the retention table in `docs/security.md`;
  - the design lane spec `docs/design/shopkeeper.md`;
  - `src/commerce/AGENTS.md` and `apps/pwa/shopkeeper/AGENTS.md`.

## Open questions for the owner

1. **VAT.** Confirm the VAT registration threshold and the 15% standard rate
   with Inland Revenue.
2. **Helpers.** When helpers come, does each get their own membership and till
   PIN, so sales name the person (recommended), or is one shared PIN enough?
3. **Owner authenticator.** Must every shop owner use an authenticator app? It
   is recommended for registering tills, exports, links and support grants;
   daily selling does not need it.
4. **Card payments.** Which acquirer comes first: Republic Bank, or Fygaro once
   confirmed?
5. **Crate and empty-bottle deposits.** Needed in phase 1 or 2?
6. **Shared product list.** Curated by Barrels only, or shop suggestions reviewed
   by Barrels (recommended)?
7. **Ended links.** Do exchanged documents stay readable by both sides after a
   link ends (recommended)?
