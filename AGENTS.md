# AGENTS.md

This is the entry point for Codex. Commands first, then conventions,
then where to find deeper context.

## Commands

### Setup

```bash
pnpm install       # Install all dependencies
pnpm start         # Start Docker services (Postgres + FastAPI)
```

### Development

```bash
pnpm dev:web:auth       # auth           :3000
pnpm dev:web:admin      # admin-gms      :3001
pnpm dev:web:hurricane  # hurricaneplan  :3002
pnpm dev:web:spicewx    # spicewx        :3003
pnpm dev:web:signal     # signal         :3004
```

### Quality — run both before finishing any task

```bash
pnpm fix                                          # Auto-fix lint + format
pnpm type-check                                   # TypeScript across all packages
turbo run check --filter=@grenmet/<package>       # Single package
turbo run type-check --filter=@grenmet/<package>  # Single package
```

### Test

```bash
turbo run test --filter=@grenmet/web-admin        # Unit tests (admin-gms)
pnpm vitest run src/path/to/test.test.ts          # Single file (from app dir)
```

### FastAPI (run from `apps/api/fastapi`)

```bash
pnpm start                                                    # Start shared infra + FastAPI (from repo root)
docker compose exec api uv run pytest                        # Full test suite
docker compose exec api uv run pytest tests/auth/            # Single domain
docker compose exec api uv run pytest --cov=src --cov-report=term  # With coverage
docker compose exec api uv run alembic upgrade head          # Apply migrations
docker compose exec api uv run alembic revision --autogenerate -m "message"  # New migration
docker compose exec api python scripts/seed_data.py --reset  # Seed data
docker compose exec api uv run mypy src                      # Type-check
./scripts/lint.sh                                            # Ruff lint + format check
./scripts/format.sh                                          # Ruff fix + format
```

**Inside the agent dev container** there is no docker CLI and `grenmet-postgres`
is not reachable, so `docker compose exec api …` won't work. Run pytest directly
against the host-published DB/redis instead (the host stack from `pnpm start` must
be up):

```bash
cd apps/api/fastapi
uv sync                                                      # one-time: build the venv (needs network)
POSTGRES_SERVER=host.docker.internal \
  REDIS_URL=redis://host.docker.internal:6379/0 \
  uv run pytest
```

Regenerate `openapi.json` before running `pnpm generate:api-client`:

```bash
cd apps/api/fastapi
uv run python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"
```

### Build & Generate

```bash
pnpm build                  # Build all packages
pnpm generate:api-client    # Regenerate TS client from FastAPI OpenAPI
pnpm check:drift            # Verify API client is in sync with openapi.json
```

## Top 5 Conventions

1. Run `pnpm fix` then `pnpm type-check` before marking any task done — no exceptions.
2. Reference shared deps with `catalog:` in `package.json` — never hardcode a version for a dep in the catalog.
3. Import UI primitives from `@grenmet/ui/components/ui/<name>`, utils from `@grenmet/ui/lib/utils`.
4. Access env vars through the app's `src/env.ts` — never `process.env` directly.
5. Default to Server Components — only add `"use client"` when interactivity or browser hooks are required.

## Top 6 Anti-Patterns

1. Never manually edit `packages/api-client/src/gen/` — always regenerate via `pnpm generate:api-client`.
2. Never write to `.env.*` or `.env.local` files.
3. Never run `git commit`, `git push`, `gh pr merge`, or any deploy command.
4. Never touch a file not explicitly named in the request without stopping and asking first.
5. Never implement after analysis — stop and wait for explicit approval before writing code.
6. Never declare a task done after editing only the named file — grep every callsite of changed symbols and verify each affected layer first (see the Blast-Radius Gate in `CLAUDE.md`).

## Where to Look Next

| I need to understand…            | Read…                        |
|----------------------------------|------------------------------|
| Cross-cutting change impact      | Blast-Radius Gate in `CLAUDE.md` |
| Monorepo structure and auth flow | `docs/technical-overview.md` |
| Service architecture             | `docs/architecture.md`       |
| Auth package API                 | `packages/auth/README.md`    |
| Auth package rules (agent)       | `packages/auth/CLAUDE.md`    |
| UI package rules (agent)         | `packages/ui/CLAUDE.md`      |
| API contracts and public routes  | `docs/api/contracts.md`      |
| Environment variables            | `docs/env.md`                |
| Deployment                       | `docs/deployment.md`         |
| A specific app                   | `apps/web/<app>/CLAUDE.md`   |
| FastAPI conventions              | `apps/api/fastapi/CLAUDE.md` |
| Design system tokens             | `docs/design-system.md`      |
| Troubleshooting                  | `docs/troubleshooting.md`    |
