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
| F8 | Organisation-scoped uploads (presigned, size and type limits) | M | U |
| E1 | Orders and tickets for free and registration tiers; inventory guard; QR ticket page | L | U |
| E2 | Idempotent admission scans, duplicate rejection, printable manifest | M | U |
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
unchanged) moves to `gms-admin.barrels.gd`, freeing `admin.barrels.gd` for the
Barrels control plane (C1).

1. **Done:** `docker-compose.deploy.yml` serves the portal on both `admin.*` and
   `gms-admin.*` (separate Traefik router and certificate), and both origins are
   in `BACKEND_CORS_ORIGINS`. The sign-in return-to allowlist already accepts any
   `.barrels.gd` subdomain.
2. **Owner:** add Cloudflare DNS records for `gms-admin.staging.barrels.gd` and,
   when production is approved, `gms-admin.barrels.gd`.
3. **After DNS is verified on staging:** point `GAA_ADMIN_APP_URL` at
   `gms-admin.*`, update the service catalogue origin, email links
   (`packages/email-templates/src/notification.tsx`) and docs, then redirect
   `admin.*` to `gms-admin.*`.
4. **C1:** once the redirect has run for a while, `admin.*` routes to `apps/web/admin`.

## Known documentation conflicts to fix

- `barrelsgd-transition.md` names the `admin.barrels.gd` package differently in
  two places (`@barrelsgd/web-gaa-admin` on port 3001 versus `apps/web/admin`).
  This plan uses `apps/web/admin` on port 3012.
- The planned hub port 3006 collides with CMS, and Salesbus 3010 collides with the
  planned CAP app (`docs/ports.md`). Resolve these in C1.
