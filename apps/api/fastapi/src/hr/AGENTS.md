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

## Tests
`tests/hr/` — service tests per sub-domain, `test_authz.py`, `test_organisation_boundary.py`, workflow tests. Use real JWT fixtures and `db_async`.

## Related
ADR-0008, ADR-0009, `apps/web/gaa-admin/AGENTS.md` (`/hr` routes), `docs/hr/`.
