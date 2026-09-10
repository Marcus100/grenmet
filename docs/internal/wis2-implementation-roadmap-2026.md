# WIS 2.0 Implementation Roadmap (2026)

> Internal living plan. Reconciled on 2026-08-16 from the June 2026 workshop
> report and implementation evidence recorded in this repository.

## Purpose and authority

The [WIS 2.0 Complementary Training Workshop implementation report](./reports/wis2-workshop-2-implementation-report-2026.pdf)
sets the local strategic direction: establish resilient national WIS 2.0
publishing and consumption capabilities without assuming sustained project time
from an understaffed operational team.

This document turns that direction into capability gates and reconciles it with
work completed after the report was written. Authority is ordered as follows:

1. [ADR-0010](../adr/0010-wis2-publishing-via-surface-builtin.md) governs the
   observation-publishing architecture.
2. The [WIS2 publishing runbook](../operations/wis2-publishing-runbook.md)
   governs verified operating procedures and evidence.
3. This roadmap governs programme sequencing, ownership, and exit criteria.
4. The source report records workshop findings and management recommendations;
   it is preserved unchanged as historical evidence.

Statements not evidenced by the repository are marked **confirmation required**
rather than treated as established operational facts.

## Strategic basis

WIS 2.0 entered its operational phase on 1 January 2025. WMO guidance plans the
GTS/WIS1 transition through 2033, recommends completing migration preferably by
2030, and considers a National Centre migrated only when a WIS 2.0 Node is
operational and its former GTS datasets are available through WIS 2.0.

WIS 2.0 separates publication, discovery, and consumption:

- nodes publish data notifications and WCMP2 discovery metadata;
- Global Caches make **core** data available without access restrictions;
- recommended data may use licences and access controls; and
- consumers discover datasets and subscribe to notifications through global
  services.

For GMS, this produces two independent operational paths:

| Path | Flow | Current position |
| --- | --- | --- |
| Publish observations | Stations → SURFACE → wis2box → WIS2 | Sandbox flow verified; soak and production cutover pending |
| Consume external data | WIS2 Global Services → WIS2Downloader → forecasting workstations | No deployment evidence in the repository; confirmation required |

CAP publication is a third, separate path. The verified SURFACE observation
publisher does not activate the grenmet CAP `publish.wis2box` job; that job still
requires a worker implementation before CAP alerts can be described as published
to WIS 2.0.

## September 2026 CMO evidence refinement

The [CMO extraction review](./gms-product-strategy-and-roadmap.md#extracted-20252026-evidence-and-implementation-consequences) reinforces Gate 3 consumption and F18 acceptance. Publication success cannot stand in for forecaster retrieval. Gate 3 may begin as a bounded read-only pilot while publication work continues, subject to owner capacity.

Before choosing the CAP integration in Gate 4, reconcile the regional portal reported in 2025 with the current local issuing path, sender authority and duplicate/cancellation handling. Keep the SURFACE observation publisher separate; approve the integration choice before implementing it. The [feature brief](../products/gms-evidence-library-implementation.md) tracks this as an operational acceptance refinement, not evidence that a regional integration already works here.

## Workshop recommendations reconciled with project evidence

| Workshop recommendation | Evidence as of 2026-08-16 | Reconciled status | Next proof point |
| --- | --- | --- | --- |
| Install a local wis2box node | Local sandbox exists; a separate WMO-registered production box is recorded in ADR-0010 | Partial | Confirm production topology and complete the gated cutover |
| Automate SYNOP/AWS publication through SURFACE | MBIA sandbox publication completed through WMO CSV, BUFR conversion, and WIS2 notification on 2026-07-08 | Verified on sandbox | Pass the 24-hour soak, enable approved stations, and verify production counts in WDQMS |
| Publish discovery metadata | A sandbox synop dataset is configured, but WCMP2 validation and Global Discovery Catalogue visibility are not evidenced | Partial | Record the metadata identifier, validation result, public URL, and global discovery result |
| Deploy WIS2Downloader | No repository evidence of an installation or operational feed | Confirmation required | Establish the actual starting state, then prove a read-only subscription end to end |
| Integrate WIS2 data into forecasting workstations | No repository evidence of workstation integration | Planned | Agree priority feeds and acceptance checks with forecasters |
| Register Carriacou Airport and implement hybrid manual/AWS reporting | No Carriacou WIGOS registration or cutover evidence in the repository | Confirmation required | Confirm registration status and approve the operational cutover rule before automation |
| Expand AWS ingestion through NOAA LRGS/GOES | geonetcast automation is planned; LRGS account status is not evidenced | Confirmation required | Confirm account status and select the authoritative acquisition path |
| Monitor GBON availability and retain compliance evidence | Local Grafana checks and publishing logs exist; production WDQMS evidence retention is not defined | Partial | Adopt monthly availability evidence and escalation ownership |
| Publish DAYCLI, CLIMAT, upper-air, and CAP data | No completed publication path is evidenced for these datasets | Planned | Prioritize datasets after stable SYNOP production |
| Progress aviation products to IWXXM | Existing aviation plan treats IWXXM as future work | Future | Coordinate the regional translator/pilot before committing an implementation date |
| Secure management endorsement, hardware, IT time, and security support | Endorsement and allocations are not evidenced in the repository | Confirmation required | Record the approving authority, named role owners, production host, and protected support window |

## Capability gates

Timing is expressed as gates with indicative windows. A gate advances when its
exit evidence exists, not merely because a calendar date has passed.

### Gate 0 — Governance and current-state confirmation

**Indicative window:** immediate, during the next management and IT planning
cycle.

- Management endorses this reconciled roadmap or records requested changes.
- Assign durable role owners for WIS2 technical operations, observations,
  forecasting integration, IT/security, and management escalation.
- Confirm the production wis2box topology and registration state.
- Confirm the starting state of WIS2Downloader, Carriacou WIGOS registration,
  and the NOAA LRGS request.
- Agree which work can use opportunistic operational windows and which gates
  require protected staff time.

**Exit evidence:** dated endorsement, role-owner register, confirmed-state
notes, and an agreed production-host decision.

### Gate 1 — Harden the verified observation sandbox

**Indicative effort:** opportunistic 4–8 hour monthly windows.

- Complete and record the 24-hour soak test defined in the runbook.
- Audit station WIGOS identifiers, freshness, international-exchange scope, and
  source-data completeness.
- Validate the synop dataset's WCMP2 record and csv2bufr mapping.
- Document least-privilege network access, credential rotation, backup, restore,
  log retention, and incident escalation for both SURFACE and wis2box.
- Replace laptop-dependent test assumptions with an approved, supportable host
  plan before production reliance.

**Exit evidence:** soak results, station audit, WCMP2 validation record,
security review, and tested recovery notes.

### Gate 2 — Cut over core surface observations to production

**Indicative effort:** scheduled blocks shared by meteorological and IT staff.

- Re-run the full seven-point publishing checklist against production.
- Confirm the dataset topic, station list, WIGOS identifiers, and mapping are
  identical to the approved sandbox configuration.
- Execute the double-publication audit and written stop plan required by
  ADR-0010.
- Verify notifications through WIS2 Global Services, discovery metadata in the
  Global Discovery Catalogue, and expected observation counts in WDQMS.
- Establish routine availability reporting and an escalation threshold for
  missing hours.

**Exit evidence:** approved cutover record, global notification and discovery
proof, WDQMS baseline, and named operational support owner.

### Gate 3 — Establish operational WIS2 consumption

**Indicative effort:** begin read-only and expand during available windows.

- Install or validate WIS2Downloader on an approved, supportable host.
- Start with one low-risk subscription selected by forecasters.
- Validate filtering, format decoding, storage, retention, and freshness.
- Exercise unavailable, stale and duplicate notifications plus reconnect/retrieval
  recovery; retain source timestamps and make missing data visible to forecasters.
- Record the selected dataset, discovery identifier, subscription filters,
  decoded sample and reviewer so a substitute can reproduce the workflow.
- Integrate the feed into one forecasting workstation workflow before adding
  NWP, SYNOP, satellite, or other subscriptions.
- Monitor persistent outbound connections and grant only required network
  access.

**Exit evidence:** unattended subscription, forecaster acceptance record,
freshness/error monitoring, and a documented recovery procedure.

### Gate 4 — Expand national datasets and station coverage

**Indicative effort:** protected cross-functional work blocks.

- Complete Carriacou Airport WIGOS registration and agree whether its metadata
  alone describes limited hours or an approved manual/AWS hybrid is required.
- Add approved AWS and SYNOP stations through the same SURFACE publishing path.
- Sequence DAYCLI, CLIMAT, and upper-air mappings after stable hourly
  observations.
- Implement CAP-to-WIS2 publication as its own tested worker path; do not infer
  CAP readiness from the observation publisher.
- Resolve NOAA LRGS/GOES acquisition and retention ownership as part of the
  satellite automation workstream.

**Exit evidence:** dataset-by-dataset acceptance records, registered station
metadata, global discovery results, and operational runbooks.

### Gate 5 — Aviation and advanced regional exchange

**Indicative window:** after core publication and consumption are stable.

- Participate in the regional TAC-to-IWXXM translator pilot as capacity permits.
- Add approved METAR/TAF IWXXM, radar, and other regional products only after
  licensing, access-control, QMS, and support requirements are defined.
- Contribute reusable scripts, mappings, and lessons to the COWET regional
  repository when it becomes available.

**Exit evidence:** approved data policy, validated formats, operational owner,
regional interoperability test, and support procedure.

## Durable ownership

| Role | Accountability |
| --- | --- |
| Management | Endorse priorities; fund or allocate hosts; protect required staff time; accept operational risk |
| IT / ISDS | Hosts, operating systems, firewall rules, credentials, backups, patching, and incident support |
| WIS2 technical lead / DTO | Node and dataset configuration, WCMP2, mappings, automation, monitoring, evidence, and runbooks |
| Observations lead | Station scope, WIGOS/OSCAR metadata, source-data availability, and quality follow-up |
| Forecasting lead | Subscription priorities, workstation integration, and operational acceptance |
| Aviation MET lead | Carriacou operating rules, aviation data policy, and future IWXXM validation |
| CMO/COWET partners | Regional coordination, peer review, training, and escalation support rather than local operational ownership |

Named individuals may be recorded in an operational contact register, but this
roadmap uses roles so that accountability survives staffing changes.

## Required operational evidence

The programme is complete only when evidence is retained, not when software is
merely installed.

| Evidence | Minimum record |
| --- | --- |
| Sandbox stability | 24-hour soak totals, missing-hour explanation, conversion errors, and dates |
| Production publication | Source row, SURFACE success log, incoming CSV, BUFR output, WIS2 notification, and API result |
| Discovery | WCMP2 identifier, validation result, canonical URL, metadata notification, and Global Discovery Catalogue result |
| Availability | Monthly WDQMS baseline, missing-data incidents, response, and closure |
| Consumption | Subscription filters, decoded sample, freshness measure, forecaster acceptance, and failure alert |
| Security and continuity | Approved ports, access review, credential-rotation date, backup result, restore test, and incident contact |
| Dataset expansion | Data owner approval, WIGOS/OSCAR record, mapping validation, licence, monitoring, and runbook |

Never store passwords, tokens, private keys, or unrestricted infrastructure
details in this evidence or in repository documents.

## Sources

- [WIS 2.0 Complementary Training Workshop implementation report](./reports/wis2-workshop-2-implementation-report-2026.pdf),
  prepared for GMS in June 2026.
- [WMO guidance on transition from GTS/WIS1 to WIS2](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-information-system-wis/guidance-transition-from-gtswis1-wis2).
- [WMO WIS2 overview](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-information-system-wis/wis2-overview).
- [Official wis2box dataset and discovery-metadata guidance](https://docs.wis2box.wis.wmo.int/en/latest/user/setup-datasets.html).

