# Full-Stack Feature Playbook

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-23

The end-to-end path for a feature that touches the database, FastAPI, the
generated client, and a web app. Each step names the pattern to copy and the
gate that proves it. Rules come from the root `AGENTS.md`,
`apps/api/fastapi/AGENTS.md`, the domain's `src/<domain>/AGENTS.md`, and the
app's `AGENTS.md`. Read those first.

Ask First applies to: schema changes and migrations, public or
contract-changing routes, new files in `packages/`, and new dependencies.
Confirm scope with the user before step 1 if any of them are involved.

## 0. Locate the owner

- Which domain owns the data? Check `docs/portfolio/repository-delivery-map.md`
  (FastAPI domains table) and the domain's `AGENTS.md`.
- Which database? Main application DB (`alembic.ini`) or a separate domain DB
  (`src/<domain>/alembic.ini`: wxproducts, wxwatch, eregister, janitorial,
  transport).
- Which permission gates it? Find or add the key in
  `apps/api/fastapi/src/auth/permissions.py`.

## 1. Model and migration (backend)

Pattern: `src/hr/leave/models.py` (SQLAlchemy 2.0 `Mapped` / `mapped_column`
on `src.orm.Base`).

```bash
cd apps/api/fastapi
uv run --frozen --package fast-back alembic revision --autogenerate -m "add_<thing>"   # main DB only
```

Separate-database domains don't autogenerate. Write the next
`src/<domain>/migrations/versions/NNNN_<slug>.py` by hand with
`revision = "<domain>_NNNN"` (recipe in `docs/api/development.md` →
Databases and migrations).

- Review the generated file by hand: static, reversible (`downgrade()` works),
  no data loss. Names are `lower_snake`, singular; `_at` for datetimes, `_date` for dates.
- Register personal or approval data for change history (`src/<domain>/audit.py`
  → `src.audit.registry.track`).

## 2. Schemas, service, dependencies, router

Pattern: `src/hr/leave/` (router → service → models, `schemas.py` on
`src.models.BaseModel`).

- `schemas.py`: `<Thing>Create`, `<Thing>Update`, `<Thing>Public`, `<Thing>ListPublic`; datetimes as `UtcDateTime`; finite values as named `str, Enum`.
- `service.py`: async functions and SQL-first queries. Call `require_permission(current_user=…, permission_key=…)`. Raise domain `AppException` subclasses. Emit notifications with `src.notifications.service.notify` inside the transaction.
- `dependencies.py`: `valid_<thing>_id` style dependencies, exposed as `Annotated` aliases.
- `router.py`: thin routes with `response_model`, `status_code`, `summary`,
  `description`, `tags`, `responses`, and a stable domain-prefixed operation ID.
  Register the router in `src/main.py` if it's new.
- Slow or retryable side effects → an ARQ job (`src/worker/`), not `BackgroundTasks`.

## 3. Backend tests

Pattern: `tests/hr/test_leave_service.py` (service level) and `tests/hr/routers/` (HTTP level).

```bash
uv run --frozen --package fast-back pytest tests/<domain>/ -q
./scripts/lint.sh
```

Use `async_client`, `db_async`, and the real-JWT header fixtures. Cover
permission denial, cross-organisation access, and invalid input, not only the
happy path. New permission keys are checked by `tests/auth/test_permission_registry.py`.

## 4. Contract and generated client

Follow the `api-change` skill (`.claude/skills/api-change/SKILL.md`):

```bash
cd apps/api/fastapi && uv run --frozen --package fast-back python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"
cd ../../.. && pnpm generate:api-client && pnpm check:drift
```

Update `docs/api/contracts.md` for new endpoints or breaking changes.
`tests/test_openapi_contract.py` enforces operation IDs, descriptions, and
named enums.

## 5. Web UI (gaa-admin example)

Run the `gaa-admin-change` skill first. It's one app with five folded modules.

- **Read on the server:** a `server-only` loader exchanges the session for an
  access token and calls the generated function with a request-scoped client.
  Pattern: `apps/web/gaa-admin/src/components/hr/dashboard/load-dashboard.ts`
  → `src/app/(admin)/hr/page.tsx` (Server Component with an error state).
- **Mutate from the browser:** generated Zod schemas validate the response.
  Pattern: `src/app/(admin)/wxproducts/product-actions.ts`. Use the generated
  React Query hooks only for client-side mutations or polling.
- UI from `@barrelsgd/ui/components/ui/<name>`; styling with `--gm-*` tokens and
  semantic classes only; `"use client"` only where interaction needs it.
- Hide controls the user can't use, but the API remains the authority. Never
  re-derive permissions or masking client-side.

## 6. Frontend tests

Pattern: colocated `*.test.tsx` with Vitest and Testing Library, using MSW for
API calls (for example `src/components/hr/leave/leave-application-editor.test.tsx`).

```bash
cd apps/web/gaa-admin && pnpm vitest run src/path/to/file.test.tsx
```

## 7. Gates before done

```bash
pnpm fix:changed && pnpm type-check
pnpm guardrails:staged          # contract pairing (stage your changes first)
pnpm check:drift
turbo run test --filter=@barrelsgd/web-gaa-admin
```

Then grep every consumer of the symbols you changed (the generated function
name, schema name, permission key) and check each layer, per the Blast-Radius
Gate. Append a `SESSION_LOG.md` entry.
