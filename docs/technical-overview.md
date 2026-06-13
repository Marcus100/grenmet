# Technical Overview

This document explains how the Grenmet codebase fits together — the relationships between apps, how shared packages are used, how auth works end-to-end, and the key design decisions a developer needs to understand before working on the project.

For the GMS service strategy and product catalogue, see [GMS Digital Service Architecture](./architecture.md). For commands and setup, see the [root README](../README.md).

---

## Monorepo structure

For the directory layout, see [Workspace Layout in the root README](../README.md#workspace-layout).

**Build system:** pnpm v10 workspaces + Turborepo v2. All tasks run via `turbo run <task>` from the root. Turbo handles caching and parallelism — run `pnpm build` or `pnpm check` at the root and Turbo figures out the order.

**Package references:** Shared dep versions are pinned in `pnpm-workspace.yaml` under `catalog:`. Apps reference them with `"react": "catalog:"` — never hardcode a version for a dep that exists in the catalog.

---

## The 8 web apps at a glance

| App | Package | Port | Auth model | Database |
|---|---|---|---|---|
| `auth` | `@grenmet/web-auth` | 3000 | Owns sign-in/sign-up | — |
| `admin-gms` | `@grenmet/web-admin` | 3001 | Deep integration | — (uses FastAPI DB via API) |
| `wxwatch` | `@grenmet/web-wxwatch` | 3002 | Delegates to auth | Own Drizzle DB |
| `hurricaneplan` | `@grenmet/web-hurricaneplan` | 3003 | Delegates to auth | — |
| `spicewx` | `@grenmet/web-spicewx` | 3004 | Delegates to auth | — |
| `wxproducts` | `@grenmet/web-wxproducts` | 3005 | None | Own Drizzle DB |
| `hr` | `@grenmet/web-hr` | 3006 | Delegates to auth | — (uses FastAPI DB via API) |
| `salesbus` | `@grenmet/web-salesbus` | 3007 | Not yet wired | — |

**Auth model** determines how a user gets authenticated. See the [Auth section](#auth-architecture) below.

---

## Auth architecture

Authentication is centralised in the `web-auth` app (`:3000`). All other apps either delegate to it or integrate with it directly.

### Two auth models

**Delegation (most apps)**

Apps that delegate (wxwatch, hr, hurricaneplan, spicewx) redirect unauthenticated users to `web-auth` for sign-in. After sign-in, `web-auth` redirects back with a shared session cookie.

```
User visits wxwatch (unauthenticated)
  → redirected to auth.example.com?app=wxwatch&returnTo=https://wxwatch.example.com/dashboard
  → user signs in on web-auth
  → web-auth sets session cookie, redirects back to wxwatch
  → wxwatch reads the session cookie to identify the user
```

These apps use `buildSharedSignInUrl()` from `@grenmet/auth/server` to construct the redirect.

**Deep integration (admin-gms)**

`admin-gms` uses `@grenmet/auth/server` directly to manage sessions — it reads cookies, calls FastAPI auth endpoints, and proxies API requests with access tokens. It does not redirect to `web-auth` for sign-in; it handles sign-in within its own route group.

### The session cookie

The session cookie (`grenmet_session` by default) is an **httpOnly, SameSite=Lax** cookie. It contains an opaque session token, not a JWT. Each request that needs user identity must exchange this token for a short-lived access token by calling `exchangeSessionForAccessToken()`.

```
Request arrives with session cookie
  → app calls exchangeSessionForAccessToken(config, sessionToken)
  → FastAPI validates the session and returns an access token + user object
  → app uses the access token for subsequent FastAPI API calls
```

The cookie is set by `web-auth` on successful sign-in via `writeSessionCookie()`. Apps that integrate auth deeply can also write it (as `admin-gms` does).

### Using auth in a new page (Server Component)

The pattern is: read session cookie → exchange for access token → render.

```ts
const sessionToken = await readSessionCookie(authConfig);
if (!sessionToken) redirect(buildSharedSignInUrl(authConfig, { origin: "..." }));

const { user } = await exchangeSessionForAccessToken(authConfig, sessionToken);
```

For the full API — `AuthConfig`, all cookie/session helpers, redirect helpers, and types — see [`packages/auth/README.md`](../packages/auth/README.md).

---

## Shared packages

### `@grenmet/auth`

Session management and auth helpers shared across all apps.

- **Client export** (`@grenmet/auth`): `SessionUserProvider`, `useSessionUser`, `signOut()`, `signOutEverywhere()`
- **Server export** (`@grenmet/auth/server`): `authApiFetch`, cookie helpers, session helpers, redirect helpers

See [`packages/auth/README.md`](../packages/auth/README.md).

### `@grenmet/ui`

Shared UI component library. All web apps import from this package.

```ts
import { Button } from "@grenmet/ui/components/ui/button";
import { cn } from "@grenmet/ui/lib/utils";
```

Built on Base UI primitives with shadcn-style component patterns and GrenMet v1 design tokens. See [`packages/ui/README.md`](../packages/ui/README.md).

### `@grenmet/api-client`

Kubb-generated TypeScript client from the FastAPI OpenAPI schema. Provides:
- TypeScript types for all API entities
- React Query hooks for all endpoints
- A typed Fetch client
- Zod schemas for validation

**Never edit files in `packages/api-client/src/gen/` directly.** When FastAPI routes change, regenerate the client and commit both `openapi.json` and the updated `src/gen/` files together. See [CONTRIBUTING.md — Generated files](../CONTRIBUTING.md#generated-files) for the exact steps.

### `@grenmet/tsconfig`

Two presets: `tsconfig.json` (base, for packages/API) and `tsconfig.nextjs.json` (for Next.js apps). Apps extend the appropriate preset and add only app-specific overrides.

---

## Database architecture

There are **three separate PostgreSQL databases**. They share the same Postgres server but are completely isolated from each other.

| Database | Managed by | Used by | ORM |
|---|---|---|---|
| FastAPI DB (`app_db`) | FastAPI / Alembic | `admin-gms`, `hr`, CAP management and public CAP feeds (via API) | SQLModel + asyncpg |
| wxwatch DB | Drizzle Kit | `wxwatch`, scrapy-wxwatch pipeline | Drizzle ORM |
| wxproducts DB | Drizzle Kit | `wxproducts` | Drizzle ORM |

**Why separate?** Domain isolation — forecast products, weather images, and HR/auth data have nothing in common. Each app owns its schema entirely and can evolve it independently.

The `infra/docker/docker-compose.yml` provisions all three databases (and their users) on startup via init scripts.

### Drizzle workflow (wxwatch / wxproducts)

After every schema change: run `pnpm db:generate` to create a migration file, then `pnpm db:migrate` to apply it. Never skip `db:generate` — the migration file must be committed with the schema change. See [CONTRIBUTING.md — Database](../CONTRIBUTING.md#database-wxproducts--wxwatch) for the rule on committing migrations.

---

## React Compiler

All web apps have React Compiler enabled via `babel-plugin-react-compiler` in their Next.js config. This means:

- **Don't wrap things in `useMemo`/`useCallback` for performance** — the compiler handles it
- **Do ensure your components follow the Rules of Hooks** — the compiler enforces them more strictly

---

## Request flow: authenticated page in a delegating app

Here is what happens end-to-end when a user loads a protected page in `wxwatch`:

```
1. Browser requests https://wxwatch.example.com/archive

2. Next.js server receives the request
   → reads session cookie from request headers
   → no cookie present → calls buildSharedSignInUrl()
   → returns redirect to https://auth.example.com?app=wxwatch&returnTo=...

3. Browser follows redirect to auth app
   → user enters email + password
   → web-auth calls createSession() → FastAPI creates a session record
   → web-auth calls writeSessionCookie() → sets cookie on response
   → web-auth redirects browser back to returnTo URL

4. Browser requests wxwatch /archive again (now with cookie)

5. Next.js server reads the session cookie
   → calls exchangeSessionForAccessToken() → FastAPI validates session
   → returns { user, access_token, session }
   → page renders with user data

6. If the page needs FastAPI data:
   → calls authApiFetch() with the access token in Authorization header
   → FastAPI returns the data
```

---

## Environment variables

Every app has a `.env.local.example`. Copy it to `.env.local` and fill in the values before running the app. Never commit `.env.local`.

All env vars are accessed through a typed `env` object in `src/env.ts` (using `@t3-oss/env-nextjs`). Never access `process.env` directly — it bypasses validation and has no type safety.

Full reference: [docs/env.md](./env.md).

---

## Where to go next

| I want to… | Read… |
|---|---|
| Run or build the project | [root README — Scripts](../README.md#scripts) |
| Work on a specific app | That app's `CLAUDE.md` in `apps/web/<app>/` |
| Use the shared auth package | [`packages/auth/README.md`](../packages/auth/README.md) |
| Use the shared UI components | [`packages/ui/README.md`](../packages/ui/README.md) |
| Set up environment variables | [`docs/env.md`](./env.md) |
| Understand the design system | [`docs/design-system.md`](./design-system.md) |
| Deploy to staging or production | [`docs/deployment.md`](./deployment.md) |
| Debug something broken | [`docs/troubleshooting.md`](./troubleshooting.md) |
| Understand what GMS builds | [`docs/architecture.md`](./architecture.md) |
