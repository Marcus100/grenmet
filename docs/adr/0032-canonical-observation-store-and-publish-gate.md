# ADR-0032: Canonical observation store and station-hour publish gate

## Status

Accepted by the owner 2026-10-20. Builds on ADR-0010; does not supersede it.

eRegister must not publish to WIS2 again until the per-station-hour gate exists.

## Context

GMS produces hourly observations from three kinds of source, and they do not
share a store:

- **Automatic stations.** The MBIA Sutron logger is read by the edge collector
  (`scripts/sutron-collector/`) into SQLite, then exported as SURFACE CSV.
  More automatic and hydromet stations exist but are not yet received.
- **Manual observations.** eRegister (`apps/api/fastapi/src/eregister/`) takes
  the observer's hourly SYNOP/METAR entry with QC.
- **SURFACE** (vendored) is the national archive and, per ADR-0010, the
  automated WIS2 publisher to wis2box.

Problems this ADR addresses:

1. eRegister and SURFACE can both publish station 78958 to the same wis2box
   dataset, so one hour can be sent twice.
2. FastAPI has no observation data, so gaa-admin cannot show all sources, and
   the `wxproducts/observations` read adapter still reads legacy tables.
3. Sutron rows carry poll time, not logger measurement time.
4. A second station, Carriacou Airport, is staffed by day only. The WIS2
   roadmap (`docs/internal/wis2-implementation-roadmap-2026.md`) calls for a
   hybrid setup: human observer by day, automatic station overnight.
5. More stations are planned, received by a cloud network that is not designed
   yet (see `docs/operations/observation-network-inventory.md`).

## Evidence

- **Facts (high):** ADR-0010 makes SURFACE's `wis2publish_task` the automated
  publisher, pre-QC, per station, at 5 minutes past each hour.
- **Facts (high):** eRegister publishes through `publisher.py`/`sends.py` to
  the same incoming bucket; only WIGOS ID `0-20000-0-78958` is allowed
  (`docs/env.md`).
- **Facts (high):** no code links eRegister and SURFACE; no doc resolves the
  double-publication risk (Gate 2 in the WIS2 runbook is still open).
- **Facts (medium):** SURFACE's station/observation schema was not inspected
  for this ADR; whether it can accept a push from FastAPI is unknown.
- **Interpretation (heuristic):** the owner decision of 2026-10-20 is that
  SURFACE owns the automated hour. The FastAPI store is a mirror and
  comparison layer, not a second publisher.
- **Uncertainty:** how hydromet stations reach us (DADS, NOAA LRGS, cellular or
  other data link). Would change the hydromet adapters, not this decision.

## Options considered

| Option | Correctness | Complexity | Risk |
| --- | --- | --- | --- |
| A. Keep two paths, add a publish gate only | Fixes duplicates | Low | Still no shared store or comparison |
| B. FastAPI store as canonical mirror; SURFACE publishes automated hours; gate for manual | Fixes duplicates, enables comparison and the Carriacou handover | Medium | Needs a sync from SURFACE (or collector dual-write) |
| C. Replace SURFACE with FastAPI as archive and publisher | One system | High | Re-implements a WMO-oriented CDMS; abandons ADR-0010 and the CMO training path |

## Decision

1. **Option B.** FastAPI gets an `observations` domain: station registry,
   element mapping, and observations keyed by
   `(station, element, valid_time_utc, source)`, upserted idempotently.
   The store lives in the EREGISTER database (the meteorological observations
   database, ADR-0003), in its own schema, next to eRegister's paper-register
   tables. It does not go in APP.
2. **SURFACE owns the automated hourly WIS2 publish** (ADR-0010 stands).
   eRegister publishes only manual observations.
3. **Station-hour publish gate.** For each `(station, valid hour)` exactly one
   source publishes. The station registry holds a per-station schedule saying
   which source is official for which hours (`automatic`, `manual`, or
   `hybrid` with manual hours, for example Carriacou by day). eRegister checks
   the gate before it writes to wis2box and refuses an hour owned by
   `automatic`. Vendored SURFACE is not modified; its per-station publish
   config is aligned to the same schedule.
4. **Edge collectors post to FastAPI** through an authenticated, idempotent
   ingest endpoint (organisation API keys, ADR-0029) while keeping the SURFACE
   CSV export. Collectors send logger measurement time; rows that are not
   top-of-hour are stored but never mapped to hourly products.
5. **Free and open-source only.** No paid services or new Python dependency
   without owner approval (AGENTS.md).

## Consequences

- Easier: one place to show, compare and audit logger vs manual observations;
  the Carriacou hybrid and further stations are configuration, not code.
- Easier: a double-publication audit can read the gate decisions.
- Harder: three writers feed one logical series, so source precedence and the
  hybrid schedule must be tested (including clock and DST-free UTC handling).
- Forbidden: a second automated publisher, and any eRegister publish for an
  hour the schedule gives to `automatic`.
- Revisit triggers: SURFACE cannot accept the sync; the hydromet link needs a
  receiver that SURFACE already provides; WDQMS quality feedback (ADR-0010).
- Follow-up work: the build is not yet broken into phases. Collector ingest
  depends on organisation API keys (ADR-0029). Hydromet adapters wait for the
  inventory. Context is in the
  [WIS2 roadmap](../internal/wis2-implementation-roadmap-2026.md).
