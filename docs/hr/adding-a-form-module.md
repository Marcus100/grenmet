# Adding a New HR Form Module

A repeatable recipe for turning a paper HR form into a FastAPI module, generalized
from `src/hr/parking/` and `src/hr/absentee/`. Follow it whenever a new GAA/HR form
needs to be captured. For the field-mapping of existing forms see
[`forms-inventory.md`](forms-inventory.md).

> Conventions referenced here come from `apps/api/fastapi/CLAUDE.md` (two-layer
> models, module-import style, route metadata). Read it first.

Replace `<form>` with the snake_case module name (e.g. `parking`) and `<Form>` with
the PascalCase entity (e.g. `ParkingPermit`) throughout.

## 1. Create the module folder

`src/hr/<form>/` with:

| File | Contents |
|---|---|
| `__init__.py` | empty |
| `models.py` | `SQLModel, table=True` DB model(s) + domain enums |
| `schemas.py` | `<Form>Create` / `<Form>Public` / `<Form>ListPublic` (extend `src.models.BaseModel`) |
| `service.py` | async business logic |
| `router.py` | `APIRouter(prefix="/hr", tags=["hr-<form>"])` |

## 2. Model (`models.py`)

- `__tablename__ = "<table>"`, `__table_args__ = {"schema": "hr"}`.
- Standard request columns so it plugs into the approval engine:
  - `status: RequestStatus` (import from `src.hr.models`)
  - `workflow_instance_id: uuid.UUID | None` → FK `hr.workflow_instance.id`
  - `submitted_by_user_id: uuid.UUID` → FK `user.id`
  - `created_at` / `updated_at` defaulting to `utc_now` (`src.utils.datetime`).
- Use `str, Enum` enums (not `StrEnum`) — kept for consistency; on Python 3.11 `StrEnum` is available but has different `str()` semantics.

## 3. Schemas (`schemas.py`)

Three classes extending `src.models.BaseModel`: `<Form>Create` (request body),
`<Form>Public` (response — mirrors the DB fields you expose), `<Form>ListPublic`
(`data: list[<Form>Public]` + `count: int`). Never expose the SQLModel directly.

## 4. Service (`service.py`)

```python
from src.auth.policy import require_permission
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

async def create_<form>(*, session, current_user, payload) -> <Form>:
    require_permission(current_user=current_user, permission_key="<form>.<entity>.create")
    obj = <Form>(..., submitted_by_user_id=current_user.id)
    session.add(obj); await session.commit(); await session.refresh(obj)
    obj.workflow_instance_id = await start_workflow_for_entity(
        session=session, current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.<FORM>,
        entity_type="<table>", entity_id=obj.id,
    )
    session.add(obj); await session.commit(); await session.refresh(obj)
    return obj
```

- List endpoints: own-only by default; gate department-wide reads behind
  `"<form>.<entity>.read.department"`.
- Raise typed exceptions from `src/hr/exceptions.py` (add a `<Form>NotFoundError`);
  business-rule failures use `HRValidationError`.

## 5. Router (`router.py`)

`APIRouter(prefix="/hr", tags=["hr-<form>"])`. Every route sets `response_model`,
`status_code`, `summary`, `description`, `responses`, and uses `*` for keyword-only
params. Delegate to `service`; never put business logic in the route.

## 6. Wire it up

- `src/main.py`: import the router and `app.include_router(hr_<form>_router, prefix="/api/v1")`.
- `src/hr/workflow/models.py`: add `WorkflowType.<FORM>`.
- `src/hr/models.py` `ApprovalAuthority`: add `can_approve_<form>: bool = False` if it needs an approval gate.
- `src/hr/constants.py`: add `ERROR_<FORM>_NOT_FOUND` (+ any rule messages).
- `alembic/env.py`: import the new model(s) so autogenerate sees them.

## 7. Migration

```
docker compose exec api uv run alembic revision --autogenerate -m "hr <form>"
```

Then **review the generated file** — autogenerate currently also surfaces unrelated
pre-existing CAP-domain drift; strip those `cap.*` operations out. Hand-edit for the
PostgreSQL enum gotchas below, then:

```
docker compose exec api uv run alembic upgrade head
```

### PostgreSQL enum gotchas (important)

- **Enums are native PG types** (`sa.Enum(..., name=...)`). Autogenerate **does not**
  detect a *new value* added to an existing enum — hand-add it:
  ```python
  op.execute("ALTER TYPE workflowtype ADD VALUE IF NOT EXISTS '<FORM>'")
  ```
- **`op.add_column` does not auto-create a new enum type** (unlike `create_table`).
  Create it explicitly first, then reference it with `create_type=False`:
  ```python
  from sqlalchemy.dialects import postgresql
  myenum = postgresql.ENUM("A", "B", name="myenum")
  myenum.create(op.get_bind(), checkfirst=True)
  op.add_column("t", sa.Column("c", postgresql.ENUM("A", "B", name="myenum", create_type=False), ...), schema="hr")
  ```
- **Reusing an existing enum** (e.g. `requeststatus`) in a new table: use
  `postgresql.ENUM(..., name="requeststatus", create_type=False)` so it isn't recreated.
- **NOT NULL columns on a populated table** need `server_default=...` on add, then
  `op.alter_column(..., server_default=None, ...)` to match the model.

## 8. Permissions are data, not code

Permission keys (`"<form>.<entity>.create"`) are checked as plain strings against
role grants — there is no catalog file. Grant them to real roles via the roles API,
and in tests via `make_role_with_permission(db_async, "<form>.<entity>.create")`
(`tests/factories.py`). Superusers bypass all checks.

## 9. Approval template is data, too

`start_workflow_for_entity` returns `None` (no approval) unless an **active
`WorkflowTemplate`** exists for that department + `WorkflowType`. Seed a template +
ordered `WorkflowStepTemplate`s (the signature chain) per department via the
`workflow.template.manage` endpoints.

## 10. Tests

Add `tests/hr/test_<form>_service.py` (async, use `db_async` + the factories). Cover:
permission-required, happy path, list scoping, and any business rules. Run:

```
docker compose exec api uv run pytest tests/hr/test_<form>_service.py -q
```

## 11. Contract sync (Ask-First)

New public routes change the OpenAPI contract. Regenerate `openapi.json` and the
TypeScript client (`pnpm generate:api-client`) and update `docs/api/contracts.md` —
CI fails on drift. Confirm with the user before committing contract changes.
