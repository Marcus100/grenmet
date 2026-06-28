# Warning and Impact-Based Forecasting Framework

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Warning Lead / Senior Forecaster |
| **Review** | DTO, Forecasting Unit |
| **Last reviewed** | June 2026 |

> **Scope:** This document defines the strategic framework — warning lifecycle, severity levels, content contract, and IBF principles. For the implemented CAP lifecycle in the codebase (states, endpoints, audit trail) see [warning-operations.md](../internal/warning-operations.md). For compliance mapping see [compliance-traceability.md](../internal/compliance-traceability.md).

---

## 1. Purpose

Warnings are GMS's most consequential output. This framework ensures:

- Every warning is structured around real hazard likelihood and impact, not only meteorological thresholds.
- The same message reaches the public, NDEMA, airports, media, and digital systems consistently.
- Forecasters follow a documented, auditable process for every warning decision.
- GMS can demonstrate after any event that the warning was issued, at what time, to what level, and through which channels.

---

## 2. Warning Philosophy

GMS warnings follow the impact-based forecasting model: the question is not only "what will the weather do?" but "what will the weather do **to people, infrastructure, and operations**?"

Every warning should answer four questions for the user:
1. **What** hazard is expected?
2. **Where** will it affect?
3. **When** will it occur and how long will it last?
4. **What should I do?**

Confidence in the forecast should always be communicated. A high-confidence warning for moderate impact is often more useful than an uncertain warning for extreme impact.

---

## 3. Warning Severity Levels

GMS uses a four-level colour-coded severity framework. These levels apply across all hazard types.

| Level | Colour | Meaning | Expected public response |
|---|---|---|---|
| **1 — Advisory** | Yellow | Conditions are possible that could be hazardous for some users or activities | Be aware; monitor updates |
| **2 — Watch** | Amber | Conditions are likely that could be hazardous for a broad population or area | Prepare; review plans |
| **3 — Warning** | Red | Hazardous conditions are expected or are occurring; impacts are likely | Take protective action now |
| **4 — Extreme** | Purple | Extreme or life-threatening conditions; severe impacts are imminent or occurring | Immediate emergency action |

### Escalation and de-escalation

- Levels escalate when the forecast confidence or severity increases.
- Levels de-escalate when the threat diminishes. De-escalation is not cancellation — it is a downgrade message.
- Cancellation occurs when the hazard has passed and no further risk exists.
- An all-clear is always issued explicitly — warnings do not silently expire without communication.

---

## 4. Hazard Types

The following hazard types are active for v1 warning operations:

| Hazard | Warning levels in use | Notes |
|---|---|---|
| Heavy rainfall | Advisory, Watch, Warning | Primary inland flood driver |
| Flash flooding | Advisory, Watch, Warning | Rapid-onset events; tight geographic scope |
| High wind | Advisory, Warning | Outside tropical cyclone context |
| Thunderstorms / lightning | Advisory, Warning | Include outdoor and marine impact language |
| Small craft / marine | Advisory, Warning | Coordinate with marine forecast |
| Tropical cyclone — local | Watch, Warning, Extreme | Interpret NHC guidance for Grenada specifically |
| Coastal flooding / storm surge | Advisory, Warning | Coordinate with marine and TC products |
| Saharan dust | Advisory | Air quality and visibility impact |
| High surf | Advisory, Warning | Beach and coastal safety focus |

---

## 5. Warning Lifecycle

```
Monitor
  ↓
Detect hazard signal (observation, model, satellite, regional guidance)
  ↓
Assess: likelihood × impact × affected area
  ↓
Select: warning level (Advisory / Watch / Warning / Extreme)
  ↓
Draft warning message (forecaster)
  ↓
Internal review (Senior Forecaster)
  ↓
Approve
  ↓
Publish → CAP XML generated → feeds updated
  ↓
Disseminate (website, API feed, CAP RSS, social, agency channels)
  ↓
Monitor and update (every scheduled interval or when conditions change)
  ↓
Escalate or de-escalate if needed
  ↓
Cancel / all-clear issued explicitly
  ↓
Archive (all states, all content, full audit trail)
  ↓
Post-event review (within 5 working days of significant events)
```

The implemented CAP system enforces: `DRAFT → SUBMITTED → APPROVED → PUBLISHED → EXPIRED / CANCELLED`.

No published warning is deleted. All lifecycle transitions are logged with actor, timestamp, and note.

---

## 6. Warning Content Contract

Every published warning must include all mandatory fields.

| Field | Mandatory? | Notes |
|---|---|---|
| `hazardType` | Yes | Standardised hazard name from the approved list |
| `warningLevel` | Yes | Advisory / Watch / Warning / Extreme |
| `headline` | Yes | Single sentence; hazard, area, and timing |
| `affectedAreas` | Yes | Named parishes or zones; polygon in CAP |
| `validFrom` | Yes | UTC datetime |
| `validTo` | Yes | UTC datetime |
| `issueTime` | Yes | UTC datetime |
| `status` | Yes | New / Update / Cancel |
| `whatIsExpected` | Yes | Meteorological description; plain language |
| `potentialImpacts` | Yes | What the hazard may cause; action-oriented |
| `actions` | Yes | What the public should do now |
| `confidence` | Yes | Low / Medium / High |
| `nextUpdate` | Yes | When the next update will be issued |
| `source` | Yes | "Grenada Meteorological Service" |
| `forecasterID` | Yes | Issuing forecaster (system-recorded) |
| `approvedBy` | Yes | Reviewer (system-recorded) |
| `capeIdentifier` | Yes | Unique CAP message identifier |

### Example warning content block

```yaml
hazardType: "Heavy Rainfall"
warningLevel: "Watch"
headline: "Heavy rainfall likely to affect Grenada from tonight"
affectedAreas:
  - "Mainland Grenada"
  - "Carriacou"
validFrom: "2026-06-01T18:00:00-04:00"
validTo: "2026-06-02T06:00:00-04:00"
issueTime: "2026-06-01T12:00:00-04:00"
status: "New"
whatIsExpected: >
  Periods of heavy showers and embedded thunderstorms expected
  tonight into early tomorrow morning. Rainfall totals of
  50 to 100 mm possible, with locally higher amounts.
potentialImpacts:
  - "Localised flooding, especially in low-lying areas and near streams"
  - "Landslides on steep or unstable slopes"
  - "Reduced visibility on roads during heavy bursts"
  - "Disruption to outdoor activities and marine operations"
actions:
  - "Avoid crossing flooded roads and streams"
  - "Stay away from steep slopes during heavy rain"
  - "Monitor official updates from GMS"
  - "Secure loose outdoor items"
confidence: "Medium"
nextUpdate: "2026-06-01T18:00:00-04:00"
source: "Grenada Meteorological Service"
```

---

## 7. Impact-Based Forecasting (IBF) Framework

### Likelihood × Impact matrix

| | **Minor impact** | **Moderate impact** | **Severe impact** | **Extreme impact** |
|---|---|---|---|---|
| **Very High likelihood** | Advisory | Watch | Warning | Extreme |
| **High likelihood** | Advisory | Watch | Warning | Warning |
| **Medium likelihood** | Green | Advisory | Watch | Warning |
| **Low likelihood** | Green | Green | Advisory | Watch |
| **Very Low likelihood** | Green | Green | Green | Advisory |

This matrix is a guide. Forecaster judgement overrides the matrix where operational experience justifies it. All overrides should be documented in the warning note field.

### Impact categories

| Category | Examples |
|---|---|
| **Infrastructure** | Road closures, bridge damage, power outages |
| **Flooding** | Urban flooding, stream overflows, property damage |
| **Landslide** | Slope failures, road blockages |
| **Marine** | Vessel danger, port disruption, wave damage |
| **Aviation** | Flight delays, diversions, aerodrome closure |
| **Agriculture** | Crop damage, livestock risk, soil erosion |
| **Public safety** | Injuries, evacuation need, restricted movement |
| **Utilities** | Water supply disruption, communications outage |

---

## 8. Dissemination Requirements

Every published warning must be disseminated through all available channels simultaneously. Dissemination is not optional once a warning is approved and published.

| Channel | Mechanism | Responsible |
|---|---|---|
| Public website (spicewx) | CAP feed → website component | DTO / developer |
| CAP XML/RSS feed | Automatic on publish | System |
| GeoJSON endpoint | Automatic on publish | System |
| Social media | Manual post using approved template | Duty Forecaster |
| Agency notification (NDEMA, GAA, ATC) | Email / phone — documented in SOP | Duty Forecaster |
| Media notification | Email list — documented in SOP | Duty Forecaster |
| WhatsApp broadcast | Manual (planned: automated) | Duty Forecaster |

The dissemination log must be completed for every warning. Gaps in dissemination are flagged in the post-event review.

---

## 9. Post-Event Review

A post-event review is required within **5 working days** after any event where:

- A Warning or Extreme level product was issued.
- An advisory or watch was not followed by expected conditions (potential false alarm).
- A hazardous event occurred without an advisory being issued (missed event).
- A significant stakeholder concern was raised about GMS warning performance.

The review covers:

| Area | Questions |
|---|---|
| Timeliness | How early was the first warning issued? Was lead time sufficient? |
| Accuracy | Did the event match the forecast? Where did it differ? |
| Content | Were impacts and actions appropriate? Was language clear? |
| Dissemination | Did all channels receive the message? Were there gaps? |
| Stakeholder response | How did NDEMA, media, and the public respond? |
| Gaps | What should be improved for next time? |

Post-event review records are archived. Recurring gaps result in SOP updates.

---

## Related Documents

| Document | Relationship |
|---|---|
| [Warning Operations](../internal/warning-operations.md) | Implemented CAP lifecycle in the codebase |
| [Compliance Traceability Matrix](../internal/compliance-traceability.md) | CAP and IBF standards alignment |
| [Product Catalogue](../internal/product-catalogue.md) | Warning product codes and metadata |
| [SOP Index](./sop-index.md) | Operational procedures for each warning product |
| [Quality and Verification Framework](./quality-verification-framework.md) | Warning performance metrics |
| [Stakeholder Research Plan](../internal/stakeholder-research-plan.md) | Stakeholder decision thresholds that inform warning levels |
