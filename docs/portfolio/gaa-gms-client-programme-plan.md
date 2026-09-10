# GAA/GMS Client Programme Plan

**Status:** Authoritative client-programme view  
**Effective:** 2026-08-16  
**Delivery owner:** Barrels Grenada  
**Institutional authority:** Grenada Airports Authority  
**Meteorological authority:** Grenada Meteorological Service

## Purpose and programme shape

This plan coordinates Barrels delivery for GAA while keeping two programmes
separate:

1. **GMS Digital Services and Meteorological Operations** modernizes the
   meteorological department's official services and operational estate.
2. **GAA Staff and Operations Platform** provides organisation-wide workflows,
   piloted in GMS and rolled out to other departments after the pilot is proven.

GMS is a department of GAA. Using GMS as the first deployment environment does
not make organisation-wide HR, transport, janitorial, attendance, or request
workflows meteorological products. Conversely, CAP, forecasting, observations,
WIS2, aviation meteorology, and public warnings remain GMS responsibilities even
when accessed through shared GAA infrastructure.

This plan is the client view beneath the
[Barrels Portfolio Implementation Plan](barrels-portfolio-implementation-plan.md).
The [Repository Delivery Map](repository-delivery-map.md) identifies the code
and systems used by both programmes.

## Joint governance

| Area | Barrels responsibility | GAA/GMS responsibility |
| --- | --- | --- |
| Prioritisation | Explain capacity, dependencies, risk, and delivery options | Set institutional and operational priority |
| Product/service design | Research, prototype, specify, and implement usable workflows | Supply operational rules, users, scenarios, and policy approval |
| Architecture and quality | Engineering design, security implementation, testing, deployment readiness | Accept institutional risk and approve operational use |
| Meteorological policy | Encode approved rules and preserve auditability | Own thresholds, terminology, warning authority, official products, and SOPs |
| Acceptance | Supply verification evidence and remediate defects | Conduct UAT, exercises, training acceptance, and operational sign-off |
| Operations | Provide agreed monitoring, support, recovery, and change control | Provide duty ownership, escalation contacts, continuity procedures, and staff adoption |

A milestone is complete only when both its technical gate and institutional
acceptance gate pass.

## Programme A — GMS Digital Services and Meteorological Operations

### Outcomes

- National all-hazards warnings move through a controlled, auditable CAP-aware lifecycle; GMS is the user-confirmed national CAP focal point, with hazard-specific authorities and channel policies to be established.
- Observations are collected, quality-controlled, archived, and exchanged using
  approved WMO pathways.
- Forecasters have reliable operational tools and continuity procedures.
- Public, aviation, marine, and partner users receive approved products through
  appropriate channels.
- GMS can measure timeliness, completeness, verification, adoption, and system
  health.

### Workstream register

The [GMS operating baseline](../operations/gms-operating-baseline.md) records
user-confirmed practice as of 2026-09-10 and the ordered acceptance checklist.
It distinguishes operational practice from repository implementation and
unverified deployment. DigitalOcean is the interim hosting choice until an AWS
account is available; migration remains planned. This clarification covers
Programme A only.
The baseline also records the user-confirmed tropical source-review/customer
preparation workflow and a proposed linked-product update/recovery exercise.
Existing product/IBF/CAP relationship schemas are design evidence to reconcile;
they do not establish a working bridge to the current CAP publication service.
The baseline's email-evidence review adds regional CAP drafts and a METLAB
capability/transmission assessment. Draft phrases require local approval; dated
vendor reports and proposed upgrades are not proof of current operation. Retain
manual EDIS while evaluating any replacement route. METLAB discovery may reduce
duplicated work but does not commit the programme to retaining the product.
Current user-directed delivery focus is national CAP. METLAB discovery is
deferred and does not block CAP catalogue/authority/phrase review. The baseline
now contains a draft twelve-category coverage checklist and an acceptance slice
covering one weather-linked and one non-weather message, with independent
national distribution and GMS website selection. These remain proposed rules,
not activated runtime configuration or institutional acceptance.
The WMO page for the February 2025 Grenada CAP workshop is now registered in
the baseline, with linked-material retrieval gaps explicit. Review available
training outputs before replacing prior national decisions; attendance is not
operational acceptance.

| Workstream | Current evidence | Horizon | Next gate | Institutional acceptance |
| --- | --- | --- | --- | --- |
| National all-hazards CAP and weather-linked IBF | User confirms GMS is Grenada CAP focal point; weather operations link CAP, IBF, bulletins and NHC products; linking application and reviewed schema remain pending | Now | Define all-hazards catalogue, issuing authorities and channel policies; reconcile weather links without requiring IBF for non-weather alerts; exercise publication, delivery, update/cancellation and archive | GMS focal-point and relevant hazard authorities accept responsibilities, workflows and exercise results |
| Observation collection | One user-confirmed Sutron automatic weather station; collector, spool and export work exist; inherited hydromet inventory is unverified | Now | Prove exclusive serial access, durable store, export, monitoring and recovery; identify hydromet interfaces separately | GMS observations owner accepts data fidelity and operating procedure |
| SURFACE CDMS | User confirms experimental status; vendored stack has its own database and lifecycle | Now | Evaluate station metadata, ingestion, QC, backup, restore and workflow while preserving current operations | GMS data owner accepts CDMS operation |
| WIS2 publication and consumption | User reports CMO-operated SYNOP-to-BUFR distribution; own-platform sandbox, ADR and roadmap exist | Now | Prove own conversion/validation, publication and external receipt; independently prove inbound retrieval, freshness and recovery before replacing the current route | GMS/GAA authorizes metadata, contacts, credentials, and operational cutover |
| WxWatch imagery | Scheduled one-shot crawler with database/object-storage behavior and tests | Now → Next | Deploy per-source schedules, freshness alerts, storage access, and recovery | GMS forecasting owner accepts availability and freshness |
| Forecast/product production | WxProducts schemas and document workflows integrated into the staff portal | Next | Reconcile catalogue to runtime workflows and complete approval/archive paths | GMS product owners approve each official workflow |
| Public weather service | SpiceWX foundation plus GMS design and product catalogues | Next | Rename/separate the public GMS surface, connect approved observations/warnings, and pass accessibility/performance review | GMS communications and leadership accept content and release |
| Documentation and SOPs | Hurricane-plan/MDX application plus operations documents | Next | Establish the dedicated GMS documentation surface and approved publishing workflow | Named GMS document owners approve published material |
| Aviation meteorology | User confirms 24-hour TAFs issued at 00/06/12/18 Grenada time, hourly METAR and SPECI as required; manual TAC email via EDIS and ADDS availability checks | Protect now; expand after review | Preserve TAC operations; confirm coded validity and applicable requirements, then prove IWXXM validation and receiving-system exchange | GMS aviation authority and relevant GAA stakeholders |
| Marine, climate, agriculture, hydromet, and partner services | Strategic catalogue; limited implementation | Later | Approve one service at a time with user decision, owner, data, workflow, and measure | Relevant GMS/GAA and sector owner |
| Continuity, security, and quality | Baselines, runbooks, backups, audit and quality framework; exercises incomplete | Continuous | Execute restore, access, dissemination fallback, and incident exercises | GAA/GMS risk owner accepts results and remediation |

### National CAP authoring implementation

The user-authorized draft composer now offers 182 national event suggestions
across 29 families, editable category selections, custom events and explicit
assessment defaults. Contact defaults are meteorology@gaa.gd and
1-473-444-4142. This uses the existing API and is not deployment or operational
acceptance. Authority governance, approved rules and channel-specific public
website selection remain outstanding; see the operating baseline for limits.

### Programme A sequencing

1. Protect current warning, observation, aviation, and continuity operations.
2. Prove station → SURFACE → WIS2 data flow and its recovery path; prove incoming WIS2 consumption separately through the existing roadmap gates.
3. Prove the complete warning lifecycle and dissemination fallback.
4. Connect accepted data and products to staff and public presentation layers.
5. Expand service areas only after core operational measures are stable.

Detailed requirements remain in the GMS
[service catalogue](../internal/service-catalogue.md),
[product catalogue](../internal/product-catalogue.md),
[systems integration roadmap](../internal/integration-roadmap.md),
[WIS2 implementation roadmap](../internal/wis2-implementation-roadmap-2026.md),
[compliance traceability matrix](../internal/compliance-traceability.md), and
[operations documentation](../operations/sop-index.md).

### Masterlist evidence for existing workstreams

The [GMS masterlist adoption brief](../operations/gms-masterlist-adoption.md)
provides an extracted 85-entry institutional document inventory, candidate
procedure crosswalk and bounded delivery slices for document control,
product traceability, handover and corrective actions. Use it to refine the
Documentation and SOPs, Forecast/product production, Aviation meteorology,
and Continuity/security/quality gates above. Retrieval, reconciliation and
GMS approval of the underlying documents remain outstanding; the inventory
does not change programme sequencing or establish operational acceptance.
Instrument records should first map to the existing SURFACE capabilities.

### CMO evidence and reporting delivery

The [feature implementation brief](../products/gms-evidence-library-implementation.md) turns the [2025–2026 PDF review](../internal/gms-product-strategy-and-roadmap.md#extracted-20252026-evidence-and-implementation-consequences) into bounded features within existing workstreams. These are specified additions awaiting implementation and institutional acceptance.

| Horizon | Workstream and deliverable | Acceptance gate |
| --- | --- | --- |
| Now, within current evidence review | CMO-01 manual source inventory; CMO-02 source/applicability review; confirm CAP portal and WIS2 starting state | Assign GMS document/meteorological owners, select ten extracted documents for deeper review, preserve approved source references and record unresolved facts. |
| Next, Documentation and SOPs | CMO-01–03 controlled evidence search, Grenada briefing and roadmap gap review; share document-control foundations with the masterlist pilot | Independent reviewer reproduces exports; source revisions, access restrictions, conflicting facts and local approval remain explicit. |
| Next, existing operational gates | CAP interoperability; WIS2 publication and consumption; guidance freshness/coverage; competency evidence | Exercise the relevant operational scenario, including stale data, outage, correction and recovery; software availability alone does not pass. |
| Later, impact/partner reporting | CMO-04–05 event evidence and annual impact-report export under F33/E09; manually reviewed reporting may begin earlier | Meteorological/partner owners validate a sample event and report before automation; preserve source claims and actual submission evidence. |
| After accepted library pilot | CMO-06 source refresh and review queue | New/changed PDFs enter review, previous revisions remain traceable, and recurring review/support capacity is assigned. |

These additions retain Programme A sequencing and reuse the staff portal, SURFACE and existing publication systems. The 2026 CMO reporting dates inform preparation, not software release promises. No external submission is scheduled or authorized by this plan. The historical May roadmap remains a snapshot; current delivery is recorded here.

## Programme B — GAA Staff and Operations Platform

### Outcome and boundary

Deliver one modular GAA staff platform with shared identity, organisation
structure, approvals, roster, notifications, documents, and audit. GMS is the
pilot department. The platform then onboards other departments using
configuration and scoped access rather than forks.

The durable architecture is recorded in
[ADR-0009](../adr/0009-gaa-staff-platform.md). External commercialization is
not part of the client programme; it remains a later Barrels productization
gate.

### Capability roadmap

| Capability | Current evidence | Horizon | Pilot gate |
| --- | --- | --- | --- |
| Organisation and access model | Department-scoped roles exist; organisation/application dimensions are designed but not implemented | Now | Approved hierarchy and access matrix; no cross-department visibility leakage |
| Employee registry and profile | FastAPI HR models and staff portal profile/user surfaces | Now | GMS pilot roster reconciles to named staff ownership and joiner/leaver procedure |
| Roster and approval workflow | Substantial API/web implementation and tests | Now | Representative duty cycles, leave, exchanges, timesheets, and approvals pass UAT |
| Audit, documents, and notifications | Audit/document behavior partial; notifications mostly planned | Next | Required actions are traceable and users receive reliable, accessible notifications |
| Attendance/time-check | Architecture direction only | Next | GMS pilot proves shift matching, corrections, device fallback, and privacy rules |
| Staff requests | Planned shared-workflow module | Later | Routing, service levels, ownership, and naming approved; never conflated with event tickets |
| Janitorial operations | Existing portal prototype/data surface | Later | Janitorial department validates phone-first tasks, exceptions, reporting, and no-phone fallback |
| Staff transport | Existing portal prototype/data surface | Later | Transport validates schedules, eligibility, sign-up, exceptions, and operational ownership |
| Payroll readiness | Deferred | Explore | GAA decides export versus in-platform computation after attendance and leave data prove reliable |

### Department rollout

1. Complete the GMS pilot and record defects, support demand, configuration,
   training effort, and adoption.
2. Harden shared capabilities; do not encode GMS-specific assumptions in the
   organisation core.
3. Select the next department jointly using operational value, readiness,
   device access, shift complexity, data sensitivity, and local ownership.
4. Configure its branch, roles, approvals, shifts, training, support, and
   acceptance scenarios.
5. Onboard one department at a time. Candidate branches include ATS/AIM,
   Security, Maintenance, HR, Accounts, IT, Transport, and Janitorial.
6. Review organisation-wide readiness before moving the portal from its GMS
   pilot host to the permanent GAA staff host.

### Productization gate

After the GAA programme has proven reusable behavior, Barrels may separately
evaluate a workforce product. Approval requires:

- evidence that multiple organisations have the same problem;
- clear software and data rights;
- tenant-isolation and security requirements;
- a support, onboarding, configuration, and pricing model;
- proof that client-specific logic can be removed or configured; and
- an explicit Barrels investment decision.

Until that gate passes, documentation must describe the system as the GAA staff
platform, not as a committed Barrels HR product.

## Shared dependencies and collision rules

- Both programmes may use Barrels identity, FastAPI, generated clients,
  deployment, storage, email, shared UI primitives, and observability.
- Portal chrome is GAA-branded. GMS modules may use GMS presentation inside
  their owned surfaces. Shared primitives must remain brand-neutral.
- GMS operational modules are `cap`, `wxwatch`, and `wxproducts`. Organisation
  modules include HR, users, roster core, and future attendance/requests.
  Janitorial and transport belong to their GAA departments.
- Official meteorological data and products do not become general staff data
  merely because the same portal presents them.
- A Barrels superuser control plane may link to the GAA portal but must not merge
  with it or silently inherit client access.

## Acceptance and reporting

Each active milestone records:

- Barrels delivery owner and GAA/GMS acceptance owner;
- operational scenario and expected outcome;
- security, privacy, continuity, and audit expectations;
- training and support readiness;
- evidence produced by tests, exercise, or production observation;
- accepted limitations and remediation owner; and
- go, hold, revise, or stop decision.

Review programme status jointly at least quarterly and after every safety
exercise, operational pilot, or department rollout. The unsigned GMS charter,
DTO Terms of Reference, and incomplete July 2026 report remain planning or
reporting inputs—not approval evidence—until completed by their authorities.

