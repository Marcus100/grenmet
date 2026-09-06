# Systems Integration Roadmap

How the GMS data systems — the grenmet monorepo (FastAPI, web apps), SURFACE
CDMS, wis2box, geonetcast, and the Scrapy pipeline — become one connected
estate. Decided 2026-07-08; WIS2 workshop recommendations reconciled
2026-08-16. Ordering principle: **data flows → presentation → identity**; each
phase ships standalone value and makes the next one cheaper.

Related: [programme roadmap](./roadmap.md) ·
[2026 WIS 2.0 implementation roadmap](./wis2-implementation-roadmap-2026.md) ·
[ADR-0010 WIS2 publishing via SURFACE](../adr/0010-wis2-publishing-via-surface-builtin.md) ·
[data architecture](../data-architecture.md) · [VENDORED.md](../../VENDORED.md)

## Phase 1 — Observation data flow: stations → SURFACE → wis2box → WIS2

**Goal:** National observations archived in SURFACE publish to the global WIS2
network automatically, eliminating manual double entry into SURFACE and
wis2box. Publication uses the pre-QC top-of-hour data decided in ADR-0010.

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
- **Status:** in progress. The sandbox path was verified end to end on
  2026-07-08; the 24 h soak, complete station audit, and production cutover are
  pending.

## Phase 1B — WIS2 consumption: Global Services → WIS2Downloader → forecasters

**Goal:** Replace fragile third-party retrieval paths with monitored,
read-only WIS2 subscriptions that feed operational forecasting workflows.

**Approach:** establish the actual WIS2Downloader starting state, then prove one
low-risk subscription on an approved host before adding NWP, SYNOP, satellite,
or other feeds. Publication and consumption are separate operational paths; the
working SURFACE publisher does not imply that WIS2Downloader is deployed.

- **Entry criteria:** role owner assigned; host and outbound network policy
  approved; first feed and forecaster acceptance check selected.
- **Exit criteria:** one unattended subscription is decoded, retained, monitored
  for freshness/errors, integrated into a forecasting workflow, and covered by
  recovery instructions.
- **Status:** confirmation required — no installation or operational-feed
  evidence is present in this repository.

## Phase 2 — geonetcast: automated satellite imagery service

**Goal:** GOES/GNC-A satellite data landing on the receiver machine is
processed into imagery/animations on a schedule and archived with metadata,
viewable in gaa-admin — no manual notebook runs for routine products.

**Approach:** promote the top routine notebook workflows (`geonetcast/`) into a
scheduled pipeline following the Scrapy → `wxwatch` precedent (standalone
script, own DB credentials, metadata rows + files in storage). Notebooks remain
for research. Confirm whether NOAA LRGS will replace the current DADS-dependent
acquisition path before treating either source as authoritative.

- **Entry criteria:** receiver machine reachable; LRGS account and source-system
  status confirmed; 2–3 routine products chosen; storage target decided
  (wxwatch-style DB + object storage).
- **Exit criteria:** chosen products regenerate automatically on new satellite
  data; imagery browsable in gaa-admin; failure alerting exists.
- **Status:** planned.

## Phase 3 — Forecaster dashboard (presentation layer)

**Goal:** one internal gaa-admin surface showing current observations
(SURFACE), latest satellite imagery (Phase 2 archive), active CAP alerts
(FastAPI CAP domain), and wis2box publication health.

**Approach:** read-only panels in gaa-admin; consume SURFACE and wis2box via
their existing APIs; batch freshness (Phase 1 decision) — no realtime plumbing.

- **Entry criteria:** Phases 1–2 pipes flowing (a dashboard before the pipes is
  just iframes).
- **Exit criteria:** forecasters use it as the shift-start overview; no
  per-system logins needed for viewing (read paths proxied server-side).
- **Status:** planned.

## Phase 4 — Single sign-on across the estate

**Goal:** GMS staff log in once (grenmet auth) and reach gaa-admin, SURFACE,
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
  separate existing channel and a future capability gate in the
  [2026 WIS 2.0 roadmap](./wis2-implementation-roadmap-2026.md), not part of the
  current integration phases.
- **Realtime push everywhere** — batch freshness accepted for all phases;
  revisit only if a Phase 3 use case demands it.
