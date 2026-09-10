# GMS evidence library and reporting — feature implementation brief

Recorded 2026-09-10. **Status: specified; runtime implementation and operational acceptance pending.** GMS owns the content and acceptance; Barrels delivers the software. This brief refines existing F/E work packages under the [client programme plan](../portfolio/gaa-gms-client-programme-plan.md) and [strategy backlog](../internal/gms-product-strategy-and-roadmap.md). It does not add another application or displace current operational work.

## Product outcome and evidence

GMS staff can find a sourced fact, assess its local relevance, assign follow-up and reproduce a reviewed briefing or impact report. Start with the CMO 2025–2026 material, using the [extraction findings](../internal/gms-product-strategy-and-roadmap.md#extracted-20252026-evidence-and-implementation-consequences) and [source inventory](../internal/reports/cmo-2025-2026-source-inventory.json). Seventeen PDFs were extracted; this establishes source availability, not accepted records or full-page technical review. The four 2026 PDFs are preparatory agendas/notes; the unavailable substantive reports remain a follow-up queue.

## Feature slices and acceptance

CMO identifiers below are delivery slices within existing F/E packages, not additional portfolio work packages. Suggested owners are roles to assign at the next programme review.

| Slice | Staff capability | Dependencies and placement | Acceptance evidence and owner |
| --- | --- | --- | --- |
| CMO-01 | Register a source, attach its approved storage reference, inspect extracted pages and identify unavailable or changed documents. | F01/F02; manual inventory in R0, library UI in Documentation and SOPs (Next). Reuse the controlled-document pilot. | Re-importing identical bytes adds no duplicate revision; changed bytes at the same URL create a candidate revision; a 404 retains the previous evidence. Document controller/engineering. |
| CMO-02 | Review a finding beside its source, classify it and link a proposed action to an existing package or procedure. | CMO-01; F02/F04/F25. | An independent reviewer opens the exact page/section; conflicting dates remain flagged; regional recommendations cannot become approved GMS requirements without applicability review. Meteorological lead/document controller. |
| CMO-03 | Search by country, year, hazard, service and review state; generate a Grenada briefing and roadmap gap review. | CMO-02; F01/F02. Proposed catalogue codes GMS-DATA-GNDBRIEF and GMS-DATA-GAPREVIEW. | Search and export find a seeded reviewed Grenada record; default export excludes unreviewed/rejected findings; every statement resolves to its source revision and review date. DTO/meteorological lead. |
| CMO-04 | Create reviewed event/impact records and replay warning, observation, guidance and response evidence. | CMO-02; F26/F27/F33/E09, R5; climate links in F34/R6. | Two reports of one event link without double-counting impacts; conflicting losses remain separate assertions; later knowledge is distinguished from information available at issuance. Meteorological/partner reviewer. |
| CMO-05 | Produce an annual weather-impact report and record preparation, review and submission evidence. | CMO-04; F33/E09, R5; a manually reviewed first report can precede automation. Proposed code GMS-DATA-IMPACTREP. | Export includes period, qualitative/quantitative impacts, missing-data statements, operational challenges, lessons and source references. Review/sign-off and actual submission receipt are separate states. GMS reporting owner. |
| CMO-06 | Recheck the source inventory, show changed/new/broken links and route relevant findings to owners. | Accepted CMO-01–03 pilot; F04/E18, Next subject to capacity. | A new 2026 report enters review, a changed PDF preserves history, and a broken link does not delete evidence. No automatic policy change or external message. Document controller/technical maintainer. |

## Information and workflow contract

Keep four identities distinct: source document/revision, extracted finding, local action, and issued report. Institutional MET document codes and official product identifiers remain separate. Reuse identity, scoped access, file storage and audit capabilities after confirming their current interfaces; use SURFACE for station and observation records and the existing publication systems for official products.

Source records retain publisher, title, URL, meeting/report year, document type, retrieval date, checksum, PDF page count, extraction method/warnings, availability and reuse conditions. Store both PDF page index and printed page/section where they differ. The meeting year is not inferred solely from the URL: the DMS2025 final report is hosted under CMC70.

Findings retain source revision and locator, supporting excerpt, country/place, event date or period, hazard/service, original value/unit, uncertainty and reviewer. Distinguish historical statement, reported decision, recommendation and locally verified requirement. Actions retain linked finding/package/procedure, owner, due date source, status and closure evidence. An absent deadline stays unknown; never infer funding, attendance or compliance from a project listing.

Use unreviewed → verified → superseded/rejected for findings, recording reason and reviewer on every transition. Verified means checked against its source; applicability and institutional approval are separate. Restricted/unknown-access material cannot enter public search. Draft reports may show clearly labelled unresolved findings to reviewers; released reports use only reviewed evidence and preserve their exact input revisions. Public explainers require the existing editorial approval path.

Event records retain stable event identity, hazard, start/end, affected area, magnitudes and units, reported impacts, affected sectors and evidence confidence. Preserve unknowns and disagreements; reported loss is not a primary observation. Link existing product/observation references rather than copying operational databases. Review the WMO-CHE mapping before implementing an exchange format.

## Operational features refined by the reports

| Existing capability | Implementation refinement | Proof required |
| --- | --- | --- |
| CAP, F11/F12 | Inventory Grenada's regional portal and local issuing path; record sender authority, revision/cancellation relationships and integration choice. | One warning exercise covers issue, update, cancellation, receipt and duplicate handling across the agreed path. |
| WIS2, F18 | Prove incoming retrieval independently of outgoing observation publication; use the existing WIS2 roadmap gates. | Selected feed is discoverable, decoded, fresh and usable by forecasters; outage and reconnect tests preserve timestamps and expose gaps. |
| Guidance/radar, F19 | Show source timestamp, coverage/quality limits and outage state; preserve selected event imagery when reuse terms permit. | A stale or unavailable radar cannot look current; replay retains source time and distinguishes imagery from measured local rainfall. |
| Quality/training, F04/F25/F33/E11 | Link reviewed lessons and corrective actions to procedures, exercises and competency evidence. Retrieve the underlying Grenada Beryl presentation before adopting its lessons. | A practice exercise records the applicable procedure revision, assessor and result; attendance alone cannot satisfy competency. |

## Pilot and rollout

First preserve the extraction inventory and obtain approved storage for source files. Select ten documents from the extracted set, including a 2025 operational/final report and 2026 agenda notes. The selection is for deeper human review; it is not a claim that only ten were extracted. Include a same-URL revision, duplicate, missing link, conflicting date and unreviewed finding in acceptance scenarios.

Deliver CMO-01–03 as one bounded internal pilot. Require independent review of every pilot finding, source-linked briefing and gap-review exports, and successful access/version tests before expanding collection. Prepare one event and annual-report sample manually to validate CMO-04–05 with the meteorological/partner owners before implementing those workflows. Expand to automation only when a named maintainer and recurring review time exist.

The 2026 notes list 31 October for scientific/new-service proposals and 5 November for weather-impact reports. Treat these as source-reported planning dates to confirm with CMO; they are neither software release deadlines nor authorization to send submissions. Track the unavailable 2026 operational, radar, project and action-status reports for a later evidence refresh.

Measure reviewed findings with reproducible references, time to find evidence, unresolved conflicts, overdue assigned actions and independently reproducible reports. Record denominators and review dates. No coverage claim follows from download counts alone. The pilot is accepted by GMS only after a substitute staff member can reproduce the outputs and explain their limitations.
