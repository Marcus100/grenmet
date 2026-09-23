# @barrelsgd/api-client — agent context

Kubb-generated TypeScript client for FastAPI. **`src/gen/` is generated and committed — never edit it** (a hook blocks writes).

## Pipeline
1. FastAPI change → regenerate `apps/api/fastapi/openapi.json` (command in root `AGENTS.md`).
2. `pnpm generate:api-client` runs `kubb.config.ts`: input `../../apps/api/fastapi/openapi.json` → `src/gen/{models,clients,hooks,zod}`.
3. `pnpm check:drift` must pass (CI fails on drift).

## Using it
- Types: `models/`; fetch functions: `clients/`; TanStack Query hooks: `hooks/`; Zod schemas: `zod/`. Import from `@barrelsgd/api-client`.
- Configure once per app with `configureApiClient({ baseURL, getHeaders })` (`src/configure.ts`); headers are resolved per request. gaa-admin does this in `src/lib/api.ts`.
- Server Components call the fetch clients directly. Hooks are for client-side mutations and polling.
- Operation IDs are stable and domain-prefixed (`capGetAlert`, `hrCreateLeaveRequest`). Renaming one is a breaking change for every consumer — grep before renaming.

Only `src/configure.ts`, `src/index.ts`, and `kubb.config.ts` are hand-written. Changing them is Ask First (shared package).
