# Exec plan: single sign-on handoff across `*.barrels.gd`

Decision record: ADR-0017 (proposed), building on ADR-0016.
Status: **steps 1–3 done; step 4 not started.** Each phase ships and
is reviewed on its own.

## Goal

One account. Each subdomain has its own session and host-only cookie. Opening
an app while signed in at `auth.barrels.gd` signs you in to that app silently.
Signing out of one app leaves the others signed in; "sign out everywhere" ends all.

## Where we are (dev @ 88676d46)

| Piece | Today |
| --- | --- |
| Events | ADR-0016 app-scoped sign-in, own `events_session` host-only cookie, own sign-in pages |
| gaa-admin, cms | Legacy `grenmet_session` cookie on `.barrels.gd` written by auth (`SESSION_COOKIE_DOMAIN`) |
| auth | Writes that shared cookie; `/?returnTo=` redirects straight back if already signed in |
| docs, gms, signal, mbia, elections | No sign-in |
| Backend | `session.app_name` and `AuthChallenge` (hashed one-use tokens) already exist, so **no migration needed** |

## Flow

```
app (no cookie) ─► app /auth/start        sets host-only state cookie (10 min)
                ─► auth /continue?app&state&returnTo
auth: account session valid + eligible?
   no session  ─► sign-in form, then continue
   not a member─► public app: one-click "Join <app>?" screen, then continue
                  staff app:  "no access to <app>" page
   yes         ─► POST /api/v1/auth/apps/{app}/handoff   (account session → code)
               ─► <registry url>/auth/callback?code&state
app /auth/callback: state == cookie?
               ─► POST /api/v1/auth/apps/{app}/handoff/redeem  (code → app session)
               ─► set app cookie, clear state cookie, redirect to local returnTo
```

## Phases

**1. Backend handoff (FastAPI, `src/auth/`) — done**
- `apps.py`: `client_secret` (an app takes part in SSO only when it is set),
  `callback_path`, `callback_url`. Events reads `EVENTS_SSO_CLIENT_SECRET`.
- `POST /auth/apps/{app}/handoff`: account session + state → one-use 60-second
  code (`AuthChallenge`, purpose `app_handoff`, state stored hashed) and the
  registered `callback_url`. 409 means join required; `join: true` runs
  `ensure_member`. App-scoped sessions can never start a handoff.
- `POST /auth/apps/{app}/handoff/redeem`: code + state + the app's
  `client_secret` → `SessionLoginResponse` via `_session_response`. A wrong
  state spends the code; a wrong secret is refused before the code is touched.
- `browser.get_cookie_user` now refuses app-scoped sessions.
- Tests: `tests/auth/test_app_handoff.py`. Contract regenerated;
  `docs/api/contracts.md` and `docs/env.md` updated.
- Moved to step 3: the staff token scope (`gaa-admin`, `cms` mint unscoped
  staff tokens) is added with the first staff app, so it is built and tested
  against a real consumer.
- Known limit: rate limits key on the caller IP, which is the web server for
  these server-to-server calls, so all users share one bucket (affects every
  sign-in route today; fix separately).

**2. Shared helpers, auth `/continue`, Events (staff SSO first) — done**
- `packages/auth`: `startAppSignIn` / `completeAppSignIn` route-handler helpers
  (state cookie, redeem with the app's client secret, `writeSessionCookie`, safe
  local `returnTo`, `Referrer-Policy: no-referrer`), with Vitest coverage.
- Auth app: `/continue?app&state&returnTo` (handoff, one-click "Join <app>?"
  screen on 409, "no access" on 403); every post-sign-in path goes there when an
  `app` is present.
- Events: `/auth/start` and `/auth/callback`; "Continue with your Barrels
  account" on its sign-in page; wire `EVENTS_SSO_CLIENT_SECRET`.
- Google sign-in at auth now carries `returnTo` through the round trip
  (`google_return` cookie), so it lands back on `/continue`.
- Deployment: API gets `EVENTS_APP_URL` and `EVENTS_SSO_CLIENT_SECRET`; Events
  gets `AUTH_APP_URL` and the secret; `render-env.py` requires 32+ characters.
  To switch it on, add the GitHub environment secret `EVENTS_SSO_CLIENT_SECRET`.
- Only approved staff can hold an auth.barrels.gd session at this point, so
  this step gives staff single sign-on into Events; residents keep Events'
  own sign-in until step 4.

**3. cms, then gaa-admin, onto their own cookies — done**
- Staff token scope for handoff sessions (unscoped staff token, staff approval
  required), `app.<key>.access` permissions and admin grants.
- cms: `cms_session` host-only cookie, start and callback routes.
- gaa-admin (run the `gaa-admin-change` skill first): `grenmet_session` but
  host-only, so FastAPI cookie routes keep working; start and callback routes.
- Remove `SESSION_COOKIE_DOMAIN` (compose, `env.ts`, `AuthConfig`, docs) and
  switch auth to a host-only `auth_session`. Everyone signs in again once.
- As built: staff apps are registry entries with `scope="staff"` (no sign-in
  methods of their own); access is staff approval (`is_staff_eligible`), not a
  new permission key, so no existing staff lose access. Only a session that
  doesn't belong to a registered app can start a handoff.
- New cookie names (`auth_session`, `admin_session`, `cms_session`) rather than
  host-only `grenmet_session`, so leftover shared-domain cookies can't shadow
  the new ones. The API's `BROWSER_SESSION_COOKIE_NAME` matches gaa-admin's.
- `GAA_ADMIN_SSO_CLIENT_SECRET` and `CMS_SSO_CLIENT_SECRET` are required
  deployment secrets; the `SESSION_COOKIE_NAME` secret is no longer used.
- Signing out at auth.barrels.gd now calls logout-all.

**4. Public accounts at auth.barrels.gd and Sign in everywhere**
- Must follow step 3: while staff apps read the shared `.barrels.gd` cookie, a
  public account session there would reach staff app shells.
- Auth accepts public accounts (email code, password, Google; self sign-up).
  Staff approval moves from sign-in to staff-app handoff and staff tokens.
  *Done:* account sessions for unapproved accounts, `AccountUser` on the
  self-service routes, "Request staff access" (`staff_access_requested_at`,
  migration `staffreq20261007` backfills existing pending sign-ups except
  Events members), staff setup lists only staff and requesters.
- Every app's "Sign in" goes to auth: Events' own sign-in page becomes a
  redirect; add Sign in, account menu, start and callback routes to Weather
  (gms), MBIA, Elections, Signal and Docs (each registered with a client
  secret, `app.<key>.access` and a self-sign-up default role).
- `/sessions` groups sessions by app; auth logout calls logout-all.
- Update ADR-0002 (superseded in part), ADR-0016 (amended), `packages/auth`
  README and AGENTS, and `apps/web/auth/AGENTS.md`.

## Decisions

Confirmed by the owner (2026-10-06):

1. **Joining a public app:** the first time a registered user opens a
   self-sign-up app (Events), auth shows a one-click "Join Barrels Events?"
   screen. Accepting grants the app's default role; later visits are silent.
2. **Staff apps:** an admin grants `app.<key>.access`; being registered is not
   enough. Ineligible users see "You don't have access to <app>".
3. **Auth logout signs out everywhere:** signing out at `auth.barrels.gd` ends
   the account session and every app session (`/login/session/logout-all`).
   Signing out inside one app ends only that app's session.
4. **2FA:** a handoff trusts the 2FA already passed by the account session.
5. **Local dev:** cookies ignore ports, so each app needs a distinct cookie name
   on `localhost` (`auth_session`, `cms_session`, `grenmet_session`, `events_session`).
6. **Public accounts sign in at auth.barrels.gd** (step 4); staff approval is
   checked when opening staff apps, not at sign-in. Sign-up creates an ordinary
   account; staff ask from their account page, and only those requests reach
   the approval queue.
8. **Joining:** Events asks "Join Barrels Events?" (it creates a visible member
   profile). Information sites sign in silently, then show a one-time notice:
   "You're signed in to <app> with your Barrels account (email). Not you?"
7. **Every app gets Sign in**, including Weather, MBIA, Elections, Signal and
   Docs, before they have member features; features come later.

## Verification (per phase)

- `uv run --frozen --package fast-back pytest tests/auth/`, `./scripts/lint.sh`
- `pnpm fix:changed`, `pnpm type-check`, `pnpm guardrails:staged`, `pnpm check:drift`
- Host stack, manual: sign in at auth → open cms then admin with no prompt; devtools
  shows separate cookies without `Domain`; sign out of cms → admin still signed in;
  "sign out everywhere" → both signed out; resident account → no access page for admin.
