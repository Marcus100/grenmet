# ADR-0031: Self-registering API domains

## Status

Approved by the owner 2026-10-20; build it after the observations store (ADR-0032) lands.

## Context

Adding an API domain means editing four shared files in `apps/api/fastapi`, so parallel domain work collides in them.

- `src/main.py`: router imports, `include_router` calls, the hand-ordered `OPENAPI_TAGS`, per-domain engine closing in `lifespan`, and the domain tuple in `_operation_domain` that sets operationId prefixes.
- `alembic/env.py`: model imports, a `import_module` tuple, and `_TRACKED_SCHEMAS`. A table in an untracked schema is silently dropped by `_include_object`.
- `src/database.py`: model imports and audit/notification `register()` calls that must run at import time, before any session exists.
- `src/worker/main.py`: job functions, the `functions` list, `cron(...)` entries, and a handler-module list copied into `startup` and `drain_outbox`.

## Evidence

**Facts (origin/dev, 2026-10-20):**
- `src/main.py` is 613 lines: 63 router imports, 65 `include_router(` matches (the count includes non-router uses), `OPENAPI_TAGS` at line 174 with 56 `"name":` entries in the file. (high)
- `alembic/env.py` has `_TRACKED_SCHEMAS` with 14 entries (`None` plus 13 named schemas) and about 30 model-import lines. (high)
- `src/database.py` has 13 `.register(` calls. `src/worker/main.py` has 21 `async def` jobs and 20 `cron(` lines. (high)
- Since 2026-09-01 the four files were touched by 34 of 203 non-merge commits (53 of 307 counting merges). (high; count by `git log --since`)
- Constraints any design must keep, from the survey of `main.py` and CI:
  - `openapi.json` byte-identical. CI regenerates it with `PROJECT_NAME="Barrels Grenada"` and runs `git diff --exit-code`.
  - Path order follows `include_router` order. Tag order follows `OPENAPI_TAGS`, which is hand-curated.
  - operationId prefix comes from path-substring precedence (cap, `/auth/`, the hardcoded tuple, then tag fallback). `_lift_inline_enums` post-processes the schema.
  - `tests/test_outbox.py` monkeypatches `outbox._HANDLERS`, so it stays a module-level dict. Tests also reference job functions as attributes of `src.worker.main`.
  - `tests/test_api_conventions.py` reads `main.py` as text. `tests/test_startup_imports.py` requires that `import src.main` does not load weasyprint. `scripts/guardrails/check-blast-radius.mjs` has exact-text exemptions on `main.py`.
  - `src/database.py` imports domain modules while domains import `src.database`: circular-import risk. (medium: from the survey, not re-read line by line)

**Interpretation:**
- The shared files are a conflict surface, and the cost is mostly in review and rebase time. (heuristic, medium)
- Explicit order matters more than convenience, because ordering is part of the public OpenAPI contract. (high)

**Uncertainty:**
- The survey did not run the tests or generate the OpenAPI snapshot. The claim that domain paths interleave in `include_router` order comes from reading `main.py`. (medium)
- Whether domains with their own engines (events, wxwatch, eregister) fit the same manifest without special cases. (low)

## Options considered

1. **Status quo.** No risk, and the conflicts stay.
2. **A. Per-domain manifest plus one explicit ordered list (chosen).**
   - `src/<domain>/register.py` exposes a frozen dataclass: router(s), tags, schema, model modules, audit/notification registrations, worker jobs, cron entries, outbox modules.
   - One shared module (for example `src/domains.py`) holds the ordered list. `main.py`, `env.py`, `database.py` and the worker loop over it.
   - Order is explicit and deterministic, mypy can check it, and the shared file is one line per domain, so conflicts are small.
3. **B. `pkgutil`/`importlib` auto-discovery.** Order becomes filesystem order, so `openapi.json` and tags would change unless each manifest carries an order integer, which is a new conflict surface. It also hides what is mounted, is slower and types worse.
4. **C. setuptools entry points.** Needs a reinstall, makes `pyproject.toml` a new hotspot, and has the same ordering problem.

## Decision

Adopt option A, migrated gradually. Take a one-time snapshot of the current tag order and include order first; the manifest list reproduces it exactly.

Do not try:
- filesystem discovery for ordering;
- sorting or deriving tags alphabetically;
- changing operationId in the same PR (it is public to the generated client and `check-api-breaking` would flag it);
- moving registrations into `lifespan`;
- a big-bang rewrite;
- entry points.

## Consequences

- A new domain adds one manifest file and one line in the shared list.
- `_TRACKED_SCHEMAS` and the audit registers stop being hand-maintained, so the silent table drop becomes a test failure instead.
- Harder: the manifest shape is a new abstraction to learn, and `main.py` text changes require updating `test_api_conventions.py` and the blast-radius exemptions.
- Import-time order for `database.py` registers must be preserved by the loop; it needs a test.

## Migration and verification

Each step is one small PR. Rollback is reverting that PR.

1. Add the `Domain` dataclass, an empty list and golden snapshots:
   - `app.openapi()` JSON;
   - ordered `(path, methods, name, operationId)` from `app.routes`;
   - `OPENAPI_TAGS` order;
   - registered outbox topics;
   - `sorted(Base.metadata.tables)`;
   - a registry test.
2. Wire `main.py` to loop over registered domains after the legacy includes. Update the exemptions and tests if its text changes.
3. Pilot `webhooks_out` (most recent, self-contained, touches all four files), then `contacts`.
4. Derive `_TRACKED_SCHEMAS`, model imports and the `database.py` registers from manifests.
5. Worker manifests contribute `functions`, `cron_jobs`, startup modules and outbox modules. Job functions stay importable from `src.worker.main`.
6. Migrate the rest in batches. Mixed domains last: `hr` (15 routers) and domains with their own engines. Update `docs/hr/adding-a-form-module.md`, `AGENTS.md` and `src/worker/AGENTS.md`.

Byte-identity proof at every step: regenerate `openapi.json` and run `git diff --exit-code`, compare the golden snapshots, run the full API tests and `tests/test_startup_imports.py`, and run `alembic check` with no new diff.

## Out of scope

- Changing operationId, tag order or any public route.
- Merging per-domain databases or Alembic trees.
- Web apps and packages.
