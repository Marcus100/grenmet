# Barrels Foundations Plan

**Status:** Active plan — owner decisions recorded 2026-10-18, 2026-10-19 and 2026-10-20  
**Owner:** Barrels Grenada  
**Last updated:** 2026-10-20 (platform foundations, PF-series; PF1-PF10 built, PF11 API built)

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

## Owner decisions (2026-10-19)

| Decision | Choice |
| --- | --- |
| Bookings | One shared, organisation-scoped appointments API in FastAPI for every app; Babydoll Beauty Bar is the first tenant ([ADR-0024](../adr/0024-bookings-domain.md)) |
| Booking engine | Port Easy!Appointments' model and availability rules into a native domain (clean-room; GPL code is never copied); no external engine |
| Studio | Each client manages bookings in a signed-in `/studio` area of its own site (Barrels ID, organisation admin) |
| Deposits | Taken on Barrels' merchant account through the provider-neutral adapter; Stripe and Republic Bank ePay (owner approaching the bank); whichever onboards first ships first |

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
| Release cadence | The agent opens the `dev` → `staging` PR right after every successful `dev` push, with a summary and checklist; the owner merges. Production on the owner's go |
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
- GA4 measurement ID for `cap.barrels.gd` (item 30).
- Email identity for the Cloudflare Access policy on the admin tools (item 22).
- Security contact address for `security.txt` (item 28).
- Later, each on its own go: DMARC `quarantine`, CSP enforcement, HSTS preload.
- Optional: compact Docker Desktop's disk (`diskpart /s C:\Users\eugin\compact-docker.txt` after `wsl --shutdown`).

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

| # | Item | Lane | Size | Needs owner | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Push `dev`, open the evening `dev` → `staging` PR with a checklist | Platform | S | Merge | Done (#412–#414) |
| 2 | Remove invented figures: `PlaceholderNotice` becomes "Not yet available from GMS"; strip figures from ~26 pages; hero uses real observations and computed sun times, "not available yet" elsewhere | GMS | M | Page approval | Done, on staging |
| 3 | Privileged MFA covers `cap.alert.approve`/`cap.alert.publish`; approval required before publish, emergency publish role audited | CAP | S | `AUTH_TOTP_ENCRYPTION_KEYS` secret | Done, on staging (MFA enforced once the key secret is set) |
| 4 | `apps/web/cap` (3010): public hub (current, map, history, feeds), Dockerfile, compose service, Traefik `cap.*` | CAP | L | — | Done, on staging |
| 5 | Signing seam: temporary self-signed key generator, `CAP_SIGNING_TEMPORARY` label in XML, feed and hub; deploy vars | CAP | M | Government PKI request | Open |
| 6 | CAP email list (`gms-alerts`) and publish-to-subscribers job; wire GMS get-alerts | CAP | M | — | Done, on staging |
| 7 | Web Push (VAPID, `pywebpush`): subscription storage and publish handler | CAP | M | — | Done, on staging (needs VAPID keys) |
| 8 | Turnstile verified server-side on every public form; `TURNSTILE_SECRET_KEY` | Platform | S | Site key and secret | Done, on staging (needs keys) |
| 9 | Staleness 90 min / 12 h / 30 min and a shared provenance chip (source, time, status, "not a GMS product") | GMS | M | — | Done, on staging |
| 10 | Public latest-satellite endpoint (wxwatch) and the satellite page | GMS | M | — | Done, on staging |
| 11 | Storm mode: cache headers on alert pages and feeds; last-known-good alerts page written to object storage on publish | GMS | M | — | Done, on staging |
| 12 | Uptime monitors for the alert hub, feeds and production API | Platform | S | Monitor account | Open |
| 13 | Copernicus Marine (waves, swell, SST) and CAMS (UV, dust) ingestion and pages | GMS | L | Copernicus credentials | Done, on staging (needs credentials) |
| 14 | Climate importer for GMS spreadsheets with QC flags; normals, monthly, records, rainfall pages | GMS | L | Spreadsheets in `/private/` | Open (request form only) |
| 15 | ECMWF open data / AIFS / GFS point meteograms in the worker; `apps/web/gmsdash` (3013) scaffold with org access requests | GMS | L | — | Done, on staging (sign-in needs `GMSDASH_SSO_CLIENT_SECRET`) |
| 16 | `JURY_DUTY` leave type; holiday table in timesheets; extra-day-for-holiday-in-vacation suggestion | HR | M | GAA HR rule confirmation | Done, on staging |
| 17 | DPA purge job and email hashing migration (after verified backup) | Platform | M | — | Held for `EMAIL_HASH_PEPPER` |
| 18 | E3 outlet cash, E4 settlement report, E5 organiser cancel/refund | Barrels | L | — | Done, on staging |
| 19 | C1 deploy wiring for `apps/web/admin` once `admin.*` is freed by the gmsadmin cutover | Barrels | M | — | Open (app built, not deployed) |
| 20 | Test speed: auto workers (CPUs − 2), pre-push runs changed-package tests, CI shards for API and gaa-admin, fuzz in CI only | Platform | M | — | Done, on staging |
| 21 | Doc fixes: missing env.md rows, invoice settings in deploy, transition-plan port conflicts, note that compose `web-admin` is gaa-admin | Platform | S | — | Partly: domain map in `docs/ports.md`; the rest open |

Known risks (updated 2026-10-18 late):
- CAP XML publishes unsigned when no certificate is set (item 5).
- Privileged MFA for approve and publish is enforced only once `AUTH_TOTP_ENCRYPTION_KEYS` is set (item 3).
- Turnstile is off until its keys are set (item 8).
- Emails are stored in plaintext indefinitely (item 17).
- The admin tools are public behind basic auth (item 22).
- A staging subdomain could plant cookies for production (item 23).

Closed tonight: single-person publish (item 3) and the 3 h staleness (item 9).

## Edge, domains and API hardening (review 2026-10-18)

A web-researched review of ports, domains, subdomains and the API against
current best practice. Every hostname by environment is in
[`docs/ports.md`](../ports.md#domains-by-environment).

Already in line with best practice:
- one port per app, enforced by `check-ports`; only Traefik is published;
- host-only `HttpOnly`/`SameSite=Lax`/`Secure` session cookies;
- HTTPS everywhere, with HSTS including subdomains;
- a versioned API, with separate liveness (`/api/v1/utils/health-check/`) and readiness (`/api/v1/utils/ready/`) probes;
- SPF and DKIM for Resend mail.

Owner decisions (2026-10-18):
- Cloudflare Access (free tier) in front of the admin tools.
- Keep staging under `*.staging.barrels.gd` and harden it with `__Host-` session cookies; no paid separate domain.
- The agent may make the DMARC reporting, CAA and Access changes in Cloudflare.
- The CAP hub gets its own GA4 property.

| # | Item | Lane | Size | Needs owner | Status |
| --- | --- | --- | --- | --- | --- |
| 22 | Cloudflare Access in front of `traefik.*` and `adminer.*` (staging and production): proxy those records, add an Access application and policy, keep basic auth as break-glass | Platform | S | Policy email | Approved |
| 23 | `__Host-` prefix on every app session cookie when `secure` is true (localhost keeps plain names); one forced sign-out per app; check the Payload CMS and FastAPI cookies separately | Platform | M | — | Open |
| 24 | DMARC: add a `rua=` reporting address (Cloudflare DMARC Management) and `sp=`; review 2–4 weeks, then `quarantine`, then `reject` | Platform | S | Go for quarantine | Approved (reporting) |
| 25 | CAA records: `issue "letsencrypt.org"` plus the CAs Vercel and Cloudflare need (verify first), and an `iodef` contact | Platform | S | — | Approved |
| 26 | Security headers: nonce-based CSP in report-only, then enforced; Permissions-Policy; HSTS from 30 days to 1 year after a clean week; preload later | Platform | M | Go to enforce; go to preload | Open |
| 27 | Health checks: every web app serves `/api/health` (cap and gmsdash already do) and Traefik and compose use it; document the API's liveness and readiness probes | Platform | S | — | Open |
| 28 | `/.well-known/security.txt` (RFC 9116: `Contact`, `Expires` under a year) on barrels.gd and the public apps | Platform | S | Security contact | Open |
| 29 | Explicit DNS records for every host, then remove the wildcard | Platform | S | — | Open |
| 30 | GA4 for `cap.barrels.gd` in the service catalogue, production only (`publicAnalytics: true`) | CAP | S | GA4 ID | Open |
| 31 | Tidy stale config: catalogue `gaa-admin` origin to `gmsadmin.*` (with item 19); retired hosts in `infra/docker/.env.*.example` CORS lists | Platform | S | — | Open |

Let's Encrypt allows about 50 certificates per registered domain per week,
shared by staging and production. Today's roughly 28 hosts fit; keep
`acme.json` on its volume so a redeploy never reissues everything.

## Delivery gate parity (lessons from 2026-10-18)

Three staging failures tonight passed every local gate:

| # | Item | Lane | Size | Status |
| --- | --- | --- | --- | --- |
| 32 | Make the local gate match CI: run coverage floors for changed apps in `verify:changed`; add a CI-order pytest option; always pass turbo filters directly, because under pnpm 12 `pnpm test --filter` skips turbo's `^build` | Platform | M | Open |
| 33 | One source for app lists: derive the shared-Sentry app lists in `scripts/integrations/catalogue.mjs` and `scripts/production/render-env.py` from the service catalogue, and fail CI when a release-scope app has no catalogue entry | Platform | S | Open |
| 34 | Host tooling notes: `jq` is not installed (use `gh --jq`); turn Docker Desktop's WSL integration back on after a disk compaction | Platform | S | Open |

## Owner decisions (2026-10-20)

| Decision | Choice |
| --- | --- |
| Platform foundations | Build the shared APIs every future app uses before more product features: org config and access, reliability primitives, payments core, org contacts, org API keys, outbound webhooks and feature flags (PF-series below) |
| Payments | Build a provider-neutral payments core **plus a Stripe test-mode adapter** now, with funds on Barrels' merchant account and payouts manual ([ADR-0027](../adr/0027-payments-core-and-providers.md)). No live card rail until the owner approves |
| API keys | Organisation-scoped; scopes come from `permissions.py` and are never wider than the creator's role; stored hashed, shown once, expiring, rotatable, audited ([ADR-0029](../adr/0029-organisation-api-keys-and-webhooks.md)). Supersedes "N4 waits for a client" |
| Migration of existing domains | Each primitive ships with one pilot consumer; other domains move one per PR |
| Rewards | Generic earn sources, Passport and trails, achievements, check-in streaks, organisation rewards admin. Guardrails relaxed for opt-in leaderboards, community challenges and stamp gifting, under constraints ([ADR-0030](../adr/0030-rewards-earn-sources-and-gamification.md)) |
| Public site owners | `barrels` and `signal` belong to the `barrels` organisation; `mbia` and `gms-alerts` belong to `gaa` |

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
| Bookings | None; Babydoll links to Acuity (`apps/web/babydoll/src/data/site.ts`) | Services, availability, public booking, studio, reminders, deposits (B-series) |

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
| E3 | Outlet cash sales by the organiser's own staff, sharing inventory with online and door | M | U — built, pending merge (`events_0008`; admin/owner staff only, per-staff-per-day till with float and count; `/dash/events/[id]/outlet`) |
| E4 | Settlement report replacing `/dash` demo fixtures | M | U — built, pending merge (`/dash/events/[id]/settlement`, CSV export, `/dash` panel) |
| E5 | Cancel, postpone and manual refund | M | U — built, pending merge (`events_0009`; cancel cascades to tickets and notifies holders; refunds are manual cash/bank records for outlet cash tickets) |
| C1 | `apps/web/admin` shell at `admin.barrels.gd` (port 3012), superuser via auth handoff, status cards (**built, pending merge**; deploy wiring and the `admin.*` host cutover deliberately not done, see "Host move") | L | U |
| C2 | Control-plane organisations: list, detail, verify, app entitlements, members (**built, pending merge**) | M | U |
| P1 | Invoice core: customer, invoice, lines, numbering, totals in minor units; entity, VAT and prefix are provisional settings | M | U — built, pending merge |
| P2 | Issue and email invoice PDF (stored through F8) | M | U — built, pending merge (PDF stored when object storage is configured, else rendered on demand; the email carries a 7-day link, not an attachment) |
| P3 | Manual payments, receivables and ageing in the control plane | M | U — built, pending merge |
| H1 | `barrels.gd` services page with contact and newsletter forms posting to FastAPI; drafted copy | S–M | U — built, pending merge; production CORS origins and copy review open |
| E6 | Provider-neutral online payment adapter | L | Planned via B6: Stripe or Republic Bank ePay, whichever onboards first (owner approaching Republic Bank) |
| R1 | Phase 2 HR foreign key, then HR reads through `OrgContext` | L | O |

Order: F1 → F2 → F3 → (F4, F5, F8) → A1, F6, F7 → E1 → E2 → E3 → E4 → E5. C1 → C2
can start after F3. P1 to P3 follow C2. H1 is independent.

### API conventions

[ADR-0025](../adr/0025-api-conventions.md): frontend-agnostic, audience zones
(`public`, `me`, `org`, `admin`), unique schema names, shared helpers.
`tests/test_api_conventions.py` enforces it, with shrink-only allowlists.

| # | Slice | Size | Mode |
| --- | --- | --- | --- |
| N0 | ADR-0025, conventions test, shared `GRENADA`/`zone()` everywhere, one router prefix style, `HrRolePublic` rename, Bookings on `org`/`public` zones | S | U — built on branch `claude/bookings-b1-b2` |
| N1 | Per-organisation settings tables replace per-site environment settings (`contact` recipients, `SUBSCRIPTIONS_SITE_URLS`, Barrels/MBIA branches) | M | U — built as PF1 (`org.public_site`); environment fallback stays until every environment sets the site rows |
| N2 | Public forms take an organisation-owned public slug instead of a free `site` field; Turnstile per organisation | M | U — built as PF1: `/contact/public/{site_key}/messages`, `/subscriptions/public/{site_key}`, Turnstile per site; old routes deprecated |
| N3 | Migrate legacy zones with deprecated aliases: `events/manage` → `events/org`, `organisations/mine` → `organisations/me`, `hr/dashboard`; regenerate the client, move consumers, delete aliases | L | U (one domain per PR) |
| N4 | Non-browser credential: organisation-scoped API keys or tokens for mobile, kiosk and partner clients | M | U — approved 2026-10-20 as PF5 ([ADR-0029](../adr/0029-organisation-api-keys-and-webhooks.md)) |

Order: N0 → N1 → N2 (both done in PF1). N3 runs alongside, one domain at a time. N4 is PF5.

### Bookings

Shared appointments domain ([ADR-0024](../adr/0024-bookings-domain.md)),
Babydoll first. Main-database slices, one at a time.

| # | Slice | Size | Mode |
| --- | --- | --- | --- |
| B0 | ADR-0024, this section, portfolio and strategy updates | S | Done |
| B1 | `bookings` schema and models; migration with the `btree_gist` exclusion constraint; studio CRUD for profile, services, providers, working plans and exceptions; `src/utils/timezones.py`; domain `AGENTS.md`; contracts and regenerated client | L | U — built on branch `claude/bookings-b1-b2`, pending CI (database tests) and merge |
| B2 | Pure availability engine with property-style tests; public services and availability endpoints | M | U — built with B1, pending CI and merge |
| B3 | Public create, manage, cancel and reschedule (Turnstile, honeypot, idempotency, hashed manage token); ICS; confirmation, studio and 24-hour reminder emails; retention | L | U |
| B4 | Babydoll organisation and service seed; `/book` and `/booking/[token]` pages behind a switch flag (Acuity stays live) | M | U |
| B5 | Babydoll Barrels ID sign-on and `/studio` (agenda, actions, services, hours, time off) | L | O (SSO secret and app URL) |
| B6 | Provider-neutral payments (E6) on Barrels' merchant account: Stripe and Republic Bank ePay; deposits held as `pending_payment`; callback; refunds; settlement and payouts | L | O (a provider onboards Barrels) |
| B7 | Switch Babydoll off Acuity; second tenant | S | O |

Order: B1 → B2 → B3 → B4. B5 can start after B1. B6 follows B3 once a payment
provider has onboarded Barrels.

### Platform foundations (PF-series, owner decision 2026-10-20)

Each primitive ships with one pilot consumer. Other domains move onto it one per PR.

| # | Slice | Pilot consumer | Depends on | Status |
| --- | --- | --- | --- | --- |
| PF1 | **Org config and access.** N1 `org.public_site` (recipient, origin, Turnstile per site; the secret is Fernet-encrypted via `src/utils/secret_box.py` and `ORG_SECRET_ENCRYPTION_KEYS`). N2 site-keyed public routes. Request-time entitlements (`require_org_app`; products `bookings`, `rewards` in `src/organisations/entitlements.py`) | contact, subscriptions, bookings and rewards organisation routes | — | Built on `ccr-1892d1ff-r3cjk9`; control-plane "Sites" UI is C3 |
| PF2 | **Reliability.** Shared `Idempotency-Key` with stored-response replay; one outbox table and runner with a single retry policy ([ADR-0026](../adr/0026-platform-reliability-primitives.md)) | Bookings B3 create | PF1 | Built (`reliability20261020`): idempotency, outbox, Bookings B3. Events, notifications and CAP loops are not moved onto it yet (one domain per PR; Events needs a separate-database design check) |
| PF3 | **Org contacts.** `org.contact` with hashed email, consent and source; lookup, upsert and audited merge ([ADR-0028](../adr/0028-organisation-contacts.md)) | `bookings.customer`, then `billing.customer` | PF1 | Built (`src/contacts`, `orgcontacts20261020`). Bookings links customers to contacts when the organisation has the `contacts` entitlement; `billing.customer` is not wired yet |
| PF4 | **Payments core.** Intents, attempts, append-only ledger, refunds; `PaymentProvider` with `manual` and Stripe test-mode adapters; reconciliation report ([ADR-0027](../adr/0027-payments-core-and-providers.md)) | Events paid tier or Bookings deposit (sandbox) | PF2, PF3 | Built, **test mode only** (`payments20261020`; `manual` and Stripe test adapters, live keys refused, payouts idempotent). Events paid tiers and booking deposits (B6) are not wired; the live rail stays gated |
| PF5 | **Org API keys** (N4) | Bookings read | PF1 | Built (`orgapikeys20261020`). Bookings reads and rewards programme read/redemption confirm accept keys; bookings write routes arrive with B5 |
| PF6 | **Outbound webhooks:** registry, HMAC signing generalised from CAP, delivery on the PF2 runner | `booking.created`, `payment.succeeded` | PF2, PF5 | Built (`webhooksout20261020`). Emitters: bookings, payments, contacts |
| PF7 | **Feature flags** (accept ADR-0020) | Babydoll `/book` switch (B4) | PF1 | Built (`featureflags20261020`); control-plane page `/flags` in `apps/web/admin` |
| PF8 | **Rewards earn sources:** `rewards.qualifying_action` on the outbox replaces `sync_event_rewards` ([ADR-0030](../adr/0030-rewards-earn-sources-and-gamification.md)) | Events admission, then bookings | PF2 | Built: catalogue, `record_qualifying_action`, outbox handler, `bookings.completed`. Events admissions still use `sync_event_rewards` |
| PF9 | **Gamification core:** Passport and trails (U5), achievements, check-in streaks (signed venue QR) | Events, venue check-in | PF8 | Built (`rewardsgame20261020`); account Rewards tab shows passport, achievements, streak and check-in |
| PF10 | **Social layer**, each behind a PF7 flag: opt-in leaderboards, community challenges, stamp gifting. Gifting is off in production until an accountant and legal sign-off | Account Rewards tab | PF7, PF9 | Built (API, `rewardssocial20261020`), every mechanic off by default behind flags; gifting is hard-off in production. No UI yet |
| PF11 | **Org rewards admin:** stamp cards, trails, challenges, redemptions | admin, Babydoll studio | PF8 | API half built (programme pause/resume, entries, redemptions, venues, trails, achievements). The organisation-facing UI is not built: it needs a decision on which app organisation admins use |

Order: PF1 → PF2 → (PF3, PF5, PF7, PF8) → PF4 → (PF6, PF9) → PF10, PF11. Main-database slices land one at a time to keep a single Alembic head.

## Barrels ID and rewards

One Barrels ID across every product, with rewards that follow completed
real-world actions. This follows the
[product strategy](../strategy/barrels-product-strategy.md#loyalty-and-responsible-gamification)
and the [loyalty reference study](../strategy/loyalty-reference-study.md).

| # | Slice | Depends on | Mode |
| --- | --- | --- | --- |
| U1 | Barrels ID profile: one account page showing apps, organisations, tickets and rewards (extends A1) | A1, E1 | U — built, pending merge |
| U2 | Rewards ledger: append-only entries with pending and confirmed states, unique transaction references, automatic refund reversal, audited manual adjustment | F3, E1, E5 | U — built, pending merge |
| U3 | Merchant rewards: organisation-funded stamp cards and ticket credits, configured per organisation; redemption limits; duplicate check-in prevention | U2, C2 | U (generic templates) — core built, pending merge; admin read-only UI open |
| U4 | Trust signals: verified organiser, verified attendee, verified purchaser badges derived from records, never purchasable | C2, E2 | U — built, pending merge |
| U5 | Barrels Passport: non-monetary stamps and collections for real attendance (parishes, Carriacou, Petite Martinique, festival trails) | E2, U2 | U (sample trail) |
| U6 | Universal Barrels Points | Evidence from U3 and the Events pilot | Explore only |

Rewards guardrails (amended 2026-10-20, [ADR-0030](../adr/0030-rewards-earn-sources-and-gamification.md)):
- Still banned: cash withdrawal, point purchases, cryptocurrency, anything that
  works as stored value without a licence, spend-ranked leaderboards, random
  prize mechanics, and rewards for opening the app.
- Now allowed, behind flags:
  - opt-in, action-ranked leaderboards;
  - community challenges;
  - streaks from real-world check-ins;
  - stamp gifting, limited to non-redeemable or capped stamps and off in
    production until an accountant and legal sign-off.

## Do not build yet

AI gateway, Knowledge and Automate; workspaces; Places API and a search engine;
SMS, push and WhatsApp; live card checkout, payouts and wallets (the PF4
payments core and its Stripe test-mode adapter are approved, owner decision
2026-10-20; a live rail needs a separate owner approval); Shop and Salesbus
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
