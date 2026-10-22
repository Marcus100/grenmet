# ADR-0046: Barrels Events catalogue model

## Status

Accepted (2026-10-22, owner). Owner decisions of 2026-10-22 are recorded below as inputs, and the
owner's answers on `booking_mode` are folded into Decision 1. Nothing in this
ADR is built. Companion ADRs: [0047](0047-experiences-reuse-events-ticketing-through-occurrences.md)
(experiences and occurrences) and [0048](0048-catalogue-provenance-and-curation.md)
(provenance and curation). ADR-0049 is reserved for a later services marketplace
and is not written.

## Context

Barrels Events launches with **events and bookable experiences** (boat trips, tours,
classes). The discovery home is a marketplace home (rows, organiser follows,
saves) with a calendar / This-Weekend list and a map toggle reading the same
data. Today the `events.listings` table models one dated event: a single
`starts_at`/`ends_at`, a free-text `venue`, one of ten frozen categories, and an
`admission` of `free | rsvp | ticketed`. That is not enough for:

- things that repeat or have several sessions (a weekly yoga class, a daily
  snorkel trip) and need inventory per session;
- a taxonomy that matches how Grenadians look for things (fete, J'ouvert, boat
  fete, brunch, regatta), which the owner has adopted (below);
- search by words, parish and map area;
- a hand-curated seed of listings before organisers arrive (ADR-0048).

Owner decisions already made (inputs, not open):

- The launch catalogue is organiser-submitted plus a hand-curated seed with
  source links. No scraping.
- The taxonomy is adopted: ten evidence-based top-level categories, a closed
  subcategory list per category, Carnival/Spicemas as a **collection**, Family &
  Kids as a **tag / audience flag**, Social & Lifestyle dropped, `boat` a **tag**
  with subcategories under Parties (boat fete) and Tours (boat & cruises).
- Classification fields: `listing_type`, `access_type`, `pricing_type`,
  `booking_mode`, `recurrence`, `island` and `parish`.
- The discovery home is concept A (rows, follows, saves) with a list and a map
  toggle on the same data.

Constraints: Events lives in the `events` schema of the main database
(ADR-0003, `apps/api/fastapi/src/events/AGENTS.md`); migrations are additive;
new Python dependencies and PostGIS are not available (below); new public routes
follow ADR-0025; organiser authoring uses the org zone with the ADR-0044 keys
and the ADR-0050 staff path; free/open-source only.

## Evidence

- **Facts**
  - `Listing` has one `starts_at`/`ends_at`, a text `venue`, a `category`
    column constrained to ten values (`fete, music, food, sport, business, tech,
    culture, faith, family, wellness`, `listings_category_check` in
    `alembic/versions/2026-10-21_events_schema.py`, mirrored by
    `schemas.Category`), `admission` constrained to `free | rsvp | ticketed`,
    a free-text `recurrence` (max 80 characters, display only), `tags` as a
    text array, and `parish` constrained to six parishes plus `carriacou`.
    (high)
  - Inventory is the count of `valid` tickets per tier plus unpaid-order items
    (`service/holds.py`); `claim_tickets` takes a shared lock on the listing row
    and then locks the requested `ticket_tiers` rows `FOR UPDATE` in id order
    (`service/ticketing.py`). Cancelling an event takes the exclusive listing
    lock. `ticket_tiers.allocation` is one number per tier, not per session.
    (high)
  - Discovery search today is `ILIKE '%q%'` over title, summary and venue
    (`service/discover.py` `list_listings`); there is no index for it, no
    ranking, no geography and no venue entity. Date windows use Grenada calendar
    days over naive UTC (`service/common.py`). (high)
  - `organisers`, `follows`, `saved_listings` and `rsvps` exist; the organiser
    has `name`, `bio`, `verified`, `logo_file_id` and `organisation_id` but no
    cover image, contact channels, parish or social links. (high)
  - There is no PostGIS in application databases. The CAP migration states
    PostGIS is intentionally not created (geometry stored as GeoJSON,
    `alembic/versions/2026_06_02_cap_domain.py`). The staging and production
    Postgres image is `postgres:17`; switching to a PostGIS image is refused by
    `scripts/production/render-env.py` unless `POSTGIS_RESTORE_VERIFIED=true`
    (an operator-recorded restore check; `docs/operations/storage-delivery.md`).
    (high)
  - `btree_gist` is created by the Bookings migration, so extension creation by
    the migration role works for that extension
    (`alembic/versions/2026-10-19_bookings_domain.py`). `pg_trgm` appears
    nowhere in the repository. (high)
  - `python-dateutil` appears only as a transitive entry in `uv.lock`, not as a
    declared dependency of `fast-back`; adding a Python dependency is ask-first
    (`AGENTS.md`). (high)
  - `docs/products/barrels-events-v1-definition.md` still says the discovery
    surface "reads and writes the Events API (own database ...)". Events moved
    into the main database (schema `events`); ADR-0045 already notes ADR-0003
    is stale on this and the Events `AGENTS.md` is correct. (high)
  - The v1 product definition's evidence base is one organiser's archive and a
    press corpus; Phase 0 discovery never ran, and Go2Fete is the incumbent for
    ticketed fetes. (high)
- **Interpretation**
  - Grenada is small: a few thousand listings a year, tens of thousands of
    occurrences at most. Postgres full-text plus trigram similarity is ample;
    a separate search service would add cost and an operational surface for no
    measurable gain (heuristic, medium).
  - A map at island scale needs "listings inside this box, nearest first", which
    plain latitude/longitude with a bounding-box filter answers exactly; true
    geodesic queries are not needed (medium).
  - A closed subcategory list stored as reference data lets the owner rename or
    add a subcategory without a code deploy, while the filter vocabulary stays
    closed (best practice, medium).
- **Uncertainty**
  - **Whether `pg_trgm` can be created by the migration role on staging and
    production is UNKNOWN.** Staging's API role `app` was reported as a
    superuser on 2026-09-06 (`docs/operations/storage-delivery.md`), which would
    allow it, but this has not been checked for production, and managed or
    hardened roles often cannot create extensions. A pre-check (below) settles
    it before any migration is written.
  - Real search volume and the share of listings that carry coordinates. Not
    measured; the seed is hand-built, so coordinates exist only where someone
    adds them.
  - Whether `wellness` has enough volume to stay its own category (owner said:
    merge into Sports & Fitness if low). Unmeasured.

## Options considered

### Search and geography

- **A. Postgres full-text (`simple` configuration) plus `pg_trgm`, latitude /
  longitude columns and a bounding box (chosen).** No new service or image.
  Works for Patois and place names because `simple` does no stemming. Cost: a
  generated `tsvector` and two indexes, and a pre-check that `pg_trgm` can be
  installed (fallback below).
- **B. PostGIS.** Proper geometry, radius and polygon queries. Rejected for now:
  the deployed image is not PostGIS, switching is gated by an operator restore
  verification, CAP deliberately dropped it, and island-scale bounding boxes do
  not need it. Revisit if a polygon feature (ferry or road-network distance) is
  wanted.
- **C. External search (Typesense, Meilisearch, Algolia).** Better ranking and
  typo tolerance. Rejected: a second data store to sync and run, or a paid
  service (free/open-source only), for a catalogue this small.
- **D. Keep `ILIKE`.** Zero change. Rejected: no ranking, no typo tolerance, a
  sequential scan as the catalogue grows.

### Taxonomy storage

- **E. Reference table of categories with parent, a `category_slug` on the
  listing, legacy `category` column kept (chosen).**
- **F. Change the existing CHECK / `Category` literal in place.** Rejected: the
  web app and generated client use the frozen ten values; changing the enum is a
  breaking contract change (ask-first) and cannot be rolled back after data
  moves.
- **G. Free-form tags only.** Rejected: unusable as filter rows on the home and
  open to spelling drift.

## Decision

Choose A and E, with the model below. All migrations are additive.

### 1. Listing types and classification fields

`events.listings` keeps its name and gains:

| Field | Values | Meaning |
| --- | --- | --- |
| `listing_type` | `event`, `experience`, `class`, `attraction`, `service` | What it is. Launch lists `event`, `experience`, `class`. `attraction` (a place you can visit, no session) is allowed in the model, shown later. `service` is reserved for the marketplace (ADR-0049) and is **refused by the API until ADR-0049 is accepted**. |
| `access_type` | `public`, `private` | Who may attend. `private` (invite or private charter) is never shown in discovery; it must have `visibility='unlisted'` (CHECK). |
| `pricing_type` | `free`, `paid`, `donation` | Display and filter value. `donation` is display-only at launch: the organiser collects at the door. No online donation collection is built (the payments-licence question in the v1 definition is open). |
| `booking_mode` | `rsvp`, `tickets`, `slots`, `enquiry`, `none`, `external` | How a person takes part (owner-final set of six). `tickets` and `slots` both go through the Events ticket and order machinery (ADR-0047). `enquiry` sends a message to the organiser and takes no payment. `none` is "just turn up": no ticket or RSVP, details only. `external` means tickets are sold elsewhere via `external_ticket_url` (ADR-0048). |
| `recurrence_rule` | JSON, nullable | Machine-readable repeat rule; see ADR-0047. The legacy text `recurrence` stays as the display label. |
| `island` | `grenada`, `carriacou`, `petite-martinique` | Island group. |
| `category_slug` | a leaf or top-level slug | See section 2. |

`admission` (`free | rsvp | ticketed`) stays as the frozen legacy field and is
dual-written from the new fields until the web app moves (`free` -> `pricing_type
free`, `booking_mode` `none`; `rsvp` -> `rsvp`; `ticketed` -> `tickets`). `parish` keeps its current set; Petite Martinique
needs one more allowed value, done by replacing the CHECK constraint in an
additive migration (or moving parishes to reference data if the slice prefers).

### 2. Categories, subcategories, tags and collections

- `events.categories` (reference data): `slug` (primary key), `parent_slug`
  (null for top level), `label`, `sort_order`, `is_active`. Seeded by the
  migration with the adopted taxonomy:
  - Top level: Parties & Fetes, Music & Live Shows, Tours & Outdoors, Food &
    Drink, Sports & Fitness, Arts & Culture, Business & Learning, Markets &
    Shopping, Community & Causes, and optional Wellness.
  - Subcategories, exactly the owner's list: Parties: all-inclusive fete,
    paint/colour fete, cooler fete, breakfast fete, boat fete, beach party, club
    night, J'ouvert, after-party. Music: concert, calypso/soca competition, pan,
    DJ set, jam, comedy, theatre, dance. Tours: boat & cruises, snorkel/dive,
    hiking, island hopping, sightseeing, day trips, water sports. Food:
    breakfast/brunch, tasting, rum/chocolate/spice tours, cooking class, food
    festival, dinner. Sports: regatta, road race, football, cricket, yoga, gym
    classes. Arts: festival, exhibition, heritage, storytelling, parade, film.
    Business: masterclass, workshop, conference, networking, training. Markets:
    craft market, pop-up, farmers market, sale. Community: bingo, fundraiser,
    charity, church/faith, town hall, volunteering.
  - Wellness is seeded `is_active = false` until volume justifies it; until
    then its content sits in Sports & Fitness (yoga, gym classes).
- A listing has exactly **one** `category_slug` (its primary place in the
  taxonomy; a leaf where one fits). The top level is derived from `parent_slug`.
  Multi-category membership is expressed by tags and collections, not by extra
  categories, so filters never double count.
- **Tags** stay in `listings.tags` (text array, existing). A small reserved set
  has meaning in the product: `family` (the Family & Kids audience flag), `boat`,
  `free-entry`. Other tags are free but lower-cased slugs, validated against a
  length and character rule.
- **Collections** are curated sets such as Spicemas / Carnival, a festival
  weekend or a season: `events.collections` (`slug`, `title`, `summary`,
  `starts_on`, `ends_on`, `is_active`) and `events.collection_listings`
  (`collection_slug`, `listing_id`, `sort_order`). A listing belongs to many
  collections; staff curate them (ADR-0048 key). Collections are not categories
  and never appear as filter values.
- **Legacy `category` column and CHECK stay, unchanged.** It is filled by a
  provisional, lossy mapping from the top-level category (for example Parties ->
  `fete`, Music -> `music`, Food -> `food`, Sports -> `sport`, Business ->
  `business`, Arts and Tours and Markets -> `culture`, Community -> `faith`) so
  the existing web app keeps working. The mapping is a stopgap, is **read only
  by the old web build**, and the column is dropped in a later destructive
  migration once the web app uses `category_slug` (ask-first when it happens).
  `GET /events/public/categories` serves the reference table.

### 3. Occurrences are the unit of time and inventory

A listing has one or more **occurrences** (`events.occurrences`: `id`,
`listing_id`, `starts_at`, `ends_at`, `status`, optional capacity and venue
override). Every existing listing gets exactly one occurrence by backfill, and
new events get one too, so there is one code path. Tiers, orders, holds,
tickets, admissions, door, settlement and refunds attach to an occurrence. The
full design (inventory per tier and occurrence, locking, recurrence generation,
cancellation) is ADR-0047. For this ADR the rule is: `listings.starts_at` and
`ends_at` remain and become a **derived next-occurrence value** (the next
non-cancelled occurrence, or the last one for a finished listing), maintained in
the same transaction as any occurrence change, so existing queries, cards and
sorting keep working and discovery can index a single column.

### 4. Venues

`events.venues` (`id`, `slug`, `name`, `island`, `parish`, `address_line`,
`latitude`, `longitude`, `organiser_id` nullable, `created_at`). Listings gain
`venue_id` (nullable) beside the existing free-text `venue`, which stays as the
display fallback; an occurrence may override the venue (a tour with a different
meeting point). Latitude and longitude are `numeric(9,6)`; a listing with no
coordinates simply does not appear on the map, still appears in the list. A
venue is shared by many listings so a corrected pin is corrected everywhere.

### 5. Organiser storefront fields

`events.organisers` gains `tagline`, `cover_file_id` (a completed upload,
purpose `organiser-cover`, no cross-database FK, as for the logo), `parish`,
`island`, `website_url`, `contact_email` and `contact_phone` (both
**organiser-published business contact**, shown only if the organiser opts in per
field), and `social_links` (JSON, whitelisted hosts). Fields validate length
and URL scheme (http/https). The follow button, rows ("From organisers you
follow") and saves use the existing `follows` and `saved_listings` tables
unchanged. A profile is public only for a verified organiser or an **unclaimed**
curated one (ADR-0048).

### 6. Search and geography

- **Search:** a generated `tsvector` column `search_tsv` on `listings` using the
  `simple` configuration over title (weight A), tags and venue name (B), summary
  and description (C), a GIN index on it, and a GIN trigram index on `title`
  for typo-tolerant and prefix matching. Query: `websearch_to_tsquery('simple',
  q)` ranked with `ts_rank`, with a `similarity(title, q)` fallback when the
  full-text match is empty. Result ranking order: text rank, then `starts_at`.
- **Geography:** bounding-box filter `latitude BETWEEN ... AND longitude BETWEEN
  ...` on the venue (joined), btree index on `(latitude, longitude)`, "near me"
  sorts by squared planar distance (adequate at 12 degrees north over tens of
  kilometres). No PostGIS, no `earthdistance`.
- **Pre-check before the migration slice (UNKNOWN today):** run `CREATE
  EXTENSION IF NOT EXISTS pg_trgm` in the staging and production database as the
  migration role (or inspect `pg_available_extensions` and the role's rights),
  and record the result in the PR. If the role cannot create it, the owner/
  operator creates it once as a superuser; if neither is possible, the fallback
  is full-text only, with `ILIKE` on `title` for the typo case. The migration
  uses `CREATE EXTENSION IF NOT EXISTS pg_trgm`, as the Bookings migration does
  for `btree_gist`.
- **Facets:** category, subcategory, tag, collection, parish, island, price
  type, access type, listing type and date window (`when`) are query
  parameters on one listing endpoint; counts for facets come from the same
  filtered query.

### 7. Public routes, authoring routes and permissions

- New public reads live under `/events/public/*` (ADR-0025 zone `public`), with
  unique schema names: `GET /events/public/listings` (the filters above, plus
  `q`, `bbox`, `near`, `sort=soonest|relevance|distance`), `/listings/{slug}`
  (with occurrences), `/categories`, `/collections`, `/collections/{slug}`,
  `/venues/{slug}`, `/organisers/{slug}` and `/home` (the marketplace rows,
  built server-side from the same queries: This Weekend, by category,
  collections, new, from organisers you follow when signed in). The existing
  `/events/*` reads keep working unchanged.
- Authoring is on the org zone: `/events/org/*` with the existing ADR-0044
  `events.listings.manage` key, plus the ADR-0050 staff counterpart
  `events.ops.listings`, through the same `require_org_permission_or_staff`
  dependency. The legacy `/events/manage/*` routes are retired by the S5 plan in
  `docs/exec-plans/events-legacy-manage-routes.md`; new catalogue fields are
  **not** added to legacy routes unless a caller needs them before S5 lands.
- The OpenAPI contract and generated client change with each route slice
  (`api-change` skill); no hand-edited generated code.

### 8. Locking and migration rules (for every later slice)

- Additive migrations only: new tables, new nullable columns, new indexes, new
  constraints that existing rows satisfy. No column drop or rename in this
  work.
- Lock order, everywhere: listing row (shared for sales, exclusive for
  cancel/edit of structure) -> occurrence row (`FOR UPDATE`) -> tier rows by id
  ascending. Detail in ADR-0047.
- The derived `listings.starts_at` is recomputed under the exclusive listing
  lock whenever an occurrence is added, moved or cancelled.

### 9. Stale documentation fix

`docs/products/barrels-events-v1-definition.md` is edited in this change to
replace the stale "own database" wording with the real position (Events data is
in the `events` schema of the main database, ADR-0003). ADR-0003's own stale
Events text remains a **follow-up for the owner** (ADR-0045 already flags it).
The v1 definition's scope section still describes events only; extending it to
experiences and the taxonomy is a follow-up product edit for the owner.

## Resolved owner decisions (2026-10-22)

- `booking_mode` gains `none` and `external`; the final set is `rsvp`,
  `tickets`, `slots`, `enquiry`, `none`, `external` (Decision 1).

## Open owner decisions

Still open (none blocks acceptance; each is needed before its slice):

1. **Wellness.** Launch it as its own category, or hold it inactive and merge
   into Sports & Fitness until volume proves it? Recommendation: inactive.
2. **`pg_trgm` availability.** Operator pre-check on staging and production
   (UNKNOWN). Decides whether typo-tolerant search ships in the first slice.
3. **Legacy category mapping.** The provisional lossy mapping above is
   acceptable only as a stopgap; confirm, or choose to ship the web move first.
4. **Venue ownership.** Venues are shared and editable by staff only, or an
   organiser may create and edit their own? Recommendation: organisers create,
   staff merge duplicates.
5. **Petite Martinique parish handling** and whether `island` replaces the
   current `carriacou` parish value long-term.
6. **Contact visibility.** Business email and phone on an organiser page are
   opt-in per field (proposed); confirm.

## Consequences

- One catalogue serves events, classes and experiences, the home rows, the list
  and the map, from the same tables and the same filter query.
- Discovery gets ranking and typo tolerance with no new service or image;
  search quality is bounded by the `simple` configuration (no stemming, no
  synonyms such as "fete"/"fête"; a synonym list is a later improvement).
- Every ticketing code path gains an occurrence key (ADR-0047). That is the
  largest cost: tiers, holds, orders, tickets, admissions, settlement and
  refund queries all need the new key, with tests, before experiences ship.
- The frozen `category` column carries a lossy mapping until the web app
  migrates; two category vocabularies coexist for a while.
- `listings.starts_at` becomes derived for repeating listings; code that writes
  it directly must go through the occurrence service.
- The map shows only listings with coordinates; the hand-curated seed must add
  them (ADR-0048).
- Files that need edits and are owner-only (not made here, **no `AGENTS.md`
  edited**): `apps/api/fastapi/src/events/AGENTS.md` (occurrences, catalogue
  tables, `/events/public/*`, new lock order) and `apps/web/events/AGENTS.md`
  (marketplace home, taxonomy, map toggle) are listed in the pull request body.
- **Revisit triggers:** the catalogue exceeds roughly 20,000 live listings or
  search latency exceeds 300 ms at the 95th percentile in production; a feature
  needs polygon or route-distance queries (PostGIS, ADR-0036/storage-delivery
  gate); a second island-scale market is added (taxonomy and parish become
  data); `wellness` volume justifies activation; the web app has fully moved to
  `category_slug` (drop the legacy column).

## Implementation slices

Nothing is built by this ADR. Numbering continues the Events plan (L1 and L2
are earlier work). Each slice is its own PR with tests; ADR-0047 and ADR-0048
supply the detail for L5 to L8 and L10.

- **L3 taxonomy API:** `events.categories` reference table and seed,
  `category_slug`, the new classification columns and `booking_mode` values,
  `GET /events/public/categories`, tags rules.
- **L4 search:** the `pg_trgm` pre-check, `search_tsv`, indexes, `q`, facets
  and ranking on `GET /events/public/listings`, bounding-box filter.
- **L5 occurrences:** `events.occurrences`, one-per-listing backfill, derived
  next-occurrence start (ADR-0047).
- **L6 per-occurrence ticketing:** occurrence key on orders, items and tickets,
  per-occurrence allocation, shared pool, new lock order (ADR-0047).
- **L7 door, outlet and settlement per occurrence:** session-aware scanning,
  manifests, till sales and settlement breakdown (ADR-0047).
- **L8 schedules:** `recurrence_rule`, the in-house generator and the ARQ
  extension job (ADR-0047).
- **L9 venues:** `events.venues`, coordinates, venue override, map data.
- **L10 curation:** curated listings, sources, claim flow, hide/unhide,
  `events.catalogue.curate` (ADR-0048).
- **L11 collections:** `events.collections`, Spicemas and festival sets, home rows.
- **L12 reminders and ICS:** session reminders through the outbox and
  calendar (ICS) downloads for saved listings and tickets.
