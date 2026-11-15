# Cloudflare storm cache runbook (GMS public site)

**Status:** Active runbook — rules scripted, not yet applied  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-15

Goal: during a storm or an origin outage, people still get the last good alerts,
CAP feeds and satellite images. Cloudflare serves a stale copy when the origin
(Next.js on the server, FastAPI, database) is down. Free plan features only.

**Owner decision (2026-11-15):** during storms Cloudflare may cache public,
same-for-everyone weather feeds for about a minute (alerts, satellite), and
static assets longer; never anything signed-in, personal, or that changes data.
This resolves decision 2 of the [Cloudflare proxy runbook](cloudflare-proxy.md).

## What the origin sends

Sources of truth: `apps/web/gms/src/lib/storm-cache.ts` (weather site),
`apps/api/fastapi/src/cap/router.py` (`PUBLIC_FEED_CACHE`) and
`apps/api/fastapi/src/wxwatch/public_router.py`. Every header below keeps the
edge copy for at most 60 seconds (`s-maxage`); tests fail if one grows.

| Host | Path (GET) | Cache-Control |
| --- | --- | --- |
| weather | `/alerts` and `/alerts/*` (pages) | `public, max-age=60, s-maxage=60, stale-while-revalidate=60, stale-if-error=86400` |
| weather | `/api/alerts/rss`, `/api/alerts/geojson` (CAP feed proxies) | same; errors are `no-store` |
| weather | `/api/satellite/{id}` (GOES image proxy) | same; errors are `no-store` |
| api | `/api/cap/latest-active`, `/alerts`, `/past`, `/alerts/{identifier}`, `/alerts.geojson`, `/active-map`, `/rss.xml`, `/{identifier}.xml` | `public, max-age=0, s-maxage=60, stale-if-error=86400` |
| api | `/api/cap/warnings`, `/api/cap/alerts/{identifier}/attachments/{kind}` (60-second signed redirect) | `no-store`: never cached |
| api | `/api/v1/wxwatch/public/latest` | `public, max-age=60, s-maxage=60, stale-while-revalidate=60, stale-if-error=86400` |
| api | `/api/v1/wxwatch/public/images/{id}` | `public, max-age=3600, s-maxage=60, stale-if-error=86400` (signed redirect: `public, max-age=30`) |

Errors (404, 5xx) carry no cacheable header (or `no-store`), so a bad response
is not stored. `stale-if-error` lets Cloudflare keep serving the last good copy
for up to a day, but only while the origin is failing.

## Cloudflare settings

The cache rules are scripted: `scripts/production/cloudflare-cache-rules.py`
(plan by default, `--apply` to write; order of work in the
[Cloudflare proxy runbook](cloudflare-proxy.md), step 4). Its last rule,
`grenmet-<env>-storm-feeds`, runs after the "never cache" rule and makes only
these requests eligible for cache:

- `GET` on `weather.<domain>`: `/alerts` exactly, `/alerts/*`,
  `/api/alerts/rss` and `/api/alerts/geojson` exactly, `/api/satellite/*`;
- `GET` on `api.<domain>`: `/api/cap/*` (public feeds; the staff routes are
  `/api/v1/cap/*` and stay uncached) and `/api/v1/wxwatch/public/*`;
- and never when the request has a session cookie (`_session`,
  `payload-token`), an `Authorization` header or an `Origin` header.

Edge and browser TTL are "use cache-control header if present, bypass cache if
not", so the origin headers above set the minute and anything unmarked is never
stored. Not cached: `/api/alerts/push` and `/api/alerts/subscribe` (sign-ups),
everything else under `/api/`, every other host, and router aliases such as
`api.weather.gd` (the rule names this environment's hosts only).

1. **Always Online / serve stale**: Cloudflare honours `stale-if-error` and
   `stale-while-revalidate` from the origin on cached responses. Also enable
   *Always Online* (Caching > Configuration) as a backstop for pages the origin
   never marked cacheable.
2. After applying, check a path twice on production (staging's basic-auth
   header bypasses the cache):
   `curl -sI https://weather.barrels.gd/alerts | grep -i 'cf-cache-status\|cache-control'`.
   Expect `MISS` then `HIT`, and `BYPASS` or `DYNAMIC` with
   `-H 'Cookie: weather_session=probe'`.

## Outage drill (5 minutes)

1. Load `/alerts`, `/api/alerts/rss` and `/weather/satellite` so they are cached.
2. Stop the web container (or block the origin). Reload the same paths: they still answer from Cloudflare (`cf-cache-status: STALE` or `HIT`).
3. Start the origin again; the next request refreshes the copy within a minute.

A cached alerts page can be up to `s-maxage` (60 s) old, plus up to another
minute while Cloudflare refreshes it in the background (`stale-while-revalidate=60`).
A cancelled alert may still show for that short window and for as long as the
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
