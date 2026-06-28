# Cybersecurity, Resilience, and Continuity Plan

| Field | Detail |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Digital Transformation Officer |
| **ICT review** | Manager, ISDS |
| **Last reviewed** | June 2026 |

> **Scope:** Operational cybersecurity posture and continuity procedures for GMS digital services. For the engineering-level security baseline (CORS, sessions, rate limiting, secrets) see [security.md](../security.md). For the system outage SOP see [SOP-SYS-001](./sop-index.md).

---

## 1. Why Cybersecurity is a Public Safety Issue for GMS

For a meteorological service, a security incident is not only an IT problem. It is a public safety and public trust problem.

| Incident type | Consequence |
|---|---|
| Website defacement | Public cannot access authoritative weather; trust damaged |
| False warning published | Public panic; legal exposure; reputational damage to GMS |
| Warning system unavailable during a hazardous event | Reduced warning capability at the worst possible time |
| Data tampering | Wrong decisions by aviation, marine, or public safety users |
| Credential compromise | Unauthorised products issued under a forecaster's identity |
| Archive manipulation | Official record integrity compromised |

These are not hypothetical risks. They justify treating cybersecurity as a service-continuity requirement, not an IT overhead.

---

## 2. Trust Architecture

The GMS digital system maintains public trust through:

**Authority chain:** Every product is linked to an identified forecaster. No product reaches publication without an approval record.

**Audit immutability:** Warning records, CAP snapshots, and audit events are append-only. No official product is deleted as a normal workflow.

**Separation of duties:** No single user can draft, approve, and publish a warning without a second person's involvement. This is enforced at the system level.

**Channel consistency:** The same warning content is delivered across website, CAP feed, and social channels simultaneously. Inconsistency between channels is flagged as an incident.

---

## 3. Access Controls

### Role-based access control

| Role | Capabilities |
|---|---|
| **Duty Forecaster** | Draft products; submit for approval; post social media |
| **Senior Forecaster / Warning Lead** | All of the above; approve and publish warnings |
| **Aviation MET Lead** | Draft, review, and publish aviation products; approve aviation warnings |
| **DTO / System Administrator** | System configuration; user management; no ability to approve products unless role is also Forecaster |
| **Read-only viewer** | View dashboard and archive; no edit capability |
| **Public API** | Read-only access to published products and feeds; no authentication required |

### Key controls

| Control | Implementation | Status |
|---|---|---|
| Role-based permissions | FastAPI permission keys (e.g. `cap.alert.publish`, `cap.alert.approve`) | Implemented |
| Multi-factor authentication | Required for all staff accounts | Gap — enforce on all accounts |
| Session management | Opaque token in httpOnly, SameSite=Lax cookie; short-lived access tokens | Implemented |
| Rate limiting | Login and recovery endpoints rate-limited via SlowAPI | Implemented |
| Account lockout | Not yet implemented — add after MFA | Gap |
| Privileged access review | Quarterly review of role assignments | Gap — process not established |

---

## 4. System Integrity Controls

| Control | Purpose | Status |
|---|---|---|
| Approval workflow | Prevents any single person from publishing without review | Implemented (CAP domain) |
| CAP XML snapshots | Permanent record of every published warning | Implemented |
| Audit log | Every create, update, approve, publish, cancel, expire action logged with actor and timestamp | Implemented (CAP domain) |
| Product versioning | Amendments reference originals; full history retained | Implemented |
| No-delete policy | Warning records are not deleted; states are terminal | Implemented — enforce in all new domains |
| Webhook signature verification | Resend and external webhooks verified with signing keys | Implemented (optional warning) |
| Vulnerability scanning | Trivy scans API image in CI | Implemented |

---

## 5. Infrastructure Controls

| Control | Implementation | Status |
|---|---|---|
| HTTPS everywhere | Traefik terminates TLS; HTTP redirected | Implemented |
| Secrets management | Secrets in GitHub Environments; never in code | Implemented |
| Database credentials | Environment-injected; not hardcoded | Implemented |
| Dashboard basic auth | Traefik and Adminer dashboards protected | Implemented |
| Production database isolation | No direct frontend access to FastAPI DB | Implemented |
| Automated backups | Daily pg_dump, verified restore, uploaded to DigitalOcean Spaces | Implemented |
| Backup retention | 30 days local; Spaces for longer retention | Implemented |
| CORS | Explicit origin whitelist; no wildcard in production | Implemented |
| Error tracking | Sentry for FastAPI; Next.js Sentry instrumentation | Implemented |

---

## 6. Dissemination Integrity

| Risk | Control |
|---|---|
| False warning posted on social media | Social media posting follows SOP; confirmation that CAP system published first is required before social post |
| Website shows different content from CAP feed | Active warning banner on website sourced from CAP feed — not a separate CMS entry |
| Unauthorised access to warning publication | `cap.alert.publish` permission required; MFA on all accounts with publish rights |
| Stale warning displayed after cancellation | Expiry and cancellation auto-update public feeds; monitoring check every 15 minutes |

---

## 7. Incident Response

### Incident classification

| Severity | Definition | Examples |
|---|---|---|
| **P1 — Critical** | Ongoing harm or imminent harm to public safety or aviation safety | False warning published; website unavailable during active hazard; aviation product compromised |
| **P2 — High** | System unavailable or integrity uncertain; no immediate safety impact | Warning system offline; database unreachable; credentials compromised |
| **P3 — Medium** | Degraded service; workaround possible | One dissemination channel failing; dashboard slow; minor data gap |
| **P4 — Low** | No operational impact; investigation required | Suspicious login attempt; minor configuration drift |

### Response procedure

| Step | Action | Who |
|---|---|---|
| 1 | Detect and classify incident | DTO |
| 2 | Notify Programme Sponsor and ISDS immediately (P1/P2) | DTO |
| 3 | Activate manual backup procedures if system is compromised (see [SOP-SYS-001](./sop-index.md)) | DTO + Forecasting Unit |
| 4 | Isolate affected component if needed (take down system rather than serve wrong data) | DTO + ISDS |
| 5 | Communicate publicly if warning availability is affected | Programme Sponsor |
| 6 | Restore from last verified backup if data integrity is in question | DTO |
| 7 | Document incident: timeline, impact, actions taken, resolution | DTO |
| 8 | Post-incident review within 5 working days | DTO + ISDS |
| 9 | Update controls and SOPs to prevent recurrence | DTO |

### P1 contacts

| Contact | Role | Purpose |
|---|---|---|
| DTO (Eugine Whint) | Primary incident lead | All incidents |
| Manager, ISDS (Kurt Williams) | Infrastructure escalation | P1/P2 infrastructure events |
| Manager, Meteorology (Gerard Tamar) | Programme Sponsor | P1 events requiring management decision |
| Director of Operations | Formal escalation | P1 events with public safety or legal exposure |

---

## 8. Backup Dissemination Channels

If the primary digital platform is unavailable, GMS must continue to disseminate weather products through backup channels.

| Primary channel | Backup channel | Who activates |
|---|---|---|
| Website (spicewx) | GMS social media pages (Facebook, Instagram) | Duty Forecaster |
| CAP feed / API | Email distribution list to NDEMA, GAA, media | Duty Forecaster |
| Website warning banner | WhatsApp broadcast to agency contacts | Duty Forecaster |
| Digital aviation products | Phone / AFTN backup to ATC and GAA | Aviation MET Lead |
| Observation dashboard | Manual observation reports by phone / email | Observations Lead |

Backup contact lists (NDEMA, GAA, ATC, media, airlines) must be:
- Maintained in a physical printed list at the GMS duty station.
- Updated at least quarterly.
- Tested at least once per year.

---

## 9. Continuity Testing

| Test | Frequency | Owner |
|---|---|---|
| Backup dissemination drill (simulate website down) | Twice per year — pre-hurricane season (May) and mid-season (August) | DTO + Forecasting Unit |
| Backup contact list verification | Quarterly | DTO |
| Database restore verification | Monthly (automated CI check) | DTO |
| Account access review | Quarterly | DTO |
| Social media account access audit | Quarterly | DTO |
| Simulated credential compromise drill | Annually | DTO + ISDS |

Drill results are documented and reviewed. Failures result in SOP or control updates.

---

## 10. Gaps Requiring Closure

| Gap | Priority | Target |
|---|---|---|
| MFA not enforced on all staff accounts | High | Q3 2026 |
| Privileged access review process not established | High | Q3 2026 |
| Account lockout not implemented | Medium | Q3 2026 |
| Audit trail extends only to CAP domain — not HR or other domains | Medium | H2 2026 |
| Security incident response not formally documented in SOP | High | Q3 2026 |
| Backup contact list not maintained in physical format | High | Q3 2026 |
| Continuity drills not yet scheduled | High | May 2026 pre-season drill |

---

## Related Documents

| Document | Relationship |
|---|---|
| [Security Baseline](../security.md) | Engineering-level implementation details |
| [SOP Index](./sop-index.md) | SOP-SYS-001 system outage procedure |
| [Data Architecture](../data-architecture.md) | Backup architecture and database isolation |
| [GMS Charter](../internal/gms-charter.md) | Cybersecurity risk register |
| [Infrastructure](../infrastructure.md) | Infrastructure operations and backup commands |
