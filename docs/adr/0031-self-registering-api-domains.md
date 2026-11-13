# ADR-0031: Self-registering API domains

## Status

Approved by the owner 2026-10-20; build it after the observations store (ADR-0032) lands.

Steps 1 to 3 built 2026-11-12: `src/domain_manifest.py` (types), `src/domains.py`
(`DOMAINS`, `MOUNT_ORDER`, `ordered_mounts`), `main.py` mounting every router
in one loop, and the `webhooks_out` pilot (`src/webhooks_out/register.py`).
`openapi.json` is byte-identical. Two hidden mounts moved after the API
routes: the `/scalar` docs page and the local-only private router (which now
loses to any API path it shares). Step 1 changed: route and tag order are not
snapshotted, because the CI `openapi.json` regeneration diff already proves
them; the only snapshot is a floor (`tests/snapshots/domain_registry_floor.json`:
tables and outbox topics must not disappear), so adding a table needs no edit.
A new domain adds one line to `DOMAINS` and one `MOUNT_ORDER` entry per router,
not one line in total. Tags stay in `OPENAPI_TAGS` for now.

Step 4 and the `contacts` pilot built 2026-11-13. Manifests name code by
import path (`"src.x.router:router"`) instead of importing it, so
`src/domains.py` imports no domain code and `src/database.py` and
`alembic/env.py` read it without a circular import. A `Domain` also lists its
schemas, model modules and `register()` modules; `database.py` calls
`import_models()` and `run_registrations()`, and `env.py` adds
`tracked_schemas()` to `_TRACKED_SCHEMAS`. Manifest registrations now run after
the legacy ones. `openapi.json` and the `alembic check` output are unchanged.
Steps 5 and 6 are not started.

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
