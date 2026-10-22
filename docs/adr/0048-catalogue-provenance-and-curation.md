# ADR-0048: Catalogue provenance and curation

## Status

Accepted (2026-10-22, owner). Owner direction: the launch catalogue is
organiser-submitted plus a hand-curated seed with source links; no scraping.
The owner also allowed outbound ticket links and settled the `booking_mode`
values (Decision 6). Nothing in this ADR is built. The legal points below are
design assumptions, **not legal advice**; counsel review is an open owner item.
Read with [ADR-0046](0046-barrels-events-catalogue-model.md),
[ADR-0047](0047-experiences-reuse-events-ticketing-through-occurrences.md),
[ADR-0033](0033-data-ownership.md) and
[ADR-0050](0050-barrels-staff-operations-access-to-organisations.md).

## Context

A marketplace home with empty rows does not persuade an organiser to join, and
organisers will not join before there is an audience. The owner's answer is a
hand-curated seed: Barrels staff list real, public events and experiences with a
link to where each came from, under profiles the organiser has not yet claimed,
and organisers claim and take over their own pages. The v1 product definition
says Go2Fete is the incumbent across many organisers and that no organiser has
been asked why they would leave it, so the seed must not look like an attack on,
or a copy of, anyone, and must not depend on any vendor's goodwill.

Questions this ADR settles: how a curated listing is represented, what a source
link records, what may and may not be copied, how an organiser claims, who may
curate and who may hide, what personal-data limits apply, and how tickets sold
elsewhere are shown.

## Evidence

- **Facts**
  - Publishing is restricted to verified organisers; unverified organisers can
    save drafts (`events/AGENTS.md`, `service/organiser_admin.py`). Verification
    is decided by an MFA superuser through `/admin/moderation/organisers`; moderators
    and superusers may read the queue (`ModerationReader`, `MfaAdminUser`,
    `moderation_router.py`). (high)
  - Resident suggestions exist (`events.suggestions`: title, date, time, venue,
    category, parish, free-text `source`, notes, status) and are reviewed before
    publication; approval writes activity `suggestion.approved`.
    (`models.py`, `events/AGENTS.md`). (high)
  - `events.reports` records user reports against a subject; moderators action or
    dismiss them. `events.moderate` is a global key held by `events-moderator`.
    (high)
  - The `activity` table is append-only, records `actor_id`, and has no actor
    capacity yet; ADR-0050 proposes `actor_capacity` (`member | staff`) and shows
    staff rows to organisers as "Barrels staff". (high)
  - Organiser `organisation_id` is NULL for legacy organisers; a platform
    organisation and owner membership are created by `service.create_organiser`.
    (high)
  - The repository is public and keeps confidential or personal material in the
    gitignored `/private/` (`AGENTS.md`). `scripts/seed_events_demo.py` seeds
    demo data only. (high)
  - ADR-0033 makes Barrels the owner and responsible party for data on its
    platforms. The v1 definition lists the Data Protection Act 1/2023 (subject
    rights, Information Commission, no published adequacy list) as the
    applicable regime. (high)
  - Uploaded images use organisation upload purposes with a completed upload id
    (`organiser-logo`, `listing-image`) and render through the same-origin
    `/files/{id}` route. (high)
- **Interpretation**
  - Dates, times, venues, prices and the existence of an event are facts and
    are not owned by whoever first published them; a poster image, a written
    description, a logo and a photograph are creative works with an owner
    (general copyright principle, medium; **Grenada's copyright law was not
    reviewed**).
  - A link back to the source is both provenance for the reader and the evidence
    that Barrels did not invent the entry (best practice, medium).
  - Reading a public page and typing the facts is editorial work. Fetching pages
    with a program, parsing them or ingesting a vendor's feed is scraping, and
    would depend on terms of service and robots rules that were not read
    (medium).
  - Naming an individual (a host, a DJ, a person in a photograph, a child) is
    personal data even when it is on a public flyer; the risk grows when Barrels
    republishes it in its own voice and indexes it for search (medium).
  - Listing another vendor's ticket link promotes that vendor, including a
    direct competitor, and sends them paying customers (high, by construction).
- **Uncertainty**
  - Whether publishing facts about events from public pages, with a link, is
    comfortable under Grenadian law and under each source's terms. Terms for
    Go2Fete and other sources have not been read. Counsel has not been asked.
  - The Data Protection Act 1/2023 position on lawful basis (legitimate
    interests is assumed, not confirmed), notice, the Information Commission's
    registration expectations, and time limits for correction and erasure
    requests.
  - How many organisers will claim, how fast, and whether organisers will object
    to being listed before they joined.

## Options considered

- **A. Organiser-submitted only.** Cleanest provenance. Rejected for launch:
  the marketplace is empty on day one and the v1 definition has no independent
  organiser willing yet.
- **B. Automated aggregation or scraping of vendor sites.** Fast and large.
  Rejected: unknown terms and robots rules, brittle, copies expression as well as
  facts, damages relationships with the incumbent and with organisers, and is
  not what the owner chose.
- **C. Hand-curated seed under unclaimed organiser profiles, each listing with
  source links, plus a claim flow (chosen).** Small, deliberate, auditable, and
  hands control to the organiser.
- **D. Open public posting.** Rejected by the v1 definition (review before
  publication; no open-ended public posting).

Compared: correctness and legal exposure (C keeps copying to facts and links),
complexity (C is one new table, a few columns and a role), maintainability
(sources and verification dates keep entries refreshable), cost (staff time
only), operational risk (hide/unhide and claim paths bound the harm).

## Decision

Choose C.

### 1. Representation

- `events.organisers` gains `profile_status` (`claimed | unclaimed`, default
  `claimed`) and `claimed_at`. A curated organiser is `unclaimed`,
  `verified = false`, has no `organisation_id` and no members, and never shows
  a verified badge. A slug follows the usual rule; its name is the public trading
  name only.
- `events.listings` gains `origin` (`organiser | curated | suggestion`),
  `moderation_state` (`visible | hidden`), `hidden_reason`, `hidden_at`,
  `hidden_by`, `external_ticket_url` and `image_rights`
  (`none | organiser_uploaded | permission_granted`) with a free-text
  `image_rights_note` (a reference to the permission, never the permission
  itself). A curated listing is bound to an unclaimed organiser and has no
  Barrels ticket tiers while unclaimed.
- `events.listing_sources`: `id`, `listing_id`, `url`, `kind` (`organiser_page |
  social_post | ticket_page | press | venue_page | other`), `label`,
  `captured_at`, `captured_by`, `verified_at`, `verified_by`,
  `verification_note`. A curated listing needs at least one source with a
  `verified_at` before it can be published. Sources are shown to the public as
  "Source" links; `captured_by` and `verified_by` are internal.
- Entries from approved resident suggestions become `origin = suggestion`
  listings and carry the suggestion's `source` as a first source row.

### 2. No scraping

Allowed: a Barrels person reads a public page, post or poster, writes the facts
in their own words, and records the link and the date. Not allowed: a program
that fetches, parses or ingests another site's pages, feeds, APIs or search
results; browser automation against vendor sites; bulk copy from any vendor;
reuse of any vendor's descriptions verbatim; extracting contact details. No
scheduled job fetches third-party URLs. A link-health check (an automated
request to a source URL) is **not** built; staleness is handled by
`verified_at` age. Whether a minimal link check is acceptable is an open
decision.

### 3. What may be copied

- Facts: title (shortened to the event's name), date and time, island, parish,
  venue name, price in numbers, and the category are entered by staff.
- Descriptions are written fresh and short (summary up to about 280 characters).
  No verbatim copying of promotional text.
- **Images:** none copied from a source by default. A curated listing shows a
  category illustration or a typographic card. An organiser's poster, logo or
  photograph is used only when the organiser uploads it (`organiser_uploaded`) or
  gives written permission (`permission_granted`, with a reference in the
  note). `image_rights = none` listings never display `image_file_id`; the
  publish check enforces it.
- Names of people appear only as they are billed on the public promotional
  material as performers or hosts and only where they are the event's public
  draw; see section 7.

### 4. Display of unclaimed pages

A curated listing and its organiser page state, in plain words: "Listed by
Barrels from public information. The organiser hasn't claimed this page", with
the source link(s), "Details last checked <verified_at date>", a **Claim this
page** link and a **Report a problem** link. No buy button, no RSVP, no tickets
on Barrels while unclaimed; the only call to action is the outbound source or
ticket link (section 6). Unclaimed pages are never described as verified,
partners or endorsed.

### 5. Claim flow

1. A signed-in Events member selects **Claim this page** and submits a claim
   request: name, role, how they can be verified (an official page that links to
   Barrels, a business email on the organiser's domain, or a phone call to a
   published number), and consent to terms.
2. This creates a **pending organiser request** through the existing
   `request_organiser` path, linked to the unclaimed profile, so it appears in
   the existing moderation queue. A moderator can read it; an **MFA superuser
   approves or rejects**, as for organiser verification today. Two competing
   claims on one profile are decided by the same MFA superuser with the
   evidence recorded.
3. On approval: the platform organisation and owner membership are created, the
   profile becomes `claimed` and verified in the usual way, the unclaimed
   profile's listings transfer to the organisation (their `origin` stays
   `curated` and history is kept), and the organiser can edit, add tickets,
   replace images with their own, or ask Barrels to remove anything. Sources stay
   until the organiser removes them.
4. At any time an organiser may require removal of their curated entries; staff
   hide them within the time target (open decision) and the activity row records
   it.

### 6. Tickets sold elsewhere

Owner decision (2026-10-22): **allowed.** `external_ticket_url` (http/https
only) lets a curated listing point to the vendor that sells the tickets
(Go2Fete or a venue's own page). The page shows a button labelled
**"Tickets sold by <vendor>"** with the vendor's name (derived from the host or
set by staff), opens the link with `rel="noopener noreferrer"`, and uses no
affiliate or commission tracking. It shows no Barrels price claim beyond the
published price text. Such a listing has `booking_mode = external` (final value,
ADR-0046) and no Barrels tiers until the organiser claims and chooses to sell
with Barrels. This promotes other vendors, including the incumbent; the owner
accepted that.

### 7. Personal data (Data Protection Act 1/2023)

Design rules, pending counsel review:

- Barrels is the controller for curated entries (ADR-0033). The assumed lawful
  basis is legitimate interests in publishing public event information; this is
  **unconfirmed**.
- Minimise: no personal phone numbers, personal emails or home addresses from
  any source; only an organiser's published business contact, and only if they
  opted in (ADR-0046). No photographs of identifiable people sourced from
  others. No names or images of children; the Family tag is an audience label
  only.
- Only public events are curated. `access_type = private` events and anything
  invite-only are never curated.
- Named individuals appear only as billed performers or hosts as printed in the
  public promotion, and only where that is the event's public draw.
- Correction and removal: a named person can ask via the report/contact route;
  staff hide the listing or remove the name within the target, and the activity
  row records the action without the requester's personal details.
- Source URLs are stored; the content of a source page is not cached or archived.
- The Information Commission's registration or notification expectations for this
  processing are not known and are an owner/counsel item.

### 8. Who may curate, hide and unhide

- New global key **`events.catalogue.curate`** (`binding="global"`): create and
  edit curated organisers and listings, sources and collections (ADR-0046), run
  the seed import, and mark sources verified. It is held through a new staff
  role **`events-curator`** and is never implied by superuser status (the ADR-0050
  resolver rule applies: no superuser shortcut). Curation writes require an MFA
  session, as the non-door staff keys do in ADR-0050. It does not grant
  organisation membership, ticketing, door, till, settlement or refund powers.
- Curating uses a dedicated service function that publishes a curated listing on
  behalf of an unclaimed organiser; it deliberately bypasses the "only verified
  organisers publish" rule **only for** `origin = curated` listings and only with
  the key. Every curation write is an `activity` row with `actor_capacity =
  staff` (shown to organisers as "Barrels staff").
- **Hide / unhide** (`moderation_state`, any origin): **moderators read** the
  hide queue and the reports (`events.moderate`, `ModerationReader`); **MFA
  superusers decide** to hide or unhide, mirroring organiser verification. A
  hidden listing leaves discovery, search, collections, feeds and the map, and
  its public URL answers 404; its organiser (if claimed) sees "hidden by Barrels"
  and the reason code in the org zone. The reason codes are `inaccurate`,
  `removal_requested`, `rights`, `personal_data`, `unsafe`, `duplicate`, `other`.
  Hidden listings keep their rows and activity.

### 9. Seed data handling

The hand-curated seed is entered through the curator tooling or imported through
a script that calls the service layer from a gitignored file under `/private/`
(never committed; the repository is public). The script records sources and
`captured_at` for each row, refuses rows without a source, a verified date or an
island and parish, and is idempotent by `(organiser slug, listing slug)`. It
performs no network access.

## Resolved owner decisions (2026-10-22)

- Outbound ticket links for other vendors are allowed, with the clear label
  above (Decision 6).
- `booking_mode` gains `external` (and `none`); final set `rsvp`, `tickets`,
  `slots`, `enquiry`, `none`, `external`.

## Open owner decisions

Still open:

1. **Legal review** of publishing facts with source links, and of the Data
   Protection Act position (lawful basis, notice, registration, response times):
   counsel or the Information Commission, before the seed goes public.
2. **Removal time target** for organiser or individual requests. Proposed: hide
   within 2 business days, resolve within 10.
3. **Emergency hide by moderators** for personal-data or safety reports pending a
   superuser decision. Not proposed here (owner said moderators read); confirm.
4. **MFA for curation writes** (proposed) versus a lighter check for the curator
   role.
5. **Automated link-health check** of source URLs: allowed (HEAD only, our own
   stored links) or not at all?
6. **Claim evidence standard** and the sign-off person for disputed claims.
7. **Curated seed size and cadence** (for example 30 to 100 entries before
   public launch, re-verified every 30 days before event dates).
8. **Image placeholder style** for entries without rights (category illustration
    set to be designed; owner to approve).

## Consequences

- The marketplace can open with real, linked content while every claim stays
  traceable to a public source and to the staff member who verified it.
- Control moves to organisers quickly: claim, replace content and images, or
  remove. Barrels never has to argue ownership of an organiser's creative work.
- Curation staff hold a powerful public-voice capability; it is a separate key,
  role, MFA requirement and audit capacity so it can be reviewed and revoked.
- Without images, unclaimed listings look plainer and may convert less; that cost
  is accepted for rights safety.
- Maintenance is manual: `verified_at` ages, and events past their date leave
  discovery through the existing ended-event rule.
- Promoting other vendors (including Go2Fete) is accepted and reversible by
  clearing the field.
- Needed edits to owner-only or separately owned files, **listed in the pull
  request body and not made here (no `AGENTS.md` edited):**
  `apps/api/fastapi/src/events/AGENTS.md` (curated listings, sources, hide/
  unhide, claim flow), `apps/web/events/AGENTS.md`, and the permission registry
  (`events.catalogue.curate`, role `events-curator`) in
  `apps/api/fastapi/src/auth/permissions.py`, which is owner-reviewed.
- **Revisit triggers:** a vendor or organiser objects to being listed; counsel
  advises a different basis or notice; more than half of curated listings are
  claimed (shrink curation); stale entries exceed an agreed share; organisers ask
  for syndication of their own feed (a different, opt-in ingest ADR); an
  Information Commission requirement applies; the first removal dispute.
- **Slices (no code in this PR; the build is ADR-0046's L10, with L11 for collections):** P0 legal check; P1 tables
  and columns (`listing_sources`, `profile_status`, `origin`, `moderation_state`,
  external ticket URL, image rights); P2 key, role, curator tooling and import
  script; P3 public display of unclaimed pages; P4 claim flow over the existing
  moderation queue; P5 hide/unhide and report wiring.
