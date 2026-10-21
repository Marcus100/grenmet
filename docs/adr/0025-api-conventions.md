# ADR-0025: API conventions — DRY, frontend-agnostic, clear endpoints

## Status

Accepted — 2026-10-19 by the project owner. Enforced by
`apps/api/fastapi/tests/test_api_conventions.py`. Migration slices: N1–N4 in the
[Barrels foundations plan](../exec-plans/barrels-foundations-plan.md#api-conventions).

## Context

The FastAPI monolith serves many apps: GAA staff tools, public sites, client sites
such as Babydoll Beauty Bar, and future mobile, kiosk and partner clients. The
owner wants one API that is DRY, frontend-agnostic and predictable to call.

## Evidence

- **Facts (2026-10-19, `openapi.json`):**
  - 432 paths and 518 operations. Every operation has an operation ID and a
    description (`tests/test_openapi_contract.py`). No path uses a verb, and
    every literal segment is kebab-case. (high)
  - `ZoneInfo("America/Grenada")` was built in 16 places, with two more fixed
    UTC-4 offsets. (high)
  - Routers were mounted with two styles: a literal `"/api/v1"` 43 times and
    `settings.API_V1_STR` 17 times. (high)
  - Two `RolePublic` classes (auth and HR) made OpenAPI emit
    `src__auth__schemas__RolePublic`, which leaked into generated TypeScript
    names. (high)
  - Audience words varied: `me` (33 paths), `manage` (19), `staff` (9),
    `studio` (9), `admin` (5), `public` (10), `mine` (1). (high)
  - Ten CAP feed paths live outside `/api/v1` (`/api/cap/*`). (high)
  - Public forms name their site with an unauthenticated `site` field, and per-site
    settings are environment variables branched in code
    (`contact/config.py:recipient_for`, `SUBSCRIPTIONS_SITE_URLS`). (high)
  - Sign-in is designed around per-app browser sessions (ADR-0016). (high)
- **Interpretation:**
  - Naming and structure are mostly consistent already. A test that fixes the
    rules plus a shrink-only allowlist stops drift at low cost. (best practice,
    high)
  - Per-site environment settings do not scale to many client organisations.
    (heuristic, high)
- **Uncertainty:** who consumes the CAP feeds outside Barrels. That is why their
  URLs stay.

## Options considered

1. **Document only.** Cheap, but drift continues.
2. **Big-bang rename of every inconsistent route.** Breaks live apps and outside
   consumers at once.
3. **Rules enforced by a test, existing exceptions on a shrink-only allowlist, and
   migration domain by domain with deprecated aliases (chosen).**

## Decision

1. **Frontend-agnostic.**
   - The API speaks HTTP and JSON, and its contract is the generated OpenAPI.
     Any client (web, mobile, kiosk, bot, partner) can generate a client from it.
   - Times are UTC on the wire (`Z`), with an IANA timezone when local display
     matters. Money is in integer minor units with an ISO currency code.
   - No HTML responses except deliberate documents (PDF, ICS, CAP XML, RSS).
     No assumptions about a framework or a specific site.
   - Links to an organisation's own pages come from that organisation's settings,
     never from hard-coded or per-site environment URLs.
   - Next.js route handlers may only proxy (ADR-0015).
2. **Clear endpoints.**
   - Every route sits under `settings.API_V1_STR`, except the public CAP feeds.
   - Path segments are kebab-case nouns, parameters are `{snake_case}`, and HTTP
     methods carry the action. Trailing action sub-resources are allowed for state
     changes (`POST /bookings/{id}/cancel`).
   - The segment after the domain names the audience zone:
     - `public`: no sign-in, keyed by a public slug or token.
     - `me`: the signed-in person.
     - `org`: the organisation in `X-Barrels-Organisation`, through `OrgContext`.
     - `admin`: Barrels superusers or a named permission.
   - Existing `manage`, `mine` and `dashboard` zones stay on an allowlist that may
     only shrink.
   - Schema and enum names are unique across the API. Domain prefixes (for example
     `Booking*`) prevent collisions, and no `src__` names reach the client.
3. **DRY.**
   - One shared helper per cross-cutting concern: `src/utils/timezones.py`
     (`GRENADA`, `zone()`), `utc_now`, `OrgContext`, pagination, error shapes,
     Turnstile and the rate limiter. A helper repeated in two domains moves to
     `src/utils` or a platform domain.
   - Configuration that differs per organisation lives in organisation-scoped
     tables, not per-site environment variables or `if site ==` branches.
4. **Changing routes.** Add the new path, keep the old one as a deprecated alias,
   regenerate the client, move every consumer over, then delete the alias and its
   allowlist entry.

## Consequences

- New routes that break a rule fail CI with a message naming the fix.
- Bookings uses `/bookings/public/*` and `/bookings/org/*` from the start.
- Follow-up slices (N1–N4) move per-site configuration into organisation tables,
  migrate the legacy zones, give public forms an organisation-owned public key,
  and add a non-browser credential (organisation API keys or tokens). N4 no
  longer waits for the first client: ADR-0029 reversed that on 2026-10-20 and
  built API keys and webhooks ahead of need.
