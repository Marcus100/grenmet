# CLAUDE.md

Guidance for Claude Code in this monorepo.
For monorepo structure, auth flow, and deployment: see `docs/`.
For app-specific rules: see `apps/web/<app>/CLAUDE.md`.

## Behavioral Tiers

### Always (no confirmation needed)
- Run `pnpm fix` then `pnpm type-check` before marking any task done
- Follow existing patterns in the codebase before proposing new ones
- Include tests with every new feature or significant logic change
- Explain reasoning before proposing any new pattern, library, or abstraction

### Ask First (stop before proceeding)
- Touching any file not explicitly named in the request
- Adding any npm package not in `pnpm-workspace.yaml` catalog
- Creating new files in `packages/` (shared — affects all apps)
- Modifying `turbo.json`, `biome.jsonc`, or any `tsconfig*.json`
- Modifying any Drizzle schema file or creating a migration
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

## Tool Usage

- When the user wants to inspect a file, return full file contents — do not spawn
  an Agent that returns summaries.
- Before investigating a CI or build failure, enumerate the top hypotheses with
  the fastest falsification command for each. Test cheapest first. Report after
  each one before continuing.
- When making multi-file changes, trace the full impact across types, config, and
  related files before starting.

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

- Always load the `/figma-use` skill before calling `use_figma` — it is mandatory.
- Use `/figma-generate-design` for translating a page or layout into Figma.
- Do not move pages between Figma files programmatically — instruct the user to
  do it in the Figma UI.
- Screenshot capture for visual diffing uses the Chrome MCP tool (not Playwright)
  when the dev server is running.

## Where to Look

| I need to understand…            | Read…                        |
|----------------------------------|------------------------------|
| Monorepo structure and auth flow | `docs/technical-overview.md` |
| Service architecture             | `docs/architecture.md`       |
| Auth package API                 | `packages/auth/README.md`    |
| Environment variables            | `docs/env.md`                |
| Deployment                       | `docs/deployment.md`         |
| Troubleshooting                  | `docs/troubleshooting.md`    |
| Design system tokens             | `docs/design-system.md`      |
| A specific app                   | `apps/web/<app>/CLAUDE.md`   |
| Dev commands                     | `AGENTS.md`                  |
