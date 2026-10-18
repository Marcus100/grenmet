# cap (`@barrelsgd/web-cap`) — agent context

Port **3010**. Host `cap.barrels.gd`. The GMS-branded public CAP alert hub:
active alerts, map, alert detail, history, machine feeds and about/terms.
Plan: "30-day plan" in `docs/exec-plans/barrels-foundations-plan.md`. Design
lane: `docs/design/gms.md` (GMS palette via `@barrelsgd/gms`, `--gm-*` tokens).
Backend and public-feed contract: `apps/api/fastapi/src/cap/AGENTS.md`.

## Boundary

- **Public and read-only for now.** No sign-in, cookies or CORS. CAP authoring
  behind sign-in moves here from `apps/web/gaa-admin` later; do not add it
  without a task for it.
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
  Keep it under 120 KB: no client Sentry SDK or analytics, no client
  components beyond those named above.

## Routes

`/` active alerts, `/map`, `/alerts/[id]`, `/history?page=N` (the API returns
the whole past list, paged here, 20 per page), `/feeds`, `/about`,
`/feeds/rss.xml`, `/feeds/alerts.geojson`, `/feeds/latest-active.json`,
`/feeds/alerts/<identifier>.xml` (proxies of the API feeds), `/api/health`.

## Commands

```bash
pnpm dev:web:cap                          # host only
pnpm --filter @barrelsgd/web-cap test
pnpm --filter @barrelsgd/web-cap type-check
```

Subscriptions (email, web push) are not built; About links to the GMS "get
alerts" page until they land.
