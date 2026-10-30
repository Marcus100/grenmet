# hr domain — agent context

**Owner:** GAA staff platform (piloted in GMS). Delivered by Barrels; GAA is the acceptance authority. Not a Barrels product.

## Layout
Sub-packages, each with its own `router.py`/`service.py`/`schemas.py`/`models.py`:
`absentee`, `calendar`, `dailystatus`, `dashboard`, `documents`, `exchange`, `leave`, `parking`, `roster`, `signatures`, `timesheet`, `training`, `workflow`. Profile/employment routes are in `routers/profile.py`; organisations in `organisations.py`.
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
- **End date (#797).** `EmploymentRecord.end_date` is the last day of employment (nullable; CHECK not before `start_date`; merged-value validation in `organisations.validate_service_facts`). From that date in Grenada time (`utils/timezones.local_today`, never UTC) the record counts as ended: `EmploymentRecord.is_live` and `models.live_employment_clause` drive `auth.policy._active_assignments`, `auth.access.effective_roles` and delegated grants. Access stops on the date, before any job runs.
- **Daily job.** `end_due_employment_records` (worker, 04:10 UTC = 00:10 Grenada) sets ACTIVE records whose end date is today or earlier to TERMINATED with organisation-wide authority. Idempotent: only ACTIVE rows match, so a second run changes nothing. Tests: `tests/worker/test_employment_end_job.py`.
- **Reinstating** with an end date that has passed is refused (400) until the date is cleared or moved, otherwise the next run would end the record again.
- **Department transfer (#797).** Changing `department_id` to another department ends every live non-baseline assignment in that organisation (audited); an administrator re-grants at the destination. Same-department edits end nothing. A person who holds a live ALL-scope assignment can be transferred only by someone with organisation-wide `hr.employment.manage` (`has_organisation_wide_hr_authority`); anyone else gets 403 `HRPermissionDeniedError` and nothing changes, including the status. Tests: `tests/hr/test_employment_transfer_roles.py`.
- **Deleted record.** No code path deletes an `EmploymentRecord`. User deletion (`auth.service.delete_user`) removes the row by database cascade, but `user_role_assignment.user_id` has no `ON DELETE`, so a user holding any assignment cannot be deleted (verified: foreign-key violation, row kept). Nothing needs ending. If a delete path is ever added, it must end the roles in the same transaction through `set_employment_status`.
- **Known gap.** Roles stop on the end date, but other `status == ACTIVE` checks (roster, timesheet, leave, exchange, baseline readiness, notifications) only see the end when the daily job has run, up to about a day later.
- A user cannot change their own employment status. A self-transfer is not special-cased: the person's own roles end, and their own authority is only what their destination scope allows.
