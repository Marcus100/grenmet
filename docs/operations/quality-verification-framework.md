# Quality Management and Verification Framework

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Digital Transformation Officer |
| **Review** | Senior Forecaster, Warning Lead, Aviation MET Lead |
| **Last reviewed** | June 2026 |

> **Scope:** Defines how GMS measures, records, and improves the quality and performance of its digital meteorological services. For the code quality scorecard (tests, types, lint, design system) see [quality-score.md](../quality-score.md). This document covers operational service quality — forecast accuracy, warning timeliness, archive completeness, and stakeholder experience.

---

## 1. Purpose

Quality for a meteorological service is not only about code. It is about whether warnings reached people in time, whether forecasts were accurate, whether products were consistent across channels, and whether GMS can prove all of the above after the fact.

This framework defines:
- What GMS measures.
- How each metric is collected and calculated.
- What the target or threshold is.
- Who owns each metric and how often it is reviewed.

Every metric should eventually be generated automatically from operational data — not assembled manually. The digital system is the evidence engine.

---

## 2. Metric Categories

| Category | What it measures |
|---|---|
| **Timeliness** | Were products issued on schedule? |
| **Warning performance** | Were warnings accurate, timely, and well-calibrated? |
| **Consistency** | Were the same products consistent across dissemination channels? |
| **Archive completeness** | Were all required products archived with metadata? |
| **Aviation product quality** | Were aviation products meeting ICAO standards? |
| **System availability** | Was the platform available when needed? |
| **User engagement** | Are stakeholders and the public using GMS products? |
| **Review completion** | Are post-event reviews being completed? |

---

## 3. Timeliness Metrics

### Scheduled product timeliness

| Metric | Definition | Target | Collection method |
|---|---|---|---|
| On-time issue rate | % of scheduled products issued within the scheduled window | ≥ 95% | Archive timestamp vs. scheduled issue time |
| Average delay | Mean minutes late for products not issued on time | < 15 minutes | Calculated from archive |
| Missed products | Count of scheduled products not issued at all | 0 per month | Archive completeness check |

**Scheduled windows:**

| Product | Schedule | On-time window |
|---|---|---|
| Daily Public Forecast | 0600 and 1800 AST | ±15 minutes |
| Marine Forecast | 0600 AST | ±15 minutes |
| TAF | Per operational agreement | ±5 minutes |
| METAR | Every 30/60 minutes | ±2 minutes |

---

## 4. Warning Performance Metrics

Warning performance is the most important and most difficult to measure well. GMS should use standard meteorological verification methods, not ad hoc self-assessment.

### Terminology

| Term | Definition |
|---|---|
| **Hit** | Warning issued; hazardous event occurred |
| **False alarm** | Warning issued; no significant event |
| **Miss** | Hazardous event occurred; no warning issued |
| **Correct negative** | No warning issued; no event |

### Warning verification metrics

| Metric | Definition | Target | Review frequency |
|---|---|---|---|
| Hit rate (H) | Hits / (Hits + Misses) | > 0.80 | Quarterly |
| False alarm ratio (FAR) | False alarms / (Hits + False alarms) | < 0.30 | Quarterly |
| Critical success index (CSI) | Hits / (Hits + Misses + False alarms) | > 0.60 | Quarterly |
| Warning lead time — forecast events | Time between first warning issue and hazard onset | ≥ 6 hours for tropical / heavy rain events | Per event |
| Warning lead time — rapid onset | Time for flash flood and convective events | ≥ 2 hours where feasible | Per event |
| Level accuracy | Correct warning level selected vs. observed impact | Track over-warn and under-warn separately | Quarterly |

### IBF confidence calibration

GMS issues confidence levels (Low / Medium / High) with each warning. Calibration measures whether High-confidence warnings are indeed more often correct than Low-confidence warnings.

| Confidence level | Target: % of time event confirmed | Review frequency |
|---|---|---|
| High | > 85% | Quarterly |
| Medium | 50–85% | Quarterly |
| Low | 20–50% | Quarterly |

This calibration should be tracked as a dataset grows. In the first year, focus on recording confidence and outcomes consistently before deriving thresholds.

---

## 5. Consistency Metrics

Every published warning must deliver the same message across all channels. Inconsistency damages trust.

| Metric | Definition | Target | Collection method |
|---|---|---|---|
| Channel consistency rate | % of warnings where website, CAP feed, and social post match | 100% | Manual audit or automated diff check |
| Warning update lag | Max time between CAP publish and website display update | < 1 minute | System monitoring |
| Social post lag | Time between CAP publish and social media post | < 30 minutes | Dissemination log |
| Agency notification lag | Time between CAP publish and NDEMA/GAA notification | < 15 minutes | Dissemination log |

---

## 6. Archive Completeness Metrics

The archive is the operational record of GMS. Every product that is issued must be archived. Incompleteness is a compliance failure.

| Metric | Definition | Target | Review frequency |
|---|---|---|---|
| Archive completeness rate | % of scheduled and event-driven products with a confirmed archive record | 100% | Monthly |
| Metadata completeness | % of archived products with all required metadata fields populated | 100% | Monthly |
| Archive search availability | % of time archive search is accessible | ≥ 99.5% | Continuous monitoring |
| Retention compliance | % of records meeting defined retention periods (aviation: permanent; public: 10 years) | 100% | Annual audit |

---

## 7. Aviation Product Quality Metrics

These metrics are required for ICAO quality management system compliance.

| Metric | Definition | Target | Review frequency |
|---|---|---|---|
| METAR on-time rate | % of METAR issued within 2 minutes of scheduled observation time | ≥ 98% | Monthly |
| SPECI response time | Time from threshold condition to SPECI issue | < 5 minutes | Per event |
| TAF on-time rate | % of TAF issued before validity start | ≥ 99% | Monthly |
| TAF amendment rate | % of TAF requiring amendment | Track (no target — indicator only) | Monthly |
| Aerodrome warning lead time | Time between warning issue and condition onset | ≥ 30 minutes | Per event |
| METAR correction rate | % of METAR requiring COR issue | Track; investigate if > 2% | Monthly |
| Briefing record completion | % of formal briefings with a documented record | 100% | Monthly |

---

## 8. System Availability Metrics

| Metric | Target | Collection method |
|---|---|---|
| Public website uptime | ≥ 99.5% | Uptime monitoring (e.g. UptimeRobot) |
| CAP feed uptime | ≥ 99.9% | Endpoint monitoring |
| API uptime | ≥ 99.5% | Endpoint monitoring |
| Admin dashboard uptime | ≥ 99% | Internal monitoring |
| Data ingestion pipeline success rate | ≥ 95% | Pipeline logs |
| Backup success rate | 100% | CI workflow logs |
| Incident mean time to resolve (MTTR) — P1 | < 2 hours | Incident log |
| Incident mean time to resolve (MTTR) — P2 | < 8 hours | Incident log |

---

## 9. User Engagement Metrics

These metrics indicate whether GMS digital products are reaching and influencing their intended audiences.

| Metric | Definition | Data source | Review frequency |
|---|---|---|---|
| Public website unique visitors | Monthly unique visitors to spicewx | Analytics (PostHog) | Monthly |
| Warning page visits during events | Traffic to warning pages when an active warning is published | Analytics | Per event |
| CAP feed consumers | Registered or known downstream consumers of the CAP feed | Feed access logs | Quarterly |
| API usage | API requests per month by endpoint | API logs | Monthly |
| Social media reach | Impressions / reach on official weather posts during events | Social media insights | Per event |
| NDEMA adoption | Whether NDEMA is formally consuming the CAP feed | Stakeholder agreement | Quarterly |
| Media adoption | Number of media outlets using GMS official products | DTO tracking | Quarterly |

---

## 10. Post-Event Review Completion

| Metric | Definition | Target | Review |
|---|---|---|---|
| Post-event review rate | % of qualifying events with a completed post-event review | 100% | Monthly |
| Review timeliness | % of post-event reviews completed within 5 working days | ≥ 90% | Monthly |
| Action closure rate | % of improvement actions from reviews that are closed within 30 days | ≥ 80% | Quarterly |

A qualifying event is any event where a Warning or Extreme level product was issued, a significant miss occurred, or a stakeholder concern was raised.

---

## 11. Review Cadence

| Review | Frequency | Participants | Output |
|---|---|---|---|
| Product timeliness check | Weekly | Duty Senior Forecaster | Log any late or missed products |
| Warning verification summary | Monthly | Warning Lead + Senior Forecaster | Hit/miss/FAR table for the month |
| Aviation product review | Monthly | Aviation MET Lead | METAR/TAF/SPECI on-time rate; corrections |
| Archive audit | Monthly | DTO | Completeness report |
| System availability report | Monthly | DTO | Uptime and incident summary |
| User engagement report | Monthly | DTO | Website, API, CAP feed usage |
| Quarterly performance review | Quarterly | Programme Sponsor + DTO + Leads | All metrics; trend analysis; action items |
| Annual verification report | Annually | Programme Sponsor + DTO | Full-year summary; targets vs. actuals; revised targets |

---

## 12. Baselines

Baselines must be established before targets are meaningful. In the first six months of operation (H2 2026), the priority is to:

1. Record all metrics consistently.
2. Identify the baseline values from the data.
3. Set targets informed by baseline performance and ICAO/WMO guidance.
4. Report targets from Q1 2027 onwards.

The compliance traceability matrix identifies which metrics are regulatory requirements (ICAO Annex 3) and which are internal quality goals.

---

## 13. How the Digital System Generates Evidence

The ambition is for every metric to be derivable from the system without manual assembly.

| Metric | How the system generates it |
|---|---|
| Product timeliness | Archive timestamp + scheduled issue time = delay calculation |
| Warning hit/miss | Event log cross-referenced with warning archive by area and time |
| Archive completeness | Automated nightly check: expected products vs. archived products |
| Dissemination log | System records channel and timestamp on every publish action |
| Aviation on-time rate | METAR timestamp vs. observation schedule |
| CAP feed uptime | External uptime monitor polling `/api/cap/latest-active` |
| Post-event review completion | Review records in admin-gms linked to warning IDs |

Where automation is not yet possible, manual logging is the interim method. Manual logs are entered into the same system so reporting is consistent.

---

## Related Documents

| Document | Relationship |
|---|---|
| [Warning and IBF Framework](./warning-ibf-framework.md) | Warning lifecycle that generates verification evidence |
| [Aviation Compliance Plan](./aviation-compliance-plan.md) | Aviation product quality requirements |
| [Compliance Traceability Matrix](../internal/compliance-traceability.md) | ICAO QMS compliance obligations |
| [Warning Operations](../internal/warning-operations.md) | Audit trail that feeds verification data |
| [Quality Score](../quality-score.md) | Code and platform quality (separate from service quality) |
| [GMS Charter](../internal/gms-charter.md) | Success criteria and KPI targets |
| [DTO Terms of Reference](../internal/dto-terms-of-reference.md) | Programme KPIs |
