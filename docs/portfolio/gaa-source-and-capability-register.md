# GAA source and capability register

**Recorded:** 2026-09-16. **Status:** Planning evidence; not institutional approval.

This register supports the [modular-platform implementation guide](../exec-plans/gaa-modular-monolith-implementation.md). Source files currently reside in the local `temp-files` collection; they are not guaranteed to be present in every checkout. Preserve access restrictions and provenance before adopting them into a durable document library.

## Evidence interpretation

- The supplied `temp-files/gaaforms` collection contains 46 originals. Inventory/extraction is not equivalent to complete visual or policy review.
- Text extraction and selected document review informed the groups below. Scanned airport regulations, soliciting material and some image-only appendices remain unverified.
- The 153-page 2026 cyclone plan received targeted review, including document control, coordination and departmental readiness/recovery material; no claim of complete page-by-page review is made.
- Repository plans describe intended behaviour. Source forms describe recorded processes. Neither proves deployed functionality or current institutional approval.
- User interview decisions guide the product roadmap. Operational policy and acceptance remain with the relevant GAA/GMS authority.

## Source groups and product consequences

| Source / local filename | Capability IDs | Implication / limitation |
| --- | --- | --- |
| `Absentee-Report.pdf`, `Application-For-Leave-of-Absence.pdf`, `shift_exchange.doc`, `timesheet.xls` | GAA-11 | Reconcile existing HR models and workflows before creating replacements |
| `training_policy.pdf`, `Study Leave Policy.pdf`, `recruitment_policy.pdf`, `Additional-Responsibility-Allowance-Policy.pdf` | GAA-11 | Controlled policy-driven workflows; conflicting/dated provisions require owner review |
| `employee_handbook.pdf`, `Dress-Code-Policy-final.pdf`, `confidentiality_policy.pdf` | GAA-19 | Policy library and acknowledgement candidates; do not infer current hierarchy or approval from age/title |
| `Employee-Complaint-Form-Version-1-Revised.docx`, `HEALTH-INSURANCE-SURVEY.docx`, `COMMUNICABLE-DISEASES-Policy.pdf`, `bully_policy.pdf`, `sexual_harassment_policy.pdf`, `policy_code_of_discipline.pdf`, `verbal_reprimand_form.doc` | GAA-17 | Restricted cases, conflict-aware handling, correction/appeal history; health records need distinct access |
| `Daily_VIP_Inspection_Checklist.pdf`, `daily_record_of_facility_operation_report.doc` | GAA-10, GAA-13 | Inspection and facility operation records are distinct from assigned cleaning work |
| `Equipment_Delivery.pdf`, `Equipment_Loan_Agreement.pdf`, `Key_delivery.pdf`, `Laptop Policies.pdf` | GAA-09 | Custody, acceptance and return lifecycle |
| `Request-for-Budgeted-Items-Form.pdf` and existing PIMU plan | GAA-07, GAA-08 | Requisition lines and review; approval/receipt/payment must remain distinct |
| `HazardReportForm.pdf`, `IncidentReportForm.pdf`, `Accident-Incident-Reporting-Policy.pdf`, `PPE-Policy-.pdf`, `Contractor_Guideline.pdf` | GAA-12 | Reporting, corrective actions and contractor/PPE evidence; investigate existing inspection tools before replacing them |
| `Vehicle_Pass_Form.docx` | GAA-04 | Permit/decals, validity and supporting records; not parking-space reservations |
| `Personal_Pass_Form.docx` | GAA-15 | Separate personal security-pass lifecycle |
| `transport_policy.pdf` | GAA-03, GAA-09 | Fleet authorisation, inspections, defects and maintenance; not authority for seat-booking rules |
| `daily_airport_status_report.doc`, `movement_sheet.xls`, `meeting_sign_in_Sheet.doc` | GAA-13 | Status reporting, aircraft movement statistics and attendance evidence; movement sheet is not staff attendance |
| `mbia_emergency_evacuation_plan.pdf`, `mbia_regulations.pdf`, `soliciting.pdf` | GAA-13, GAA-14, GAA-19 | Operational reference candidates; scanned material and current applicability require verification |
| `Airport_Concession_Development_Proposal_&_Business_Plan_Requirements.pdf`, `Filming_photography_recording_agreement.pdf`, `Request_Cold_Storage_Facility.pdf`, `Request_for_Additional_operational_hours.pdf`, `Move_in_Move_out_Inspection.pdf` | GAA-16 | Request-to-review/service journeys; confirm fees, conditions and approval authority before activation |
| `Airport_Tour_Evaluation.pdf`, `Guidelines_for_traveling_with_service_animals_at_MBIA.pdf` | GAA-18 | Feedback and accessible passenger guidance |
| `Launch of New Staff Transportation System.pdf` | GAA-03 | Six routes, shift coverage and day-type exceptions; contradictory times need dispatch review |
| `GAA Organisational Structure 6.5.26 (without names).pptx` | GAA-01, GAA-11 | More recent hierarchy evidence; filename does not guarantee absence of personal names; reconcile subsequent changes |
| `REVISION 2.1  GAA Tropical Cyclone Emergency Plan 2026_1st June 2026.pdf` | GAA-14, GAA-19 | Readiness, coordination, situation reporting and recovery; filename/control-page version mismatch |
| `gms-feature-backlog.csv`, `Masterlist draft table 21 Aug.docx`, existing GMS evidence and WIS2 plans | GAA-05, GAA-19 | Reuse established product, source, continuity and document-control workstreams |

## Conflict and verification register

| ID | Finding | Resolution / gate |
| --- | --- | --- |
| SRC-01 | Transport memo says not to reserve seats; intended app includes bookings | User clarified prohibition concerns holding seats for others and official bookings are authorised; preserve provenance and confirm operating instructions during transport acceptance |
| SRC-02 | Transport attachment contains inconsistent departure and AM/PM entries | Import only as draft; dispatch verifies each dated timetable before publication |
| SRC-03 | Cyclone filename says revision 2.1; control page says version 2.0 with incomplete effective date | Document owner confirms approved version before rules/checklists become operational |
| SRC-04 | Training/study-leave documents contain different application lead times and benefits | HR confirms current policy; no automatic enforcement of extracted values |
| SRC-05 | Older handbook hierarchy differs from newer organisational material | HR validates structure, role assignments and later changes such as PIMU |
| SRC-06 | Scanned regulations and image appendices are not fully verified | Complete visual/OCR review and applicability review before deriving requirements |
| SRC-07 | Existing ADR describes one staff PWA and older rollout order | Superseded in the amended ADR by this interview's three-PWA sequence |
| SRC-08 | Service-desk plan uses ticket terminology; ADR reserves internal `requests` naming | Preserve legacy ticket references; agree user-facing labels before new routes/schemas; do not rename Events concepts |

## External design references

These sources were reviewed for patterns, not for GAA policy or evidence of another airport's private architecture.

| Reference | Transferable lesson |
| --- | --- |
| [Schiphol Today case study, 2020](https://www.schiphol.nl/nl/innovatie/blog/empowered-people-operational-excellence-schiphol-today/) | Shift briefing, work-area context and avoiding duplicate defect reports; historical example |
| [Heathrow ID Centre](https://www.heathrow.com/company/team-heathrow/id-centre/documents) | Authorised applications across the pass lifecycle; do not copy UK regulatory rules |
| [Dublin Airport suppliers](https://www.dublinairport.com/b2b/airport-suppliers) | Distinct journeys for suppliers, identification and transport operators |
| [Grantley Adams passenger information](https://gaia.bb/frequently-asked-questions/) | Clear passenger-service routing and separate assistance/feedback information |
| [Microsoft BFF pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends) | Client adaptation has costs; keep BFF responsibilities explicit |
| [FastAPI application composition](https://fastapi.tiangolo.com/tutorial/bigger-applications/) | Compose routes within one application; service/data boundaries require additional design |
| [MDN offline operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) | Service-worker caching needs explicit freshness and failure behaviour |

## Evidence completion procedure

For each adopted requirement, record source filename/version/page, extraction and visual-review status, accountable policy owner, conflict resolution, capability ID and acceptance scenario. Acquire durable approved copies through the responsible owner; do not publish restricted forms or personal data into public docs. New evidence refines the governing programme and linked implementation guide rather than creating another competing priority list.
