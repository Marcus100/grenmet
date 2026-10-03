# GAA HR leave rules and accounting map

**Status:** Working evidence register for the GMS pilot, updated 2026-09-26. GMS is a department of GAA. This document records what the available sources say and what the current application does; it does not approve a policy or change an entitlement. HR must confirm coverage, amendments, current law, and operational interpretation before a rule becomes enforceable.

**Scope:** The first official leave journey and the following leave-year allocation. Add rules for later HR work only when that work starts. Keep policy documents and employee balance files in their controlled locations; this register contains no personal data.

## Evidence and decision states

| State | Meaning |
| --- | --- |
| Source found | A local document says this; currency and applicability still need HR confirmation. |
| Agreement found | The photographed 2024–28 memorandum states a term; coverage and current applicability still need HR confirmation. |
| HR decision pending | A source exists, but implementation needs an operational interpretation or confirmation that it is in force. |
| Conflict | Sources or current records differ; no agent should choose a winner. |

Handbook and form references below are to local PDFs in `temp-files/gaaforms/`; their page numbers are PDF pages from text extraction, not necessarily printed page numbers. Agreement references are to `temp-files/union/GAA-GTAWU-Memorandum-2024-2028-photo-scan.pdf` (49 photo pages, assembled 2026-09-26). Its OCR companion in the same folder is for search only; verify wording and numbers against the photos. Both files are local and gitignored, so a reviewer in another checkout needs the controlled originals. The employee handbook has comments dated March 2004 in its footer; its effective version has not been verified. The [GAA source register](../portfolio/gaa-source-and-capability-register.md) tracks provenance and conflicts.

The memorandum cover names GAA and the Grenada Technical & Allied Workers' Union and gives 1 April 2024–31 March 2028; Article 24 (PDF p. 34) says it takes effect 1 April 2024 and sets a revision process. Article 2 (PDF p. 4) defines its employees as full-time bargaining-unit workers and excludes management. GMS roles appear in the probation list (PDF p. 21), but this alone does not prove that every GMS employee is covered. HR must verify the signed copy, amendments, staff coverage, and policy hierarchy before applying any term.

## Rules needed for the first two stages

| Rule ID | Source and short reading | State | HR decision before enforcement |
| --- | --- | --- | --- |
| GAA-LV-SERVICE-01 | `employee_handbook.pdf`, p. 4: written employment terms identify commencement and whether prior employment counts as continuous service. | HR decision pending | Confirm each employee's continuous-service date and any recognised earlier service. |
| GAA-LV-PROBATION-01 | Handbook p. 6 says three or six months with extension by mutual agreement. Memorandum Art. 9, PDF pp. 20–21, lists meteorological staff under six months and describes extension, confirmation letters, and a ten-working-day consequence if no termination/extension letter is issued. The extension language differs from the handbook. | Conflict | HR verifies each pilot employee's role, period, letters, extensions and applicable term; do not infer status from dates alone. |
| GAA-LV-VAC-ELIG-01 | Handbook pp. 11–12 and memorandum Art. 7(1)(a), PDF p. 13, state twelve months' continuous service for annual vacation. | Agreement found | Confirm staff coverage, each continuous-service date and how service breaks are handled. |
| GAA-LV-VAC-AMOUNT-01 | Handbook p. 12 points to the agreement. Memorandum Art. 7(1)(a), PDF p. 13, gives 10 working days after one year, 15 at 2–4 years, 20 at 5, 25 at 6–9, and 30 at 10 years; it also uses calendar-week wording at 10 years and for each subsequent fifth year. | Agreement found | Confirm covered staff, service-band boundaries, how working days and calendar weeks reconcile for shifts, and any amendments. |
| GAA-LV-VAC-NOTICE-01 | `employee_handbook.pdf`, p. 12: vacation requests should reach the department manager at least one month before the proposed start. | HR decision pending | Decide whether late requests warn, require an exception, or are refused; record the authorised approver. |
| GAA-LV-VAC-CARRY-01 | Handbook p. 12 requires written carry-over approval. Memorandum Art. 7(1)(b), PDF pp. 13–14, permits deferral up to two years' entitlement and requires at least 7 days annual leave for 1–4 years' service or 14 days for 5 years and over. | HR decision pending | Confirm approval authority, year boundary and counting units; find written evidence for existing `LeaveCarryOver` rows and flag missing evidence instead of deleting rows. |
| GAA-LV-VAC-EXIT-01 | `employee_handbook.pdf`, p. 12: accrued unused vacation is payable on exit after one year of service. | Source found | Confirm in-force wording; the HR portal records the balance statement and does not calculate pay. |
| GAA-LV-MED-ELIG-01 | Handbook p. 12 and memorandum Art. 7(2), PDF pp. 14–15, tie sick leave to completed probation; the memorandum states 42 certified days, or 14 certified days with less than one year of continuous service. | Agreement found | Confirm covered staff, annual reset, how `SICK` maps to certified and uncertified categories, and interaction with current law. |
| GAA-LV-MED-CERT-01 | Handbook p. 12 and memorandum Art. 7(2), PDF pp. 14–15, state different uncertified paid sick-leave limits for male and female employees (9 and 14 days). The memorandum requests a certificate on the third consecutive day. | HR decision pending | HR and legal must verify current applicability and an appropriate implementation; do not encode a sex-based rule from these documents alone. |
| GAA-LV-MAT-ELIG-01 | Handbook pp. 11–12 conflicts internally on service eligibility. Memorandum Art. 7(4), PDF p. 16, refers maternity leave to the Employment Act 1999 without stating a day count or service threshold. | Conflict | HR and legal resolve eligibility and duration against the law and governing documents before coding. |
| GAA-LV-OTHER-AMOUNT-01 | Handbook pp. 11–12 names paternity and bereavement. Memorandum Art. 7(3),(5), PDF p. 16, places bereavement within a maximum 7 paid special-leave days per annum and states 5 paid paternity days after 12 months' continuous service, for 3 occasions, with a birth-certificate condition. | Agreement found | Confirm category mapping, proof handling, covered staff and current-law effect; do not automatically convert paternity leave to vacation if proof is absent. |
| GAA-LV-JURY-01 | Handbook p. 16 requests a summons; memorandum Art. 7(9), PDF p. 17, also covers jury duties. | HR decision pending | Confirm how HR records it and its pay treatment; the current `LeaveType` has no `JURY_DUTY` value. |
| GAA-LV-HOLIDAY-01 | Handbook p. 8 recognises declared public holidays. Memorandum Art. 7(1)(a)(iii), PDF p. 13, gives an extra day's leave when a public holiday occurs during vacation. | HR decision pending | Confirm holiday list and how the extra day counts for each shift pattern. Reuse the existing `PublicHoliday` model. |
| GAA-LV-YEAR-01 | `employee_handbook.pdf`, p. 12: the vacation wording refers to a calendar year. | HR decision pending | Confirm year boundary, prorating, allocations, and approved carry-over before automating January rollover. |
| GAA-LV-FORM-01 | `Application-For-Leave-of-Absence.pdf`, p. 1: the form captures leave type, balance before and after, requested dates, decision with possible changes, and expected return. | HR decision pending | Confirm the current form and the exact app cutover date for this process. |
| GAA-LV-TYPES-01 | Leave form p. 1 offers vacation, maternity, professional appointment, bereavement, paternity, and other. Memorandum Art. 7, PDF pp. 13–18, also lists sick, special, study, national service, jury duty, and compensatory training time. Current code has `CASUAL`, `COMPASSIONATE`, and `STUDY`. | Conflict | Map agreement categories to form choices and existing codes with HR; retain historical codes until records are reconciled. |

The memorandum also describes certified illness during vacation as a reclassification that restores overlapping vacation days and requires mutual agreement to schedule the remaining leave (Art. 7(7)(d), PDF p. 17). Training on a day off or during vacation can create compensatory time (Art. 7(10), PDF p. 18). These need distinct request and ledger treatment if HR includes them in the pilot; neither is an instruction to alter balances automatically.

`Study Leave Policy.pdf` is marked effective 1 June 2017; `training_policy.pdf` is marked “DRAFT PROPOSED” and differs on study benefits. Preserve the existing `STUDY` leave type, but decide application, bond, and benefit rules in the later study-leave stage. Do not adopt the draft as policy.

## Inputs to request from GAA HR

1. HR authentication of the supplied 2024–28 memorandum, its amendments, covered staff groups, and which GMS staff are in the bargaining unit. Record the HR-approved interpretation where it and the handbook differ.
2. The opening balance export for each pilot employee and leave type, with its **as-of date**, units, year, any already-approved future leave deduction, and HR sign-off. Keep the source file as controlled evidence.
3. The currently approved handbook, leave form, holiday list, and any written carry-over approvals. HR should decide how to handle legacy rows without evidence.
4. A small set of real, anonymised examples: ordinary staff, shift staff, part-year service, overnight shift, public holiday, partial day, and approved leave crossing a year boundary. HR should state whether each uses calendar days, scheduled working days, or another count.
5. The current approval and temporary cover practice, including who can appoint a stand-in, when pending work moves, and who can cancel approved leave.

The register can be reviewed immediately; missing inputs block only the rules that depend on them. A source moves to “approved for enforcement” only when HR records the version, effective date, interpretation, and approver.

## Current leave balance and request map

**Updated 2026-09-25 (Stage 3.1a, ledger core).** Every ledger read and write now goes through [`hr/leave/ledger.py`](../../apps/api/fastapi/src/hr/leave/ledger.py). [`LeaveBalanceEvent`](../../apps/api/fastapi/src/hr/leave/models.py) stores a delta, the resulting balance, an `entry_kind` (`OPENING`, `ADJUSTMENT`, `APPROVAL_DEBIT`) and a per-employee, per-leave-type `sequence`. The database enforces one sequence per (user, leave type) and one approval debit per leave request. Migration `c9d0e1f2a3b4` backfilled existing rows in `created_at, id` order and stops, listing the request IDs, if any request already has more than one debit. The ledger still has no leave-year, effective-date or import-provenance field. Organisation ownership still follows the employee through `user_id`.

### Writers and readers

| Path | Effect through the ledger |
| --- | --- |
| [`baseline/service.py::set_balance`](../../apps/api/fastapi/src/baseline/service.py) and [staff setup UI](../../apps/web/gaa-admin/src/components/hr/setup/staff-setup.tsx) | `ledger.set_to`: the first entry is `OPENING`, later ones `ADJUSTMENT`. Still no as-of date or import identifier (Stage 3.1c). |
| [`hr/leave/service.py::action_leave_request`](../../apps/api/fastapi/src/hr/leave/service.py) | Legacy approval re-reads the request under the employee lock and posts one `APPROVAL_DEBIT`; a concurrent second approval is refused. |
| [`hr/workflow/finalize.py::finalize_entity`](../../apps/api/fastapi/src/hr/workflow/finalize.py) | Final workflow approval posts one `APPROVAL_DEBIT`; a repeat returns the existing entry. |
| `baseline/service.py::require_leave_ready`, leave request creation | `ledger.has_entry` checks that an opening exists. |
| [`hr/dashboard/service.py`](../../apps/api/fastapi/src/hr/dashboard/service.py) and [dashboard UI](../../apps/web/gaa-admin/src/components/hr/dashboard/dashboard-data.ts) | `ledger.balance` for vacation. |
| [`hr/service.py::_build_profile_response`](../../apps/api/fastapi/src/hr/service.py) | `leave.balances` from `ledger.balances`, so it matches the dashboard. The old `LeaveCarryOver` figures appear only as `leave.unverified_carry_over`. The old `LeaveBalance` table is no longer read but is kept for the reconciliation report (Stage 3.1b). |

Still open: a policy for backdated corrections and reversal of approved leave (no path cancels approved leave today).

### Reconciliation report (Stage 3.1b)

`python scripts/leave_reconciliation.py [--organisation gaa] [--require-reconciled]` (from `apps/api/fastapi`, after migration `c9d0e1f2a3b4`) prints one CSV row per active employee and leave type. It is read-only; logic is in [`hr/leave/reconciliation.py`](../../apps/api/fastapi/src/hr/leave/reconciliation.py). Findings:

| Finding | Meaning | HR action |
| --- | --- | --- |
| `NO_OPENING` | No ledger entry for this type. | Record the verified opening in staff setup. |
| `FIRST_ENTRY_NOT_OPENING`, `SEQUENCE_GAP`, `REPLAY_MISMATCH` | The ledger chain does not replay cleanly. | Escalate to Barrels; correct with a reviewed adjustment, never by editing rows. |
| `LEGACY_BALANCE_DIFFERS` | Old `LeaveBalance` disagrees with the ledger. | Confirm which figure is right; record it as a verified balance. |
| `UNVERIFIED_CARRY_OVER` | Old carry-over days exist (GAA-LV-VAC-CARRY-01). | Supply the written approval or decide the days lapse; the report never adds them to the balance. |

The output contains staff emails and employee numbers. Send it only to GAA HR and file it with the controlled balance evidence, not in the repository. A pilot employee is ready for the leave form cutover when every row for them has no findings and HR has signed the figures.

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
