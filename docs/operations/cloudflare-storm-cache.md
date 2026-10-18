# Cloudflare storm cache runbook (GMS public site)

Goal: during a storm or an origin outage, people still get the last good alerts,
CAP feeds and satellite images. Cloudflare serves a stale copy when the origin
(Next.js on the server, FastAPI, database) is down. Free plan features only.

## What the origin already sends

Source of truth: `apps/web/gms/src/lib/storm-cache.ts`.

| Path | Cache-Control |
| --- | --- |
| `/alerts` and `/alerts/*` (pages) | `public, max-age=60, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400` |
| `/api/alerts/rss`, `/api/alerts/geojson` (CAP feed proxies) | same; errors are `no-store` |
| `/api/satellite/{id}` (GOES image proxy) | `public, max-age=60, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400` |
| FastAPI `GET /api/v1/wxwatch/public/latest` | `public, max-age=60, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400` |
| FastAPI `GET /api/v1/wxwatch/public/images/{id}` | `public, max-age=3600, s-maxage=86400, stale-if-error=86400` (signed redirect: `max-age=30`) |

Errors (5xx) are never cacheable (`no-store`), so a bad response is not stored.

## Cloudflare settings (dashboard, one-off)

1. **Cache Rules**: create a rule "GMS storm paths". Match `(http.host eq "<gms host>") and (starts_with(http.request.uri.path, "/alerts") or starts_with(http.request.uri.path, "/api/alerts/") or starts_with(http.request.uri.path, "/api/satellite/"))`. Action: *Eligible for cache*, *Edge TTL: use cache-control header if present*, *Browser TTL: respect origin*.
2. Add the same rule for the API host for `/api/v1/wxwatch/public/*` and `/api/cap/*` (the CAP feed and attachments).
3. **Always Online / serve stale**: Cloudflare honours `stale-if-error` and `stale-while-revalidate` from the origin on cached assets. Also enable *Always Online* (Caching > Configuration) as a backstop for pages the origin never marked cacheable.
4. Do not cache: `/auth/*`, `/api/health`, anything with cookies. The rule above lists only the safe paths; keep it an allowlist.
5. After enabling, check a path twice: `curl -sI https://<host>/alerts | grep -i 'cf-cache-status\|cache-control'`. Expect `HIT` on the second request.

## Outage drill (5 minutes)

1. Load `/alerts`, `/api/alerts/rss` and `/weather/satellite` so they are cached.
2. Stop the web container (or block the origin). Reload the same paths: they still answer from Cloudflare (`cf-cache-status: STALE` or `HIT`).
3. Start the origin again; the next request refreshes the copy within a minute.

A cached alerts page can be up to `s-maxage` (60 s) plus one revalidation behind. A
cancelled alert may still show for that short window and for as long as the
origin is down. That is why every page also carries its own time and source line.

## Static last-known-good snapshot (no origin needed)

After any CAP publish, update or cancel the worker (job `publish.last_known_good`,
`apps/api/fastapi/src/worker/last_known_good.py`) rewrites two objects in object
storage: `alerts/last-known-good.json` and `alerts/last-known-good.html`. They hold
only active Public Actual alerts and no scripts or external assets. Skipped cleanly
when storage is not configured.

The bucket is private. To make the snapshot reachable while the API is down, an
owner decision is needed: expose only the `alerts/` prefix through the CDN base
(`STORAGE_PUBLIC_BASE_URL`, see `docs/env.md`) with a bucket or CDN rule that allows
that prefix and nothing else (never `wxwatch/`, `cap/` or `org/`). Then point a
Cloudflare Worker route or a fallback link at `<STORAGE_PUBLIC_BASE_URL>/alerts/last-known-good.html`.
Do not make the whole bucket public.
