# GMS weather operations: requirements

**Status:** Draft proposal for GMS review; consolidates existing documents and does not approve policy or targets  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-10-15

One place that says what the weather services must do and how reliable they must be.
It adds no new policy: each row names the document it comes from, and anything not yet
confirmed by GMS is marked. Where documents disagree, the disagreement is listed in
[Open points](#open-points) rather than resolved here. The
[client programme plan](../portfolio/gaa-gms-client-programme-plan.md) governs
priority and acceptance; the [operating baseline](gms-operating-baseline.md) records
confirmed operating facts.

States: **Built** has code in this repository; **Partly** is built with a stated gap;
**Planned** is described but not built; **Unconfirmed** needs a GMS decision before
anyone builds or relies on it.

## Functional requirements

| ID | Requirement | Source | State |
| --- | --- | --- | --- |
| WF-1 | Author and archive routine public forecasts (07:00, 12:00, 18:00), the marine forecast (05:00) and the Tropical Weather Outlook (02:00, 08:00, 14:00, 20:00), Grenada time. Validity and issue slot are derived, late publication keeps its slot and records the actual time. | [gms-products](gms-products.md) | Built; schedules in operation unconfirmed |
| WF-2 | Author hazard bulletins by category and keep a searchable archive of all issued products by date and type. | [gms-products](gms-products.md) | Built |
| WF-3 | Compose, publish, correct and cancel CAP alerts. Separate the hazard catalogue, message level, lifecycle state and geographic scope. | [ADR-0013](../adr/0013-cap-alert-self-publish-and-bulletin-linkage.md), [baseline](gms-operating-baseline.md) | Partly: draft authoring built; national catalogue unconfirmed |
| WF-4 | Support all nationally approved hazards and authorised issuers, not only weather. Record originating authority, sender and reviewer. Publication to national feeds must not depend on website visibility. | [baseline](gms-operating-baseline.md) | Planned; catalogue and authorities unconfirmed |
| WF-5 | Link CAP alerts to their source bulletin, IBF assessment and NHC product where one exists, without requiring one for non-weather alerts. | [ADR-0013](../adr/0013-cap-alert-self-publish-and-bulletin-linkage.md), [baseline](gms-operating-baseline.md) | Partly; IBF schema pending from GMS |
| WF-6 | Prepare aviation products: TAF (00:00, 06:00, 12:00, 18:00), METAR hourly, SPECI on need; keep the source TAC; add IWXXM. Today transmission is manual through EDIS. | [baseline](gms-operating-baseline.md), [aviation plan](aviation-compliance-plan.md) | Partly: draft composer and PDF preview only, nothing transmitted |
| WF-7 | Record hourly SYNOP observations in eRegister with validation, convert and publish to WIS2. A CMO platform does the conversion and distribution today. | [baseline](gms-operating-baseline.md), [ADR-0010](../adr/0010-wis2-publishing-via-surface-builtin.md) | Partly; GMS's own conversion is a target |
| WF-8 | Ingest and store automatic weather station data with timestamps, units, quality checks and freshness reporting. | [baseline](gms-operating-baseline.md) | Unconfirmed: sensors and storage to inventory |
| WF-9 | Collect NHC guidance and imagery into an immutable archive, keep the previous good data when a pull fails, and alert when a job fails. | WxWatch domain guide, release v0.27 | Built; alert recipients default to cap-admin and management |
| WF-10 | Present published products on the public weather site and CMS, as one channel among several. | [baseline](gms-operating-baseline.md) | Built |
| WF-11 | Keep a manual fallback and backup dissemination channels for every service when the website or a feed is down. | [continuity plan](cybersecurity-continuity.md) | Planned; contact list and drills pending |
| WF-12 | Inventory the inherited hydromet system and local workstations before adopting or replacing anything. | [baseline](gms-operating-baseline.md) | Planned |

## Non-functional requirements

Numbers marked *documented* come from the draft
[quality framework](quality-verification-framework.md) or the continuity plan, which
GMS has not signed off. Rows marked *proposed* are the missing pieces.

| ID | Quality | Requirement | Basis |
| --- | --- | --- | --- |
| WN-1 | Timeliness | At least 95% of scheduled products issued inside their window; average delay under 15 minutes; no missed products in a month. Windows: public and marine forecasts ±15 minutes, TAF ±5, METAR ±2. | documented (forecast windows marked proposed there) |
| WN-2 | Warning quality | Hit rate above 0.80, false alarm ratio below 0.30, critical success index above 0.60, reviewed quarterly. Lead time at least 6 hours for tropical and heavy-rain events and 2 hours for rapid-onset events where feasible. | documented |
| WN-3 | Availability | Public site and API 99.5%, CAP feed 99.9%, admin dashboard 99%, pipeline success 95%, backups 100%. | documented; the monitoring that measures them is not confirmed |
| WN-4 | Incident response | Mean time to resolve under 2 hours for P1 and under 8 hours for P2. | documented |
| WN-5 | Recovery | Current backup rate loses at most 24 hours of data; backups kept 30 days; programme target is to rebuild in under 2 hours. | [infrastructure](../infrastructure.md), [ADR-0021](../adr/0021-timed-recovery-drill.md); the 2-hour target is not yet proven |
| WN-6 | Continuity testing | Backup dissemination drill twice a year (May, August); monthly database restore check; quarterly contact-list and account reviews. | [continuity plan](cybersecurity-continuity.md); drills not yet scheduled |
| WN-7 | Security | MFA on all staff accounts, privileged access review, account lockout, and an incident-response SOP. | [continuity plan](cybersecurity-continuity.md) gap list, target Q3 2026 |
| WN-8 | Integrity and audit | Every issued product archived with metadata; changes to products and alerts have a recorded history; dissemination integrity controls. | [continuity plan](cybersecurity-continuity.md), [ADR-0007](../adr/0007-cap-warning-lifecycle.md) |
| WN-9 | Interoperability | CAP for warnings, BUFR and WIS2 for observations, IWXXM alongside TAC for aviation, EDIS for exchange until replaced. | [baseline](gms-operating-baseline.md), [WMO reference](wmo-weather-reference.md) |
| WN-10 | Priority | A safety, compliance or live-operations need for weather can pre-empt other work, with the reason and recovery point recorded. | [portfolio plan](../portfolio/barrels-portfolio-implementation-plan.md) |
| WN-11 | Performance | Response-time and publish-latency targets are not defined anywhere. | proposed: set after one season of measurement |
| WN-12 | Accessibility | An accessibility standard for public weather pages is not defined. | proposed: GMS to choose |

## Open points

1. The national CAP hazard catalogue, issuing authorities and channel visibility are
   unconfirmed ([baseline checklist](gms-operating-baseline.md#ordered-acceptance-checklist)).
2. Documents disagree on the bulletin count: [gms-products](gms-products.md) lists nine
   hazard categories, [ADR-0013](../adr/0013-cap-alert-self-publish-and-bulletin-linkage.md)
   says eight event-triggered bulletins. Confirm and correct one.
3. The availability and warning-quality numbers above are drafts. Until GMS adopts them,
   treat them as targets to measure against, not commitments.
4. No document sets an availability target for the weather-operations hosting itself, as
   opposed to the public site and API.
5. Recovery time is unproven until the restore drill starts the application against
   restored data ([restore drill](restore-drill.md)).
6. The quality framework expects metrics to be generated from operational data; the
   collection and scoring are not implemented.
