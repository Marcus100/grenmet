# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Overview

pnpm v10 workspaces + Turbo v2. All tasks run through `turbo run <task>` from the root.

- `apps/web/*` — Next.js 16.1.1 apps (React 19, TypeScript strict)
- `apps/api/honoapi` — Hono Node.js API (`@grenmet/api-hono`) — currently a stub
- `apps/api/fastapi` — FastAPI backend (Docker only, Python — not in pnpm workspace)
- `packages/api-client` — Kubb-generated TypeScript client from FastAPI OpenAPI
- `packages/auth` — Shared auth (`@grenmet/auth`)
- `packages/ui` — Shared UI component library (`@grenmet/ui`) — shadcn-style primitives built on Base UI
- `packages/tsconfig` — Base tsconfig

### App directory → package name → port

| Directory | Package name | Port |
|---|---|---|
| `apps/web/admin-gms` | `@grenmet/web-admin` | 3001 |
| `apps/web/auth` | `@grenmet/web-auth` | 3000 |
| `apps/web/wxwatch` | `@grenmet/web-wxwatch` | 3002 |
| `apps/web/hurricaneplan` | `@grenmet/web-hurricaneplan` | 3003 |
| `apps/web/spicewx` | `@grenmet/web-spicewx` | 3004 |
| `apps/web/wxproducts` | `@grenmet/web-wxproducts` | 3005 |
| `apps/web/hr` | `@grenmet/web-hr` | 3006 |
| `apps/web/salesbus` | `@grenmet/web-salesbus` | 3007 |
| `apps/api/honoapi` | `@grenmet/api-hono` | — |

## Commands

### Development

```bash
# Start shared infrastructure (Postgres, tools) + FastAPI
pnpm start

# Stop all services
pnpm stop

# Dev all web apps in parallel
pnpm dev:web

# Dev a specific app
pnpm dev:web:admin       # admin-gms on :3001
pnpm dev:web:auth        # auth on :3000
pnpm dev:web:wxwatch     # wxwatch on :3002
pnpm dev:web:wxproducts  # wxproducts on :3005
pnpm dev:web:hurricane   # hurricaneplan on :3003
pnpm dev:web:spicewx     # spicewx on :3004
pnpm dev:web:hr          # hr on :3006
pnpm dev:web:salesbus    # salesbus on :3007
pnpm dev:honoapi         # Hono API
```

> Note: FastAPI and Postgres run in Docker via `pnpm start`. Web apps that call FastAPI need the Docker services running.

### Quality

```bash
pnpm check           # Biome check (lint + format check) across all packages
pnpm check:fix       # Auto-fix Biome issues
pnpm fix             # Run ultracite fix (equivalent to pnpm dlx ultracite fix)
pnpm type-check      # TypeScript type checking across all packages
pnpm lint            # Lint only
```

Run against a single package with Turbo filter (use the package name from the table above):

```bash
turbo run check --filter=@grenmet/web-admin
turbo run type-check --filter=@grenmet/web-wxproducts
```

**After making edits:** always run `pnpm fix` (auto-fix lint/format) then `pnpm type-check` (or the filtered variant) before finishing. Do not leave type errors or lint violations.

### Build & Generate

```bash
pnpm build                    # Build all packages
pnpm generate:api-client      # Regenerate TypeScript client from FastAPI OpenAPI schema
pnpm clean                    # git clean -xdf node_modules (destructive — removes all untracked files)
```

### Testing

```bash
# Run tests for a specific app (admin-gms has Vitest + Playwright)
turbo run test --filter=@grenmet/web-admin

# Run a single test file (from within the app directory)
pnpm vitest run src/path/to/test.test.ts
```

Only `admin-gms` currently has tests (Vitest unit + Playwright e2e). No other web apps have test suites.

### Database (wxwatch / wxproducts only)

```bash
# From within the app directory
pnpm db:generate    # Drizzle Kit generate migrations
pnpm db:migrate     # Apply migrations
```

### Docker infrastructure

```bash
pnpm reset    # Wipe Postgres volumes and restart fresh
pnpm status   # Show all container statuses
```

## Architecture

### Auth flow

`packages/auth` provides both client and server exports:

- `@grenmet/auth` — `SessionUserProvider`, `useSessionUser`, `signOut()`, `signOutEverywhere()` (client)
- `@grenmet/auth/server` — `authApiFetch()`, cookie helpers (`readSessionCookie`, `writeSessionCookie`, `clearSessionCookie`), session helpers (`createSession`, `exchangeSessionForAccessToken`, `refreshSession`, `logoutSession`), redirect helpers (`buildSharedSignInUrl`, `getSafeLocalReturnTo`)

The `web-auth` app (`:3000`) is the only app that handles sign-in/sign-up. All other apps delegate to it via redirects. Session cookies are shared across apps.

**Apps that delegate auth** (redirect to `web-auth` for login): `hr`, `hurricaneplan`, `spicewx`, `wxwatch`
**Apps that integrate auth deeply** (use `@grenmet/auth/server` directly): `admin-gms`, `wxwatch`

### Shared UI (`@grenmet/ui`)

All web apps import from `@grenmet/ui`. Import pattern:

```ts
import { Button } from "@grenmet/ui/components/ui/button"
```

Available components: accordion, alert, avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, popover, radio-group, select, separator, sheet, skeleton, switch, table, tabs, textarea, tooltip.

Utility: `import { cn } from "@grenmet/ui/lib/utils"` (tailwind-merge + clsx)

Built on `@base-ui-components/react`, `class-variance-authority`, `lucide-react`, `tailwind-merge`.

### API client generation

`packages/api-client` is generated by [Kubb](https://kubb.dev) from `apps/api/fastapi/openapi.json`. Generated files live in `src/gen/` and are committed. When FastAPI routes change:

1. Update `apps/api/fastapi/openapi.json`
2. Run `pnpm generate:api-client`
3. Commit the updated `src/gen/` files

The client exposes TypeScript types, React Query hooks, a Fetch client, and Zod schemas.

### FastAPI backend

Covers two domains:

- **Auth** (`/api/v1/auth/`, `/api/v1/login/`) — users, roles, permissions, sessions, password recovery
- **HR** (`/api/v1/hr/`) — timesheets, rosters, shifts, leave requests, shift swaps, employment profiles, workflows

The `web-hr` and `web-admin` apps consume HR endpoints via `@grenmet/api-client`. FastAPI uses PostgreSQL via SQLModel/asyncpg + Alembic migrations.

### Hono API

Currently a stub (`GET /` → "Hello Hono!"). Not used by any web app yet.

### Database schemas

**wxwatch** (`src/db/schema.ts`) — single table `weatherImages` for storing scraped weather image metadata (paths, checksums, timestamps, JSONB raw metadata, etc.)

**wxproducts** (`src/db/schema/`) — modular domain schema:
- Forecast products: `morning`, `midday`, `evening` (GMS daily forecasts)
- Aviation: `metarSpeci`, `taf`
- Surface obs: `synop`
- Other products: `marine`, `cap`, `bufr`, `ibf`
- Supporting types: `primitives`, `zod-primitives`, `iwxxm-primitives`, `elements`, `weather`, `product-metadata`, `suite-types`
- All exported from `src/db/schema/index.ts`

### Linting & formatting

Biome via [Ultracite](https://ultracite.dev) presets (`ultracite/biome/core`, `/react`, `/next`). Run `pnpm fix` or `pnpm check:fix` to auto-fix.

### Special app notes

- **hurricaneplan**: Uses `--webpack` (not turbopack) for both dev and build. Has MDX with custom remark/rehype pipeline, Shiki syntax highlighting, Algolia autocomplete, Zustand, framer-motion. Config: `next.config.mjs` (not `.ts`).
- **wxproducts**: Has Playwright PDF export (`pnpm pdf:morning`). Has its own Drizzle ORM + Postgres DB.
- **wxwatch**: Has its own Drizzle ORM + Postgres DB (separate from FastAPI's DB and wxproducts' DB).
- **admin-gms**: Heaviest app — FullCalendar, ApexCharts, TanStack Form/Query/Table/Virtual, react-dropzone, sonner, react-error-boundary. Has Vitest unit tests and Playwright e2e tests.
- **All web apps**: React Compiler enabled via `babel-plugin-react-compiler` in `next.config.ts` (or `next.config.mjs` for hurricaneplan).

### Environment variables

Each app has a `.env.example`. Access env vars via the typed `env.ts` file in each app using `@t3-oss/env-nextjs` — never access `process.env` directly.

**Auth-delegating apps** (`auth`, `hr`, `hurricaneplan`, `spicewx`):
```
AUTH_API_URL, AUTH_API_V1_STR, SESSION_COOKIE_NAME, AUTH_ALLOWED_RETURN_HOSTS
```

**wxwatch** (auth + own DB):
```
AUTH_APP_URL, AUTH_API_URL, AUTH_API_V1_STR, SESSION_COOKIE_NAME, SESSION_COOKIE_DOMAIN, DB_URL
```

**wxproducts** (own DB only):
```
DATABASE_URL
```

**admin-gms** (auth + FastAPI):
```
AUTH_APP_URL, AUTH_API_URL, AUTH_API_V1_STR, SESSION_COOKIE_NAME, NEXT_PUBLIC_API_URL, RESEND_API_KEY
```

**FastAPI** (Docker, via infra .env): `POSTGRES_*`, `SECRET_KEY`, `FIRST_SUPERUSER`, `RESEND_API_KEY`, `SENTRY_DSN`

### Dependency versions (pnpm catalog)

Canonical versions are pinned in `pnpm-workspace.yaml` under `catalog:`. Use `catalog:` references in `package.json` rather than hardcoding versions for shared deps (React, Next.js, TypeScript, Tailwind, TanStack, Drizzle, Zod, etc.).

## Code conventions

- **No `any`** — use `unknown` and narrow. Biome enforces this.
- **No `forwardRef`** — React 19: pass `ref` as a prop directly.
- **Server Components by default** — only add `"use client"` when you need interactivity or browser hooks.
- **Async data fetching in Server Components** — do not use React Query for data that can be fetched server-side.
- **`catalog:` for shared deps** — never hardcode versions for deps that exist in the catalog.
- **Path aliases** — use `@/` (maps to `src/`) rather than relative `../../` for cross-directory imports.
- **Env vars via `@t3-oss/env-nextjs`** — use the typed `env` object from the app's `env.ts`, not `process.env`.
- **`@grenmet/ui` for UI primitives** — prefer shared components over reimplementing. Import as `@grenmet/ui/components/ui/<name>`.
- **Generated files are committed** — `packages/api-client/src/gen/` is checked in. Never edit manually; always regenerate via `pnpm generate:api-client`.
