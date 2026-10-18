# Barrels Foundations Plan

**Status:** Active plan — owner decisions recorded 2026-10-18  
**Owner:** Barrels Grenada  
**Last updated:** 2026-10-18

## Purpose

This plan sequences the platform core and fundamental products every Barrels
product needs: organisations and memberships, the Events pilot loop, the
control plane, invoicing, the company hub, and one Barrels ID with rewards, Passport and trust
signals. The
[portfolio plan](../portfolio/barrels-portfolio-implementation-plan.md) stays
authoritative for priority. Tenancy follows
[ADR-0022](../adr/0022-platform-organisations-and-memberships.md).

## Owner decisions (2026-10-18)

| Decision | Choice |
| --- | --- |
| Tenancy | Bridge A: parallel `org.organisation` with the same ids, HR dual-write, `hr.organisation` untouched (ADR-0022) |
| Workspaces | Deferred |
| Events pilot | Free and registration tickets plus outlet cash; online card payment waits for the Republic ePay answer |
| Control plane | Separate `apps/web/admin` at `admin.barrels.gd`, superuser-only, dev and staging first |
| Pay/Invoice v1 | Barrels invoicing its own service-line clients, manual payments (bank, cash, cheque); no card rail; new Stripe work parked |
| Barrels HR | Next; stays in `apps/web/gaa-admin`; eventual host `hr.barrels.gd` |
| Build order | Approved as written (2026-10-18) |
| Invoicing details | Configurable settings with provisional defaults: entity "Barrels Grenada", VAT 15%, numbers `BG-YYYY-NNNN`; confirm with an accountant |
| Hub copy | Agent drafts neutral copy from the service-lines doc; owner edits later |
| Tickets (E1) | Barrels account required to claim; per-tier limit set by the organiser, default 4 per account |
| Outlet cash (E3) | Organiser's own staff (members of its organisation) only; no third-party outlets |
| Invoices (P1) | XCD, net 30, reminder emails 7 and 0 days before due and 7 days overdue |
| Rewards (U3, U5) | Generic templates: configurable stamp card and a sample "Parish Explorer" trail; real merchants and trails configured in admin later |
| Control plane access | Owner is the only superuser for now |
| eRegister QC | Add a QC accept step; only accepted observations go to WIS2; email allowed earlier for internal use. Gust group `910ff` stays flagged unconfirmed until observers confirm |
| Still open | ePay webhook (E6) |

## 30-day plan (2026-10-18 to 2026-11-17)

Owner interview, 2026-10-18. When lanes compete for time or review, this
section decides.

### Goals

1. **GMS public accuracy (lead goal).** Every GMS public page shows real data or
   an honest "not yet available from GMS" notice; never sample numbers.
2. **CAP warning loop, end to end**, accepted through a full GMS plus NaDMA drill.
3. **GAA HR acceptance (equal priority).** Phase 0 journeys with GAA HR on
   staging; agents fix findings within a day; no new HR features.
4. **Barrels lanes continue in parallel** (Events E3–E5, rewards, control plane,
   invoicing) without displacing goals 1–3.

### Functional requirements

| Area | Requirement |
| --- | --- |
| Placeholder pages (60 of 136) | Stay visible with an honest notice; no sample figures |
| Satellite and tropics | GOES-East imagery via the GeoNetCast/wxwatch pipeline; NHC products already ingested |
| Sun, UV, dust, heat | Sun times computed locally; UV and Saharan dust from Copernicus CAMS (free registration) |
| Climate | Normals, monthly, records and rainfall computed from GMS historical spreadsheets imported with QC flags (files supplied into gitignored `/private/`), plus eRegister data |
| Marine | Waves, swell and sea temperature from Copernicus Marine; tides via a harmonic model; coastal from wxproducts |
| Models and GeoNetCast | ECMWF open data, AIFS and GFS; point meteograms and maps; GeoNetCast for imagery, model fields, lightning/fire and offline resilience (investigation first) |
| `cap.barrels.gd` | GMS-branded public alert hub (current warnings, map, history, CAP XML/RSS/GeoJSON) **and** CAP authoring moved there behind sign-in; `@barrelsgd/web-cap` on port 3010 |
| CAP signing | Government PKI certificate; if not issued by the drill, a clearly labelled temporary self-signed key (signer configurable) |
| CAP dissemination | Feeds, WMO Register of Alerting Authorities / Alert Hub, email and web push subscribers, partner distribution lists, social auto-post (free tiers) |
| CAP drill | Full GMS + NaDMA exercise including amend and cancel |
| Public alert subscriptions | Email (subscriptions domain) and free Web Push (VAPID); CAP remains the source |
| `gmsdash.barrels.gd` | GMS client service for external users with premium products (models and more). Barrels ID sign-in, organisations request access, GMS approves (tenancy and entitlements). GAA/GMS set pricing and terms; Barrels bills. In 30 days: scaffold plus one meteogram page |
| barrels.gd hub | Goes public after the owner edits the drafted copy |

### Non-functional requirements

| Area | Requirement |
| --- | --- |
| Storm resilience | Cloudflare-cached pages plus a last-known-good alerts page that works when the VM is unreachable; "last updated" shown |
| Freshness | Observations flagged stale after 90 min, forecasts after 12 h, satellite after 30 min; stale data shown with a warning, never silently |
| Performance | Built for residents on mobile data (target under 200 KB first-load JS, usable within 3 s), plus mariners, aviation and visitors |
| Provenance | Every value shows source, time and status (provisional or verified); external data labelled "not a GMS product" |
| Security | Privileged MFA enforced for anyone who can approve or publish CAP |
| Monitoring | Free external uptime checks on the alert hub, feeds and API, alerting the owner |
| Privacy (DPA 2023) | Contact and data requests deleted 24 months after closing; unconfirmed subscriptions after 30 days; unsubscribed emails kept only as a suppression hash; privacy notice per site; scheduled purge job |
| Abuse | Cloudflare Turnstile verified server-side on every public form |

### Ways of working

| Topic | Decision |
| --- | --- |
| Acceptance of GMS public pages | Owner approves; GMS informed |
| Release cadence | Daily: the agent opens the `dev` → `staging` PR each evening with a summary; the owner merges before bed. Production on the owner's go |
| Staging breakage | Agent fixes forward on `dev` with tests; read-only checks on VMs only |
| Order inside GMS | CAP first (weeks 1–2: hub, authoring move, signing seam, channels, Alert Hub paperwork; week 3: drill), pages in parallel weeks 2–4 |

### Owner actions

- GMS historical spreadsheets into `/private/`.
- Government PKI request for CAP signing.
- WMO Register of Alerting Authorities entry (through the GMS Permanent Representative).
- NaDMA drill date and participants.
- Copernicus (Marine and CAMS) free account credentials into GitHub secrets.
- Deploy variables: contact, data-request and eRegister recipients.
- `AUTH_TOTP_ENCRYPTION_KEYS` secret to enforce privileged MFA.
- Edit barrels.gd copy; GAA HR inputs; gust group 910ff/911ff with observers.

## Next work list (from the 2026-10-18 codebase audit)

Owner decisions on 2026-10-18 (late): remove every invented figure from GMS
pages including the home hero (reverses the 30 Sep decision); CAP requires
approval by a different person, with an audited emergency publish only for a
duty-supervisor role; Python dependencies approved: `pywebpush`,
`ecmwf-opendata`, `cfgrib`/`eccodes`, `copernicusmarine`, `cdsapi`; the
integrations recommended in `docs/strategy/integration-opportunities.md` are
approved to build when a product pulls them (paid providers still flagged
first); hashing suppressed/unsubscribed emails approved after a verified
backup. GMS real data sources are ready; the work is integration.

| # | Item | Lane | Size | Needs owner |
| --- | --- | --- | --- | --- |
| 1 | Push `dev`, open the evening `dev` → `staging` PR with a checklist | Platform | S | Merge |
| 2 | Remove invented figures: `PlaceholderNotice` becomes "Not yet available from GMS"; strip figures from ~26 pages; hero uses real observations and computed sun times, "not available yet" elsewhere | GMS | M | Page approval |
| 3 | Privileged MFA covers `cap.alert.approve`/`cap.alert.publish`; approval required before publish, emergency publish role audited | CAP | S | `AUTH_TOTP_ENCRYPTION_KEYS` secret |
| 4 | `apps/web/cap` (3010): public hub (current, map, history, feeds), Dockerfile, compose service, Traefik `cap.*` | CAP | L | — |
| 5 | Signing seam: temporary self-signed key generator, `CAP_SIGNING_TEMPORARY` label in XML, feed and hub; deploy vars | CAP | M | Government PKI request |
| 6 | CAP email list (`gms-alerts`) and publish-to-subscribers job; wire GMS get-alerts | CAP | M | — |
| 7 | Web Push (VAPID, `pywebpush`): subscription storage and publish handler | CAP | M | — |
| 8 | Turnstile verified server-side on every public form; `TURNSTILE_SECRET_KEY` | Platform | S | Site key and secret |
| 9 | Staleness 90 min / 12 h / 30 min and a shared provenance chip (source, time, status, "not a GMS product") | GMS | M | — |
| 10 | Public latest-satellite endpoint (wxwatch) and the satellite page | GMS | M | — |
| 11 | Storm mode: cache headers on alert pages and feeds; last-known-good alerts page written to object storage on publish | GMS | M | — |
| 12 | Uptime monitors for the alert hub, feeds and production API | Platform | S | Monitor account |
| 13 | Copernicus Marine (waves, swell, SST) and CAMS (UV, dust) ingestion and pages | GMS | L | Copernicus credentials |
| 14 | Climate importer for GMS spreadsheets with QC flags; normals, monthly, records, rainfall pages | GMS | L | Spreadsheets in `/private/` |
| 15 | ECMWF open data / AIFS / GFS point meteograms in the worker; `apps/web/gmsdash` (3013) scaffold with org access requests | GMS | L | — |
| 16 | `JURY_DUTY` leave type; holiday table in timesheets; extra-day-for-holiday-in-vacation suggestion | HR | M | GAA HR rule confirmation |
| 17 | DPA purge job and email hashing migration (after verified backup) | Platform | M | — |
| 18 | E3 outlet cash, E4 settlement report, E5 organiser cancel/refund | Barrels | L | — |
| 19 | C1 deploy wiring for `apps/web/admin` once `admin.*` is freed by the gmsadmin cutover | Barrels | M | — |
| 20 | Test speed: auto workers (CPUs − 2), pre-push runs changed-package tests, CI shards for API and gaa-admin, fuzz in CI only | Platform | M | — |
| 21 | Doc fixes: missing env.md rows, invoice settings in deploy, transition-plan port conflicts, note that compose `web-admin` is gaa-admin | Platform | S | — |

Known risks: one account can still publish a national warning with a password
only (items 3); CAP XML publishes unsigned when no certificate is set (item 5);
observation staleness is 3 h in code (item 9); Turnstile always passes (item 8);
emails are stored in plaintext indefinitely (item 17).

## What exists today

| Capability | Evidence | Gap |
| --- | --- | --- |
| Identity and app access | `src/auth/apps.py`, `app_router.py`, ADR-0016 to ADR-0018 | None for v1 |
| Organisations | `hr.organisation` only (`src/hr/models.py`); Events `organisers` unlinked | Platform organisation, membership, verification |
| Request context | `src/request_context.py` (request id) | `OrgContext` with denial tests |
| Notifications | Inbox, opt-outs, email outbox with retry (`notifications/models.py`, `dispatch.py`) | Delivery from the Events database; non-email channels deferred |
| Billing | Stripe checkout and webhook only (`src/billing`) | Invoices, manual payments, receivables |
| Storage | Spaces service; weather images only | Organisation-scoped uploads |
| Audit | `src/audit`, main database only | Events activity log |

## Slices

**U** = an unattended agent can build it once its dependencies merge. **O** = needs
an owner answer first. Migrations are additive. Every route change follows the
`api-change` skill. Main-database slices run one at a time to keep a single
Alembic head.

| # | Slice | Size | Mode |
| --- | --- | --- | --- |
| F0 | ADR-0022 and this plan | S | Done |
| F1 | `organisations` domain: `org.organisation`, `org.membership`, `org.organisation_app`; backfill from `hr.organisation`; `GET /api/v1/organisations/mine` | M | U — built, pending merge |
| F2 | HR dual-write in `src/hr/organisations.py` and baseline seeds; reconciliation test | S | U — built, pending merge |
| F3 | `OrgContext` (`X-Barrels-Organisation`), `org.*` permission keys, `organisation_id` in log context, cross-organisation denial tests | M | U — built, pending merge (no `org.*` permission keys needed: access is by membership role) |
| F4 | Membership invites (hashed, expiring, single use), accept, role change, removal, last-owner protection, audit | M | U — built, pending merge |
| A1 | Account "Organisations" tab in `apps/web/auth` | S | U — built, pending merge |
| F5 | Events organiser to organisation bridge (`organisers.organisation_id`), `require_organiser` accepts platform membership or legacy rows | M | U — built, pending merge |
| F6 | Events outbox drained by the worker into `notifications.notify` with a dedupe key | M | U — built, pending merge |
| F7 | Events append-only activity log | S–M | U — built, pending merge |
| F8 | Organisation-scoped uploads (presigned, size and type limits) | M | U — built, pending merge (`org.upload`, `/storage/uploads`; Events organiser logo and listing image; bucket CORS for browser PUT is an ops step) |
| E1 | Orders and tickets for free and registration tiers; inventory guard; QR ticket page | L | U — built, pending merge (`events_0005`; per-account limit default 4 per tier; paid tiers refused until E6; verified-publish gate added with it) |
| E2 | Idempotent admission scans, duplicate rejection, printable manifest | M | U — built, pending merge (`events_0006`; `/dash/events/[id]/door`, keyboard-scanner input, no camera) |
| E3 | Outlet cash sales by the organiser's own staff, sharing inventory with online and door | M | U |
| E4 | Settlement report replacing `/dash` demo fixtures | M | U |
| E5 | Cancel, postpone and manual refund | M | U |
| C1 | `apps/web/admin` shell at `admin.barrels.gd` (port 3012), superuser via auth handoff, status cards (**built, pending merge**; deploy wiring and the `admin.*` host cutover deliberately not done, see "Host move") | L | U |
| C2 | Control-plane organisations: list, detail, verify, app entitlements, members (**built, pending merge**) | M | U |
| P1 | Invoice core: customer, invoice, lines, numbering, totals in minor units; entity, VAT and prefix are provisional settings | M | U — built, pending merge |
| P2 | Issue and email invoice PDF (stored through F8) | M | U — built, pending merge (PDF stored when object storage is configured, else rendered on demand; the email carries a 7-day link, not an attachment) |
| P3 | Manual payments, receivables and ageing in the control plane | M | U — built, pending merge |
| H1 | `barrels.gd` services page with contact and newsletter forms posting to FastAPI; drafted copy | S–M | U — built, pending merge; production CORS origins and copy review open |
| E6 | Provider-neutral online payment adapter | L | Blocked (ePay) |
| R1 | Phase 2 HR foreign key, then HR reads through `OrgContext` | L | O |

Order: F1 → F2 → F3 → (F4, F5, F8) → A1, F6, F7 → E1 → E2 → E3 → E4 → E5. C1 → C2
can start after F3. P1 to P3 follow C2. H1 is independent.

## Barrels ID and rewards

One Barrels ID across every product, with rewards that follow completed
real-world actions. This follows the
[product strategy](../strategy/barrels-product-strategy.md#loyalty-and-responsible-gamification)
and the [loyalty reference study](../strategy/loyalty-reference-study.md).

| # | Slice | Depends on | Mode |
| --- | --- | --- | --- |
| U1 | Barrels ID profile: one account page showing apps, organisations, tickets and rewards (extends A1) | A1, E1 | U |
| U2 | Rewards ledger: append-only entries with pending and confirmed states, unique transaction references, automatic refund reversal, audited manual adjustment | F3, E1, E5 | U |
| U3 | Merchant rewards: organisation-funded stamp cards and ticket credits, configured per organisation; redemption limits; duplicate check-in prevention | U2, C2 | U (generic templates) |
| U4 | Trust signals: verified organiser, verified attendee, verified purchaser badges derived from records, never purchasable | C2, E2 | U |
| U5 | Barrels Passport: non-monetary stamps and collections for real attendance (parishes, Carriacou, Petite Martinique, festival trails) | E2, U2 | U (sample trail) |
| U6 | Universal Barrels Points | Evidence from U3 and the Events pilot | Explore only |

Rewards guardrails: no cash withdrawal, person-to-person transfer, point
purchases or cryptocurrency, and nothing that works as stored value without a
licence. No public spending leaderboards, random prize mechanics or rewards for
opening the app.

## Do not build yet

AI gateway, Knowledge and Automate; workspaces; Places API and a search engine;
SMS, push and WhatsApp; card checkout, payouts and wallets; Shop and Salesbus
extraction; `hr.barrels.gd` as its own app; organisation scope for CAP, weather,
janitorial or transport; a separate Barrels Business app; microservices.

## Host move for the GAA staff portal

Owner decision 2026-10-18: the GAA staff portal (`apps/web/gaa-admin`, code name
unchanged) moves to `gmsadmin.barrels.gd`, freeing `admin.barrels.gd` for the
Barrels control plane (C1).

1. **Done:** `docker-compose.deploy.yml` serves the portal on both `admin.*` and
   `gmsadmin.*` (separate Traefik router and certificate), and both origins are
   in `BACKEND_CORS_ORIGINS`. The sign-in return-to allowlist already accepts any
   `.barrels.gd` subdomain.
2. **DNS:** nothing to add. Wildcard records (`*.staging.barrels.gd` to the
   staging VM, `*.barrels.gd` to production) already resolve `gmsadmin.*`;
   Traefik obtains the certificate on the first deploy that includes the router.
3. **After DNS is verified on staging:** point `GAA_ADMIN_APP_URL` at
   `gmsadmin.*`, update the service catalogue origin, email links
   (`packages/email-templates/src/notification.tsx`) and docs, then redirect
   `admin.*` to `gmsadmin.*`.
4. **C1:** once the redirect has run for a while, `admin.*` routes to `apps/web/admin`.

## Known documentation conflicts to fix

- `barrelsgd-transition.md` names the `admin.barrels.gd` package differently in
  two places (`@barrelsgd/web-gaa-admin` on port 3001 versus `apps/web/admin`).
  This plan uses `apps/web/admin` on port 3012.
- The planned hub port 3006 collides with CMS, and Salesbus 3010 collides with the
  planned CAP app (`docs/ports.md`). Resolve these in C1.
