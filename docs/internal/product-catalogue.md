# GMS Product Catalogue

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft — planning reference |
| **Owner** | Digital Transformation Officer |
| **Last reviewed** | September 2026 evidence/reporting extension; original v1 status remains a June snapshot |

> **Purpose:** Defines the metadata schema for every GMS product, and identifies the v1 priority set. The [Service Catalogue](./service-catalogue.md) lists the full universe of possible products by service area. This document defines the metadata standard and commits to a specific v1 build order.

---

## Product Metadata Schema

Every product in the GMS system — whether a daily forecast, a CAP warning, or a METAR — should carry a consistent metadata record. This schema is the standard.

```yaml
productCode: "GMS-PUB-DAILY-FCST"           # Unique product identifier
productName: "Daily Public Forecast"          # Human-readable name
serviceArea: "Public Weather Service"         # Parent service (from Service Catalogue)
productType: "Forecast"                       # Forecast | Warning | Advisory | Observation | Bulletin | Graphic | Data | Report

audience:
  - General public
  - Media
  - Schools
primaryUserDecision: >
  What weather should I expect today and tomorrow,
  and do I need to change my plans?

issueSchedule: "Daily, 0600 AST and 1800 AST"
validPeriod: "24 to 48 hours"
updateFrequency: "Twice daily, or as conditions require"
trigger: "Routine"                            # Routine | Threshold | Event-driven | On-request

inputData:
  - Surface observations (AWS, manual)
  - Satellite imagery
  - NWP model guidance (GFS, ECMWF)
  - Radar (when available)
  - Forecaster analysis

forecasterRole: "Duty Forecaster"
reviewerRole: "Senior Forecaster or delegated reviewer"
approvalRequired: true

disseminationChannels:
  - Website (gms)
  - Social media
  - Email digest
  - API (structured)
  - Radio/TV bulletin

archiveRequired: true
archiveRetentionYears: 10

verificationMethod: "Forecast skill scores; post-event review"

icaoWmoReference: null                        # e.g. "ICAO Annex 3 §3.2" if applicable
capCompatible: false                          # Whether this product maps to a CAP message
iwxxmCompatible: false                        # Whether IWXXM encoding applies

digitalStatus: "Planned"                      # Implemented | Partial | Planned | Deferred
v1Priority: true                              # Committed to v1 build?

owner: "Forecasting Unit"
lastReviewed: "2026-06"
```

---

## V1 Priority Product Set

These are the products committed for Version 1 of the GMS Digital Services Programme. Every product in this set requires:

- A complete metadata record (above schema)
- An implemented or in-progress digital workflow
- An associated SOP (see [SOP Index](../operations/sop-index.md))
- Inclusion in the product archive

Products marked `Partial` exist in the codebase but are not fully operational. Products marked `Planned` are in scope but not yet started.

### Public Weather

| Code | Product | Status | Dissemination |
|---|---|---|---|
| `GMS-PUB-DAILY-FCST` | Daily Public Forecast | Partial | Website, API, social |
| `GMS-PUB-3DAY-FCST` | 3-Day Forecast | Partial | Website, API |
| `GMS-PUB-WX-CARD` | Weather Graphic Card | Planned | Social media, website |
| `GMS-PUB-COND` | Current Conditions | Partial | Website, API |

### Warnings and Impact-Based Forecasting

| Code | Product | Status | Dissemination | CAP |
|---|---|---|---|---|
| `GMS-WARN-CAP` | CAP Alert | Partial | Website, feed, API, RSS | Yes |
| `GMS-WARN-HRWW` | Heavy Rainfall Advisory/Watch/Warning | Partial | Website, CAP feed, social | Yes |
| `GMS-WARN-FFW` | Flash Flood Advisory/Watch/Warning | Planned | Website, CAP feed, social | Yes |
| `GMS-WARN-HIGHWIND` | High Wind Advisory/Warning | Planned | Website, CAP feed, social | Yes |
| `GMS-WARN-IBF` | Impact Matrix / IBF Bulletin | Partial | Internal dashboard, agency email | Partial |

### Tropical Cyclone

| Code | Product | Status | Dissemination |
|---|---|---|---|
| `GMS-TC-OUTLOOK` | Tropical Weather Outlook | Partial | Website, social |
| `GMS-TC-SPECIAL` | Special Tropical Weather Outlook | Planned | Website, social, CAP |
| `GMS-TC-IMPACT` | Local Impact Bulletin | Planned | Website, CAP, agency briefing |
| `GMS-TC-KEYMSG` | Key Messages Graphic | Planned | Social, website |

### Marine

| Code | Product | Status | Dissemination |
|---|---|---|---|
| `GMS-MAR-FCST` | Marine Forecast | Partial | Website, API |
| `GMS-MAR-SCA` | Small Craft Advisory | Planned | Website, CAP |
| `GMS-MAR-SURF` | High Surf Advisory | Planned | Website, CAP |
| `GMS-MAR-SWELL` | Swell / Sea State Forecast | Planned | Website, API |

### Aviation

| Code | Product | Status | Dissemination | ICAO standard |
|---|---|---|---|---|
| `GMS-AV-METAR` | METAR | Partial | AFTN, API, archive | Annex 3 |
| `GMS-AV-SPECI` | SPECI | Partial | AFTN, API, archive | Annex 3 |
| `GMS-AV-TAF` | TAF | Partial | AFTN, API, archive | Annex 3 |
| `GMS-AV-AWY` | Aerodrome Warning | Gap | AFTN, archive | Annex 3 |
| `GMS-AV-BRIEF` | Aviation Briefing | Gap | Dashboard, briefing log | PANS-MET |

### Data and Digital

| Code | Product | Status | Notes |
|---|---|---|---|
| `GMS-DATA-ARCHIVE` | Product Archive | Partial | All products stored in wxproducts DB |
| `GMS-DATA-CAPFEED` | CAP Alert Feed | Partial | RSS, GeoJSON, XML endpoints active |
| `GMS-DATA-API` | API-ready Structured Data | Partial | FastAPI and Hono endpoints |
| `GMS-DATA-OBS` | Observation Dashboard | Planned | AWS data; gaa-admin target |

---

## Evidence and reporting products — proposed extensions

These proposed outputs support the Data and Digital Weather Service and quality work. They are planned extensions, not new runtime product kinds or additions to the v1 commitment. Delivery is governed by the [client programme plan](../portfolio/gaa-gms-client-programme-plan.md) and specified in the [feature implementation brief](../products/gms-evidence-library-implementation.md).

| Proposed code | Product and decision | Trigger / audience | Feature slice and acceptance |
| --- | --- | --- | --- |
| `GMS-DATA-GNDBRIEF` | Grenada evidence briefing: what has been reported and what needs follow-up? | On request or reviewed source update; internal leadership/forecasters | CMO-03; reviewed findings with source revision, locator, report date and unresolved limitations. |
| `GMS-DATA-GAPREVIEW` | Roadmap gap review: which local requirement or action needs assessment? | Programme review or material source change; DTO/service owners | CMO-03; distinguish regional recommendation from approved local requirement; action owner and existing work-package reference. |
| `GMS-DATA-IMPACTREP` | Annual weather-impact report: what happened, what was affected and what should improve? | Annual or requested reporting period; GMS and authorized partners | CMO-05; reviewed events, impacts, missing data, operational lessons and reproducible source references; submission receipt recorded separately. |

All three begin with `digitalStatus: Planned`, `v1Priority: false`, `productType: Report` and `capCompatible: false`. Proposed owner is GMS leadership with a designated reporting reviewer. The searchable evidence library and event register are supporting features, not issued forecasts. Approval, access, retention and any external distribution must be set by the owner before release; do not inherit forecast validity windows or automatically apply the example ten-year retention above. Each export preserves its covered/as-of period, source/finding revisions, reviewer and report revision.

## Product Numbering Convention

```
GMS-{AREA}-{CODE}

AREA:
  PUB   Public weather
  WARN  Warnings and advisories
  TC    Tropical cyclone
  MAR   Marine
  AV    Aviation
  CLM   Climate
  AGR   Agriculture
  HYD   Hydromet
  DATA  Data and digital

CODE: Short uppercase descriptor (max 10 characters)
```

---

## Product Record Requirements

When a product is issued, the system must record:

| Field | Requirement |
|---|---|
| `productCode` | Must match catalogue |
| `issuedAt` | UTC timestamp |
| `validFrom` / `validTo` | UTC timestamps |
| `issuedBy` | Forecaster user ID |
| `approvedBy` | Reviewer user ID |
| `status` | Draft / Submitted / Approved / Published / Amended / Cancelled |
| `disseminationLog` | Channels and timestamps |
| `archiveSnapshot` | Full product content at publish time |

This record is the minimum for a product to be considered officially archived.

---

## Related Documents

| Document | Relationship |
|---|---|
| [Service Catalogue](./service-catalogue.md) | Full universe of products by service area |
| [Warning and IBF Framework](../operations/warning-ibf-framework.md) | Warning product lifecycle and content contract |
| [Aviation Compliance Plan](../operations/aviation-compliance-plan.md) | Aviation product requirements and gaps |
| [Compliance Traceability Matrix](./compliance-traceability.md) | Standards mapped to each product |
| [SOP Index](../operations/sop-index.md) | SOPs covering each product workflow |
| [Warning Operations](./warning-operations.md) | CAP lifecycle as implemented in codebase |
