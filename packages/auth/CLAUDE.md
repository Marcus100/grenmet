# @grenmet/auth — Claude context

Agent rules for working with the shared auth package. For the full API reference (all functions, types, examples), read `packages/auth/README.md`.

## Two entry points — hard boundary

| Import | Runtime | Use for |
|---|---|---|
| `@grenmet/auth` | Client (browser) | `SessionUserProvider`, `useSessionUser`, `signOut`, `signOutEverywhere` |
| `@grenmet/auth/server` | Server only | Everything else — cookies, sessions, redirects, `authApiFetch` |

The server entry point imports `server-only`. Importing it in a Client Component is a **build error**, not a runtime error. Never import `@grenmet/auth/server` in a file with `"use client"`.

## AuthConfig — define once per app

Every server function takes an `AuthConfig` as its first argument. Define it once in `src/lib/auth-config.ts` and import it everywhere in the same app. Never construct an inline config object at a call site.

```ts
// src/lib/auth-config.ts
export const authConfig: AuthConfig = {
  appName: "my-app",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.SESSION_COOKIE_NAME,
};
```

## Standard page auth pattern (Server Component)

```ts
const sessionToken = await readSessionCookie(authConfig);
if (!sessionToken) redirect(buildSharedSignInUrl(authConfig, { origin: "..." }));

const { user, access_token } = await exchangeSessionForAccessToken(authConfig, sessionToken);
```

Catch `AuthApiError` from `exchangeSessionForAccessToken` — a 401 means the session is expired or revoked. Clear the cookie and redirect to sign-in rather than letting it propagate.

## Logout routes

Every app that uses auth must implement:

- `POST /auth/logout` → calls `logoutSession`, then `clearSessionCookie`
- `POST /auth/logout-all` → calls `logoutAllSessions`, then `clearSessionCookie`

The client-side `signOut()` and `signOutEverywhere()` functions POST to these routes. If the routes are missing, sign-out silently fails.

## Which apps use what

| App | Auth model | Key server functions |
|---|---|---|
| `auth` | Owns sign-in | `createSession`, `writeSessionCookie`, `buildSharedSignInUrl` |
| `admin-gms` | Deep integration | `readSessionCookie`, `exchangeSessionForAccessToken`, `authApiFetch` |
| `wxwatch`, `hr`, `hurricaneplan`, `spicewx` | Delegates to auth | `readSessionCookie`, `buildSharedSignInUrl` |
| `wxproducts`, `salesbus` | No auth | — |

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Importing `@grenmet/auth/server` in a Client Component | Move the call to a Server Component or Route Handler |
| Constructing `AuthConfig` inline at a call site | Define once in `src/lib/auth-config.ts` |
| Using `process.env` for auth config values | Use the app's typed `env` object from `src/env.ts` |
| Swallowing `AuthApiError` without redirecting | Redirect to sign-in on 401 — do not silently fail |
| Skipping logout route handlers | Implement both `/auth/logout` and `/auth/logout-all` in every auth-integrated app |
