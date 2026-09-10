# GMS masterlist adoption and delivery brief

Recorded 2026-09-10. Status: source inventory extracted; proposed delivery slices and unresolved operational decisions. This brief supports the [GAA/GMS programme plan](../portfolio/gaa-gms-client-programme-plan.md); it does not change programme priority or approve procedures.

## Source and extraction

Source: `temp-files/Masterlist draft table 21 Aug.docx`, supplied by the user. SHA-256: `f6358da417df3a7baba0219a0e81be95a3a13a7c093e81e08b5bc11c6077c346`.

The [CSV inventory](gms-document-masterlist.csv) contains all 85 titled entries: Forecasting 19, Climatology 5, Observation 7, Instruments 3, Administration 11, Management and QMS 29, Training/Competency 11. These are source sections, not validated domain assignments: the final section also contains continuity, complaints and data-management procedures.

Each entry retains the ten source columns plus its one-based table/row locator, original cell count and preceding section heading. Paragraph boundaries remain newlines; spelling, whitespace, ambiguous dates, duplicate titles and blank values are retained. One nine-cell row (AMF competency) has an empty trailing remarks field in the CSV; `source_cell_count` preserves that distinction. Blank/layout rows and headings are excluded. All ten fields were compared with the extracted source after CSV round-trip. Source row locators are not permanent document identifiers.

The source DOCX remains unchanged. This is a metadata inventory, not an import of the referenced SOPs, completed records or attached evidence. The source is in a temporary directory: preserve the original in approved document storage before removing that directory. The checksum identifies the reviewed copy even if its filename changes. No inference of approval follows from a version number or revision date.

## What changes in project understanding

The [SOP index](sop-index.md) describes software-era procedure gaps, while the masterlist names existing institutional procedures. A repository gap does not establish that GMS lacks a procedure. Retrieve and compare the source documents before drafting replacements. Keep institutional document numbers distinct from repository planning IDs and meteorological product identifiers.

Existing [authored product storage](../../apps/web/gaa-admin/src/db/wxproducts/schema/authored.ts), [CAP audit records](../../apps/api/fastapi/src/cap/models.py), [staff credentials](../../apps/api/fastapi/src/baseline/models.py), and [SURFACE equipment/maintenance models](../../surface/api/wx/models.py) provide reuse points. They do not, by themselves, establish an accepted controlled-document or competency system.

## Candidate procedure crosswalk

These are title-based discovery links, not confirmed equivalence. Underlying documents must be inspected before adopting a mapping. Codes below use display-normalized spacing; the CSV preserves source spelling.

| Institutional source | Repository planning target | Next evidence needed |
| --- | --- | --- |
| MET SOP-002-01; MET F-002-01/02/03 | SOP-PUB-001/002; forecast desk F01/F07 | Retrieve all three July 2026 forms; compare sections, issue variants and sign-off with current editors. |
| MET SOP-004-01 | SOP-MAR-001; F07 | Compare marine bulletin SOP with current editor and official output. |
| MET WI-004-02 | SOP-WARN-001/005/006; F10/F11 | Source explicitly requests CAP update; exercise actual review, issue, update/cancel and delivery workflow before revising instructions. |
| MET SOP-011; MET SOP-010 | SOP-AV-001/002; F20 | Inspect METAR/SPECI procedures and confirm existing transmission, correction and fallback arrangements. |
| MET WI-002-01; MET QP-002-01 | SOP-AV-003/004; F21 | Source says method changed; obtain the current method and TAF flowchart. |
| MET SOP-003-02; MET F-003-001; MET F-003-02 | SOP-AV-006; F23 | Resolve duplicate briefing-record titles before selecting a template. |
| MET WI-005-01; MET F-033; MET F-005-01 | F04 handover | Retrieve checklist, incoming-shift instruction and debriefing form; validate outstanding-duty transfer. |
| MET F-012/013/014; MET SOP-013 | F15 station/instrument health | Map fields and identifiers to SURFACE equipment and maintenance before adding storage. |
| MET WI-006; MET SOP-031 | F16/F34 data workflows | Source explicitly requests electronic-register update; identify the actual register and data owner. |
| MET SOP-015/016; MET F-029/030; MET G-001 | F01/F02/F25 document and evidence control | Obtain control-of-documents/records procedures, revision template and QMS change log. |
| MET F-022 through MET F-028; MET F-031; MET SOP-023 through MET SOP-028 | F14/F25 quality evidence | Inspect audit, incident and corrective-action forms; agree responsibility and closure evidence. |
| MET QM-003; MET SOP-007/018/032; CAS gap analysis | F04/E11 competency | Confirm assessment evidence and assessors; a staff grade or training attendance is not an assessment result. |
| MET SOP-029 | SOP-SYS-001; F03 continuity | Compare institutional continuity procedure with technical recovery runbooks and observed exercises. |

F/E identifiers refer to the [GMS strategy backlog](../internal/gms-product-strategy-and-roadmap.md). This crosswalk refines those packages instead of creating a competing roadmap.

## Reconciliation queue

Owners below are suggested roles, not assigned people. All items remain open.

| ID | Source evidence or ambiguity | Required decision and suggested owner |
| --- | --- | --- |
| ML-01 | Customer-related forms F-017/F-036, tour surveys F-018/F-037 and aviation/public surveys F-019/F-038 repeat titles; legacy code associations also differ. | Document controller: compare originals and decide separate versions, aliases or duplicates. Preserve every source row until resolved. |
| ML-02 | F-003-001 and F-003-02 share the flight-folder records title but have different versions/dates. | Aviation lead: select or distinguish the forms; do not silently normalize the extra zero. |
| ML-03 | Missing new code for CAS gap analysis; missing types/versions/dates; malformed TAF date and incomplete customer-process date. | Document controller: verify originals and record correction evidence. Do not manufacture dates or IDs. |
| ML-04 | Master List entry G-001 says version 4, Aug 2025; other entries reach July 2026. | Document controller: establish the register's actual revision and approval history. Filename does not resolve this. |
| ML-05 | METAR pad and issued bulletins say one year then Destroy; project retention guidance differs. | Records owner with aviation/product leads: distinguish paper originals, templates, issued products and digital copies, retention start event, archive duration and disposition authority. No deletion policy is imported. |
| ML-06 | CAP, TAF, electronic register and model-monitoring instructions explicitly need updates. | Warning, aviation, data and forecasting leads: retrieve source content and validate current workflow before approving revisions. |
| ML-07 | Many storage fields are blank or point to M:/Z: drives, folders, cupboards or CAeM. | Document controller: locate files, establish access classification and durable storage; a path in the CSV is not a retrieved document. |
| ML-08 | Repository SOP IDs and institutional MET codes differ; source headings include mixed subjects. | Document controller and engineering: approve many-to-many crosswalks without renumbering institutional records. |

The retention difference is between supplied/project documents, not a determination of legal requirements. See [data architecture](../data-architecture.md) and the [draft quality framework](quality-verification-framework.md). Approved policy and applicability evidence must resolve it.

## Delivery slices

Start with ML-01 through ML-08 as a document-retrieval and reconciliation session. Confirm active forecasting, warnings, aviation and continuity documents first; incomplete unrelated entries need not prevent this bounded pilot.

### 1. Searchable controlled-document pilot — F01/F02/F25

Proposed placement: GMS-scoped staff-portal document library, aligned with the existing documentation workstream. Pilot public forecast, marine, CAP, METAR/SPECI, TAF and handover procedures. Reuse staff authentication and scoped access.

Keep document identity, revision, source evidence and workflow mapping separate. A future revision record needs its source code/version, file reference/checksum, approval evidence, effective date, owner and access classification. Record unknown values explicitly. Status should distinguish inventoried, retrieved, reviewed, approved and superseded. The source inventory remains immutable evidence; corrections are recorded separately with reason and reviewer.

Acceptance: a staff member finds a procedure by old or new code, sees whether its actual content is available and approved, and can inspect its revision history. Draft or ambiguous records cannot appear as approved. A superseded revision remains accessible to authorized reviewers. Re-importing the same source adds no duplicate evidence, and distinct same-title entries remain separate. Confirm schema, file storage and access design before runtime implementation.

### 2. Link procedures to existing product workflows — F07/F11/F20/F21

After owners validate the crosswalk, show the applicable document in each pilot workflow. Preserve the exact procedure/template revision associated with an issued product; changing the current SOP must not rewrite historical associations. Do not use document codes as product IDs or infer issue schedules from titles.

Acceptance: reconstruct one public forecast and one warning from issue history to the procedure version used at issuance. Authorized corrections preserve earlier associations. Missing procedure content is visible. Existing publishing remains subject to its approved operational rules.

### 3. Handover pilot — F04

Retrieve F-033 and WI-005-01 first. Proposed workflow: outgoing duty identifies outstanding products, warnings, stale sources and incidents; incoming duty acknowledges transfer; unresolved work remains visible until resolved with evidence. Reuse roster and identity; confirm roles and required fields from the real checklist.

Acceptance: a two-shift exercise carries one overdue issue, one active warning and one source outage forward without losing responsibility. An unacknowledged handover stays visible; retrospective corrections preserve who changed what and why. Competence checks require validated assessment records, not a grade-based assumption.

### 4. Incident and corrective-action pilot — F14/F25

Use retrieved F-031, F-026 and F-028 to define the first workflow: report, assess, assign action, attach evidence, verify effectiveness and close/reopen. Link the affected issued product or equipment record where relevant. Confirm confidentiality and who may close an action.

Acceptance: a failed delivery or incorrect product can be traced to an incident and reviewed corrective action. Closure records its reviewer and evidence; a reopened case retains history. Avoid building the entire audit/survey suite before this small workflow is accepted.

Equipment forms should refine F15 in SURFACE. Competency portfolios and climate-request intake follow their existing packages after form retrieval and owner validation. No duplicate station registry, automatic record destruction or wholesale digital reproduction of unknown forms is part of these slices.

## Shared foundation with CMO evidence features

The [CMO implementation brief](../products/gms-evidence-library-implementation.md) reuses the controlled-document pilot for source identity, revisions, access and review. Keep external reference reports distinct from institutional procedures: a verified CMO statement is not an approved MET SOP revision. CMO findings may propose a change to a mapped procedure, but the document owner must retrieve, assess and approve the actual revision through the existing control process.

CMO-01–03 add source-page evidence, reviewed search and briefing exports; they must not overwrite the immutable masterlist inventory or manufacture missing institutional document numbers. Link accepted lessons to the incident/corrective-action and competency pilots. Acceptance includes tracing one external recommendation to its local review decision and, only where approved, the resulting procedure revision.

## First operational review packet

Bring the unchanged source, CSV, this crosswalk, current product previews and the relevant existing procedures to the document/forecasting/aviation owners. Record: named owner, retrieved file and checksum, active version evidence, mapping decision, remaining discrepancy and next action. Completion means the bounded pilot documents have verified content and owners; inventory extraction alone is not institutional acceptance.
