# @grenmet/auth

Shared authentication and session package for all Grenmet web apps.

Two entry points — client and server — with a strict boundary between them:

| Import | Runtime | Use when |
|---|---|---|
| `@grenmet/auth` | Client (browser) | Reading the current user in a component, signing out |
| `@grenmet/auth/server` | Server only | Middleware, Server Components, Route Handlers, API routes |

The server entry point imports `server-only` and will throw a build error if imported in a Client Component.

---

## Concepts

Auth in this monorepo is session-based, not JWT-based on the client side. The session token is an opaque value stored in an httpOnly cookie. Each server-side request that needs user identity exchanges this token for a short-lived access token by calling FastAPI.

For the full auth flow, see [docs/technical-overview.md — Auth architecture](../../docs/technical-overview.md#auth-architecture).

---

## Client API

Import from `@grenmet/auth`:

```ts
import {
  SessionUserProvider,
  useSessionUser,
  signOut,
  signOutEverywhere,
} from "@grenmet/auth";
```

### `SessionUserProvider`

Wrap your app (or a subtree) to make the current user available via `useSessionUser`.

```tsx
// In your root layout or provider tree
import { SessionUserProvider } from "@grenmet/auth";

export default function Layout({ children, user }) {
  return (
    <SessionUserProvider user={user}>
      {children}
    </SessionUserProvider>
  );
}
```

The `user` prop is a `SessionUserPublic | null` — fetch it server-side (see `exchangeSessionForAccessToken` below) and pass it down.

### `useSessionUser`

Read the current user in any Client Component.

```tsx
"use client";
import { useSessionUser } from "@grenmet/auth";

export function UserMenu() {
  const user = useSessionUser();
  if (!user) return null;

  return <span>{user.full_name ?? user.email}</span>;
}
```

Returns `SessionUserPublic | null`.

### `signOut(signInPath?)`

Revoke the current session and redirect to sign-in.

```tsx
"use client";
import { signOut } from "@grenmet/auth";

<button onClick={() => signOut()}>Sign out</button>

// Custom sign-in path (defaults to "/signin")
<button onClick={() => signOut("/auth/signin")}>Sign out</button>
```

Calls `POST /auth/logout` on the current app's API proxy, then redirects. Safe to call even if the request fails — the redirect always happens.

### `signOutEverywhere(signInPath?)`

Same as `signOut` but revokes all sessions for the user, not just the current one. Calls `POST /auth/logout-all`.

---

## Server API

Import from `@grenmet/auth/server`:

```ts
import {
  // Cookie helpers
  readSessionCookie,
  writeSessionCookie,
  clearSessionCookie,
  clearSessionCookieOnResponse,

  // Session helpers
  createSession,
  exchangeSessionForAccessToken,
  refreshSession,
  logoutSession,
  logoutAllSessions,

  // Redirect helpers
  buildSharedSignInUrl,
  getSafeLocalReturnTo,
  getRequestOrigin,

  // Typed fetch
  authApiFetch,
} from "@grenmet/auth/server";
```

All server functions take an `AuthConfig` object as their first argument. Define this once per app:

```ts
// src/lib/auth-config.ts
import type { AuthConfig } from "@grenmet/auth";
import { env } from "@/env";

export const authConfig: AuthConfig = {
  appName: "my-app",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.SESSION_COOKIE_NAME,
  // sessionCookieDomain: env.SESSION_COOKIE_DOMAIN, // only if needed for cross-subdomain cookies
};
```

---

### Cookie helpers

#### `readSessionCookie(config)`

Read the session token from the incoming request cookie store.

```ts
const sessionToken = await readSessionCookie(authConfig);
// string | null
```

#### `writeSessionCookie(config, sessionToken, sessionExpiresAt)`

Write the session cookie on the response (e.g. after sign-in).

```ts
await writeSessionCookie(authConfig, session.session_token, session.session_expires_at);
```

#### `clearSessionCookie(config)`

Clear the session cookie (e.g. on sign-out).

```ts
await clearSessionCookie(authConfig);
```

#### `clearSessionCookieOnResponse(config, response)`

Clear the session cookie on a `NextResponse` object. Use in middleware or Route Handlers where you have a response object.

```ts
import { type NextResponse } from "next/server";

clearSessionCookieOnResponse(authConfig, response);
```

---

### Session helpers

#### `exchangeSessionForAccessToken(config, sessionToken)`

Exchange a session token for a short-lived access token and the current user. This is the primary way to authenticate a server request.

```ts
import { readSessionCookie, exchangeSessionForAccessToken } from "@grenmet/auth/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const sessionToken = await readSessionCookie(authConfig);
  if (!sessionToken) redirect(buildSharedSignInUrl(authConfig, { origin: "..." }));

  const { user, access_token } = await exchangeSessionForAccessToken(authConfig, sessionToken);
  // user: SessionUserPublic
  // access_token: string — use this in Authorization headers for FastAPI calls
}
```

Throws `AuthApiError` if the session is invalid or expired. Handle this by clearing the cookie and redirecting to sign-in.

#### `createSession(config, { email, password, appName?, clientType? })`

Create a new session. Used by `web-auth` on sign-in. Returns `SessionLoginResponse` (includes `session_token`, `user`, `access_token`).

```ts
const session = await createSession(authConfig, {
  email: "user@weather.gd",
  password: "...",
  appName: "web-auth",
});
await writeSessionCookie(authConfig, session.session_token, session.session_expires_at);
```

#### `refreshSession(config, sessionToken)`

Refresh an expiring session. Returns a new `SessionLoginResponse` with an updated token and expiry.

#### `logoutSession(config, sessionToken)`

Revoke a single session.

#### `logoutAllSessions(config, sessionToken)`

Revoke all sessions for the user.

---

### Redirect helpers

#### `buildSharedSignInUrl(config, { origin, returnTo? })`

Build a redirect URL to `web-auth` that includes the return destination. Use this to send unauthenticated users to sign-in.

```ts
import { headers } from "next/headers";
import { buildSharedSignInUrl, getRequestOrigin } from "@grenmet/auth/server";
import { redirect } from "next/navigation";

const requestHeaders = await headers();
const origin = getRequestOrigin(requestHeaders);
redirect(buildSharedSignInUrl(authConfig, { origin, returnTo: "/dashboard" }));
```

#### `getRequestOrigin(requestHeaders)`

Derive the request origin from headers (`x-forwarded-host` → `host` fallback). Use this to build absolute return URLs.

#### `getSafeLocalReturnTo(value)`

Validate a `returnTo` value from a query parameter. Returns `null` if the value is not a safe local path (must start with `/`, must not be `//`).

---

### `authApiFetch<T>(config, path, init?)`

Type-safe fetch wrapper for FastAPI auth endpoints. Forwards user-agent and IP headers, serialises the request body as JSON, and throws `AuthApiError` on non-2xx responses.

```ts
const data = await authApiFetch<MyType>(authConfig, "/some/endpoint", {
  method: "POST",
  body: { key: "value" },
});
```

The URL is built as `authApiBaseUrl + authApiPrefix + path`. Do not include the prefix in `path`.

---

## Types

```ts
import type {
  AuthConfig,
  SessionUserPublic,
  SessionPublic,
  SessionAccessTokenResponse,
  SessionLoginResponse,
  AuthApiError,
} from "@grenmet/auth";
```

### `SessionUserPublic`

```ts
interface SessionUserPublic {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
}
```

### `AuthApiError`

Thrown by `authApiFetch` and all session helpers on non-2xx responses.

```ts
import { isAuthApiError } from "@grenmet/auth";

try {
  await exchangeSessionForAccessToken(authConfig, token);
} catch (error) {
  if (isAuthApiError(error)) {
    console.error(error.status, error.detail);
    // 401 → redirect to sign-in
  }
  throw error;
}
```

---

## Which apps use which exports

| App | Client | Server |
|---|---|---|
| `auth` | — | `createSession`, `writeSessionCookie`, `buildSharedSignInUrl` |
| `admin-gms` | `SessionUserProvider`, `useSessionUser`, `signOut` | `readSessionCookie`, `exchangeSessionForAccessToken`, `authApiFetch` |
| `wxwatch` | `SessionUserProvider`, `useSessionUser`, `signOut` | `readSessionCookie`, `exchangeSessionForAccessToken`, `buildSharedSignInUrl` |
| `hr`, `hurricaneplan`, `spicewx` | `signOut` | `readSessionCookie`, `buildSharedSignInUrl` |
