# ADR-0054: CAP warning desk on the cap host, behind single sign-on

## Status

Proposed — 2026-10-31. Pending GMS sign-off after the parallel run
(`docs/operations/cap-desk-acceptance.md`). Builds on ADR-0017 (single sign-on),
ADR-0023 (approval gate) and ADR-0007 (CAP-XML, audit, feeds).

## Context

CAP authoring lives in GAA Admin (`apps/web/gaa-admin/(admin)/cap`), a portal
that folds five modules together. The public alert hub (`apps/web/cap`,
`cap.barrels.gd`) shows the same warnings. The CAP desk move design (option A,
2026-10-30) chose to move authoring next to the public hub so the warning
service has one home. Before launch the desk also lacked two things upstream
cap-composer has: editing a saved draft and issuing an Update of a published
warning.

`cap.barrels.gd` is a public, edge-cached host: its pages send
`s-maxage=60, stale-if-error=86400` so Cloudflare can serve the last good page
while the origin is down.

## Evidence

- **Facts:** `next.config.ts` applied the edge-cache header to every path except
  `_next`, `api` and `feeds`. High.
- **Facts:** `@barrelsgd/auth` pins the single sign-on state cookie to path
  `/auth`, so the start and callback routes must be `/auth/start` and
  `/auth/callback`. High.
- **Facts:** session cookies are `SameSite=Lax` and host-only; other
  `*.barrels.gd` hosts are the same site, so a Lax cookie reaches a request one
  of them sends. High.
- **Facts:** `service.duplicate_alert` sets CAP status `Draft` and copies the
  original's references; the publish-time reference check requires the same
  status, sender, scope and exact `sent`. A duplicate therefore cannot become a
  valid Update. High.

## Options

1. Keep authoring in GAA Admin only. Least work; leaves the desk inside the
   most cross-cutting app.
2. **Desk at `cap.barrels.gd/desk`, staff single sign-on (chosen).** Registry key
   `cap`, staff scope, so ordinary staff tokens keep every `/api/v1/cap/*`
   permission check. Staff paths `/desk*` and `/auth/*` send
   `private, no-store`; public pages never read cookies.
3. A separate host (`desk.barrels.gd`). Clean cache separation, but another
   certificate, DNS record and app for one screen.

## Decision

Option 2, run in parallel with GAA Admin's desk until GMS signs off:

- Pages under `/desk`; a server-side gate on every page (staff token plus
  `cap.alert.read`); FastAPI re-checks each call.
- Browser calls go through `/desk/api/...`: an explicit allow-list of CAP
  routes, a same-origin check for changes (Lax cookies reach same-site hosts),
  the token added server-side, nothing cached.
- Cloudflare's cache rules (static assets only; bypass for `*_session` cookies) already keep the desk out of the cache, and the never-cache rule names `/desk` and `/auth/` as well.
- New API: `POST /api/v1/cap/alerts/{id}/updates` (Issue Update) and
  `snapshot.schema_mismatch` on publish (the emergency path says it went out
  with a format problem). Edit draft uses the existing
  `PATCH /api/v1/cap/alerts/{id}`.
- GAA Admin links "Try the new desk"; nothing is removed there.

## Consequences

- One more SSO secret per environment (`CAP_SSO_CLIENT_SECRET`); empty keeps the
  desk's sign-in off without affecting public pages.
- The public host now carries staff traffic: a cache rule mistake could store a
  staff page. Headers say `no-store`, an e2e smoke checks them, and the
  acceptance script checks them on staging.
- Cutover (redirect `gms.../cap` to the desk) and retiring GAA Admin's CAP
  screens are later, separate decisions. Admin screens (settings, areas, feeds,
  profiles, import, audit) still need porting first.
