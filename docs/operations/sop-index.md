# Standard Operating Procedures — Index

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Index established; individual SOPs in draft |
| **Owner** | Digital Transformation Officer |
| **SOP approval authority** | Relevant unit lead + Programme Sponsor |
| **Last reviewed** | June 2026 |

> This index tracks all GMS Standard Operating Procedures. Each SOP covers a specific operational activity and is the authoritative procedure for that workflow. Individual SOPs live as separate files in this directory once drafted and approved.

---

## SOP Status Key

| Symbol | Meaning |
|---|---|
| `Approved` | Formally reviewed and approved by unit lead and Programme Sponsor |
| `Draft` | Written but not yet formally approved |
| `Stub` | Structure defined; content not yet written |
| `Gap` | Required but not yet started |

---

## SOP Register

### Public Weather

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-PUB-001 | Daily Public Forecast — Production Procedure | Senior Forecaster | Stub | `sop-pub-001-daily-forecast.md` |
| SOP-PUB-002 | 3-Day Forecast — Production Procedure | Senior Forecaster | Gap | — |
| SOP-PUB-003 | Current Conditions — Observation Entry and Display | Duty Forecaster | Gap | — |
| SOP-PUB-004 | Weather Graphic Card — Production and Posting | Duty Forecaster | Gap | — |

### Warning and Impact-Based Forecasting

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-WARN-001 | Warning Issuance — General Procedure | Warning Lead | Stub | `sop-warn-001-warning-issuance.md` |
| SOP-WARN-002 | Warning Cancellation and All-Clear | Warning Lead | Stub | `sop-warn-002-warning-cancellation.md` |
| SOP-WARN-003 | Heavy Rainfall Warning — Specific Thresholds and Workflow | Warning Lead | Gap | — |
| SOP-WARN-004 | Flash Flood Advisory / Watch / Warning | Warning Lead | Gap | — |
| SOP-WARN-005 | CAP Alert — Composition, Review, and Publication | Warning Lead | Stub | `sop-warn-005-cap-alert.md` |
| SOP-WARN-006 | Multi-Channel Dissemination — Warning Distribution | Warning Lead | Gap | — |
| SOP-WARN-007 | Post-Event Warning Review | Warning Lead + DTO | Gap | — |

### Tropical Cyclone

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-TC-001 | Tropical Cyclone Operations — General | Senior Forecaster | Gap | — |
| SOP-TC-002 | Tropical Weather Outlook — Issuance | Duty Forecaster | Gap | — |
| SOP-TC-003 | Local Impact Bulletin — Procedure | Warning Lead | Gap | — |
| SOP-TC-004 | Agency Briefing During Tropical Cyclone Event | Senior Forecaster | Gap | — |
| SOP-TC-005 | Post-Tropical Cyclone Report | Senior Forecaster + DTO | Gap | — |

### Aviation Meteorological Service

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-AV-001 | METAR — Observation, Encoding, and Transmission | Aviation MET Lead | Stub | `sop-av-001-metar.md` |
| SOP-AV-002 | SPECI — Threshold-Triggered Observation Procedure | Aviation MET Lead | Gap | — |
| SOP-AV-003 | TAF — Drafting, Review, and Issuance | Aviation MET Lead | Stub | `sop-av-003-taf.md` |
| SOP-AV-004 | TAF Amendment — Trigger and Procedure | Aviation MET Lead | Gap | — |
| SOP-AV-005 | Aerodrome Warning — Issuance and Cancellation | Aviation MET Lead | Gap | — |
| SOP-AV-006 | Aviation Pilot Briefing — Procedure | Aviation MET Lead | Gap | — |
| SOP-AV-007 | Aviation System Outage — Contingency Procedure | Aviation MET Lead + DTO | Gap | — |

### Marine Weather

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-MAR-001 | Marine Forecast — Production Procedure | Duty Forecaster | Gap | — |
| SOP-MAR-002 | Small Craft Advisory — Threshold and Issuance | Duty Forecaster | Gap | — |
| SOP-MAR-003 | Marine Incident Weather Report | Senior Forecaster | Gap | — |

### Product Approval and Publishing

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-PROD-001 | Product Review and Approval — General | Senior Forecaster | Gap | — |
| SOP-PROD-002 | Website and API Publishing | DTO | Gap | — |
| SOP-PROD-003 | Social Media Posting — Official Weather Products | Duty Forecaster | Gap | — |
| SOP-PROD-004 | Product Correction Procedure | Duty Forecaster | Gap | — |
| SOP-PROD-005 | Product Archive Verification | DTO | Gap | — |

### System and Continuity

| ID | SOP Title | Owner | Status | File |
|---|---|---|---|---|
| SOP-SYS-001 | System Outage — Response and Backup Procedure | DTO | Stub | `sop-sys-001-system-outage.md` |
| SOP-SYS-002 | Data Ingestion Failure — Response | DTO | Gap | — |
| SOP-SYS-003 | Security Incident — Response | DTO | Gap | — |
| SOP-SYS-004 | Backup and Restore Verification | DTO | Gap | — |

---

## SOP Template

All SOPs follow this structure:

```markdown
# SOP-XXX-000 — [Title]

| Field | Detail |
|---|---|
| **SOP ID** | SOP-XXX-000 |
| **Title** | |
| **Version** | 1.0 |
| **Status** | Draft / Approved |
| **Owner** | [Role] |
| **Approved by** | [Role + date] |
| **Next review** | [Date] |

## 1. Purpose
What this SOP governs and why it exists.

## 2. Scope
Which products, systems, and personnel this SOP applies to.

## 3. Roles and Responsibilities
Who does what in this procedure.

## 4. Inputs
What information, data, or conditions trigger or feed this procedure.

## 5. Procedure
Step-by-step instructions. System steps reference specific screens or actions in admin-gms or spicewx.

## 6. Approval Requirement
Who must approve before publication.

## 7. Dissemination
Which channels receive the output of this procedure and how.

## 8. Fallback / Contingency
What to do if the system or a step fails.

## 9. Records Generated
What records this procedure creates and where they are stored.

## 10. Quality Checks
What the forecaster verifies before and after completion.

## 11. Review Frequency
How often this SOP is reviewed and by whom.
```

---

## SOP Stub: SOP-WARN-001 — Warning Issuance — General Procedure

| Field | Detail |
|---|---|
| **SOP ID** | SOP-WARN-001 |
| **Version** | 0.1 Draft |
| **Owner** | Warning Lead |
| **Status** | Stub — requires content review with Forecasting Unit |

### 1. Purpose
Defines the standard procedure for issuing any public weather warning through the GMS digital system.

### 2. Scope
All Advisory, Watch, Warning, and Extreme level products issued by GMS. Applies to all hazard types. Does not cover aviation aerodrome warnings (see SOP-AV-005).

### 3. Roles
- **Duty Forecaster:** Drafts the warning using the CAP alert tool in admin-gms.
- **Senior Forecaster / Warning Lead:** Reviews content, checks dissemination channels, approves and submits for publication.
- **DTO:** Ensures system is operational; escalates technical issues.

### 4. Procedure (stub)
1. Assess hazard signal from observations, NWP, satellite, or regional guidance.
2. Determine likelihood and impact using the IBF matrix (see [Warning and IBF Framework](./warning-ibf-framework.md)).
3. Open CAP Alert tool in admin-gms → New Alert.
4. Complete all mandatory fields (see Warning Content Contract).
5. Select affected areas using predefined zones or draw polygon.
6. Submit for review.
7. Senior Forecaster reviews content and approves.
8. Publish — system generates CAP XML, updates feed endpoints.
9. Confirm website warning banner is visible.
10. Post social media notification using approved template.
11. Notify NDEMA, GAA, and media contacts by email/phone.
12. Log dissemination completed.

### 8. Fallback
If admin-gms is unavailable: draft warning in approved plain-text format, notify channels by phone and email, enter record manually when system is restored.

---

## SOP Stub: SOP-AV-001 — METAR Observation, Encoding, and Transmission

| Field | Detail |
|---|---|
| **SOP ID** | SOP-AV-001 |
| **Version** | 0.1 Draft |
| **Owner** | Aviation MET Lead |
| **Status** | Stub — requires review with Aviation MET staff |

### 1. Purpose
Defines the procedure for routine METAR observation, encoding, validation, transmission, and archiving.

### 2. Scope
All routine METAR observations at MBIA. SPECI procedure is covered in SOP-AV-002.

### 3. Roles
- **Observer / Encoder:** Conducts the observation and encodes the METAR.
- **Aviation MET Lead:** Supervises; reviews corrections.

### 4. Procedure (stub)
1. Conduct surface observation at scheduled time (UTC).
2. Record values: wind, visibility, present weather, cloud, temperature, dewpoint, QNH.
3. Open METAR tool in admin-gms → New METAR.
4. Enter all fields; system validates against Annex 3 encoding rules.
5. Resolve any validation errors before proceeding.
6. Submit METAR → system records timestamp and author.
7. Transmit via AFTN connection.
8. Confirm transmission received by ATC.
9. Archive record confirmed automatically.

### 8. Fallback
If digital tool is unavailable: encode METAR manually using standard form. Transmit by phone to ATC. Record time, content, and transmission confirmation. Enter retrospectively when system is restored.

---

## SOP Stub: SOP-SYS-001 — System Outage Response and Backup Procedure

| Field | Detail |
|---|---|
| **SOP ID** | SOP-SYS-001 |
| **Version** | 0.1 Draft |
| **Owner** | DTO |
| **Status** | Stub |

### 1. Purpose
Defines how GMS maintains operational meteorological services when digital systems are partially or fully unavailable.

### 4. Procedure (stub)
1. Identify the scope of the outage (which systems are affected).
2. Notify DTO and Aviation MET Lead immediately.
3. Activate manual backup procedures for each affected service (see product-specific SOPs).
4. Notify ISDS for infrastructure-level issues.
5. Maintain handwritten log of all products issued during the outage.
6. Update public website (if accessible) or post to social media: "GMS is currently experiencing a technical issue. Weather services are continuing. Updates to follow."
7. Retrospectively enter all manual records when system is restored.
8. Document the outage in the system incident log.

---

## Related Documents

| Document | Relationship |
|---|---|
| [Warning and IBF Framework](./warning-ibf-framework.md) | Procedure framework that SOPs implement |
| [Aviation Compliance Plan](./aviation-compliance-plan.md) | Aviation-specific procedure requirements |
| [Cybersecurity and Continuity Plan](./cybersecurity-continuity.md) | System outage and incident response |
| [Warning Operations](../internal/warning-operations.md) | CAP system states and endpoints |
| [Product Catalogue](../internal/product-catalogue.md) | Product codes referenced in SOPs |
