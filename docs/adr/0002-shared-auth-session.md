# ADR-0002: Use Shared Auth With Opaque Browser Sessions

## Status

Accepted

## Context

Multiple web apps need a common sign-in experience while preserving server-side rendering and avoiding client-side token storage.

## Decision

Use the `auth` web app as the shared sign-in surface. Store an opaque session token in an `httpOnly`, `SameSite=Lax` cookie. Server-side app code exchanges the session token for a short-lived FastAPI access token.

## Consequences

- Browser clients do not store JWTs directly.
- Apps can delegate sign-in to `web-auth` or integrate auth more deeply, as `admin-gms` does.
- Cross-app auth depends on consistent `SESSION_COOKIE_NAME`, optional `SESSION_COOKIE_DOMAIN`, and return-host allowlists.
- API calls that need user identity must happen server-side or through a trusted route handler that can exchange the session.

