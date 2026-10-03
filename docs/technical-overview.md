# Technical Overview

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-18

This document explains how the Barrels Grenada codebase fits together: the
relationships among applications, shared packages, authentication, and data.
The repository hosts Barrels products and client delivery. GAA is the client
organisation and GMS is its meteorological department; neither is a Barrels
product.

For ownership and planning, see the [Portfolio Planning System](./portfolio/).
For GMS service design, see [GMS Digital Service Architecture](./architecture.md).
For commands and setup, see the [root README](../README.md).

---

## Monorepo structure

For the directory layout, see [Workspace Layout in the root README](../README.md#workspace-layout).

**Build system:** pnpm v12 workspaces + Turborepo v2. All tasks run via `turbo run <task>` from the root. Turbo handles caching and parallelism — run `pnpm build` or `pnpm check` at the root and Turbo figures out the order.

**Package references:** Shared dep versions are pinned in `pnpm-workspace.yaml` under `catalog:`. Apps reference them with `"react": "catalog:"` — never hardcode a version for a dep that exists in the catalog.

---

## The web apps at a glance

| App | Package | Port | Auth model | Database |
|---|---|---|---|---|
| `auth` | `@barrelsgd/web-auth` | 3000 | Owns sign-in/sign-up | — |
| `gaa-admin` | `@barrelsgd/web-gaa-admin` | 3001 | Deep integration | FastAPI databases through generated API contracts |
| `docs` | `@barrelsgd/web-docs` | 3002 | Delegates to auth | — |
| `gms` | `@barrelsgd/web-gms` | 3003 | Delegates to auth | — |
| `signal` | `@barrelsgd/web-signal` | 3004 | None (static MDX) | — |
| `mbia` | `@barrelsgd/web-mbia` | 3005 | None (public content) | — |
| `cms` | `@barrelsgd/web-cms` | 3006 | Shared FastAPI identity | Dedicated `gms_cms` database |
| `events` | `@barrelsgd/web-events` | 3009 | None (prototype) | — |

**Auth model** determines how a user gets authenticated. See the [Auth section](#auth-architecture) below.

> **Current mixed portal boundary:** the former `cap`, `hr`, `wxwatch`, `wxproducts`, and
> `salesbus` apps were folded into `gaa-admin` as path-prefixed, auth-gated routes
> (`/cap`, `/hr`, `/wxwatch`, `/wxproducts`, `/salesbus`). Their dedicated Postgres
> databases remain separate, while FastAPI owns schema changes, seeds, reads, and writes;
> `gaa-admin` consumes those domains through generated API contracts. The old subdomains
> (`wxwatch.barrels.gd`, `hr.barrels.gd`, `sales.barrels.gd`, `wxproducts.barrels.gd`)
> are retired. The application is the GAA staff-portal implementation, piloted
> in GMS; it is not the future Barrels superuser admin.

---

## Auth architecture

Authentication is centralised in the `web-auth` app (`:3000`). All other apps either delegate to it or integrate with it directly.

### Two auth models

**Delegation (most apps)**

Apps that delegate (wxwatch, hr, docs, gms) redirect unauthenticated users to `web-auth` for sign-in. After sign-in, `web-auth` redirects back with a shared session cookie.

```
User visits wxwatch (unauthenticated)
  → redirected to auth.example.com?app=wxwatch&returnTo=https://wxwatch.example.com/dashboard
  → user signs in on web-auth
  → web-auth sets session cookie, redirects back to wxwatch
  → wxwatch reads the session cookie to identify the user
```

These apps use `buildSharedSignInUrl()` from `@barrelsgd/auth/server` to construct the redirect.

**Deep integration (gaa-admin)**

`gaa-admin` uses `@barrelsgd/auth/server` directly to manage sessions — it reads cookies, calls FastAPI auth endpoints, and proxies API requests with access tokens. It does not redirect to `web-auth` for sign-in; it handles sign-in within its own route group.

### The session cookie

The session cookie (`grenmet_session` by default) is an **httpOnly, SameSite=Lax** cookie. It contains an opaque session token, not a JWT. Each request that needs user identity must exchange this token for a short-lived access token by calling `exchangeSessionForAccessToken()`.

```
Request arrives with session cookie
  → app calls exchangeSessionForAccessToken(config, sessionToken)
  → FastAPI validates the session and returns an access token + user object
  → app uses the access token for subsequent FastAPI API calls
```

The cookie is set by `web-auth` on successful sign-in via `writeSessionCookie()`. Apps that integrate auth deeply can also write it (as `gaa-admin` does).

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

### `@barrelsgd/auth`

Session management and auth helpers shared across all apps.

- **Client export** (`@barrelsgd/auth`): `SessionUserProvider`, `useSessionUser`, `signOut()`, `signOutEverywhere()`
- **Server export** (`@barrelsgd/auth/server`): `authApiFetch`, cookie helpers, session helpers, redirect helpers

See [`packages/auth/README.md`](../packages/auth/README.md).

### `@barrelsgd/ui`

Brand-neutral shared UI component library. Product and client presentation
packages may depend on it; it must not depend on them.

```ts
import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
```

Built on Base UI primitives with shadcn-style component patterns. See
[`packages/ui/README.md`](../packages/ui/README.md).

### `@barrelsgd/gms`

GMS assets and service-specific presentation components. Its extraction from
shared UI is in progress in the current worktree.


### `@barrelsgd/api-client`

Kubb-generated TypeScript client from the FastAPI OpenAPI schema. Provides:
- TypeScript types for all API entities
- React Query hooks for all endpoints
- A typed Fetch client
- Zod schemas for validation

**Never edit files in `packages/api-client/src/gen/` directly.** When FastAPI routes change, regenerate the client and commit both `openapi.json` and the updated `src/gen/` files together. See [CONTRIBUTING.md — Generated files](../CONTRIBUTING.md#generated-files) for the exact steps.

### `@barrelsgd/tsconfig`

Two presets: `tsconfig.json` (base, for packages/API) and `tsconfig.nextjs.json` (for Next.js apps). Apps extend the appropriate preset and add only app-specific overrides.

---

## Database architecture

The application, weather archive, weather products, eRegister, janitorial catalogue, and staff transport timetable use separate PostgreSQL databases. FastAPI owns the weather, eRegister, janitorial, and transport boundaries through dedicated SQLAlchemy sessions and Alembic histories. GAA Admin renders generated API contracts and does not connect directly to those databases.

FastAPI also hosts platform-wide change history (`src/audit`) and in-app/email notifications (`src/notifications`); see [API contracts](api/contracts.md#change-history-and-notifications-platform-core).

The web migration image and legacy catalogue scripts are being retired. New schema, migration, seed, and read changes belong in `apps/api/fastapi`; the Python catalogue seeder is `scripts/seed_catalogues.py`.

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
| Work on a specific app | That app's `AGENTS.md` in `apps/web/<app>/` |
| Use the shared auth package | [`packages/auth/README.md`](../packages/auth/README.md) |
| Use the shared UI components | [`packages/ui/README.md`](../packages/ui/README.md) |
| Set up environment variables | [`docs/env.md`](./env.md) |
| Understand the design system | [`docs/design-system.md`](./design-system.md) |
| Deploy to staging or production | [`docs/deployment.md`](./deployment.md) |
| Debug something broken | [`docs/troubleshooting.md`](./troubleshooting.md) |
| Understand what GMS builds | [`docs/architecture.md`](./architecture.md) |
