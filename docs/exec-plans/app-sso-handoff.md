# Exec plan: single sign-on handoff across `*.barrels.gd`

Decision record: ADR-0017 (proposed), building on ADR-0016.
Status: **phase 1 (backend) done; phases 2–6 not started.** Each phase ships and
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

**1. Backend (FastAPI, `src/auth/`) — done**
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
- Moved to phase 4: the staff token scope (`gaa-admin`, `cms` mint unscoped
  staff tokens) is added with the first staff app, so it is built and tested
  against a real consumer.
- Known limit: rate limits key on the caller IP, which is the web server for
  these server-to-server calls, so all users share one bucket (affects every
  sign-in route today; fix separately).

**2. `packages/auth`**
- `startAppSignIn(config, request)` and `completeAppSignIn(config, request)`
  route-handler helpers (state cookie, redeem, `writeSessionCookie`, safe local
  `returnTo`, `Referrer-Policy: no-referrer`). Vitest coverage.
- `buildSharedSignInUrl` keeps its signature and points at the app's own
  `/auth/start`, so existing callers don't change.

**3. Auth app**
- `/continue` route; account cookie renamed to a host-only `auth_session`
  (done in phase 6, so gaa-admin and cms keep working until then).
- Every post-sign-in path (password action, Google confirm, email code) goes to
  `/continue` when an `app` is present instead of `redirect(returnTo)`.
- One-click "Join <app>?" screen for self-sign-up apps the user hasn't joined;
  backend needs a `join` flag on the handoff call that runs `ensure_member`.
- `/sessions` groups sessions by app, with per-app end and "sign out everywhere".

**4. cms** (smallest, proves the pattern): own `cms_session` host-only cookie,
`/auth/start` + `/auth/callback`, logout routes unchanged.

**5. gaa-admin** (run the `gaa-admin-change` skill first): keeps the cookie name
`grenmet_session` but host-only, so FastAPI cookie routes (janitorial, eregister,
transport, wxwatch, wxproducts via `proxy.ts` and the `db/*/queries.ts`
forwarders) keep working. Add start and callback routes.

**6. Events and cleanup**
- Events: add "Continue with your Barrels account" next to its own sign-in;
  wire `EVENTS_SSO_CLIENT_SECRET` (GitHub secret → API and Events containers).
- Remove `SESSION_COOKIE_DOMAIN` from `AuthConfig`, the three compose files,
  every `env.ts`, and `docs/env.md`; switch auth to `auth_session`. Users sign
  in again once.
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

## Verification (per phase)

- `uv run --frozen --package fast-back pytest tests/auth/`, `./scripts/lint.sh`
- `pnpm fix:changed`, `pnpm type-check`, `pnpm guardrails:staged`, `pnpm check:drift`
- Host stack, manual: sign in at auth → open cms then admin with no prompt; devtools
  shows separate cookies without `Domain`; sign out of cms → admin still signed in;
  "sign out everywhere" → both signed out; resident account → no access page for admin.
