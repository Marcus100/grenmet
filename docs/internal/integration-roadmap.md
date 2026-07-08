# Systems Integration Roadmap

How the GMS data systems — the grenmet monorepo (FastAPI, web apps), SURFACE
CDMS, wis2box, geonetcast, and the Scrapy pipeline — become one connected
estate. Decided 2026-07-08. Ordering principle: **data flows → presentation →
identity**; each phase ships standalone value and makes the next one cheaper.

Related: [programme roadmap](./roadmap.md) ·
[ADR-0010 WIS2 publishing via SURFACE](../adr/0010-wis2-publishing-via-surface-builtin.md) ·
[data architecture](../data-architecture.md) · [VENDORED.md](../../VENDORED.md)

## Phase 1 — Observation data flow: stations → SURFACE → wis2box → WIS2

**Goal:** QC-archived national observations publish to the global WIS2 network
automatically, eliminating manual double entry into SURFACE and wis2box.

**Approach:** configure SURFACE's built-in WIS2 publisher (Celery →
WMO CSV → wis2box MinIO `wis2box-incoming`; see ADR-0010). No new bridge code.
Local wis2box is the sandbox; the WMO-registered production wis2box (separate
machine) is cut over to in a gated final step.

- **Entry criteria:** both host stacks running; SURFACE stations audited
  (WIGOS ids, data freshness); pilot station selected.
- **Exit criteria:** pilot station publishes end-to-end on the sandbox
  unattended for 24 h (7-point checklist in the
  [runbook](../operations/wis2-publishing-runbook.md)); all
  `international_exchange` stations enabled; production cutover complete and
  WDQMS shows Grenada synop counts at hourly cadence.
- **Status:** in progress (Stage 0 audit).

## Phase 2 — geonetcast: automated satellite imagery service

**Goal:** GOES/GNC-A satellite data landing on the receiver machine is
processed into imagery/animations on a schedule and archived with metadata,
viewable in admin-gms — no manual notebook runs for routine products.

**Approach:** promote the top routine notebook workflows (`geonetcast/`) into a
scheduled pipeline following the Scrapy → `wxwatch` precedent (standalone
script, own DB credentials, metadata rows + files in storage). Notebooks remain
for research.

- **Entry criteria:** receiver machine reachable; 2–3 routine products chosen;
  storage target decided (wxwatch-style DB + object storage).
- **Exit criteria:** chosen products regenerate automatically on new satellite
  data; imagery browsable in admin-gms; failure alerting exists.
- **Status:** planned.

## Phase 3 — Forecaster dashboard (presentation layer)

**Goal:** one internal admin-gms surface showing current observations
(SURFACE), latest satellite imagery (Phase 2 archive), active CAP alerts
(FastAPI CAP domain), and wis2box publication health.

**Approach:** read-only panels in admin-gms; consume SURFACE and wis2box via
their existing APIs; batch freshness (Phase 1 decision) — no realtime plumbing.

- **Entry criteria:** Phases 1–2 pipes flowing (a dashboard before the pipes is
  just iframes).
- **Exit criteria:** forecasters use it as the shift-start overview; no
  per-system logins needed for viewing (read paths proxied server-side).
- **Status:** planned.

## Phase 4 — Single sign-on across the estate

**Goal:** GMS staff log in once (grenmet auth) and reach admin-gms, SURFACE,
and wis2box admin surfaces without separate accounts.

**Approach:** deferred deliberately — requires auth surgery inside vendored
Django (SURFACE) and wis2box-auth; deliver convenience, not capability. Design
when the daily cost of separate logins justifies it.

- **Entry criteria:** Phases 1–3 stable; auth package delegation pattern
  (`packages/auth`) evaluated against SURFACE's Django session model.
- **Exit criteria:** one credential set per staff member; vendored auth changes
  recorded in VENDORED.md.
- **Status:** deferred.

## Explicitly out of scope (recorded 2026-07-08)

- **ICAO Annex 3 aviation products** (METAR/TAF in IWXXM, aeronautical QMS) —
  separate existing channel; fold-in is a future decision, not assumed.
- **Realtime push everywhere** — batch freshness accepted for all phases;
  revisit only if a Phase 3 use case demands it.
