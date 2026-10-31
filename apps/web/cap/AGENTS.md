# cap (`@barrelsgd/web-cap`) — agent context

Port **3010**. Host `cap.barrels.gd`. The GMS-branded public CAP alert hub:
active alerts, map, alert detail, history, machine feeds and about/terms.
Plan: "30-day plan" in `docs/exec-plans/barrels-foundations-plan.md`. Design
lane: `docs/design/gms.md` (GMS palette via `@barrelsgd/gms`, `--gm-*` tokens).
Backend and public-feed contract: `apps/api/fastapi/src/cap/AGENTS.md`.

## Boundary

- **Public pages stay public and read-only.** Everything outside `/desk` and
  `/auth` has no sign-in, never reads cookies or headers, and keeps the edge
  cache header. Pages live in the `(public)` route group (header and footer);
  the root layout is the document shell only.
- **Staff warning desk under `/desk` (ADR-0054).** Registry key `cap`, staff
  scope (ADR-0017): `/desk/signin` -> `/auth/start` -> auth.barrels.gd ->
  `/auth/callback` (needs `CAP_SSO_CLIENT_SECRET`; unset, sign-in says it is
  off). `src/proxy.ts` runs only for `/desk*` and checks the cookie exists;
  `lib/desk/gate.ts` is the real check (staff token plus `cap.alert.read`),
  called by every page. `/desk*` and `/auth/*` send `private, no-store` and
  `X-Robots-Tag: noindex` (`next.config.ts`). Cloudflare's cache rules
  (`scripts/production/cloudflare-cache-rules.py`) cache static assets only and
  bypass `*_session` cookies, which already keeps the desk out; keep
  `/desk` and `/auth/` listed in its never-cache rule too. Browser calls use `@barrelsgd/api-client` with base URL
  `/desk`, through `app/desk/api/[...path]/route.ts`: an allow-list
  (`lib/desk/proxy-rules.ts`), a same-origin check for changes, minimal
  headers, the token added server-side. Add a rule there before using a new
  endpoint from the desk. Server reads: `lib/desk/api.ts`.
- **Desk scope.** Board, new warning, edit draft (PATCH), validate, submit,
  review, approve, publish, emergency publish, cancel, expire and Issue update
  (`POST /cap/alerts/{id}/updates`). Imported alerts are flagged and need the
  "checked against the source" tick (`confirm_imported`). The editor reads the
  GMS catalogue from `/cap/gms-catalogue`; `lib/desk/alert-form.ts` turns a
  saved draft back into the form and carries over everything the form does not
  show (other info blocks, parameters, resources, references are never sent).
  The area picker restores parishes, one circle or one polygon only when it
  would rebuild the same area; anything else is kept as saved. Admin screens
  (settings, areas, feeds, profiles, import, audit) are still in GAA Admin,
  whose desk keeps working during the parallel run
  (`docs/operations/cap-desk-acceptance.md`).
- Pages and feed routes only validate, proxy to or render FastAPI's public
  endpoints (`/api/cap/latest-active`, `/past`, `/alerts/{id}`,
  `/alerts.geojson`, `/rss.xml`, `/{id}.xml`). No database access, no warning
  rules. GMS owns warning policy; this app displays it.
- Do not import `apps/web/gms` code. Shared presentation comes from
  `@barrelsgd/gms`. The severity-to-level mapping in `src/lib/alerts.ts`
  mirrors `apps/web/gms/src/lib/cap-alerts.ts` and must stay in step with it.
- No sample data, ever. An empty feed and an unreachable feed are different
  states and must never look alike.

## Behaviour that must not regress

- **Honest failure.** `src/lib/feed-client.ts` keeps the last good answer per
  path (in process memory, six hours at most). On an API error pages show it
  flagged "Live updates are not reachable right now" with its time; with none,
  they show "Alert service temporarily unreachable" and say it is not an
  all-clear. Expired alerts are filtered at render time, so last-known-good can
  never resurrect an ended warning. 404 is "not found", never a fallback.
- **Staleness.** `FeedStatus` shows "Last updated HH:MM" in Grenada time.
  `StaleGuard` (the only client component besides the print button and error
  boundaries) warns in the browser when a cached page is five minutes old,
  because an edge-cached page cannot know its own age.
- **Edge caching.** Pages are `force-dynamic` (a build never bakes in a feed
  answer) and `next.config.ts` sets `s-maxage=60, stale-while-revalidate=300,
  stale-if-error=86400` so Cloudflare can serve the last good page while the
  origin is down. Feed routes under `/feeds/*` set their own 30 s headers.
- **Severity by text.** Cards and the map list always state severity, urgency
  and certainty in words; colour is additional. The map is an inline SVG drawn
  on the server from the GeoJSON, with no map library and no client JS. It
  shows alert areas and approximate place markers, not coastlines.
- **Weight.** About 106 KB gzip of first-load JavaScript for modern browsers.
  Keep public pages under 120 KB: no client Sentry SDK or analytics, no client
  components beyond those named above. Desk code (maps, editor) must stay
  under `app/desk` and `components/desk` so it never reaches a public page.

## Routes

`/` active alerts, `/map`, `/alerts/[id]`, `/history?page=N` (the API returns
the whole past list, paged here, 20 per page), `/feeds`, `/about`,
`/feeds/rss.xml`, `/feeds/alerts.geojson`, `/feeds/latest-active.json`,
`/feeds/alerts/<identifier>.xml` (proxies of the API feeds), `/api/health`.
Staff: `/desk`, `/desk/new`, `/desk/alerts/[id]`, `/desk/alerts/[id]/edit`,
`/desk/signin`, `/desk/api/...` (proxy), `/auth/start|callback|logout`.
E2E smoke: `pnpm --filter @barrelsgd/web-cap test:e2e` (needs the dev server).

## Commands

```bash
pnpm dev:web:cap                          # host only
pnpm --filter @barrelsgd/web-cap test
pnpm --filter @barrelsgd/web-cap type-check
```

Subscriptions (email, web push) are not built; About links to the GMS "get
alerts" page until they land.
