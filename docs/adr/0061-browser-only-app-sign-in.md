# ADR-0061: Sign-in for browser-only apps

## Status

Accepted 16 Nov 2026 (owner decisions in the session that designed the Printix
organiser screen). Amends ADR-0016 (app-scoped accounts and sessions) for apps
that have no server part. First user: the Printix organiser screen in
`apps/pwa/printix`.

## Context

The phone apps in `apps/pwa/*` are browser-only React apps built with Vite and
served as files from Cloudflare Pages (owner decision, 16 Nov 2026: app-first,
not Next.js). They have no server of their own.

The repository's sign-in assumes a server part:

- ADR-0002 and ADR-0016: each web app keeps a host-only session cookie and reads
  it server-side (`packages/auth`, `@barrelsgd/auth/server`).
- ADR-0017: single sign-on hands a one-use code to the app's server, which redeems
  it with a client secret that never reaches the browser.

A browser-only app can keep neither the cookie nor the secret. It still needs a
signed-in person, for example a Printix organiser who imports tickets and makes
gate QR codes.

What already exists and is reused:

- App-scoped sign-in from an app's own pages: `POST /api/v1/auth/apps/{app}/email-code/start`,
  `/email-code/verify` and `/login` (`apps/api/fastapi/src/auth/app_router.py`). They
  return `SessionLoginResponse` with `session_token` and a short-lived access token
  in the body.
- An enrolled authenticator is checked during sign-in and marks the session as
  having passed it (`auth/app_service.py`).
- `POST /api/v1/auth/sessions/refresh` (`auth/routers/login.py`) issues a new
  access token for a live session. Access tokens last 15 minutes
  (`auth/config.py`, `SESSION_ACCESS_TOKEN_EXPIRE_MINUTES`).
- CORS already allows the `Authorization` header (`src/main.py`).

## Options considered

1. **A small server-rendered app per browser-only app** (Next.js with
   `@barrelsgd/auth/server`). Most proven, but it contradicts the app-first
   decision, adds a Node server and a second address per app.
2. **Single sign-on handoff with a code exchange that needs no secret** (public
   client, PKCE). Adds a new kind of credential redeem path next to the
   client-secret check in `app_service.py`. More moving parts for the same result.
3. **A session cookie shared across `.barrels.gd`.** ADR-0017 removed exactly this
   cookie: it reaches every subdomain and needs CSRF protection. Rejected.
4. **App-scoped sign-in from the app's own pages, tokens held by the browser for a
   short time.** Reuses existing routes; no new credential type. Chosen.
5. **A sign-in layer served by FastAPI** (an HttpOnly refresh cookie on
   `api.barrels.gd`, one path, exact Origin check). A possible later upgrade of
   option 4 if longer sessions are wanted; it needs its own ADR.

## Decision

1. A browser-only app is registered in `auth/apps.py` like any app, with **no
   client secret** (it does not take part in single sign-on). It signs people in
   from its own pages through the existing `/auth/apps/{app}/*` routes. The pages
   may say "Sign in with your Barrels account"; Barrels branding on sign-in is
   allowed for Printix (owner, 16 Nov 2026).
2. **Tokens:** the access token is kept **in memory only** and renewed through
   `/auth/sessions/refresh`. The session token is kept in **`sessionStorage`**, so
   it is gone when the tab closes. Nothing goes in `localStorage`, IndexedDB, a
   service worker cache or a URL.
3. **Session length:** a new per-app field caps how long a session of that app may
   last. Printix: **12 hours**, whatever the platform default. A refresh never
   extends a session past its cap.
4. **Authenticator:** an app may require an enrolled authenticator and a session
   that passed it for every signed-in route. Printix requires it for every
   organiser (owner, 16 Nov 2026).
5. **Page rules:** a strict content security policy with no `'unsafe-inline'`
   scripts, no third-party scripts, `connect-src` naming only the API origin.
   Server-provided text is rendered only as text.
6. **Sign out** revokes the session on the server, then clears memory and
   `sessionStorage`.
7. One-time steps that need the account site (accepting an invitation, enrolling
   an authenticator) may stay on `auth.barrels.gd` (owner accepted this for
   Printix before December).
8. The app's address is on the API's CORS allow-list (`BACKEND_CORS_ORIGINS`).

## Consequences

- No change for existing server-rendered apps.
- A script injection on the app's address could read the session for up to the
  cap (12 hours for Printix), limited to what that app's roles allow. The content
  security policy and the cap are the controls.
- People sign in again after closing the tab. Longer sessions need option 5.
- Each browser-only app's sign-in screens are its own code; a shared component in
  `packages/pwa-kit` follows once a second app needs it.

## Follow-ups

- The per-app session cap field and its tests (built with the Printix organiser
  screen).
- A test that the Printix organiser pages hold no token in `localStorage`.
