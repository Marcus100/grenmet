# AGENTS.md

Canonical instructions for every coding agent in this monorepo (Codex, Claude
Code, and others). `AGENTS.md` files are the default instruction files for all
agents; do not create or maintain `CLAUDE.md` files.

**Project in one paragraph:** Barrels Grenada is the software company. Grenada
Airports Authority (GAA) is a client organisation; Grenada Meteorological
Service (GMS) is its meteorological department. Neither is a Barrels product.
This pnpm/Turborepo monorepo holds Next.js 16 / React 19 web apps, a FastAPI
(Python 3.14) modular-monolith API, shared packages, and GMS operational
tooling. Start with `docs/technical-overview.md`.

## Instruction map — read the nested file before editing its directory

Codex only loads `AGENTS.md` files from the repo root down to its start
directory, and Claude only loads nested files when it reads inside that
directory. **Before editing under a path below, open its `AGENTS.md`.**

| Path | Covers |
| --- | --- |
| `apps/api/fastapi/AGENTS.md` | FastAPI conventions, testing, OpenAPI contract |
| `apps/api/fastapi/src/<domain>/AGENTS.md` | Per-domain ownership, invariants, tests (auth, hr, cap, wxproducts, wxwatch, audit, notifications, storage, billing, worker, eregister, janitorial, transport, baseline) |
| `apps/web/<app>/AGENTS.md` | auth, cms, docs, events, gaa-admin, gms, mbia, signal |
| `packages/<pkg>/AGENTS.md` | api-client, auth, email-templates, gms, theme, ui |
| `docs/playbooks/full-stack-feature.md` | End-to-end: model → migration → route → OpenAPI → client → UI → tests |

## Commands

```bash
pnpm install                 # dependencies
pnpm start                   # Docker services (Postgres, Redis, FastAPI, worker) — HOST ONLY
pnpm dev:web:<app>           # auth:3000 gaa-admin:3001 docs:3002 gms:3003 signal:3004 mbia:3005 cms:3006 events:3009 — HOST ONLY
pnpm fix:changed             # Biome/Ultracite fix on this session's changed files
pnpm type-check              # TypeScript across all packages
pnpm fix                     # repo-wide fix — only when deliberate (e.g. dependency bump)
turbo run test --filter=@barrelsgd/<package>   # one package's tests
pnpm vitest run src/path/to/file.test.ts       # one test file (from the app dir)
pnpm generate:api-client     # Kubb client from apps/api/fastapi/openapi.json
pnpm check:drift             # client/openapi drift (fails CI)
pnpm guardrails:staged       # FastAPI contract pairing check on staged files
pnpm docs:check-links && pnpm docs:check-portfolio && pnpm test:docs   # docs gates
pnpm design-system:check     # token gate
```

FastAPI (from `apps/api/fastapi`; host stack uses `docker compose exec api …`):

```bash
uv run --frozen --package fast-back pytest [tests/<domain>/]            # tests
uv run --frozen --package fast-back alembic upgrade head                # main DB migrations
uv run --frozen --package fast-back alembic -c src/<domain>/alembic.ini upgrade head  # separate-DB domains
./scripts/lint.sh     # Ruff + format check + mypy
./scripts/format.sh   # Ruff fix + format
uv run --frozen --package fast-back python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"  # regen openapi.json
```

**Inside the agent dev container** there is no docker CLI and Compose hostnames
(`db`, `grenmet-postgres`) don't resolve. Point tests at the host stack:
`POSTGRES_SERVER=host.docker.internal REDIS_URL=redis://host.docker.internal:6379/0 uv run --frozen --package fast-back pytest`
(full variable list in `apps/api/fastapi/AGENTS.md` → Testing).

## Behavioral Tiers

### Always (no confirmation needed)
- Run `pnpm fix:changed` then `pnpm type-check` before marking any task done.
  Repo-wide `pnpm fix` reformats unrelated in-progress files and can bust
  turbo's cache, surfacing pre-existing issues as if new
- Treat GAA as the client organisation and GMS as its meteorological department; never describe either as a Barrels product
- Put backend logic in Python (FastAPI). The only TypeScript backend is the Payload CMS (`apps/web/cms`). Next.js route handlers may only validate, proxy to FastAPI, or render (e.g. email HTML); never add database access, business rules, or delivery there
- Use Biome/Ultracite through `pnpm fix` for linting and formatting; never invoke Prettier or ESLint
- Before marking a task done, grep every importer/callsite of changed symbols and confirm the change is complete across all affected layers — see Blast-Radius Gate
- Follow existing patterns in the codebase before proposing new ones
- Include tests with every new feature or significant logic change
- Explain reasoning before proposing any new pattern, library, or abstraction

### Ask First (stop before proceeding)
- Touching any file not explicitly named in the request
- Adding any npm package not in `pnpm-workspace.yaml` catalog, or any Python dependency
- Creating new files in `packages/` (shared — affects all apps)
- Modifying `turbo.json`, `biome.jsonc`, or any `tsconfig*.json`
- Modifying any SQLAlchemy model schema or creating an Alembic migration
- Adding or modifying FastAPI routes that are public or change the OpenAPI contract — update `docs/api/contracts.md` and regenerate the client
- Introducing a new pattern, abstraction, or design approach

### Never
- `git commit`, `git push`, `gh pr merge`, or any deploy command — mechanically
  blocked by a `PreToolUse` hook (`.claude/hooks/block-dangerous-git.mjs`,
  wired for Codex in `.codex/config.toml`)
- Write to `.env.*` or `.env.local` files — blocked by `.claude/hooks/protect-files.mjs`
- Manually edit `packages/api-client/src/gen/` — blocked by the same hook
- Implement after analysis without explicit approval

## Behavioral Rules

### Scope Gate
Only touch files explicitly named in the request. If the task reveals related
changes needed elsewhere, finish the requested task, then describe the finding
and ask before continuing.

### Host/Container Boundary
Run `pnpm start` and `pnpm dev:web:*` on the host, never inside the
devcontainer; use the devcontainer for editing, agents, linting,
type-checking, and tests.

### Parallel Agents
Several agents often run at once: give each its own git worktree and branch
(Claude: `claude --worktree <topic>`, which creates `.claude/worktrees/<topic>`
from the current `dev` HEAD; Codex: its worktree mode). Run `pnpm install` in a
new worktree. Commit in the worktree, then land on `dev` with
`git fetch && git rebase origin/dev`, `pnpm fix:changed`, `git push origin HEAD:dev`;
if the push is rejected, rebase and retry — never force-push. Never hand-merge
`openapi.json` or `packages/api-client/src/gen/`: take either side, regenerate
(openapi command above → `pnpm generate:api-client` → `pnpm check:drift`).
Dev servers stay on the host in the main checkout.

### Communication
Lead with the answer or the next step in plain language; keep responses short
and offer deeper detail only when asked. When teaching, go one concept at a
time with a hands-on command — never a comprehensive architecture dump.

### Verify Environment Before Theorizing
Before acting on any setup/diagnosis theory, confirm the environment with a
cheap check (host vs devcontainer, which Docker daemon, which port/config
file) and state the assumption being tested. Never bundle a speculative
environment change with a fix.

### Blast-Radius Gate
A change is not done when the named file passes `pnpm fix` + `pnpm type-check`.
Run `pnpm guardrails:staged` (FastAPI route/schema changes must be paired with
`openapi.json`; same check CI runs), then grep for every remaining consumer of
the symbols you touched and verify each affected layer — the script covers one
case, not the general one. Use the `api-change` skill for FastAPI contract
changes and the `gaa-admin-change` skill before touching `apps/web/gaa-admin`
(five formerly separate apps: cap/hr/wxwatch/wxproducts/salesbus).

This gate finds impact; it does not override the Scope Gate. Report files you
were not asked to change and ask — never silently expand scope.

| If you change… | Also verify… |
| --- | --- |
| A FastAPI route or schema | regen `openapi.json` → `pnpm generate:api-client` → `pnpm check:drift`; `docs/api/contracts.md`; every web consumer of the generated hook/type |
| A SQLAlchemy model | Alembic revision for the right database (main or `src/<domain>/alembic.ini`); seeds; `openapi.json` if it surfaces in a schema |
| A permission key | `src/auth/permissions.py` catalogue (enforced by `tests/auth/test_permission_registry.py`); UI gating in gaa-admin |
| Auth behavior (`packages/auth`) | all apps using it + delegating apps (docs, gms via `AUTH_API_URL`) |
| A domain baseline (`src/<domain>/migrations/drizzle-history.json`) | never edit it — it verifies adopted production history; new schema work is a new Alembic revision |
| A consolidated admin route | the other folded modules in gaa-admin |
| A `@barrelsgd/ui` primitive | every app importing it |

### Reasoning Gate
Before introducing any new pattern, library, abstraction, or approach: state
(1) the problem it solves, (2) why the existing approach is insufficient,
(3) the tradeoffs. Wait for approval before implementing.

### Tests Alongside Features
Every new feature, component, server action, or significant logic change
includes tests in the same task. If there is no clear test target, flag it and ask.

### Correction Handling
When corrected mid-session, ask "Should I add this to AGENTS.md?" before writing
anything to project files or memory.

### AGENTS.md Update Protocol
- **Behavioral rule** → the right tier, or a named rule under Behavioral Rules
- **Code convention** → Code Conventions; lead with `**Name**`, say what to do and not do
- **CI/CD fact** → CI/CD Conventions
- **Lookup pointer** → Where to Look
- **Directory-specific rule** → that directory's `AGENTS.md` and add it to the Instruction map
- One or two lines per entry; no narrative prose. Keep this file under 20 KB — Codex concatenates root + nested files against a byte budget.

### Session Handoff
Claude Code and Codex share one working tree. A `SessionStart` hook tails
`SESSION_LOG.md` (main checkout root, gitignored; shared by every worktree) into context — read it before
assuming a task is untouched. After a meaningful chunk of work, append one
entry: timestamp, tool, one-line summary, files touched, next step. Newest at
the bottom. Don't log trivial single-file tweaks.

## Tool Usage

- When the user wants to inspect a file, return full contents — not a summary.
- Before investigating a CI or build failure, list the top hypotheses with the
  fastest falsification command for each; test cheapest first and report after each.
- For multi-file changes, trace impact across types, config, and related files first.
- When delegating to a sub-agent, include the Blast-Radius Gate and the relevant
  nested `AGENTS.md` paths in its brief — it starts cold.

## Playbooks and hooks

- Reusable playbooks: `.claude/skills/*/SKILL.md` and `.claude/commands/*.md`
  (plain markdown, usable by any agent). `.agents/skills` is a symlink to
  `.claude/skills`; edit the canonical `.claude/skills`. Check for a playbook
  before improvising CI triage, pre-merge, release, API changes, or diagnosis.
- Hooks: scripts in `.claude/hooks/`, wired in `.claude/settings.json` (Claude)
  and `.codex/config.toml` (Codex). Edit scripts once; both tools pick them up.
  `scripts/guardrails/*.test.mjs` self-checks the wiring and this instruction layout.

## Code Conventions

Frontend (TypeScript/React) — full style rules in `.agents/rules/ultracite.mdc` (Ultracite/Biome):
- **No `any`** — use `unknown` and narrow. Biome enforces this.
- **No `forwardRef`** — React 19: pass `ref` as a prop.
- **No `process.env` in app code** — use the app's typed `src/env.ts`. Exceptions: `next.config.*`, `instrumentation.ts`, `sentry.*.config.ts`.
- **Server Components by default** — `"use client"` only for interactivity or browser hooks.
- **No React Query for server-fetchable data** — fetch in Server Components; React Query is for client-side mutations/polling (gaa-admin).
- **`catalog:` for shared deps** — never hardcode a version for a catalogued dep.
- **Path aliases** — `@/` (maps to `src/`), not deep relative imports.
- **UI primitives** — `@barrelsgd/ui/components/ui/<name>`; utils from `@barrelsgd/ui/lib/utils`.
- **Class composition** — use `cn` from `@barrelsgd/ui/lib/utils` for conditional utilities and caller `className`; keep custom `text-*` size/color pairs intact when `cn` would merge them.
- **Generated client** — types, fetch clients, hooks, and Zod schemas come from `@barrelsgd/api-client`; never hand-write a FastAPI response type.
- **Sentry everywhere** — let unexpected errors throw to the app's `error.tsx` / `global-error.tsx` (both report to Sentry). If you catch an error and show a fallback instead, call `reportError(error, "<area>")` from the app's `src/lib/report-error.ts` (it skips expected 4xx via the shared `shouldReportError` rule). Never import `@sentry/nextjs` in a shared package — it would resolve an uninitialised copy of the SDK. Only `area` and `digest` tags survive the privacy scrubber; never put user data in Sentry.

Backend (Python/FastAPI) — details in `apps/api/fastapi/AGENTS.md`:
- **Two layers** — SQLAlchemy models in `models.py`, `src.models.BaseModel` schemas in `schemas.py`; never expose ORM models.
- **Thin routers** — logic in `service.py`; `Annotated` dependency aliases; typed `AppException` subclasses.
- **SQL first** — filter/join/paginate in SQL; Pydantic at the HTTP seam only.
- **Permissions** — `require_permission(current_user=…, permission_key=…)`; every key in `src/auth/permissions.py`.
- **Async I/O** — no sync network calls in `async def`; background work goes to the ARQ worker.

Other:
- **geonetcast runs devcontainer-first** — its `gdal` pin tracks the devcontainer's libgdal; never `uv sync --package geonetcast` on the host.

### Claude Code

- Claude Code v2.1.277+ loads `AGENTS.md` natively in its default Project instructions mode when no `CLAUDE.md` or `CLAUDE.local.md` exists in the working directory or an ancestor.
- Invoke repo playbooks with the Skill tool or `/<name>` (for example `/api-change`, `/gaa-admin-change`, `/pre-merge`, `/ci-triage`, `/release`, `/commit`, `/ui-check`, `/design-critique`, `/tdd`, `/diagnosing-bugs`, and `/stack-doctor`).
- Only spawn sub-agents when the user asks; when doing so, pass the Blast-Radius Gate and relevant nested `AGENTS.md` paths.
- Claude hooks live in `.claude/settings.json`; `format-changed-file.mjs` formats each edited file automatically.

## CI/CD Conventions

- Docker image names in GitHub workflows must be lowercase.
- Pin all GitHub Actions to SHAs, not tags.
- After modifying Biome config, verify both `assist` and `formatter` override keys — Linux CI formatting can differ from macOS.
- `outputFileTracingRoot` in Next.js config must be top-level, not inside `experimental`.
- `packages/api-client/src/gen/` must stay in sync with `apps/api/fastapi/openapi.json` — drift fails CI.

## Design

- Loop: `docs/design-workflow.md`. Token contract: `docs/design-system.md`. Before building UI, read the lane spec `docs/design/<gms|gaa-admin|mbia|signal>.md` (DESIGN.md format; drift-tested by `pnpm test:docs`).
- **Figma is not linked to this repo.** Ignore Figma tools and node URLs; design intent arrives via Claude Design or a supplied screenshot. Never ask for a Figma frame URL.
- Style only with `--gm-*` tokens / Tailwind aliases / shadcn semantics — never hardcode color/spacing/radius or add design values to Tailwind config. New or changed `--gm-*` tokens need approval and land in `packages/gms/src/styles/foundation.css`, **not** `packages/ui`. Run `pnpm design-system:sync` after editing the canonical block in `packages/ui/src/styles/globals.css`.
- Brand: navy `#0b132b`, blue `#2878f5`, sky `#37a3ef`, lime `#b9ee63`. Kit hues fail AA as small text — use `--gm-*-ink` for text under 24px regular / 18.66px bold, icons under ~24px, and fills behind small white text.
- Logo: `@barrelsgd/gms/components/logo`; never hardcode a path or set `width`/`height` (use `className`). Retired: `--gm-sun`, the orange wordmark.
- Token commands: `pnpm design-system:check` (gate), `:audit` / `:audit:full`, `:contrast`, `:sync`. Dark mode is class-based; prefer semantic tokens over `dark:*` in shared primitives; printable "papers" stay light.

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
| Agent configuration (how this layout works) | `docs/agent-configuration-guide.md` |
| Vendored ops apps (SURFACE, wis2box) | `VENDORED.md` |

## Issue tracking and domain docs

- Issues: GitHub Issues for `Marcus100/grenmet` via `gh`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain language: root `CONTEXT.md` (created lazily by `/domain-modeling`) plus `docs/adr/`. See `docs/agents/domain.md`.
