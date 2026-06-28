# HR Forms → Model Inventory

Source-of-truth mapping from the Grenada Airports Authority (GAA) paper HR forms to the FastAPI
`src/hr` data models. Raw forms live outside the repo at
`OneDrive/bishop/raw/03-software-data/grenmet/hr`.

**Status legend**

| Status | Meaning |
|---|---|
| `covered` | Form field has a direct model field. |
| `gap` | Form field is **not** modeled. |
| `abstracted` | Form intent is represented differently (e.g. normalized, or generalized to a richer field). |
| `via-workflow` | Signatures / approval decisions are captured by the generic `hr/workflow` engine (`WorkflowStepInstance` + `ApprovalActionLog`), not per-form columns. |

> **Signatures & approval chains** on every form (Supervisor / Manager / Director / CEO / HR) are
> intentionally *not* stored as per-form columns. Each request links to a `WorkflowInstance` via
> `workflow_instance_id`; the signature chain is configured as ordered `WorkflowStepTemplate` rows
> per department. See `src/hr/workflow/`.

---

## 1. Absentee Report → `src/hr/absentee/models.py::AbsenteeReport`

| Form field | Model field | Status |
|---|---|---|
| Employee Name | `user_id` (name resolved from auth `User`) | covered |
| Date | `report_date` | covered |
| Department | `department_id` | covered |
| Reason checklist (Uncertified Sick / Illness family / Illness on Job / Time Off / Other) | `reason: AbsenceReason` | covered (enum, Workstream C) |
| Reason(s) free text | `notes` (required when reason ∈ {UNCERTIFIED_SICK, ILLNESS_ON_JOB}) | covered |
| Supervisor / Dept Manager signatures + dates | — | via-workflow |
| _(model extras)_ `expected_shift_code`, `absence_start_time`, `absence_end_time`, `contact_attempted`, `contact_method`, `replacement_arranged`, `replacement_user_id` | — | richer than form |

## 2. Application for Leave of Absence → `src/hr/leave/models.py::LeaveRequest` (+ `LeaveBalanceEvent`)

| Form field | Model field | Status |
|---|---|---|
| Employee Name | `user_id` | covered |
| Department | `department_id` | covered |
| Start Date / End Date | `start_date` / `end_date` | covered |
| Type of leave | `leave_type: LeaveType` | covered |
| Professional Appointment subtype (Bank/Medical/Legal/Dental) | `professional_appointment_subtype` | covered (Workstream C) |
| Salary in advance Yes/No | `salary_in_advance` | covered (Workstream C) |
| Where leave to be spent | `leave_address` | covered |
| From / To (travel dates) | `travel_from_date` / `travel_to_date` | covered (Workstream C) |
| Will require acting appointment Yes/No | `requires_acting_appointment` (+ `acting_officer_id`) | covered (Workstream C) |
| Decision (approved / denied / approved-with-changes) + Comments | `status` + `head_of_dept_comments` | covered / via-workflow |
| Signature chain (Supervisor→Dept Mgr→Director→CEO→HR) | — | via-workflow |
| HR: Previous Balance / Days requested / New Balance / as at | `LeaveBalanceEvent` ledger (`delta_days`, `balance_after_days`, `created_at`) | abstracted (ledger, not snapshot columns) |
| Expected return-to-work | `expected_return_date` | covered (Workstream C) |
| Days requested (with/without pay split) | `days_requested` / `days_with_pay` / `days_without_pay` | covered |

## 3. Daily Airport Status Report → `src/hr/dailystatus/models.py::StatusReport` (+ `StatusReportEntry`)

| Form field | Model field | Status |
|---|---|---|
| Department | `department_id` | covered |
| Date | `report_date` | covered |
| Shift AM/PM | `shift_period: ShiftPeriod` (+ existing `shift_code`) | covered (Workstream C) |
| Absenteeism | `personnel_summary` + per-person `StatusReportEntry` | covered |
| Personnel: all reported on time? + explain | `all_personnel_reported_on_time` + `personnel_explanation` | covered (Workstream C) |
| Personnel: affected operations? + explain | `affected_operations` + `affected_operations_explanation` | covered (Workstream C) |
| Equipment: all operational? + reason + remedy | `all_equipment_operational` + `equipment_issue_reason` + `equipment_remedy_action` | covered (Workstream C) |
| Incidents/accidents reports submitted? + why not | `incident_reports_submitted` + `incident_explanation` | covered (Workstream C) |
| Supervisor / Manager signatures + dates | — | via-workflow |
| _(model extras)_ `weather_summary`, `runway_status`, `navaids_status`, `communications_status`, `general_remarks` | — | richer than form |

## 4. Shift Exchange Requisition → `src/hr/exchange/models.py::ShiftSwapRequest` — **no gaps**

| Form field | Model field | Status |
|---|---|---|
| Department | `department_id` | covered |
| Employee requesting | `requesting_user_id` | covered |
| Employee with whom change desired | `counterpart_user_id` | covered |
| Date & shift requested for change | `source_date` / `source_shift_code` | covered |
| Date of return shift | `target_date` / `target_shift_code` | covered |
| Reason(s) | `reason` | covered |
| Counterpart agreement | `counterpart_agreed` / `counterpart_agreed_at` | covered |
| Both names + signatures; supervisor recommendation; approval | — | via-workflow |
| _(model extras)_ `swap_type` (TEMPORARY/PERMANENT), `effective_date`, `restoration_date` | — | richer than form |

## 5. Official Time Sheet → `src/hr/timesheet/models.py::Timesheet` (+ `TimesheetEntry`, `TimesheetSubmission`)

Applies to Maurice Bishop Int'l **and Lauriston** airports.

| Form column | Model field | Status |
|---|---|---|
| DEPARTMENT | `Timesheet.department_id` | covered |
| PERIOD | `Timesheet.period_start` / `period_end` | covered |
| NAME (rows = many employees) | `Timesheet.user_id` | abstracted (one per-employee timesheet vs one department sheet) |
| DATE | `TimesheetEntry.entry_date` | covered |
| ROSTER HOURS | `roster_hours` | covered |
| ACTUAL HOURS | `actual_hours` | covered |
| TOTAL HOURS | `total_hours` | covered (Workstream C) |
| BREAK HOURS | `break_hours` | covered |
| HOURS WORKED | `hours_worked` (default ≈ actual − break) | covered (Workstream C) |
| REMARKS | `comments` | covered |
| Medical certificates attached (note d) | `medical_certificate_attached` | covered (Workstream C) |
| Dept Manager/Supervisor signature | — | via-workflow |
| _(model extra)_ `overtime_hours`, proxy/self submission (`TimesheetSubmission`, `DepartmentPolicy`) | — | richer than form |

## 6. Vehicle Pass / Airport Security Parking Access → `src/hr/parking/models.py::ParkingPermit` (Workstream B)

| Form field | Model field | Status |
|---|---|---|
| Company Name | `company_name` | covered |
| Date | `created_at` (application timestamp) | abstracted |
| Employee Name | `user_id` | covered |
| Phone | `phone` | covered |
| Vehicle Registration No. | `vehicle_registration_no` | covered |
| Vehicle Insurance Issue / Expiry Date | `vehicle_insurance_issue_date` / `vehicle_insurance_expiry_date` | covered |
| Action Requested (New/Renewal/Replacement/Info Change/Other) | `action_requested: ParkingAction` + `action_other_detail` | covered |
| $40 fee / decal / year | `fee_amount` (default 40.00) | covered |
| Company authorizing signature / Dept Head | — | via-workflow |
| DECAL ISSUANCE: decal number, received by, date | `decal_number`, `received_by`, `issued_at`, `valid_from`, `valid_to`, `issued_by_user_id` | covered |
| AIRPORT USE ONLY: Security Manager auth, processed by, dates | — | via-workflow |
| Indemnity / rules clauses | — | prose, not data |

---

_To add a new form module, follow `docs/hr/adding-a-form-module.md`._
