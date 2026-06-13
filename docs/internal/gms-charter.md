# GMS Digital Transformation Charter

| Field | Detail |
|---|---|
| **Programme** | GMS Digital Services Programme |
| **Version** | 1.0 |
| **Status** | Draft — pending formal GMS leadership sign-off |
| **Owner** | Digital Transformation Officer |
| **Sponsor** | Manager, Meteorology Department |
| **Prepared** | Eugine Whint |
| **Date** | June 2026 |

> **Scope of this document:** Executive-level vision, objectives, governance, success criteria, and decision principles. For programme governance, KPIs, and DTO role detail see [dto-terms-of-reference.md](./dto-terms-of-reference.md). For the phase-by-phase build plan see [roadmap.md](./roadmap.md). For the service and product catalogue see [service-catalogue.md](./service-catalogue.md).

---

## 1. Vision

Grenada Meteorological Service operates as a **digital-first national meteorological service** — authoritative, accessible, and built around the decisions people and institutions need to make.

GMS digital products and services are:

- **Trusted** — official, consistent, and traceable to forecaster authority.
- **Timely** — issued on schedule, updated when conditions change, and archived for accountability.
- **Actionable** — structured around what users need to decide, not only what the weather will be.
- **Interoperable** — machine-readable, standards-compliant, and shareable with regional and international partners.
- **Resilient** — available during high-impact events when they are needed most.

---

## 2. Strategic Objectives

| Objective | What success looks like |
|---|---|
| **Public safety** | Warnings reach the public across multiple channels with clear impacts and actions before hazardous events |
| **Aviation safety** | ICAO-compliant aviation meteorological products issued on schedule with full audit trails |
| **Marine safety** | Marine forecasts and advisories accessible to fishers, mariners, and port operators |
| **Climate resilience** | Climate data and services available to planners, agriculture, water, and infrastructure sectors |
| **National development** | GMS data accessible programmatically to developers, researchers, and partner agencies |

---

## 3. Scope

### In scope — Version 1

| Area | Description |
|---|---|
| Public weather platform | Website, current conditions, daily forecasts, 3-day outlook, weather graphics |
| Warning and IBF system | CAP alert lifecycle, impact-based forecasting, multi-channel dissemination |
| Tropical cyclone products | Outlooks, bulletins, local impact summaries, key messages |
| Aviation products | METAR, SPECI, TAF, aerodrome warnings, digital briefing support |
| Marine products | Marine forecast, small craft advisory, swell forecast |
| Internal forecaster workbench | Product editor, approval workflow, archive, dashboard |
| Data and API layer | Structured product archive, CAP feed, observation data |
| Observation data pipeline | AWS data ingestion, CDMS integration, QC baseline |
| HR and workforce management | Timesheets, rosters, leave, shift swaps |

### Out of scope — Version 1

| Item | Reason |
|---|---|
| Climate service portal | Year 2+ — requires CDMS full deployment and historical data loading |
| Agriculture weather service | Year 2+ — requires agrometeorological capacity and data |
| Health meteorology service | Year 2+ — requires cross-agency partnerships |
| AI/ML nowcasting tools | Year 2+ — requires stable data infrastructure first |
| WMO WIS2 publication | Year 2 target — gated on metadata readiness and WIGOS alignment |
| Full IWXXM output | Year 2 target — gated on aviation module and regional coordination |
| SMS/WhatsApp dissemination | Planned for H2 2026 — not v1 scope |
| Public mobile application | Year 2+ — follows public website stabilisation |

---

## 4. Governance

Reporting lines, role assignments, and decision authority are defined in full in [dto-terms-of-reference.md](./dto-terms-of-reference.md) (Sections 1 and 7). Charter-level accountability:

- **Programme Sponsor:** Manager, Meteorology Department (Gerard Tamar) — executive approval, resource decisions, inter-agency relationships.
- **Digital Transformation Officer:** Eugine Whint — programme delivery, technical direction, documentation.
- **Technical lead:** TBC — frontend and UI implementation under DTO direction.

Domain leads for forecasting, aviation MET, warning, and observations are named in the TOR. All scope additions require Programme Sponsor approval. Budget commitments and contract classification changes require CEO approval.

---

## 5. Success Criteria

### Operational targets

| Criterion | Target |
|---|---|
| Warning lead time | Public warnings issued at least 6 hours before hazard onset for forecast events |
| Product timeliness | ≥ 95% of scheduled products issued within the scheduled window |
| Archive completeness | 100% of official products stored with metadata and timestamps |
| Warning consistency | Same message content across website, CAP feed, and dissemination channels |
| Aviation product availability | METAR, SPECI, TAF issued on schedule with no unplanned gaps |
| Platform uptime | ≥ 99.5% availability for public website and API during non-maintenance periods |
| CAP feed availability | ≥ 99.9% uptime for public CAP feed endpoints |

### Stakeholder adoption

| Stakeholder | Target |
|---|---|
| NDEMA | Formal adoption of CAP alerts as primary warning input by end of 2026 |
| GAA / Airport | Aviation dashboard used operationally by aviation MET staff |
| Media | At least two major broadcasters receiving official GMS CAP feed |
| Fishers / marine | Marine forecast product accessible via public website |

### Compliance

| Standard | Target |
|---|---|
| ICAO Annex 3 | All required aviation products issued, archived, and auditable |
| WMO CAP | All public warnings published as valid CAP messages |
| WMO data exchange | Observation metadata available in WIGOS-compatible format (Year 2) |

---

## 6. Risks

The full risk register — likelihood ratings, impact ratings, and mitigations — is maintained in [dto-terms-of-reference.md, Section 14](./dto-terms-of-reference.md). Decision-level risks for this charter:

| Risk | Response |
|---|---|
| Cybersecurity incident affecting warning integrity | Role-based access, approval workflow, audit trail — see [cybersecurity-continuity.md](../operations/cybersecurity-continuity.md) |
| ICAO compliance gap identified by external audit | Compliance traceability matrix maintained; aviation lead owns gap closure |
| Key staff departure or reduced availability | Documentation-first approach; SOPs reduce key-person dependency |
| Funding gap or cloud budget overrun | Cost-conscious architecture; formal budget approval required before costs incurred |

---

## 7. Decision Principles

**Standards first.** Where an international standard exists (CAP, IWXXM, BUFR, WIGOS, WIS2), use it. Do not invent proprietary formats for public products.

**Public safety first.** Warning capability is never deprioritised for feature work. Warning system availability and reliability are treated as critical infrastructure.

**Interoperability first.** Design products for machine readability from the start. Every product that can be structured should be structured.

**Phased and evidence-driven.** New services are added when there is operational capacity to run them and stakeholder demand to justify them.

**Archive everything.** Every official product is archived with metadata, timestamps, and authorship. Nothing is deleted as a normal workflow.

**Forecaster authority is preserved.** Digital tools assist forecasters — they do not replace forecaster judgement. Approval workflow is mandatory for all official products.

---

## Related Documents

| Document | Purpose |
|---|---|
| [DTO Terms of Reference](./dto-terms-of-reference.md) | Programme governance, KPIs, role detail, risk register |
| [Roadmap](./roadmap.md) | Phase-by-phase build plan and current status |
| [Service Catalogue](./service-catalogue.md) | Full service and product catalogue |
| [Compliance Traceability Matrix](./compliance-traceability.md) | ICAO/WMO obligations mapped to digital features |
| [Product Catalogue](./product-catalogue.md) | Product metadata schema and v1 committed set |
| [GMS Digital Service Architecture](../architecture.md) | Strategic service design framing |
| [Operations folder](../operations/) | SOPs, warning framework, aviation compliance, quality verification |
