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
docker compose exec api uv run --frozen --package fast-back pytest                        # Full test suite
docker compose exec api uv run --frozen --package fast-back pytest tests/auth/            # Single domain
docker compose exec api uv run --frozen --package fast-back pytest --cov=src --cov-report=term  # With coverage
docker compose exec api uv run --frozen --package fast-back alembic upgrade head          # Apply migrations
docker compose exec api uv run --frozen --package fast-back alembic revision --autogenerate -m "message"  # New migration
docker compose exec api python scripts/seed_data.py --reset  # Seed data
docker compose exec api uv run --frozen --package fast-back mypy src                      # Type-check
./scripts/lint.sh                                            # Ruff lint + format check
./scripts/format.sh                                          # Ruff fix + format
```

**Inside the agent dev container** there is no docker CLI and `grenmet-postgres`
is not reachable, so `docker compose exec api …` won't work. Run pytest directly
against the host-published DB/redis instead (the host stack from `pnpm start` must
be up):

```bash
cd apps/api/fastapi
uv sync --frozen --package fast-back                         # one-time: build the shared venv (needs network)
POSTGRES_SERVER=host.docker.internal \
  REDIS_URL=redis://host.docker.internal:6379/0 \
  uv run --frozen --package fast-back pytest
```

Regenerate `openapi.json` before running `pnpm generate:api-client`:

```bash
cd apps/api/fastapi
uv run --frozen --package fast-back python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"
```

### Build & Generate

```bash
pnpm build                  # Build all packages
pnpm generate:api-client    # Regenerate TS client from FastAPI OpenAPI
pnpm check:drift            # Verify API client is in sync with openapi.json
```

## Top 6 Conventions

1. Run `pnpm fix` then `pnpm type-check` before marking any task done — no exceptions.
2. Use Biome/Ultracite through `pnpm fix` for linting and formatting — never invoke Prettier.
3. Reference shared deps with `catalog:` in `package.json` — never hardcode a version for a dep in the catalog.
4. Import UI primitives from `@grenmet/ui/components/ui/<name>`, utils from `@grenmet/ui/lib/utils`.
5. Access env vars through the app's `src/env.ts` — never `process.env` directly.
6. Default to Server Components — only add `"use client"` when interactivity or browser hooks are required.

## Top 6 Anti-Patterns

1. Never manually edit `packages/api-client/src/gen/` — always regenerate via `pnpm generate:api-client`.
2. Never write to `.env.*` or `.env.local` files.
3. Never run `git commit`, `git push`, `gh pr merge`, or any deploy command.
4. Never touch a file not explicitly named in the request without stopping and asking first.
5. Never implement after analysis — stop and wait for explicit approval before writing code.
6. Never declare a task done after editing only the named file — grep every callsite of changed symbols and verify each affected layer first (see the Blast-Radius Gate in `CLAUDE.md`).

## Playbooks

Reusable step-by-step playbooks live in `.claude/skills/*/SKILL.md` and
`.claude/commands/*.md` — plain markdown, not Claude-specific. Before improvising
a multi-step workflow (CI triage, pre-merge checks, release promotion, environment
diagnosis, teaching), check whether a playbook already covers it and follow it.

## Communication & Diagnosis

1. Lead with the answer or next step in plain language; keep responses short and offer deeper technical detail only when asked. Teach one concept at a time with a hands-on command.
2. Before acting on any setup/diagnosis theory, confirm the environment with a cheap check (host vs devcontainer, which Docker daemon, which port) and state the assumption being tested. Never bundle a speculative environment change with a fix.

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
| Release promotion runbook        | `docs/operations/release-runbook.md` |
| A specific app                   | `apps/web/<app>/CLAUDE.md`   |
| FastAPI conventions              | `apps/api/fastapi/CLAUDE.md` |
| Design system tokens             | `docs/design-system.md`      |
| Troubleshooting                  | `docs/troubleshooting.md`    |
