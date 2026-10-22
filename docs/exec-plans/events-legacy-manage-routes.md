# Events legacy `/events/manage/*` routes: inventory and retirement plan

**Status:** Phase 1 delivered (inventory plus entitlement kill switch); phases 2 and 3 proposed  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-22  
**Relates to:** ADR-0044 (slice S5), ADR-0025 (org zone), issue #517 (known lows)

## Objective and boundary

The 20 routes under `/events/manage/*` in `apps/api/fastapi/src/events/router.py` predate the
organisation-bound keys. They gate on `EventsOrganiser` / `OrganiserScope` (an active admin or owner
membership of any linked organisation, or the global `events.organiser.manage` permission with a legacy
`organiser_members` row) and never read the `events.*` organisation keys. The org-zone
routes in `org_router.py` (`/events/org/*`) already enforce the keys, the `events` entitlement and the
`X-Barrels-Organisation` header, but cover only orders, attendees, manual payment, refunds and cancel.

Goal: one organiser desk on the org zone, then delete the legacy routes. Phase 1 (this change) makes the
entitlement a real kill switch on the legacy routes without moving any caller. Non-goals here: moving web
callers, deleting routes, owner-only paths, new permission keys, contract changes.

## Phase 1 behaviour (implemented)

`service/organiser_admin.py::my_organisers` is the single choke point (every legacy route except
`POST /manage/organiser` resolves its organiser through `_my_organiser`). A linked organiser now counts
only when its organisation holds an enabled `events` row in `org.organisation_app`; the check is in SQL.

| Caller | Result |
| --- | --- |
| Linked organiser, entitlement on | unchanged |
| Linked organiser, entitlement off or row missing | 403 `Barrels Events isn't enabled for this organisation` (all routes below) |
| Unlinked legacy organiser (`organisation_id` NULL) | unchanged (no organisation to switch off) |
| Superuser / staff | unchanged identity rules; a superuser who is also owner follows the switch like anyone; no bypass |
| Plain member with a grant only | still 403 (unchanged) |
| Member of several organisations | `GET /manage` lists only entitled organisers; naming a switched-off one with `?organiser=` is 403 with the message above |

`POST /manage/organiser` (request an organiser) has no organisation yet and is not gated. The suspended
status of an organisation is still not checked on the legacy routes (org-zone `OrgContext` refuses it):
see open questions.

## Inventory

Gate column: `EO` = `EventsOrganiser` + `OrganiserScope` (organiser_scope). Web caller = generated client
operation used in `apps/web/events/src` (`data/actions.ts` = server actions, `data/events-api.ts` = server
reads). "Org zone today" lists what already exists in `/events/org/*`.

| Route | Operation id | Does | Gate | Target key (ADR-0044) | Org zone today | Web caller |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /manage` | `eventsGetManagedOrganiser` | Organiser workspace: organiser, options, all listings incl. drafts | EO | `events.listings.manage` | none | `events-api.ts` `getManagedOrganiser` |
| `POST /manage/organiser` | `eventsRequestOrganiser` | Create organiser + organisation + owner (pending), 5/hour | EventsMember | none (onboarding, no organisation yet) | none | `actions.ts` `requestOrganiser` |
| `PUT /manage/organiser/logo` | `eventsSetOrganiserLogo` | Set or clear logo upload | EO | `events.listings.manage` | none | `actions.ts` `saveOrganiserLogo` |
| `POST /manage/organiser/resubmit` | `eventsResubmitOrganiser` | Rejected organiser back to review | EO | `events.listings.manage` (owner/admin today) | none | none found |
| `POST /manage/listings` | `eventsCreateManagedListing` | Create draft or published listing + tiers | EO | `events.listings.manage` | none | `actions.ts` `saveListing` |
| `PUT /manage/listings/{id}` | `eventsUpdateManagedListing` | Replace listing and tiers (status `cancelled` cancels, no money) | EO | `events.listings.manage` | none | `actions.ts` `saveListing` |
| `GET /manage/{id}/activity` | `eventsGetListingActivity` | Append-only history | EO | `events.listings.manage` | none | `events-api.ts` `getListingActivity` |
| `POST /manage/{id}/postpone` | `eventsPostponeEvent` | Move a published event | EO | `events.listings.manage` | none | `actions.ts` `postponeEvent` |
| `POST /manage/{id}/cancel` | `eventsCancelEvent` | Cancel event; refund `none` default | EO | `events.listings.manage` | `POST /events/org/events/{id}/cancel` (`eventsOrgCancelEvent`, default `follow_policy`) | `actions.ts` `cancelEvent` (fallback only when the organiser has no organisation), `order-actions.ts` |
| `POST /manage/{id}/admissions` | `eventsAdmitTicket` | Door scan, idempotent | EO | `events.door.scan` | none | `actions.ts` `admitTicket` |
| `GET /manage/{id}/manifest` | `eventsGetManifest` | Door list and counts | EO | `events.door.scan` | `GET /events/org/events/{id}/attendees` (paged, different shape, holder email not shown) | `events-api.ts` `getDoorManifest` |
| `GET /manage/settlement` | `eventsGetOrganiserSettlement` | Settlement summary across events | EO | `events.settlement.view` | none | `events-api.ts` `getSettlementSummaries` |
| `GET /manage/{id}/settlement` | `eventsGetSettlement` | Settlement report | EO | `events.settlement.view` | none | `events-api.ts` `getSettlement` |
| `GET /manage/{id}/settlement.csv` | `eventsGetSettlementCsv` | CSV download | EO | `events.settlement.view` | none | raw fetch in `app/dash/events/[id]/settlement/csv/route.ts` (not the generated client) |
| `POST /manage/{id}/tickets/{tid}/refund` | `eventsRefundTicket` | Manual cash/bank refund of an outlet cash ticket | EO | `events.refunds.issue` | `POST /events/org/orders/{id}/refunds` covers online orders only; cash tickets have no org route | `actions.ts` `refundTicket` |
| `GET /manage/{id}/outlet` | `eventsGetOutlet` | Outlet screen: stock, own till, recent sales | EO | `events.tickets.sell` | none | `events-api.ts` `getOutlet` |
| `POST /manage/{id}/outlet/till` | `eventsOpenTill` | Open cash till | EO | `events.tickets.sell` | none | `actions.ts` `openTill` |
| `POST /manage/{id}/outlet/till/close` | `eventsCloseTill` | Close till with counted cash | EO | `events.tickets.sell` | none | `actions.ts` `closeTill` |
| `POST /manage/{id}/outlet/sales` | `eventsSellOutletTickets` | Cash sale, idempotent | EO | `events.tickets.sell` | none (`/org/orders/{id}/manual-payments` settles existing pending orders only) | `actions.ts` `sellOutletTickets` |
| `GET /manage/{id}/outlet/sales/{oid}` | `eventsGetOutletSale` | Reprint a sale | EO | `events.tickets.sell` | `GET /events/org/orders/{id}` (different shape, no QR tokens) | `events-api.ts` `getOutletSale` |

Missing in the org zone (needed before the legacy routes can go): organiser workspace read, listing
create/update/postpone/logo/activity, door admission and manifest, settlement (summary, report, CSV),
outlet overview, till open/close, outlet sale and reprint, manual cash/bank ticket refund, and an
organiser-selection story (legacy uses `?organiser=<slug>`; the org zone uses `X-Barrels-Organisation`, one
organiser per organisation).

Things that need a decision, not just a port:

- Outlet and door are admin/owner only today (plain members were excluded on purpose because they handle
  cash). Key-based access lets an `events-till` or `events-door` grant holder do it, which is the ADR-0044
  intent but widens who can touch cash.
- Unlinked legacy organisers (`organisation_id` NULL) have no organisation, so no org-zone route can serve
  them. They need linking (data migration or the owner's decision to retire them) before deletion.
- `POST /manage/organiser` and `/resubmit` are organiser lifecycle, not organisation operations: keep
  `/manage/organiser` as a member (`me`) route or rename it to `/events/me/organiser-requests`.

## Phase 2: org-zone routes and web moves (proposed, needs the owner's go)

Additive routes under `/events/org/*` (each with `require_org_permission(..., session_app="events")`,
cross-organisation 404 test, entitlement-off 403 test), then move callers, then mark the legacy route
`deprecated`. Web files to change (hand to `web-engineer`):

1. `apps/web/events/src/data/events-api.ts`: `getManagedOrganiser`, `getListingActivity`, `getDoorManifest`,
   `getOutlet`, `getOutletSale`, `getSettlement`, `getSettlementSummaries` switch to `eventsOrg*` operations
   and pass the organisation id (`data/org-context.ts` already resolves it server-side).
2. `apps/web/events/src/data/actions.ts`: `saveListing`, `saveOrganiserLogo`, `postponeEvent`, `cancelEvent`
   (drop the legacy fallback), `admitTicket`, `openTill`, `closeTill`, `sellOutletTickets`, `refundTicket`;
   `requestOrganiser` stays on the member route.
3. `apps/web/events/src/app/dash/events/[id]/settlement/csv/route.ts`: proxy the org-zone CSV with the header.
4. Screens that call those loaders: `app/dash/events/[id]/{page,door,outlet,settlement}`,
   `app/dash/events/page.tsx`, `app/dash/events/new`. Add a forbidden state for "Events switched off for this
   organisation" (see risk below).
5. Anything in `apps/pwa/pwa-events` when it lands.

## Phase 3: retire (proposed)

Remove the legacy routes after one release with no traffic (check access logs), delete `EventsOrganiser`
/ `organiser_scope` / `?organiser=`, drop the `organiser_members` fallback after linking legacy organisers,
regenerate `openapi.json` and the client (breaking: needs the owner's go-ahead,
`node scripts/api/check-api-breaking.mjs --base origin/dev`).

## Risks and open questions

- A switched-off organisation now gets 403 on `GET /manage`. The web app may read a 403 there as "not an
  organiser" and offer the "request an organiser account" flow. Phase 2 (or a small web fix) should show the
  entitlement message instead; the API message is `Barrels Events isn't enabled for this organisation`.
- Suspended organisations are not refused on the legacy routes (`OrgContext` does refuse them). Add in phase 2
  by construction, or sooner with a `PlatformOrganisation.status` check in `my_organisers`?
- Org-linked organisers created before `eventsentitlement20261022` and later switched off by staff on purpose
  stay off; organisers linked after it get the row at creation. A linked organisation with no row (for example
  a manual SQL link) is now refused.
- Outlet cash access widening under keys (above) is an owner decision.
- `ensure_events_entitlement` never re-enables a row staff switched off; there is no self-service way back.
