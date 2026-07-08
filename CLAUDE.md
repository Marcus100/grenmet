# CLAUDE.md

Guidance for Claude Code in this monorepo.
For monorepo structure, auth flow, and deployment: see `docs/`.
For app-specific rules: see `apps/web/<app>/CLAUDE.md`.

## Behavioral Tiers

### Always (no confirmation needed)
- Run `pnpm fix` then `pnpm type-check` before marking any task done
- Before marking a task done, grep every importer/callsite of changed symbols and confirm the change is complete across all affected layers — see Blast-Radius Gate
- Follow existing patterns in the codebase before proposing new ones
- Include tests with every new feature or significant logic change
- Explain reasoning before proposing any new pattern, library, or abstraction

### Ask First (stop before proceeding)
- Touching any file not explicitly named in the request
- Adding any npm package not in `pnpm-workspace.yaml` catalog
- Creating new files in `packages/` (shared — affects all apps)
- Modifying `turbo.json`, `biome.jsonc`, or any `tsconfig*.json`
- Modifying any Drizzle schema file or creating a migration
- Adding or modifying FastAPI routes that are public or change the OpenAPI contract — update `docs/api/contracts.md` and regenerate the client
- Introducing a new pattern, abstraction, or design approach

### Never
- `git commit`, `git push`, `gh pr merge`, or any deploy command
- Write to `.env.*` or `.env.local` files
- Manually edit `packages/api-client/src/gen/` files
- Implement after analysis without explicit approval

## Behavioral Rules

### Scope Gate
Only touch files explicitly named in the request. If working on a task reveals
related changes needed in other files, finish the requested task first, then
describe the finding and ask before continuing.

### Blast-Radius Gate
A change is not done when the named file passes `pnpm fix` + `pnpm type-check`.
Before declaring done, grep for every consumer of the symbols you touched and
verify each affected layer. admin-gms is a cross-cutting surface — it hosts five
formerly-separate apps, so treat any change there as potentially affecting
cap/hr/wxwatch/wxproducts/salesbus, not one isolated app.

This gate finds impact; it does not override the Scope Gate. When the search
surfaces a file you were not asked to change, report it and ask — do not silently
edit it. Find and report, never silently expand scope.

| If you change…                  | Also verify…                                                                                    |
|---------------------------------|-------------------------------------------------------------------------------------------------|
| A FastAPI route or schema       | regen `openapi.json` → `pnpm generate:api-client` → `pnpm check:drift`; `docs/api/contracts.md` |
| Auth behavior (`packages/auth`) | all 5 apps + delegating apps (hurricaneplan, spicewx via `AUTH_API_URL`)                         |
| A Drizzle schema                | migration + `web-migrate` prod service + wxwatch & wxproducts DBs                                |
| A consolidated admin route      | the other folded modules in admin-gms (cap/hr/wxwatch/wxproducts/salesbus)                       |
| A `@grenmet/ui` primitive       | every app importing it (shared — already an Ask-First trigger)                                   |

### Reasoning Gate
Before introducing any new pattern, library, abstraction, or approach not already
present in the codebase: state (1) the problem it solves, (2) why the existing
approach is insufficient, (3) the tradeoffs. Wait for approval before implementing.

### Tests Alongside Features
Every new feature, component, server action, or significant logic change includes
tests as part of the task — not a follow-up. If a task has no clear test target,
flag it and ask.

### Correction Handling
When a correction is given mid-session, ask: "Should I add this to CLAUDE.md?"
before writing anything to project files or memory.

### CLAUDE.md Update Protocol
When adding to this file, follow this structure:
- **Behavioral rule** → add to the appropriate tier (Always / Ask First / Never) or create a named rule under Behavioral Rules
- **Code convention** → add a bullet to Code Conventions; lead with `**Name**` and state what to do and what not to do
- **CI/CD fact** → add to CI/CD Conventions
- **Lookup pointer** → add a row to the Where to Look table
- Keep each entry to one line or two where an example is essential. Do not add narrative prose — this file is machine-read first.

## Tool Usage

- When the user wants to inspect a file, return full file contents — do not spawn
  an Agent that returns summaries.
- Before investigating a CI or build failure, enumerate the top hypotheses with
  the fastest falsification command for each. Test cheapest first. Report after
  each one before continuing.
- When making multi-file changes, trace the full impact across types, config, and
  related files before starting.
- When spawning an Agent for a code change, include the Blast-Radius Gate in its
  brief — a sub-agent starts cold and will otherwise plan only on the files it opens.

## Code Conventions

- **No `any`** — use `unknown` and narrow. Biome enforces this.
- **No `forwardRef`** — React 19: pass `ref` as a prop directly. Biome enforces this.
- **No `process.env` in app code** — use the typed `env` object from the app's
  `src/env.ts`. Exception: `next.config.*`, `instrumentation.ts`,
  `drizzle.config.ts`, `sentry.*.config.ts`.
- **Server Components by default** — only add `"use client"` when you need
  interactivity or browser hooks.
- **No React Query for server-fetchable data** — fetch in Server Components directly.
- **`catalog:` for shared deps** — never hardcode versions for deps in the catalog.
- **Path aliases** — use `@/` (maps to `src/`) not relative `../../` imports.
- **`@grenmet/ui` for UI primitives** — import as `@grenmet/ui/components/ui/<name>`.
- **Generated files are committed** — never edit `packages/api-client/src/gen/`
  manually; always regenerate via `pnpm generate:api-client`.
- **geonetcast runs devcontainer-first** — its `gdal` pin tracks the devcontainer
  image's libgdal (Debian), not the host; never `uv sync` `geonetcast/` on the host.

## CI/CD Conventions

- Docker image names in GitHub workflows must be lowercase.
- Pin all GitHub Actions to SHAs, not tags.
- After modifying Biome config, verify both `assist` and `formatter` override keys
  are correct — Linux CI formatting can differ from macOS.
- `outputFileTracingRoot` in Next.js config must be at the top level, not inside
  `experimental`.
- `packages/api-client/src/gen/` must stay in sync with
  `apps/api/fastapi/openapi.json` — drift fails CI.

## Figma / Design

- Full Figma→code→verify→token-guard loop: `docs/design-workflow.md`. Token contract and governance: `docs/design-system.md`.
- Always load the `/figma-use` skill before calling `use_figma` — it is mandatory.
- Use `/figma-generate-design` to translate a page or layout into code; `/analyse-grenmet` to audit Figma structure/drift.
- Use `/ui-check` to implement or refine a component against its Figma node.
- Do not move pages between Figma files programmatically — instruct the user to do it in the Figma UI.
- Screenshot capture for visual diffing uses the Chrome MCP tool (not Playwright) when the dev server is running.
- Style only with `--gm-*` tokens / Tailwind aliases / shadcn semantics — never hardcode color/spacing/radius and never add design values to Tailwind config. Adding or changing a `--gm-*` token needs user approval, landed in Figma and `packages/ui/src/styles/globals.css` together.
- Token commands: `pnpm design-system:check` (gate), `:audit` / `:audit:full` (warning-only drift), `:contrast` (warning pairs), `:sync` (regenerate app blocks after editing the canonical block). Dark mode is supported (class-based `dark` variant + `.dark` token overrides); prefer semantic tokens over `dark:*` branches in shared primitives, and keep printable document "papers" light in both modes.

## Where to Look

| I need to understand…              | Read…                              |
|------------------------------------|------------------------------------|
| Monorepo structure and auth flow   | `docs/technical-overview.md`       |
| Service architecture               | `docs/architecture.md`             |
| Auth package API                   | `packages/auth/README.md`          |
| Auth package rules (agent)         | `packages/auth/CLAUDE.md`          |
| UI package rules (agent)           | `packages/ui/CLAUDE.md`            |
| API contracts and public endpoints | `docs/api/contracts.md`            |
| Environment variables              | `docs/env.md`                      |
| Port allocation (dev + container)  | `docs/ports.md`                    |
| Deployment                         | `docs/deployment.md`               |
| Infrastructure, backups, incidents | `docs/infrastructure.md`           |
| Security baseline                  | `docs/security.md`                 |
| Troubleshooting                    | `docs/troubleshooting.md`          |
| Design system tokens               | `docs/design-system.md`            |
| Design workflow (Figma→code→verify)| `docs/design-workflow.md`          |
| Data architecture and governance   | `docs/data-architecture.md`        |
| GMS programme and strategy         | `docs/internal/`                   |
| GMS operational procedures / SOPs  | `docs/operations/`                 |
| A specific web app                 | `apps/web/<app>/CLAUDE.md`         |
| HR forms → model field mapping     | `docs/hr/forms-inventory.md`       |
| Adding a new HR form module        | `docs/hr/adding-a-form-module.md`  |
| FastAPI conventions                | `apps/api/fastapi/CLAUDE.md`       |
| FastAPI dev workflow               | `docs/api/development.md`          |
| Vendored ops apps (SURFACE, wis2box) | `VENDORED.md`                    |
| Dev commands                       | `AGENTS.md`                        |

## Agent skills

### Issue tracker

Issues tracked in GitHub Issues for `Marcus100/grenmet` via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default kebab-case state labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (`wontfix` already exists; the other four are created on first use). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` (created lazily by `/domain-modeling`) plus the existing `docs/adr/`. See `docs/agents/domain.md`.
