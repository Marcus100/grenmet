# GAA HR leave rules and accounting map

**Status:** Working evidence register for the GMS pilot, 2026-09-24. GMS is a department of GAA. This document records what the available sources say and what the current application does; it does not approve a policy or change an entitlement. HR must identify the versions currently in force before a rule becomes enforceable.

**Scope:** The first official leave journey and the following leave-year allocation. Add rules for later HR work only when that work starts. Keep policy documents and employee balance files in their controlled locations; this register contains no personal data.

## Evidence and decision states

| State | Meaning |
| --- | --- |
| Source found | A local document says this; currency and applicability still need HR confirmation. |
| Agreement pending | The Industrial Agreement is needed for the actual term or day count. |
| HR decision pending | A source exists, but implementation needs an operational interpretation or confirmation that it is in force. |
| Conflict | Sources or current records differ; no agent should choose a winner. |

References below are to local PDFs in `temp-files/gaaforms/`. Page numbers are PDF pages from text extraction, not necessarily printed page numbers. The employee handbook has comments dated March 2004 in its footer; its effective version has not been verified. The [GAA source register](../portfolio/gaa-source-and-capability-register.md) tracks document provenance, including the conflicting study and draft training policies.

## Rules needed for the first two stages

| Rule ID | Source and short reading | State | HR decision before enforcement |
| --- | --- | --- | --- |
| GAA-LV-SERVICE-01 | `employee_handbook.pdf`, p. 4: written employment terms identify commencement and whether prior employment counts as continuous service. | HR decision pending | Confirm each employee's continuous-service date and any recognised earlier service. |
| GAA-LV-PROBATION-01 | `employee_handbook.pdf`, p. 6: probation may be three or six months and may be extended by mutual agreement. | HR decision pending | Confirm period, extensions, and confirmation for each pilot employee; do not auto-confirm. |
| GAA-LV-VAC-ELIG-01 | `employee_handbook.pdf`, pp. 11–12: vacation entitlement follows one year of continuous service. | Source found | Confirm handbook version and how service breaks are handled. |
| GAA-LV-VAC-AMOUNT-01 | `employee_handbook.pdf`, p. 12: the Industrial Agreement gives vacation days. | Agreement pending | Supply the applicable schedule, effective date, and staff categories. |
| GAA-LV-VAC-NOTICE-01 | `employee_handbook.pdf`, p. 12: vacation requests should reach the department manager at least one month before the proposed start. | HR decision pending | Decide whether late requests warn, require an exception, or are refused; record the authorised approver. |
| GAA-LV-VAC-CARRY-01 | `employee_handbook.pdf`, p. 12: vacation carry-over requires written approval. | Conflict | Identify the approving authority and evidence for existing `LeaveCarryOver` rows; flag rows without evidence instead of deleting them. |
| GAA-LV-VAC-EXIT-01 | `employee_handbook.pdf`, p. 12: accrued unused vacation is payable on exit after one year of service. | Source found | Confirm in-force wording; the HR portal records the balance statement and does not calculate pay. |
| GAA-LV-MED-ELIG-01 | `employee_handbook.pdf`, p. 12: paid medical leave follows probation; the Industrial Agreement sets entitlement. | Agreement pending | Confirm schedule and whether current `SICK` represents this category. |
| GAA-LV-MED-CERT-01 | `employee_handbook.pdf`, p. 12: the certificate threshold is stated differently for male and female staff (nine and fourteen days). | HR decision pending | HR and legal must verify current applicability and an appropriate implementation; do not encode the sex-based rule from this document alone. |
| GAA-LV-MAT-ELIG-01 | `employee_handbook.pdf`, p. 12: paid maternity leave follows eighteen months of service; p. 11 lists maternity with a general twelve-month sentence. | Conflict | Resolve the handbook's internal inconsistency against the governing agreement and current law before coding eligibility. |
| GAA-LV-OTHER-AMOUNT-01 | `employee_handbook.pdf`, pp. 11–12: paternity and bereavement appear as benefits; bereavement refers to Industrial Agreement Art. 7(4). | Agreement pending | Confirm types, days, eligibility, and paid status from the agreement. |
| GAA-LV-JURY-01 | `employee_handbook.pdf`, p. 16: jury duty requires the relevant summons. | Source found | Confirm how HR records it; the current `LeaveType` has no `JURY_DUTY` value. |
| GAA-LV-HOLIDAY-01 | `employee_handbook.pdf`, p. 8: GAA recognises Grenada public holidays as declared by government. | HR decision pending | Confirm holiday list and how holidays count for each leave type and shift pattern. Reuse the existing `PublicHoliday` model. |
| GAA-LV-YEAR-01 | `employee_handbook.pdf`, p. 12: the vacation wording refers to a calendar year. | HR decision pending | Confirm year boundary, prorating, allocations, and approved carry-over before automating January rollover. |
| GAA-LV-FORM-01 | `Application-For-Leave-of-Absence.pdf`, p. 1: the form captures leave type, balance before and after, requested dates, decision with possible changes, and expected return. | HR decision pending | Confirm the current form and the exact app cutover date for this process. |
| GAA-LV-TYPES-01 | `Application-For-Leave-of-Absence.pdf`, p. 1: choices are vacation, maternity, professional appointment, bereavement, paternity, and other. Current code also has `CASUAL`, `COMPASSIONATE`, and `STUDY`. | Conflict | Map existing codes to current policy after reviewing the agreement; retain historical codes until records are reconciled. |

`Study Leave Policy.pdf` is marked effective 1 June 2017; `training_policy.pdf` is marked “DRAFT PROPOSED” and differs on study benefits. Preserve the existing `STUDY` leave type, but decide application, bond, and benefit rules in the later study-leave stage. Do not adopt the draft as policy.

## Inputs to request from GAA HR

1. The Industrial Agreement, its effective dates, amendments, covered staff groups, and confirmation that it covers GMS. Record the HR-approved interpretation where it and the handbook differ.
2. The opening balance export for each pilot employee and leave type, with its **as-of date**, units, year, any already-approved future leave deduction, and HR sign-off. Keep the source file as controlled evidence.
3. The currently approved handbook, leave form, holiday list, and any written carry-over approvals. HR should decide how to handle legacy rows without evidence.
4. A small set of real, anonymised examples: ordinary staff, shift staff, part-year service, overnight shift, public holiday, partial day, and approved leave crossing a year boundary. HR should state whether each uses calendar days, scheduled working days, or another count.
5. The current approval and temporary cover practice, including who can appoint a stand-in, when pending work moves, and who can cancel approved leave.

The register can be reviewed immediately; missing inputs block only the rules that depend on them. A source moves to “approved for enforcement” only when HR records the version, effective date, interpretation, and approver.

## Current leave balance and request map

The current [`LeaveBalanceEvent`](../../apps/api/fastapi/src/hr/leave/models.py) stores a delta and resulting balance. It has no leave-year or effective-date field, and there is no database uniqueness constraint on `related_leave_request_id`. Existing organisation ownership follows the employee through `user_id`; a new direct organisation key or constraint would need a separately approved schema change.

### Production writers and dependencies

| Path | Trigger and current effect | Accounting concern |
| --- | --- | --- |
| [`baseline/service.py::set_balance`](../../apps/api/fastapi/src/baseline/service.py) | HR setup sets a target balance by appending the difference from the latest event; the staff setup form calls it. | It can adjust a live balance without an opening-balance as-of date or import identifier. |
| [`hr/leave/service.py::action_leave_request`](../../apps/api/fastapi/src/hr/leave/service.py) | Legacy leave requests without a workflow append a debit on approval. | Separate posting logic; its own comment records a first-empty-ledger concurrency gap. |
| [`hr/workflow/finalize.py::finalize_entity`](../../apps/api/fastapi/src/hr/workflow/finalize.py) | Final workflow approval appends a debit if no request-linked event is found. | Separate posting logic; idempotency is checked in application code and should also be enforced at the database boundary. |

All three select the latest event by `created_at DESC` alone. A deterministic tie-break and an explicit policy for backdated corrections are needed before a ledger replay can be authoritative. Migration or import scripts and tests may also insert events; inventory those again when implementing the accounting change.

### Production readers and displays

| Path | Current source and use |
| --- | --- |
| [`baseline/service.py::set_balance` and `require_leave_ready`](../../apps/api/fastapi/src/baseline/service.py) | Latest event for adjustment; existence of an event for setup readiness. |
| [`hr/leave/service.py`](../../apps/api/fastapi/src/hr/leave/service.py) | Opening-event check during request creation; latest event during legacy approval. |
| [`hr/workflow/finalize.py`](../../apps/api/fastapi/src/hr/workflow/finalize.py) | Prior request-linked event and latest balance during workflow approval. |
| [`hr/dashboard/service.py`](../../apps/api/fastapi/src/hr/dashboard/service.py) and [dashboard UI](../../apps/web/gaa-admin/src/components/hr/dashboard/dashboard-data.ts) | Latest vacation ledger event drives the dashboard balance. |
| [`hr/service.py::_build_profile_response`](../../apps/api/fastapi/src/hr/service.py) | Reads older `LeaveBalance` and `LeaveCarryOver` tables for the staff profile, so it may disagree with the dashboard. |
| [staff setup UI](../../apps/web/gaa-admin/src/components/hr/setup/staff-setup.tsx) | Posts a verified target balance through the baseline service. |

### Request state map and gaps to verify

The [leave router](../../apps/api/fastapi/src/hr/leave/router.py) exposes create, edit, delete, submit, action, and list endpoints. [Workflow service](../../apps/api/fastapi/src/hr/workflow/service.py) supports draft submission, return, resubmission, approval, rejection, and cancellation. Its leave finaliser runs on final approval or rejection; cancellation and return need explicit balance and entity-state checks. The current leave router has no dedicated approved-request amendment or reversal endpoint. [Signature capture](../../apps/api/fastapi/src/hr/signatures/service.py) stores a signed entity record, so return, revision, and resubmission need a signed-version test. These are implementation risks to test, not conclusions that every path is broken.

## First accounting change: implementation brief

**Goal:** Every pilot balance shown to staff and HR can be reproduced from one ordered event stream and reconciled to HR's signed opening figures at their as-of date. This is the first code change after this evidence stage; the full leave journey and leave-year engine follow as separate reviewable work.

**Scope to inspect and change together:** the three production writers above; `LeaveBalanceEvent` and any required migration; old balance and carry-over readers in `hr/service.py`; dashboard reader; baseline import path; affected schemas, routes, generated client, and web consumers if the public contract changes. Reuse existing workflow and permission checks. Do not silently copy old integer balances over HR's signed source.

**Accounting invariants to design and test:**

1. One posting service owns opening, adjustment, approval debit, and reversal semantics. An approval has one stable source key and cannot post twice, including two concurrent clicks. Corrections append reversing or adjusting events; posted history remains intact.
2. Event ordering is deterministic. A replay yields the recorded balance after every event; backdated entries, partial days, negative balances, and year boundaries have explicit decisions. Store enough provenance to distinguish imported opening figures from later adjustments.
3. The HR import records source file identity, as-of date, unit, staff/type mapping, reviewer, and whether future leave was already deducted. Re-running the same import has no new financial effect; an amended file needs a reviewed correction.
4. Every read, count, export, write, and notification remains scoped to the authorised employee and organisation. Extend the existing synthetic second-organisation test coverage. Document the ownership path for any table without its own organisation key.
5. The old profile and dashboard agree for every pilot employee before the leave form cuts over. Unapproved carry-over remains visible as a discrepancy, with evidence requested rather than discarded.

**Acceptance evidence:** focused tests for duplicate and concurrent approval, repeat import, adjustment and reversal, fractional days, event ordering, second-organisation denial, and profile/dashboard agreement; a discrepancy report for all pilot employees; HR sign-off on every opening figure; a disposable-database migration rehearsal. The later complete journey must also exercise return/re-sign, approver cover, approved cancellation, notification failure, and roster effects before paper retirement.

**Approval boundary:** implementing this brief will touch SQLAlchemy schema, Alembic, and likely the public FastAPI contract. Follow the repository's schema and API change gates with exact files and migrations reviewed at that stage. This Stage 0 document changes no code, data, policy, or app behaviour.
