# Aviation MET Digital Compliance Plan

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Aviation MET Lead |
| **Review** | DTO, Forecasting Unit |
| **Standards** | ICAO Annex 3, PANS-MET (Doc 10157), ICAO Doc 9859 |
| **Last reviewed** | June 2026 |

> **Scope:** The digital requirements for GMS aviation meteorological services. For the full compliance gap mapping see [Compliance Traceability Matrix](../internal/compliance-traceability.md). For aviation product metadata see [Product Catalogue](../internal/product-catalogue.md).

---

## 1. Mandate

GMS is the designated meteorological authority for Maurice Bishop International Airport (MBIA) and Grenada airspace under ICAO Annex 3. This means GMS is accountable — legally and operationally — for the quality, timeliness, and accuracy of aviation meteorological products issued in support of international air navigation.

Aviation MET is not a secondary function. Digital modernisation of these products is a compliance requirement, not an enhancement.

---

## 2. Products in Scope

| Product | Code | ICAO basis | Schedule | Archive required |
|---|---|---|---|---|
| METAR | `GMS-AV-METAR` | Annex 3 §4.3 | Every 30 or 60 minutes (schedule per operational agreement) | Yes — permanent |
| SPECI | `GMS-AV-SPECI` | Annex 3 §4.4 | When threshold conditions met | Yes — permanent |
| TAF | `GMS-AV-TAF` | Annex 3 §5 | Every 6 hours (or per MBIA operational agreement) | Yes — permanent |
| TAF Amendment | `GMS-AV-TAF-AMD` | Annex 3 §5.5 | When forecast deteriorates | Yes — permanent |
| Aerodrome Warning | `GMS-AV-AWY` | Annex 3 §7.3 | When defined thresholds met | Yes — permanent |
| Wind Shear Alert | `GMS-AV-WSA` | Annex 3 §7.4 | When LLWS observed or forecast | Yes — permanent |
| Aviation Briefing | `GMS-AV-BRIEF` | PANS-MET §6 | On request and pre-flight | Yes — 2 years minimum |
| Trend Forecast | `GMS-AV-TREND` | Annex 3 §6 | Appended to METAR when applicable | Assess operational need |

---

## 3. Digital Requirements by Product

### 3.1 METAR and SPECI

**What digital implementation must deliver:**

| Requirement | Detail |
|---|---|
| Structured composition | Forecaster composes or validates each METAR/SPECI in a structured tool — not free text |
| Field validation | Wind, visibility, weather, cloud, temperature, dewpoint, pressure validated against ICAO encoding rules before transmission |
| Timestamp | Auto-recorded at observation time (UTC) and at encoding time |
| Author record | Issuing observer/encoder ID recorded on every report |
| Transmission log | Record of transmission to AFTN, ATIS, and other recipients |
| Archive | Every METAR and SPECI stored permanently with encoding, transmission record, and any corrections |
| Correction audit | Any correction (COR) issued must reference the original and record the reason and responsible person |
| Public API | METAR/SPECI available via structured API endpoint |

**Current status:** Partial. Schema exists in wxproducts. Composition tool and transmission log not yet implemented.

**Gap closure plan:**

| Action | Owner | Target |
|---|---|---|
| Aviation product composition UI in admin-gms | DTO / Developer | H2 2026 |
| METAR field validation against Annex 3 encoding rules | DTO | H2 2026 |
| Transmission log to AFTN and ATIS | Aviation MET lead + DTO | H2 2026 |
| Archive endpoint and search in admin-gms | DTO | H2 2026 |

---

### 3.2 TAF

**What digital implementation must deliver:**

| Requirement | Detail |
|---|---|
| Structured drafting | TAF drafted in a structured tool with field-level validation |
| Review and approval | TAF reviewed by a second qualified person before transmission |
| Amendment tracking | Amendments (AMD) linked to the original TAF; reason and delta recorded |
| Cancellation | Formal cancellation (CNL) recorded and transmitted when required |
| Archive | All TAFs, amendments, and cancellations archived with full authorship and timestamps |
| Lead time record | Time between forecast valid start and issuance time recorded for verification |
| Public API | Current and recent TAFs available via structured API |

**Current status:** Partial. Schema exists. Drafting, approval, amendment workflow not yet implemented.

**Gap closure plan:**

| Action | Owner | Target |
|---|---|---|
| TAF drafting and amendment workflow in admin-gms | DTO / Developer | H2 2026 |
| Two-person review enforcement in approval workflow | DTO | H2 2026 |
| TAF archive with amendment history | DTO | H2 2026 |
| Lead time auto-calculation for verification dashboard | DTO | H2 2026 |

---

### 3.3 Aerodrome Warnings

**What digital implementation must deliver:**

| Requirement | Detail |
|---|---|
| Formal issuance | Every aerodrome warning issued through the system — not verbal only |
| Threshold documentation | Warning thresholds (wind speed, visibility, CB, wind shear, etc.) documented in SOP and enforced in tool |
| Cancellation | Formal cancellation or all-clear issued and recorded |
| Notification | Warning delivered to ATC, GAA operations, airlines, and ground handlers with timestamp |
| Archive | All aerodrome warnings archived permanently with lifecycle history |

**Current status:** Gap. No aerodrome warning workflow implemented. This is a compliance gap.

**Gap closure plan:**

| Action | Owner | Target |
|---|---|---|
| Aerodrome warning module in admin-gms (linked to CAP lifecycle) | DTO / Developer | H2 2026 |
| Threshold table documented in SOP | Aviation MET lead | Q3 2026 |
| Notification list configured (ATC, GAA ops, airline duty contacts) | Aviation MET lead | Q3 2026 |
| ICAO verification that aerodrome warning gap is closed | Aviation MET lead | Q4 2026 |

---

### 3.4 Aviation Briefings

**What digital implementation must deliver:**

| Requirement | Detail |
|---|---|
| Briefing record | Every formal briefing (to pilot, airline, ATC, or airport) recorded with recipient, time, and content summary |
| Digital briefing dashboard | Consolidated view of current METAR, TAF, aerodrome warnings, and NWP for briefing support |
| Archive | Briefing records retained for a minimum of 2 years |

**Current status:** Gap. No briefing record or aviation dashboard implemented.

---

### 3.5 IWXXM Readiness

IWXXM (ICAO Weather Information Exchange Model) is the XML/GML standard for encoding aviation meteorological products for machine exchange. It is the ICAO-mandated format for SWIM (System-Wide Information Management).

**Current requirement:** Not immediately mandatory for MBIA operations, but GMS should build toward IWXXM output as part of regional and WMO interoperability.

| Action | Owner | Target |
|---|---|---|
| Confirm with CMO and ICAO CAR/SAM which IWXXM products are regionally mandated | Aviation MET lead | Q3 2026 |
| IWXXM encoding assessment — what wxproducts schema elements map to IWXXM | DTO | Q4 2026 |
| IWXXM pilot output for METAR/SPECI | DTO | Year 2 |

---

## 4. Quality Management Requirements

ICAO requires an operational quality management system (QMS) for aviation MET services. Digitally, this means:

| QMS requirement | Digital implementation |
|---|---|
| Product traceability | Author ID, timestamps, and approval record on every product |
| Correction and amendment log | Linked audit trail — every correction references original |
| Error and near-miss reporting | Aviation weather incident log in admin-gms |
| Performance review | Monthly aviation product performance report |
| Staff qualification records | Aviation MET staff authorisations documented |
| Calibration / maintenance records | Not yet in scope — physical instruments; note for Phase 3 |

**Post-event review** is required for any weather-related aviation incident or significant operational disruption. Records are retained permanently.

---

## 5. Contingency Procedures

If the primary digital system is unavailable, aviation MET operations must continue using backup procedures.

| Scenario | Backup procedure |
|---|---|
| Admin-gms dashboard unavailable | METAR/SPECI encoded manually; transmitted via phone/AFTN backup; handwritten record |
| Database unavailable | Manual log; retrospective entry when system restored |
| Internet outage | AFTN backup maintained; fax/phone contacts for ATC and GAA |
| Power outage | UPS for critical workstations; paper backup forms |

Backup procedures are documented in full in the Aviation SOP (see [SOP Index](./sop-index.md)).

---

## 6. Current Compliance Status Summary

| Area | Status | Priority |
|---|---|---|
| METAR/SPECI composition and validation | Partial | High |
| METAR/SPECI archive | Partial | High |
| TAF drafting and amendment | Gap | High |
| TAF archive | Gap | High |
| Aerodrome warnings | Gap | Critical |
| Wind shear alerts | Gap | High |
| Aviation briefing records | Gap | Medium |
| Aviation dashboard | Gap | Medium |
| QMS audit trail | Partial (CAP domain only) | High |
| IWXXM output | Gap | Low (Year 2) |
| Contingency procedures | Gap — SOP not documented | High |

---

## 7. Regulatory Contact

| Organisation | Contact point | Purpose |
|---|---|---|
| GCAA (Grenada Civil Aviation Authority) | Director of Civil Aviation | Regulatory authority; ICAO Annex 3 oversight |
| CMO (Caribbean Meteorological Organisation) | Technical Services | Regional coordination; ICAO CAR/SAM support |
| ICAO NAM/CAR Regional Office | As required | Annex 3 and PANS-MET compliance queries |

---

## Related Documents

| Document | Relationship |
|---|---|
| [Compliance Traceability Matrix](../internal/compliance-traceability.md) | Full ICAO/WMO obligations gap table |
| [Product Catalogue](../internal/product-catalogue.md) | Aviation product metadata and status |
| [SOP Index](./sop-index.md) | Aviation MET SOPs |
| [Quality and Verification Framework](./quality-verification-framework.md) | Aviation product performance metrics |
| [Warning Operations](../internal/warning-operations.md) | CAP lifecycle that aerodrome warnings will integrate with |
