# hr domain — agent context

**Owner:** GAA staff platform (piloted in GMS). Delivered by Barrels; GAA is the acceptance authority. Not a Barrels product.

## Layout
Sub-packages, each with its own `router.py`/`service.py`/`schemas.py`/`models.py`:
`absentee`, `attendance`, `calendar`, `dailystatus`, `dashboard`, `documents`, `exchange`, `leave`, `parking`, `payroll` (pay-input quantities for HrPlus; see Payroll below), `roster`, `signatures`, `timesheet`, `training`, `workflow`. Profile/employment routes are in `routers/profile.py`; organisations in `organisations.py`.
All tables live in the `hr` schema of the main database (main Alembic history).

## Invariants
- **Approvals go through `workflow/`** (named approvers, ADR-0008). Do not add ad-hoc approval state to a form model.
- **Organisation boundary:** records are scoped by organisation/department (`docs/hr/organisation-boundary.md`). Use `src.auth.policy.can_act_on_user…` for cross-user access; never trust a client-supplied user or department ID.
- **Change history:** models registered in `hr/audit.py` (`registry.track`) are audited automatically on flush. Register new HR models that hold personal or approval data; mark sensitive fields.
- **Notifications:** HR events are declared in `hr/notifications.py` and sent via `src.notifications.service.notify` inside the same transaction.
- Permission keys (`roster.*`, `timesheet.*`, `leave.*`, `calendar.*`, …) live in `src/auth/permissions.py`.

## Adding a form module
Follow `docs/hr/adding-a-form-module.md`; map paper forms with `docs/hr/forms-inventory.md`.
For cross-form attendance, roster and PDF alignment, follow `docs/hr/end-to-end-alignment.md`; distinguish scheduled work, actual attendance and approved absence.

## Tests
`tests/hr/` — service tests per sub-domain, `test_authz.py`, `test_organisation_boundary.py`, workflow tests. Use real JWT fixtures and `db_async`.

## Related
ADR-0008, ADR-0009, `apps/web/gaa-admin/AGENTS.md` (`/hr` routes), `docs/hr/`.

## Ending employment (#789, #797)
- **One status writer.** Every change of `EmploymentRecord.status` goes through `hr/employment_status.set_employment_status`: the HR route (`update_employment_for_user`), staff offboarding (`baseline.service.offboard`) and the daily job. Any change ends the user's live assignments of every scope (except the SELF-scope `staff` role) in that organisation, with audit entries (`auth.assignments.end_assignments_for_employment`). Reinstating does not restore them. INACTIVE is therefore permanent for roles: do not use it for temporary leave or suspension. The caller decides `organisation_wide` (ALL-scope roles, #794); a department-scope HR admin passes `False` and leaves organisation-wide roles paused.
- **End date (#797).** `EmploymentRecord.end_date` is the last day of employment (nullable; CHECK not before `start_date`; merged-value validation in `organisations.validate_service_facts`). The end date is the last day of employment: roles work through that whole day and end at midnight after it (Grenada time, `utils/timezones.local_today`, never UTC). Once the end date is before today the record counts as ended: `EmploymentRecord.is_live` and `models.live_employment_clause` drive `auth.policy._active_assignments`, `auth.access.effective_roles` and delegated grants. Access stops on the date, before any job runs.
- **Daily job.** `end_due_employment_records` (worker, 04:10 UTC = 00:10 Grenada) sets ACTIVE records whose end date is before today (Grenada) to TERMINATED with organisation-wide authority. Each record runs in its own savepoint, so one failure leaves the others committed; failures are logged by employment id and the run is then reported as failed. The TERMINATED change itself is audited by the `EmploymentRecord` listener. Idempotent: only ACTIVE rows match, so a second run changes nothing. Tests: `tests/worker/test_employment_end_job.py`.
- **Changing an end date** (setting, moving or clearing it) on someone who holds a live ALL-scope assignment needs organisation-wide `hr.employment.manage`, the same as a transfer: otherwise 403 and nothing changes. With no live ALL-scope role, a department admin who may edit the record can set, move or clear it. Tests: `tests/hr/test_employment_end_date.py`.
- **Reinstating** with an end date that is before today (400) until the date is cleared or moved, otherwise the next run would end the record again.
- **Department transfer (#797).** Changing `department_id` to another department ends every live non-baseline assignment in that organisation (audited); an administrator re-grants at the destination. Same-department edits end nothing. A person who holds a live ALL-scope assignment can be transferred only by someone with organisation-wide `hr.employment.manage` (`has_organisation_wide_hr_authority`); anyone else gets 403 `HRPermissionDeniedError` and nothing changes, including the status. Tests: `tests/hr/test_employment_transfer_roles.py`.
- **Deleted record.** No code path deletes an `EmploymentRecord`. User deletion (`auth.service.delete_user`) removes the row by database cascade, but `user_role_assignment.user_id` has no `ON DELETE`, so a user holding any assignment cannot be deleted (verified: foreign-key violation, row kept). Nothing needs ending. If a delete path is ever added, it must end the roles in the same transaction through `set_employment_status`.
- **Known gap.** Roles stop at midnight after the end date, but other `status == ACTIVE` checks (roster, timesheet, leave, exchange, baseline readiness, notifications, supervisor validation) see an ended employment only after the daily job has run, up to about a day later. Named workflow approvers are checked live (`workflow/service._named_actor_in_organisation`, #797). Role-based workflow steps are gated through the roles, which are already live, so they need no separate change.
- A user cannot change their own employment status. A self-transfer is not special-cased: the person's own roles end, and their own authority is only what their destination scope allows.

## Payroll (`payroll/`)
**Owner:** Barrels Grenada engineering, for GAA. HrPlus stays GAA's payroll of
record; this module produces **input quantities** for it and a reconciliation
trail. It is slice 1 of the payroll plan; gross pay, deductions, payslips, bank
files and cutover are later slices that need their own approval.

### Invariants
- **Quantities only.** No rate, amount, tax, NIS number or bank detail is stored,
  logged or exported. Adding any of them is a separately approved slice with its
  own permission keys (`hr.payroll.rates.manage`, `hr.payroll.read.amounts`).
- **Pay items are organisation data.** Rules live in `pay_item.params`, never in
  code. GAA's items are loaded once by `catalogue.py` (BaselineStep marker
  `payroll:gaa-pay-items:v1`), all PROVISIONAL with a memorandum reference; every
  other organisation starts with an empty catalogue.
- **Only approved attendance counts.** An `AttendanceRecord` whose current
  workflow instance is APPROVED and whose departure is recorded. The legacy
  `TimesheetEntry.overtime_hours` is ignored.
- **Lines change only while OPEN.** The `pay_line_locked` trigger refuses any
  insert, update or delete once the period is IN_REVIEW or later. A change to
  attendance in an approved period becomes REVERSAL + REPLACEMENT lines in the
  ADJUSTMENT run of a later open period (`service._adjustments`).
- **Computation is idempotent.** Computed lines are keyed by `source_key`
  (`att:<attendance>:<item>`, `adj:<attendance>:<item>:<kind>`); recomputing with
  unchanged inputs changes no row. Computed lines are bulk writes; one
  `pay_period_computation` audit entry summarises each changing computation.
- **Two people.** Submitting starts a `PAYROLL_RUN` workflow on the calendar's
  approving department with self-approval off. The generic workflow action and
  instance-create endpoints refuse `pay_period`; approve and return go through
  `/hr/payroll/periods/{id}/approval|return`, which check `hr.payroll.approve`
  (organisation-wide) and, for approve, an MFA-verified session.
- **Access.** `hr.payroll.read.department`, `.prepare`, `.approve`, `.export` are
  granted to no default role. Reading is department-scoped (ALL or DEPARTMENT
  assignments; SELF grants nothing); prepare, approve and export need ALL scope.
  A period in an organisation without payroll access is a 404. Export needs an
  MFA-verified session and writes a `pay_period_export` audit entry with counts.
- **Overtime bands (#890).** `OVERTIME_BAND` items name a `band` as #890 names
  it (the multiplier: "1.5", "2", "3"). `overtime.RosterOvertimeBands` reads
  them from `roster.overtime_service.attendance_bands` (time outside the rostered
  shift, and whole holiday or rest days); payroll never repeats the band maths.
  #890 computes bands on read, so payroll copies them into pay-line quantities
  at computation and the lines lock at submission. Manual band lines are refused
  where the employee's department computes bands, and allowed with a reason
  where it does not.
- **Logs and Sentry:** IDs and counts only, never names, quantities or reasons.

### Rules (all provisional, parameters in the GAA catalogue)
- Base hours: arrival to departure (`hours_basis` ELAPSED, the memorandum's
  8 hours inclusive of lunch) capped at `standard_hours`.
- Shift premium: hours inside the local 21:00–06:00 window; breaks not deducted.
- Public holiday: hours inside a `PublicHoliday` local day. Base is not reduced.
- Meal: shift worker more than `shift_worker_beyond_hours` past
  `shift_worker_standard_hours`; non-shift worker departing after
  `non_shift_departs_after` on the shift's own date. One per shift.
- Call-out and call-out meal: MANUAL lines with a required reason.
- Shift worker: `employee_pay_profile.shift_worker`, else the department default.

### Tests
`tests/hr/test_payroll_inputs.py` (the eleven acceptance checks, through the API),
`tests/hr/test_payroll_rules.py` (pure rule edges). Synthetic data only.

## Roster rules (#380)
- Rules are data: `roster.RosterRuleSet` (organisation default, department rows replace it; built-in `rules.DEFAULT_RULES` when none). Edit with `roster.rules.manage` (HR admins; organisation rows need organisation-wide scope). Union coverage and worker type live on `EmploymentRecord` (`union_covered`, `rule_worker_type`) and are edited only through `PUT /hr/rosters/employees/{id}/rule-profile` with the same key, never by the employee themselves.
- Every path that changes scheduled or worked time must call the shared checks and `rule_service.enforce`: publish and published-roster edits (`roster/service.py`), exchange approval, leave/absence cancellation, timesheet and attendance approval (`roster/change_checks.py` via `workflow/finalize.py`). A break raises `RosterRuleWarningsError` (409) unless `rule_override_reason` is given; the override is stored in `RosterRuleOverride` and the record's change history. Report only breaches the change introduces (`rules.introduced`), except at publish.
- Worked hours are the shift span minus `ShiftCatalog.break_minutes` (`expansion.worked_shift_hours`); never use the raw span for limits or bands. Every route that can raise the warnings wraps its `responses` in `roster.schemas.with_rule_warnings` and takes an `OverrideReason` field.
- Overtime bands (`roster/overtime.py`, `overtime_service.py`) are hours only and computed on read. Readings and open questions: `docs/hr/roster-rules.md`. Do not copy agreement text into the repository.
- Tests that publish fixture rosters not about rules pass `rule_override_reason`.
