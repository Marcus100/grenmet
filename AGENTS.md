# AGENTS.md

Canonical instructions for every coding agent in this monorepo (Codex, Claude
Code, and others). Do not create `CLAUDE.md` files; Claude Code reads
`AGENTS.md` natively when none exists.

**Project:** Barrels Grenada is the software company. Grenada Airports
Authority (GAA) is a client organisation; Grenada Meteorological Service (GMS)
is its meteorological department. Neither is a Barrels product. This
pnpm/Turborepo monorepo holds Next.js 16 / React 19 web apps, a FastAPI
(Python 3.14) modular-monolith API, shared packages, and GMS operational
tooling. Start with `docs/technical-overview.md`.

## Instruction map — read the nested file before editing its directory

| Path | Covers |
| --- | --- |
| `apps/api/fastapi/AGENTS.md` | FastAPI conventions, testing, OpenAPI contract |
| `apps/api/fastapi/src/<domain>/AGENTS.md` | Per-domain ownership, invariants, tests (auth, hr, cap, wxproducts, wxwatch, audit, notifications, subscriptions, contact, feedback, organisations, flights, storage, billing, worker, eregister, janitorial, transport, events, stores, baseline) |
| `apps/web/<app>/AGENTS.md` | admin, auth, cms, docs, elections, events, gaa-admin, gms, mbia, signal |
| `apps/web/barrels/AGENTS.md` | Static Barrels Grenada company homepage |
| `packages/<pkg>/AGENTS.md` | api-client, auth, email-templates, gms, theme, ui |
| `docs/playbooks/full-stack-feature.md` | End-to-end: model → migration → route → OpenAPI → client → UI → tests |

## Commands

```bash
pnpm install  # dependencies
pnpm start  # Docker services (Postgres, Redis, FastAPI, worker) — HOST ONLY
pnpm dev:web:<app>  # auth:3000 gaa-admin:3001 docs:3002 gms:3003 signal:3004 mbia:3005 cms:3006 elections:3007 events:3009 admin:3012 — HOST ONLY
pnpm verify:changed  # only the gates this diff needs (--dry-run to list)
pnpm fix:changed  # formats dirty files; in shared checkouts use `pnpm exec ultracite fix <owned-files>`
pnpm type-check  # TypeScript across all packages
pnpm e2e  # Playwright smoke tests (needs the app's dev server)
turbo run test --filter=@barrelsgd/<package>  # one package's tests
pnpm generate:api-client && pnpm check:drift  # regenerate the client; drift fails CI
pnpm guardrails:staged  # FastAPI contract pairing check on staged files
```

FastAPI (from `apps/api/fastapi`; host stack uses `docker compose exec api …`):

```bash
uv run --frozen --package fast-back pytest [tests/<domain>/]  # tests
uv run --frozen --package fast-back alembic [-c src/<domain>/alembic.ini] upgrade head  # migrations
./scripts/lint.sh  # Ruff + format check + mypy
PROJECT_NAME='Barrels Grenada' uv run --frozen --package fast-back python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"  # regen openapi.json
```

Inside the agent dev container there is no docker CLI and Compose hostnames don't
resolve: prefix tests with `POSTGRES_SERVER=host.docker.internal
REDIS_URL=redis://host.docker.internal:6379/0` (full list in
`apps/api/fastapi/AGENTS.md` → Testing).

## Always

- Work locally first: run formatting, types, affected tests and integration checks before pushing; CI is extra verification, not the first test run.
- Before calling a task done, run `pnpm fix:changed` and `pnpm type-check` (or `pnpm verify:changed`), then grep every importer and callsite of changed symbols and finish every affected layer. See the blast-radius table in `docs/agents/workflow.md`.
- Put backend logic in Python (FastAPI). The only TypeScript backend is the Payload CMS (`apps/web/cms`). Next.js route handlers may only validate, proxy to FastAPI, or render; never add database access, business rules, or delivery there.
- Failure budget: if the same check fails twice on the same error, stop editing. Report the raw output and your proposed fix, then wait for the user (routines: record it in the run record, mark the outcome `blocked` and stop).
- Before building, state the task contract: deliverable, constraints, non-goals and acceptance check. Skip it only for one-line fixes.
- Every new feature or significant logic change ships with tests in the same task; if there is no clear test target, say what you verified and its limits.
- Follow existing patterns. Before introducing a new pattern, library or abstraction, state the problem, why the existing approach falls short, and the tradeoffs.
- Treat GAA as the client and GMS as its meteorological department. Software is Barrels IP; client data, marks and `Owner: GAA/GMS` docs are GAA's. The repo is public: keep confidential client material in gitignored `/private/`.
- Before acting on a setup or diagnosis theory, confirm the environment with a cheap check (host vs devcontainer, which Docker daemon, which port or config file). Run `pnpm start` and `pnpm dev:web:*` on the host only.
- Lead with the answer or next step in plain language; keep responses short, and teach one concept at a time with a hands-on command. Apply user corrections immediately and record lasting rules in the relevant doc or `AGENTS.md`.

## Ask first

- Work outside the task or domain the user has authorized. The requested outcome is the scope: related source, tests, contracts, generated artifacts, docs and additive migrations are included; respect explicit file limits. Existing session authorization counts.
- Adding an npm package not in the `pnpm-workspace.yaml` catalog, or any Python dependency.
- Modifying `turbo.json`, `biome.jsonc`, or any `tsconfig*.json`.
- Destructive schema or data changes, breaking API changes, or widening public access or permissions.
- Cross-project architecture changes or business-policy decisions the repository and session do not resolve.

## Never

- Merge to `main`, publish releases, or deploy to production without explicit user authorization.
- Force-push, bypass hooks, or run destructive git commands (blocked by `.claude/hooks/block-dangerous-git.mjs`).
- Write `.env*` files or hand-edit `packages/api-client/src/gen/` (blocked by `.claude/hooks/protect-files.mjs`).
- Implement a review-only or planning-only request before the user authorizes implementation.
- Use Prettier or ESLint; Biome/Ultracite through `pnpm fix` is the only formatter and linter.

## Git, parallel agents and handoff

- **Attended sessions:** work in a worktree per task, merge into local `dev`, validate, then push `dev`. Standing authorization covers creating and merging the `dev → staging` PR once all its checks pass (`--match-head-commit`). **Unattended routines** push only their own branch and open a PR to `dev` (`docs/agents/routines.md`). Full rules: `docs/agents/workflow.md`.
- Never hand-merge `openapi.json` or `packages/api-client/src/gen/`; regenerate both.
- Read `SESSION_LOG.md` (main checkout root) before assuming a task is untouched; append one entry after meaningful work. Run the `file-friction` skill if you worked around anything. Tool switches: `docs/agents/tool-usage.md`.
- Use the `api-change` skill for FastAPI contract changes and `gaa-admin-change` before touching `apps/web/gaa-admin`. Check `.claude/skills/` (also `.agents/skills`) before improvising CI triage, pre-merge, release or diagnosis.
- Issues: GitHub Issues for `Marcus100/grenmet` via `gh`. Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (`docs/agents/triage-labels.md`). Domain language: root `CONTEXT.md` (created lazily by `/domain-modeling`) plus `docs/adr/` (`docs/agents/domain.md`).
- Claude Code: spawn sub-agents only when the user asks, and pass them the relevant nested `AGENTS.md` paths.

## Code conventions

Frontend (full style rules in `.agents/rules/ultracite.mdc`):
- No `any` (use `unknown` and narrow); no `forwardRef` (React 19 `ref` prop).
- No `process.env` in app code: use the app's typed env module (`src/env.ts` or `src/lib/env.ts`; except `next.config.*`, `instrumentation.ts`, `sentry.*.config.ts`).
- Server Components by default; React Query only for client-side mutations and polling.
- `catalog:` for shared deps; `@/` path alias; UI primitives from `@barrelsgd/ui/components/ui/<name>`, `cn` from `@barrelsgd/ui/lib/utils`.
- Types, fetch clients, hooks and Zod schemas come from `@barrelsgd/api-client`; never hand-write a FastAPI response type.
- Let unexpected errors throw to `error.tsx`/`global-error.tsx`. If you catch and show a fallback, call `reportError(error, "<area>")` from the app's `src/lib/report-error.ts`. Never import `@sentry/nextjs` in a shared package; never put user data in Sentry.

Backend (details in `apps/api/fastapi/AGENTS.md`):
- SQLAlchemy models in `models.py`, `src.models.BaseModel` schemas in `schemas.py`; never expose ORM models.
- Thin routers, logic in `service.py`, typed `AppException` subclasses; filter, join and paginate in SQL.
- `require_permission(current_user=…, permission_key=…)` with every key in `src/auth/permissions.py`.
- No sync network calls in `async def`; background work goes to the ARQ worker.
- geonetcast runs devcontainer-first; never `uv sync --package geonetcast` on the host.

Design: read the lane spec `docs/design/<lane>.md` before building UI; style only with `--gm-*` tokens, Tailwind aliases or shadcn semantics; new tokens need approval. Figma is not linked; never ask for a Figma URL. Details, CI/CD and telemetry rules: `docs/agents/extended-rules.md`.

## Where to Look

| I need to understand… | Read… |
| --- | --- |
| Portfolio, client programmes, repository ownership | `docs/portfolio/` |
| Monorepo structure, auth flow, codebase architecture | `docs/technical-overview.md` |
| Barrels product, AI/data platform, IP strategy | `docs/strategy/` |
| GMS service strategy (not codebase architecture) | `docs/architecture.md` |
| Architecture decisions | `docs/adr/README.md` |
| Building a feature end to end | `docs/playbooks/full-stack-feature.md` |
| Frontend development and testing | `docs/web/development.md` |
| FastAPI dev workflow and testing | `docs/api/development.md` |
| API contracts and public endpoints | `docs/api/contracts.md` |
| Auth package API | `packages/auth/README.md` |
| Environment variables | `docs/env.md` |
| Port allocation | `docs/ports.md` |
| Deployment | `docs/deployment.md` |
| Release promotion | `docs/operations/release-runbook.md` |
| Infrastructure, backups, incidents | `docs/infrastructure.md` |
| Security baseline | `docs/security.md` |
| Troubleshooting | `docs/troubleshooting.md` |
| Design system and workflow | `docs/design-system.md` |
| Data architecture and governance | `docs/data-architecture.md` |
| GMS programme / SOPs | `docs/internal/` |
| HR forms and new form modules | `docs/hr/adding-a-form-module.md` |
| HR forms, roster, attendance and timesheet alignment | `docs/hr/end-to-end-alignment.md` |
| Agent workflow, git, blast radius, hooks | `docs/agents/workflow.md` |
| Agent helpers, principles, routines, run records, benchmarks | `docs/agents/README.md` |
| Agent configuration (how this layout works) | `docs/agent-configuration-guide.md` |
| Vendored ops apps (SURFACE, wis2box) | `VENDORED.md` |
