# ICAO / WMO Compliance Traceability Matrix

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Digital Transformation Officer |
| **Aviation lead** | Aviation MET lead |
| **Last reviewed** | June 2026 |

> This matrix maps international obligations and standards to GMS digital features. It ensures every significant digital capability can be traced to a real requirement, and every significant obligation has an identified owner and a digital response. It is a living document — update it when standards change or implementation status changes.

---

## How to read this matrix

| Column | Meaning |
|---|---|
| **Standard / Mandate** | The international standard, annex, or document |
| **Requirement** | What the standard requires |
| **GMS implication** | What that requirement means for Grenada Meteorological Service specifically |
| **Digital feature** | The system capability that addresses it |
| **Owner** | Who is responsible for this area at GMS |
| **Status** | Current implementation status |
| **Evidence** | How compliance will be demonstrated |

**Status values:** `Implemented` · `Partial` · `Planned` · `Gap` · `Not applicable`

---

## Section A — ICAO Aviation Meteorological Services

### Source: ICAO Annex 3 — Meteorological Service for International Air Navigation

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Provision of meteorological service to international air navigation | GMS is the designated meteorological authority for MBIA and Grenada airspace | Aviation MET module; METAR/SPECI/TAF production workflow | Aviation MET lead | Partial | SOP, product archive |
| Routine aerodrome observations (METAR) | Issue METAR at scheduled intervals | METAR composition, validation, transmission, and archive | Aviation MET lead | Partial | Archive records, timestamp logs |
| Special observations (SPECI) | Issue SPECI when defined thresholds are met | SPECI trigger rules, composition, and archive | Aviation MET lead | Partial | SPECI archive, threshold documentation |
| Aerodrome forecasts (TAF) | Issue TAF for MBIA at scheduled intervals; amend when conditions change | TAF drafting, review, approval, amendment, and archive workflow | Aviation MET lead | Partial | TAF archive, amendment records |
| Aerodrome warnings | Issue aerodrome warnings for hazardous conditions | Aerodrome warning lifecycle: draft, approve, publish, cancel, archive | Aviation MET lead | Gap | Warning records, audit trail |
| Trend forecasts (TREND) | Issue trend forecasts when applicable | Trend forecast module (if operationally required) | Aviation MET lead | Gap | Operational assessment |
| Low-level wind shear alerts | Issue alerts when wind shear is observed or forecast | Wind shear alert product; LLWS documentation | Aviation MET lead | Gap | Alert records |
| Pilot briefings | Provide pre-flight meteorological briefings | Aviation briefing dashboard; briefing record | Aviation MET lead | Gap | Briefing log |
| SIGMET coordination | Coordinate SIGMET issuance with VAAC/TCAC as applicable | SIGMET coordination procedure and record | Aviation MET lead | Gap | Coordination log |
| Contingency procedures | Maintain backup procedures if primary system fails | Fallback SOP; offline backup checklist | Aviation MET lead + DTO | Gap | SOP document |
| Records and audit | Maintain records of all aviation products issued | Archive with timestamps, authorship, and amendment history | DTO | Partial | Archive, audit log |

### Source: ICAO Doc 10157 — PANS-MET (Procedures for Air Navigation Services — Meteorology)

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Detailed procedures for METAR/SPECI production | Standard operating procedure for observation and coding | Aviation SOP; METAR composition tool with validation | Aviation MET lead | Gap | SOP document |
| TAF production procedures | Standard procedure for TAF drafting and amendment | TAF workflow; amendment tracking | Aviation MET lead | Gap | SOP document |
| Runway visual range (RVR) procedures | RVR observation and reporting procedures | RVR field in METAR tool; SOP | Aviation MET lead | Gap | SOP, METAR records |
| Meteorological information exchange | Timely transmission of aviation products to ATC, airlines, and AFTN | Dissemination log; transmission records | Aviation MET lead | Gap | Transmission audit |
| Quality management system | QMS for aviation MET services | Audit trail, correction records, performance review | Aviation MET lead + DTO | Gap | QMS records |

### Source: ICAO Doc 9859 — Safety Management Manual (aviation MET context)

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Safety-critical product traceability | Aviation MET products must be traceable to issuing forecaster | Author ID, timestamp, and approval record on each product | DTO | Partial | Audit log |
| Incident reporting | Weather-related aviation incidents should trigger a report | Aviation weather incident report SOP | Aviation MET lead | Gap | Incident log |

---

## Section B — WMO Warning and Alerting Standards

### Source: WMO CAP (Common Alerting Protocol) — ITU-T X.1303 / OASIS CAP 1.2

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Standard format for all-hazard alerts | Public warnings should be machine-readable CAP messages | CAP alert generator; lifecycle (draft → submit → approve → publish → cancel/expire) | Warning lead | Implemented | CAP XML feed, audit trail |
| Multi-channel dissemination | CAP enables consistent message across web, mobile, radio, SMS | CAP RSS feed; planned webhook/MQTT/WIS2 publication | DTO | Partial | Feed endpoints active; worker not yet deployed |
| Alert area definition | Affected area defined as polygon, circle, or geocode | Area fields in CAP schema: polygon, multipolygon, circle, geocode | Warning lead | Implemented | CAP XML output |
| Alert validity and expiry | Effective and expiry times required | `onset`, `expires` fields; automated expiry tracking | Warning lead | Implemented | CAP schema |
| Update and cancellation messages | Warnings must be formally updated and cancelled | Update/cancel/expire lifecycle | Warning lead | Implemented | Audit trail |

### Source: WMO Manual on the WMO Integrated Global Observing System (WIGOS) / WIGOS Metadata Standard

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Station metadata registration | AWS and manual stations should have WIGOS Station Identifiers (WSI) | Station metadata catalogue with WSI fields | Observations lead | Gap | Station metadata records |
| Observation availability reporting | Timely submission of observation data | Automated data pipeline with availability monitoring | Observations lead + DTO | Partial | Pipeline logs |
| Data quality flags | Observations should carry QC flags | QC layer in data ingestion pipeline | Observations lead | Gap | QC records |

### Source: WMO WIS 2.0 — WMO Information System 2.0

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Data discovery via MQTT/HTTP | Publish dataset metadata for discovery by global community | WIS2 node or broker endpoint; dataset metadata records | DTO | Planned (Year 2) | Metadata catalogue |
| Core and recommended data publication | Publish core surface observations and CAP alerts to WIS2 | WIS2 publication via `publish.wis2box` job | DTO | Gap (job defined, worker not deployed) | WIS2Box records |
| WCMP2 metadata records | Each dataset requires a metadata record in WMO Core Metadata Profile 2 | Metadata authoring tool or static records | DTO | Gap | Metadata files |

### Source: WMO Manual on Impact-Based Forecasting (IBF) / No. 1124

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Forecast hazard, exposure, and vulnerability | Warnings should assess likelihood × impact, not only meteorological thresholds | IBF schema (likelihood, impact, confidence fields) in wxproducts | Warning lead | Partial | IBF records |
| Action-oriented communication | Warnings should include recommended public actions | `actions` field in CAP and IBF product | Warning lead | Implemented | CAP content |
| Impact language | Products should describe what the hazard may do, not only what it will be | Content standard in warning SOP | Warning lead | Gap | SOP document |

---

## Section C — Regional and National Obligations

### Source: CMO (Caribbean Meteorological Organisation) — Regional obligations

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Regional data sharing | Share observation data and CAP alerts with CMO and regional partners | API and CAP feed accessible to partners | DTO | Partial | Feed endpoints |
| Tropical cyclone coordination | Coordinate local interpretation with NHC and CMO during tropical events | Tropical cyclone product workflow; local briefing record | Warning lead | Partial | Bulletin records |

### Source: Grenada National Disaster Management Agency (NaDMA / NDEMA)

| Requirement | GMS implication | Digital feature | Owner | Status | Evidence |
|---|---|---|---|---|---|
| Official warning input | NDEMA depends on GMS for official hazard warning | CAP feed consumed by NDEMA; formal adoption agreement | Warning lead | Gap (informal) | Adoption agreement |
| Agency briefings during events | GMS provides briefings to EOC during hazardous events | Briefing record; agency dashboard | Warning lead | Gap | Briefing log |

---

## Section D — Data and Interoperability Standards

| Standard | Requirement | GMS implication | Digital feature | Owner | Status |
|---|---|---|---|---|---|
| BUFR (Binary Universal Form for Representation) | Standard format for meteorological observations | BUFR records in wxproducts schema | Observations lead | Partial | Schema exists; encoding pipeline gap |
| IWXXM (ICAO Weather Information Exchange Model) | XML/GML format for aviation MET products | IWXXM primitives in wxproducts; IWXXM output pipeline | Aviation MET lead | Gap | Schema foundations only |
| GeoJSON | Geospatial product dissemination | CAP GeoJSON endpoint active | DTO | Implemented | `/api/cap/alerts.geojson` |
| RSS 2.0 | Syndicated alert feed | CAP RSS feed active | DTO | Implemented | `/api/cap/rss.xml` |
| JSON / REST API | Machine-readable data access | Hono API and FastAPI public endpoints | DTO | Partial | API contracts doc |

---

## Gap Summary

| Standard area | Gaps requiring attention |
|---|---|
| ICAO aviation products | Aerodrome warnings, wind shear alerts, trend forecasts, pilot briefing records, contingency procedures, QMS |
| IWXXM output | Not yet producing IWXXM-encoded aviation products |
| WIS2 | WIS2Box worker not deployed; WCMP2 metadata records not authored |
| WIGOS station metadata | AWS stations not yet registered with WSI numbers |
| IBF impact language | Content standard not yet in SOP |
| NDEMA formal agreement | CAP feed adoption is informal |

---

## Related Documents

| Document | Relationship |
|---|---|
| [Aviation Compliance Plan](../operations/aviation-compliance-plan.md) | Detailed digital plan for aviation MET compliance |
| [Warning and IBF Framework](../operations/warning-ibf-framework.md) | Operational warning lifecycle and IBF standard |
| [GMS Charter](./gms-charter.md) | Compliance section of programme governance |
| [DTO Terms of Reference](./dto-terms-of-reference.md) | Section 16 — Standards and Compliance |
| [Warning Operations](./warning-operations.md) | Implemented CAP lifecycle in codebase |
