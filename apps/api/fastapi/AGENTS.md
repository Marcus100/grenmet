# FastAPI AGENTS.md

Guidance for coding agents working in `apps/api/fastapi/`. Each domain under
`src/<domain>/` may have its own `AGENTS.md` with ownership, invariants, and tests —
read it before editing that domain. End-to-end recipe:
`docs/playbooks/full-stack-feature.md`.

To add a new HR form module, follow `docs/hr/adding-a-form-module.md` (recipe) and
`docs/hr/forms-inventory.md` (form→model field mapping).

## Project Layout

```
src/
├── {domain}/
│   ├── router.py       — APIRouter: endpoints only, no business logic
│   ├── schemas.py      — Pure Pydantic API shapes (Create, Public, ListPublic)
│   ├── models.py       — SQLAlchemy 2.0 ORM models (`src.orm.Base`) + domain enums
│   ├── service.py      — Business logic (async functions)
│   ├── dependencies.py — Annotated type aliases for Depends
│   ├── exceptions.py   — Domain-specific AppException subclasses
│   └── constants.py    — Error codes, string constants
├── config.py           — Global Settings (BaseSettings)
├── models.py           — Shared Pydantic base (BaseModel = CustomModel)
├── exceptions.py       — Global exception hierarchy + handlers
├── dependencies.py     — SessionDep, CurrentUser, TokenDep type aliases
├── database.py         — async_engine, async_session_factory
└── main.py             — FastAPI app, lifespan, middleware, router registration
```

Imports use the module name, not individual symbols, for both cross-domain and intra-domain service imports. This avoids name collisions between route functions and service functions:
```python
# Do — module import, no collision, origin is clear at the call site
from . import service                          # intra-domain
from src.auth import service as auth_service   # cross-domain

# Don't — importing by name creates collisions (route can't also be named create_user)
from .service import create_user
from src.auth.service import create_user
```

## Two-Layer Model Pattern

**Never collapse DB models and API schemas into one class.**

| Layer | Base class | Location | Purpose |
|---|---|---|---|
| DB model | SQLAlchemy ORM declarative model | `{domain}/models.py` | Table definition |
| API schema | `src.models.BaseModel` | `{domain}/schemas.py` | Request/response shape |

```python
# models.py — DB layer
class LeaveRequest(Base):  # from src.orm import Base
    __tablename__ = "leave_request"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    ...

# schemas.py — API layer (always extend src.models.BaseModel, not Pydantic directly)
# Exception: internal-only Pydantic models (e.g. settings wrappers in config.py) may use pydantic.BaseModel
from src.models import BaseModel

class LeaveRequestCreate(BaseModel):
    leave_type: LeaveType
    start_date: date
    ...

class LeaveRequestPublic(BaseModel):
    id: uuid.UUID
    status: RequestStatus
    ...
```

Services return DB models. Routes always declare `response_model` with a `Public` schema so FastAPI filters and validates the output — internal DB fields never leak:
```python
# service.py — returns the DB model
async def create_leave_request(...) -> LeaveRequest:
    ...
    return leave_request  # SQLAlchemy ORM instance

# router.py — response_model converts it to the API shape
@router.post("/leave-requests", response_model=LeaveRequestPublic, status_code=status.HTTP_201_CREATED)
async def create_leave_request_endpoint(...) -> Any:
    return await service.create_leave_request(...)
```

## SQL first, Pydantic second

Use SQLAlchemy statements to perform filtering, joins, aggregation, pagination,
and database-side JSON shaping. Fetch only the columns needed by the use case;
do not load a graph of ORM objects and then rebuild the same result in Python.
Use Pydantic after the database has produced the result, at the HTTP input and
output seam. This keeps query semantics in PostgreSQL and leaves Pydantic to
validate and serialize API contracts.

## Dependencies

Define `Annotated` type aliases in `dependencies.py`. Never inline `Depends` in route signatures.

```python
# dependencies.py
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# router.py — clean, alias-only params
async def my_endpoint(*, session: SessionDep, current_user: CurrentUser, payload: MyCreate) -> Any:
    ...
```

Chain dependencies for permission checks:
```python
async def valid_owned_request(
    request: Annotated[LeaveRequest, Depends(valid_leave_request_id)],
    current_user: CurrentUser,
) -> LeaveRequest:
    if request.user_id != current_user.id:
        raise AuthorizationError()
    return request
```

## Exception Handling

Use `AppException` subclasses in service/dependency layers. Reserve raw `HTTPException` for protocol-level errors (auth, token parsing) in `dependencies.py`.

```python
# services and dependencies — raise typed exceptions
raise NotFoundError("Leave request not found")
raise AuthorizationError("Not allowed to action this request")

# only in low-level auth deps — HTTPException is acceptable
raise HTTPException(status_code=401, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"})
```

Never catch bare `Exception` around route bodies. Catch the specific class; let global handlers handle the rest.

## Route Conventions

```python
@router.post(
    "/hr/leave-requests",
    response_model=LeaveRequestPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create leave request",
    description="Creates a leave request for the current user.",
    tags=["hr-leave"],
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
async def create_leave_request_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Any:
    return await service.create_leave_request(session=session, current_user=current_user, payload=payload)
```

- Use `*` to make all route params keyword-only.
- Always set `response_model`, `status_code`, `summary`, `description`, `tags`, and `responses`.

## Async and Blocking I/O

| Route does | Use |
|---|---|
| `await`-able I/O (DB, HTTP) | `async def` |
| Sync-only library (no async client exists) | `def` — FastAPI runs it in threadpool |
| Mix: async route + one sync call | `async def` + `await run_in_threadpool(fn, *args)` |
| CPU-heavy or retryable work | Enqueue for the ARQ worker (`src/worker/`) |

```python
# Don't — blocks the event loop
@router.get("/bad")
async def bad():
    result = requests.get("https://example.com")  # sync inside async

# Do — wrap sync call in threadpool
from fastapi.concurrency import run_in_threadpool

@router.get("/ok")
async def ok():
    result = await run_in_threadpool(legacy_client.fetch, "id")
    return result
```

**BackgroundTasks** — use only for fire-and-forget tasks under ~1 second that can be silently dropped (e.g. sending a welcome email). There is no retry. If the worker dies, the task is lost. Use the ARQ worker (`src/worker/`) for anything you'd page on.

## Enums

Use `str, Enum` (not `StrEnum`) — kept for consistency with existing enums; `StrEnum` changes `str()` semantics (`str(member)` yields the value, not `Class.MEMBER`), so don't mix the two:

```python
from enum import Enum

class LeaveType(str, Enum):
    VACATION = "VACATION"
    SICK = "SICK"
```

## Settings

Add domain-scoped settings to a `BaseSettings` subclass in `{domain}/config.py`, not to the global `Settings`. Follow the `AuthConfig` pattern in `src/auth/config.py`.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class MyDomainConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MY_DOMAIN_", env_file=".env.local", extra="ignore")
    SOME_KEY: str = "default"

my_domain_settings = MyDomainConfig()
```

## Observability

**Logging** — `src/logging_config.py` configures JSON output (Datadog-compatible) via `python-json-logger`. Call `configure_logging()` once at startup (already wired in `main.py`). Set `LOG_FORMAT=text` locally for human-readable output, `LOG_LEVEL` to control verbosity.

**ddtrace** — Installed as a runtime dep. The production image defaults trace exports, instrumentation telemetry and remote configuration to disabled until a Datadog Agent is provisioned. In production, run the app via `ddtrace-run uvicorn src.main:app` so APM tracing, trace ID injection into logs, and auto-instrumentation of FastAPI/SQLAlchemy/httpx are active. Set `DD_LOGS_INJECTION=true`, `DD_SERVICE`, `DD_ENV`, `DD_VERSION` in the environment.

**Sentry** — Captures exceptions automatically via `sentry_sdk.init` in `main.py` (API) and `src/worker/main.py` (worker), with the content-minimising policy in `src/telemetry.py`. `logger.error`/`logger.exception` calls are reported too, so never swallow an unexpected exception silently: log it or re-raise. Only `area` and `digest` tags survive scrubbing. Controlled by `SENTRY_DSN`.

**Domain logging** — Every service file has `logger = logging.getLogger(__name__)`. Log key business events at `INFO` with structured `extra={}` dicts. Log permission denials at `WARNING`.

## JWT

Always use `PyJWT` (`import jwt`). Never use `python-jose`.

```python
import jwt
from jwt.exceptions import InvalidTokenError

payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
```

## Testing

**Prefer async for new tests.** Use `async_client` and `db_async` fixtures from `conftest.py`.

```python
@pytest.mark.asyncio
async def test_create_leave_request(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    resp = await async_client.post(
        "/api/v1/hr/leave-requests",
        headers=superuser_token_headers_async,
        json={...},
    )
    assert resp.status_code == 201
```

- Authenticate with real JWTs (`superuser_token_headers_async`, `normal_user_token_headers_async`); use `app.dependency_overrides` only for external services or forced error paths (see `TESTING.md`).
- Use a real database (the `db_async` fixture hits the actual DB). Don't mock `AsyncSession`.
- The sync `client` and `db` fixtures are legacy — don't add new tests that use them.
- Running from the agent dev container? There's no docker CLI and Compose service
  names such as `db` and `grenmet-postgres` are not resolvable there. Run
  `uv sync --frozen --package fast-back` once, then override every database/Redis
  host used by the test process:

  ```bash
  POSTGRES_SERVER=host.docker.internal \
  POSTGRES_PORT=5432 \
  POSTGRES_USER=app \
  POSTGRES_PASSWORD=changethis \
  REDIS_URL=redis://host.docker.internal:6379/0 \
  WXPRODUCTS_DATABASE_URL=postgresql://wxproducts:changethis@host.docker.internal:5432/wxproducts \
    uv run --frozen --package fast-back pytest
  ```

- Before pushing API changes, run the touched domains' tests
  (`pytest tests/<domain>/`); the pre-push hook does not run pytest. Parallelise
  with at most `-n 2`, as CI does — higher worker counts against the shared local
  Postgres cause fixture `TimeoutError`s that are not real failures.

  The passwords above are local-development placeholders; use the local stack's
  actual values when they differ, and never commit real credentials. The main
  suite creates a run-owned application database. wxproducts migration and
  authoring fixtures create separate disposable `weather_test_*` databases:
  wxproducts migration `0001` intentionally refuses to install beside the main
  application's untracked tables. Do not point either test database at a
  development or production database. See the root `AGENTS.md` → Commands.

## Best-practice baseline

This service follows [zhanymkanov/fastapi-best-practices](https://github.com/zhanymkanov/fastapi-best-practices).
Where this file is more specific, this file wins. Checklist for new code:

| Practice | In this repo |
|---|---|
| Domain packages under `src/` with `router/schemas/models/service/dependencies/constants/config/exceptions/utils` | Yes; add only the files a domain needs |
| Explicit module imports across domains | `from src.auth import service as auth_service` |
| `async def` for awaitable I/O; sync SDKs via `run_in_threadpool`; heavy/retryable work to a queue | ARQ worker, not Celery |
| Custom Pydantic base for shared serialization | `src.models.BaseModel`, `UtcDateTime` |
| `BaseSettings` split per domain | `src/<domain>/config.py` with an `env_prefix` |
| Dependencies validate against the DB (e.g. `valid_<thing>_id`), are chained, and rely on per-request caching | Prefer `async` dependencies |
| Same path-variable name for the same resource across endpoints so validators are reusable | e.g. `alert_id`, `product_id` |
| Raise `ValueError` in Pydantic validators | FastAPI turns it into a 422 |
| `response_model`, `status_code`, `summary`, `description`, `tags`, `responses` on every route | Enforced by review and `tests/test_openapi_contract.py` |
| API docs hidden in production | `main.py` sets `docs_url`/`openapi_url` to `None` outside allowed environments — keep it that way |
| DB names: `lower_snake`, singular, grouped prefixes, `_at` for datetimes and `_date` for dates | Explicit index/constraint naming via `src.orm.Base.metadata` |
| Migrations static, reversible, date-slug file names | Main `alembic.ini` uses `%%(year)d-%%(month).2d-%%(day).2d_%%(slug)s` |
| SQL-first; nested JSON via `func.json_build_object` when it saves Python reshaping | See "SQL first, Pydantic second" |
| Async test client from day one; `dependency_overrides` for external services | Real DB + real JWT for auth |
| Ruff for lint and format | `./scripts/lint.sh`, `./scripts/format.sh` |

**Intentional deviation:** the separate-database domains (`wxproducts`,
`wxwatch`, `eregister`, `janitorial`, `transport`) use hand-written SQL
migrations named `NNNN_<slug>.py` with namespaced revision IDs
(`<domain>_NNNN`), no autogenerate, and explicitly named indexes and
constraints. Their `env.py` refuses to run against the wrong database. Follow
that style there; use the date-slug autogenerate flow only for the main
database.

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| `requests.get(...)` inside `async def` | Use `httpx.AsyncClient` or `run_in_threadpool` |
| `time.sleep(...)` inside `async def` | Use `await asyncio.sleep(...)` |
| `from jose import jwt` | `import jwt` (PyJWT) |
| Inline `Depends(fn)` in route signature | Define a named `Annotated` alias in `dependencies.py` |
| Route returning a DB model without `response_model` set | Always set `response_model` to a `Public` schema — internal DB fields leak otherwise |
| Catching `Exception` around route logic | Catch the specific class; let global handlers run |
| Adding domain config to global `Settings` | Create a domain `BaseSettings` subclass |
| New test using sync `TestClient` | Use `async_client` fixture |
| Mocking `AsyncSession` in tests | Use `db_async` fixture (real DB) + `dependency_overrides` for auth |

## OpenAPI contract conventions

- Keep operation IDs stable, unique, and domain-prefixed (`capGetAlert`,
  `hrCreateLeaveRequest`, `authLogin`).
- Use `src.models.BaseModel` for public Pydantic schemas; do not expose ORM
  models directly.
- Use `UtcDateTime` for API datetimes so serialization retains
  `format: date-time`.
- Promote meaningful finite values to named enums; document intentional open maps
  in the OpenAPI guard exemption registry.
- Declare response models, success statuses, summaries, descriptions, and
  realistic error responses on public routes.
- Regenerate `openapi.json` before Kubb and run `pnpm check:drift`; never edit
  generated client files manually.

## Python runtime

The FastAPI project requires Python 3.14 (`pyproject.toml` is authoritative).
The workspace `.venv` used by `uv run` must be created with that interpreter; do not use a
system Python or a stale environment linked to Python 3.13 or earlier. Python
3.14 syntax such as PEP 758's unparenthesized multiple-exception syntax is
intentional. If a syntax check reports errors around that syntax, verify the
interpreter before changing source code. `scripts/lint.sh` fails early when the
active `uv` environment does not match the configured requirement.
