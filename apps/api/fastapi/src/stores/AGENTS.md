# stores domain — agent context

**Owner:** GAA internal stores requisition (Stores module of the gaa-admin portal, routes still under `/salesbus`). Delivered by Barrels; GAA is the acceptance authority. Not a Barrels product.

- Tables live in the `stores` schema of the **main** database (main Alembic history, revision `stores20261017`). Not a separate-database domain.
- Layout: `models.py`, `schemas.py`, `access.py` (caller context + scoped authority), `stock.py` (the only code that changes a stock level), `service.py` (catalogue, locations, stock, requisitions), `router.py` (`/api/v1/stores/*`), `audit.py` (change-history registration, called from `src/database.py`).
- **Tenancy is reused, not invented.** The caller's organisation and department come from their HR `EmploymentRecord`; no employment record means 403. Approval and management authority come from role assignments via `src.hr.organisations.permitted_departments`. A client never supplies an organisation or department: a requisition is always filed under the requester's own department.
- **Permissions** (`src/auth/permissions.py`): `stores.view` (catalogue, stock, own and in-scope requisitions), `stores.request`, `stores.approve` (per department), `stores.manage`. Seeded roles: `stores-requester`, `stores-approver`, `stores-keeper`. Existing roles (`staff`, `hr-supervisor`, …) are **not** changed; grant a stores role with a department (or organisation) scope in the admin UI.
- **Catalogue, locations and stock are organisation-wide**, so changing them needs a `stores.manage` grant that covers every department of the organisation. Delivering a requisition needs `stores.manage` for the requisition's department.

## Invariants

- Requisition states: `DRAFT → SUBMITTED → APPROVED | REJECTED`, `APPROVED → PARTIALLY_DELIVERED → DELIVERED`; `CANCELLED` from draft or submitted (requester only). Drafts are visible only to the requester.
- The requester can never approve or reject their own requisition, whatever they hold. Approval may lower line quantities, never raise them; at least one line must stay above zero.
- Delivery locks the requisition and the stock rows (stable item order), writes `ISSUE` movements and updates line `delivered_quantity` in **one transaction**. A shortfall (409) or an over-delivery (422) changes nothing.
- Stock is never negative: `stock_level.quantity >= 0` is a DB check as well as a service check. Every change goes through `stock.apply_movement` and leaves a `stock_movement` ledger row (receipt, issue, adjustment). An adjustment sets the **counted** level, needs a reason and is audited like every tracked model.
- Items, locations and requisition lines are never deleted — deactivate. SKU is unique per organisation (case-insensitive check).
- A requisition outside the caller's reach answers 404, not 403.

## Not built yet

Notifications to approvers/requesters, reservation of stock at approval, reorder levels, units of measure beyond a label, and moving stock between locations.

## Tests

`tests/stores/test_stores.py` — lifecycle, partial delivery, self-approval, cross-department denial, org-wide manage gate, stock invariants, adjustment audit. Use real JWT fixtures and `db_async`.

## Related

`docs/playbooks/full-stack-feature.md`; ADR-0008 (approval pattern — this domain uses a single-step department approval, not the HR workflow engine); `apps/web/gaa-admin/AGENTS.md` (`/salesbus` routes).
