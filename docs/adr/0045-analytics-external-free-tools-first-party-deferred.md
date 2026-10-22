# ADR-0045: Analytics stays on free external tools; first-party analytics deferred

## Status

Accepted (2026-10-22, owner).

## Context

- Browser analytics is Google Analytics 4 (GA4) on the free tier. Seven public
  production origins have a GA4 mapping in `packages/ui/src/lib/service-catalogue.json`.
  Collection is consent-gated and production-only: staging, development and
  previews never collect (`docs/operations/analytics-monitoring.md`).
- PostHog is wired in the shared runtime (`packages/ui/src/lib/analytics-runtime.ts`)
  but every PostHog mapping in the catalogue is empty, so it is off.
- No paid analytics tool exists. The owner rule is free/open-source only for now.
- The API already uses Redis-backed counters for rate limiting, but there is no
  request or usage analytics store.
- Client-side tools cannot see server truth (a booking confirmed, a ticket sold,
  per-organisation usage). A first-party design that could was drafted; see
  `docs/exec-plans/first-party-analytics-design.md`.

## Evidence

- **Facts**
  - Seven production origins carry a GA4 ID; PostHog mappings are all empty. (high)
  - GA4 properties are set to two-month event retention and 14-month user
    retention, with Google signals off (`docs/operations/analytics-monitoring.md`). (high)
  - Bookings state changes go through `transition()` and `BookingEvent`
    (`apps/api/fastapi/src/bookings`), and Events now lives in the APP database
    (ADR-0003). (high)
- **Interpretation**
  - Current needs (page views, selected interactions on public sites) are met by
    the free tier. (medium)
  - Funnels per organisation or booking would need server-side events. (medium)
- **Uncertainty:** legal position on consent and Grenada data-protection
  obligations for a first-party store; GA4 limits once traffic grows.

## Options considered

- **A. Stay on free external tools (chosen).** No build cost; consent banner and
  catalogue already shipped. Data sits with Google; no server-truth funnels.
- **B. Build first-party analytics now.** Full data ownership (ADR-0033) and
  server-truth funnels, but a new module with high-risk slices (public ingest,
  privacy) for needs not yet felt.
- **C. Adopt a self-hosted open-source tool (Umami, Plausible CE).** Free
  software, more ownership than GA4, but a new service to run and still blind to
  server truth.
- **D. Paid vendor.** Rejected by the free/open-source rule.

## Decision

Choose A.

1. Keep GA4 (free tier, behind consent, production only) and keep PostHog wired
   but off. Build no first-party analytics module yet.
2. Free/open-source only. A paid tier is considered only after the owner sees the
   cost, flagged before any build.
3. If external tools stop being enough, the preferred upgrade path is a
   self-hosted open-source tool (Umami or Plausible CE) over a paid vendor, unless
   the triggers below point to the first-party build.
4. The first-party design is deferred and kept on file in
   `docs/exec-plans/first-party-analytics-design.md`.

## Revisit when

- We need funnels per organisation, booking or Events from server truth.
- Data ownership under [ADR-0033](0033-data-ownership.md) becomes a concern for
  visitor data held by Google.
- GA4 retention or quota limits block real questions.
- Legal advice on consent or Grenada data-protection changes what we may collect.

## Consequences

- Easier: no new service, schema or public ingest endpoint to secure and run.
- Harder: no per-organisation product usage and no server-truth funnels; visitor
  data stays with Google under its retention settings.
- Org-bound read keys for a future analytics view would follow
  [ADR-0044](0044-organisation-scoped-permissions-via-membership-grants.md).
- No code, catalogue or consent behaviour changes with this ADR.
