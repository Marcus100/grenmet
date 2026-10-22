# First-party analytics design

**Status:** Deferred (owner decision 2026-10-22, [ADR-0045](../adr/0045-analytics-external-free-tools-first-party-deferred.md)); nothing here is built
**Owner:** Barrels Grenada engineering
**Last updated:** 2026-10-22

Kept on file so the work can start quickly if ADR-0045's revisit triggers fire.

## Starting point

No paid analytics tool exists. Browser analytics is consent-gated GA4 on seven
production origins; PostHog is wired but off (all mappings empty). Neither sees
server truth. Events has since moved into the APP database (schema `events`, see
`apps/api/fastapi/src/events/models.py` and `apps/api/fastapi/src/events/AGENTS.md`;
ADR-0003 is stale on this and the owner will amend it separately), so every
product table named below is in one database.

## Goals

- Page views for public sites.
- Booking funnel from server truth: `bookings` `transition()` and `BookingEvent`.
- Events funnel from the `events` schema.
- Organisation product usage (per-organisation daily counts).
- Visitor data owned by Barrels (ADR-0033), no IP storage, privacy by default.

## Non-goals

- Cross-site user tracking, fingerprinting, ad attribution or session replay.
- Replacing Sentry (errors) or uptime checks.
- Personal data in events; no user ids, emails or free text.

## Data model

Schema `analytics` in the APP database:

| Table | Holds | Retention |
| --- | --- | --- |
| `event` | raw events (site, name, day, device class, validated props) | 35 days |
| `daily_rollup` | per-site, per-event daily counts and unique visitors | 25 months |
| `org_usage_daily` | per-organisation product usage counts | 25 months |
| `site` | registry of allowed sites and origins | kept |

- `visitor_hash = BLAKE2b(day_salt, site, ip, ua)[:16]`. The day salt lives only
  in Redis with a 48-hour life, so hashes cannot be linked across days or
  recomputed later. The IP is never stored. The user agent is reduced to a device
  class before storage.
- DNT and GPC are honoured: no event is recorded.

## Collection

1. Browser beacon to same-origin `/api/a` (a Next.js proxy only; no logic).
2. Proxy forwards to FastAPI `POST /api/v1/analytics/public/events`: rate limit,
   origin allowlist from the `site` registry, event catalogue validation.
3. Accepted events are appended to a Redis stream.
4. An ARQ drain cron writes batches to `analytics.event`.
5. Nightly ARQ jobs build rollups and purge expired rows.

Server-truth events (booking transitions, ticket sales) are emitted in-process
from the owning service, not from the browser.

## Reads

- Admin summary: global permission key `analytics.read`.
- Organisation summary: organisation-bound key `analytics.view` (binding
  `organisation`, ADR-0044, status Proposed), scoped to the caller's organisation.

Both keys would be added to `src/auth/permissions.py` (owner-reviewed).

## Build vs adopt

| | Build first-party | Umami (MIT) | Plausible CE (AGPL, ClickHouse) |
| --- | --- | --- | --- |
| Cost | Engineering time only | Free; run a service plus Postgres | Free; run app, Postgres and ClickHouse |
| Server-truth funnels | Yes | No (client events only) | No (client events only) |
| Per-organisation usage | Yes | Awkward (one site per org) | Awkward |
| Data ownership | Full, in APP | Full, separate store | Full, separate store |
| Ops burden | Low: reuses Redis, ARQ, Postgres | Medium | Highest (ClickHouse) |
| Licence | Ours | MIT | AGPL obligations |

Recommendation: build, because only a first-party design reaches booking and
Events server truth and per-organisation usage inside existing infrastructure.
What would change it: if only page-view stats are ever needed, adopt Umami; if the
owner accepts AGPL and ClickHouse for richer web reports, Plausible CE.

## Risks

- Public ingest endpoint: abuse, spam events, inflated counts (rate limits and
  origin allowlist mitigate, not eliminate).
- Privacy/legal: consent rules and Grenada data-protection law are unconfirmed.
- Hash design mistakes could make visitors linkable; needs security review.
- Storage growth if retention or event volume is mis-set.
- Two sources of truth while GA4 stays on.

## Slice plan

| Slice | Scope | Risk tier |
| --- | --- | --- |
| A0 | Event catalogue, `site` registry and design review; no runtime | standard |
| A1 | Public ingest endpoint, rate limit, origin allowlist, Redis stream, `/api/a` proxy | high |
| A2 | ARQ drain, `analytics` schema and migration, raw `event` table | standard |
| A3 | Nightly rollups and retention purge | standard |
| A4 | Admin and organisation summary routes, permission keys | high |
| A5 | Server-truth emitters (bookings, Events) and `org_usage_daily` | high |
| A6 | Dashboards in admin and the organisation consoles; decide GA4 shutdown | standard |

## Open owner decisions

- Consent banner and legal advice: does first-party, cookieless counting need
  consent in Grenada?
- Retention: confirm 35 days raw and 25 months rollups.
- Referrer hosts: reviewed allowlist before any campaign collection.
- When to turn off GA4 once first-party numbers are trusted.
