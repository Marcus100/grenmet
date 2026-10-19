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

## Notifications

`notifications.py` registers five events with `src.notifications.events` (registered in `src/database.py`) and calls `notify()` inside the requisition's own transaction, so a rolled-back change never notifies. Submitted (direct create with `submit` or draft submit) → holders of `stores-approver` whose grant covers the department (`default_roles`, tunable in notification settings; "waiting for approval" cannot be muted by email opt-out). Approved / rejected → requester. Partially delivered / delivered → requester. The actor is excluded; texts hold only reference, requester and department (never approver notes). `dedupe_key` is `<event>:<requisition>`; delivery events add the running delivered total, so a retried delivery is silent and each real delivery is announced once. A user's per-event email opt-out and any snooze are honoured by `notify()`. Approvers who hold `stores.approve` through another role (not `stores-approver`) are not told unless the role is added to the event in notification settings.

## Granting the stores roles (admin note)

Roles are seeded (`stores-requester`, `stores-approver`, `stores-keeper`) and not changed on existing roles. A superuser grants them in gaa-admin: **Users** → open the person → **Manage user** → role assignments → pick the role, a scope and, for `DEPARTMENT`, the department. Everyone must also have an active HR employment record (it fixes their organisation and department).

- `stores-requester`: scope `SELF` is enough; requisitions always file under the employment department.
- `stores-approver`: scope `DEPARTMENT` + the department they approve (or `ALL` for every department of the organisation). They cannot approve their own requisitions.
- `stores-keeper`: scope `ALL` to maintain the catalogue, locations and stock (organisation-wide manage); a `DEPARTMENT` keeper can deliver only that department's requisitions.

With no UI: `POST /api/v1/auth/role-assignments` (superuser) with `{"user_id": "<uuid>", "role_id": "<uuid of the stores role>", "scope": "DEPARTMENT", "department_id": "<department id>", "organisation_id": "<org id>"}`; list roles with `GET /api/v1/auth/roles` to find the `role_id`.

## Not built yet

Reservation of stock at approval (approval does not hold stock; availability is only checked at delivery), reorder levels, units of measure beyond a label, and moving stock between locations.

## Tests

`tests/stores/test_notifications.py` — recipients, dedupe, opt-outs, no secrets in text. `tests/stores/test_stores.py` — lifecycle, partial delivery, self-approval, cross-department denial, org-wide manage gate, stock invariants, adjustment audit. Use real JWT fixtures and `db_async`.

## Related

`docs/playbooks/full-stack-feature.md`; ADR-0008 (approval pattern — this domain uses a single-step department approval, not the HR workflow engine); `apps/web/gaa-admin/AGENTS.md` (`/salesbus` routes).
