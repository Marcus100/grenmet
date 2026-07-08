# ADR-0010: Publish observations to WIS2 via SURFACE's built-in publisher

## Status

Accepted (2026-07-08)

## Context

Observations were entered into SURFACE (national archive) and wis2box (WMO WIS2
node) separately — duplicated manual work, and internationally published data
was not guaranteed to match the archive. We planned a new bridge job in the
monorepo (arq cron or a standalone script per the Scrapy/wxwatch precedent,
ADR-0003) until exploration showed that vendored SURFACE 1.0.0 already ships a
complete, Grenada-configured wis2box publisher: Celery task `wis2publish_task`
(per-station cron, default 5 min past each hour) builds WMO CSV and uploads it
to the wis2box MinIO `wis2box-incoming` bucket under
`origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop`
(`surface/api/production.env`), with per-station config (`Wis2BoxPublish`),
Fernet-encrypted credentials (`LocalWisCredentials`/`RegionalWisCredentials`),
publish logs, and a dashboard UI. wis2box performs the CSV→BUFR conversion and
WIS2 notification itself.

Two environments exist: the local wis2box (sandbox, unregistered with any WIS2
Global Broker) and the WMO-registered production wis2box on a separate machine.

## Decision

1. Use SURFACE's built-in publisher as the observation bridge. Do not build a
   monorepo bridge job; the integration is configuration, not code.
2. Configure and verify against the local sandbox wis2box first; promote to the
   production box only through an explicit, gated cutover (same dataset and
   station list present, network reachability verified, double-publication
   audit with a written stop-plan for the old entry path).
3. Use the real centre id `gd-metservice` on the sandbox. SURFACE's topic
   hierarchy is fixed in its env; a test id would force vendored-env edits
   twice. Safety comes from the sandbox broker being unregistered, not from a
   fake id.
4. Accept pre-QC publishing: the publisher reads top-of-hour `raw_data` without
   a quality-flag filter. This matches WMO real-time SYNOP practice (data is
   exchanged before full QC; filtering on "good" would silence stations whose
   data is merely not yet checked).

## Consequences

- Zero new services and zero vendored-code changes on the happy path; the
  monorepo carries only documentation (this ADR, the integration roadmap, and
  `docs/operations/wis2-publishing-runbook.md`).
- Publishing correctness now depends on vendored SURFACE code: upgrades of
  `surface/` must preserve the `wx.tasks` wis2 pipeline (recorded as an upgrade
  check in `VENDORED.md` workflow).
- Runtime dependency on cross-stack Docker networking (SURFACE containers →
  host gateway → wis2box MinIO :9000); the verified address lives in the
  runbook.
- Published values may later be flagged suspicious/bad in the national archive.
  Revisit trigger: WDQMS quality flags on Grenada observations → minimal
  vendored patch excluding confirmed-bad (`quality_flag = 3`) only, recorded in
  `VENDORED.md`.
- The csv2bufr mapping template on the wis2box side must match SURFACE's CSV
  columns; schema fixes belong on the wis2box mapping side, never in SURFACE's
  CSV generation.
