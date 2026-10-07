# Exec plan: single sign-on handoff across `*.barrels.gd`

Decision record: ADR-0017 (proposed), building on ADR-0016.
Status: **plan only, not started.** Each phase ships and is reviewed on its own.

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

**1. Backend (FastAPI, `src/auth/`)**
- `apps.py`: add `sso: bool`, `scope: "app" | "staff"`, `callback_path`; register
  `gaa-admin` and `cms` as `scope="staff"` (plus `app.<key>.access` permissions and
  default role grants in `permissions.py`).
- `app_router.py` / `app_service.py`: `POST /auth/apps/{app}/handoff` (account
  session token + state hash → code via `modern_service.issue`, purpose
  `app_handoff`, 1 minute) and `POST /auth/apps/{app}/handoff/redeem` (code + state
  → `SessionLoginResponse`, reusing `_session_response`; staff scope mints an
  unscoped token and keeps `require_approved_account`). Rate-limit both.
- Close a gap found while planning: `browser.get_cookie_user` accepts any active
  session, including an app-scoped one; refuse app-scoped sessions there, as
  `get_current_user` already does for tokens.
- Tests in `tests/auth/`: single use, expiry, wrong app, wrong state, ineligible
  user, revoked account session, staff vs app token scope, cookie-route refusal.
- Regen `openapi.json` → `pnpm generate:api-client` → `pnpm check:drift`;
  `docs/api/contracts.md`.

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
- Events: add "Continue with your Barrels account" next to its own sign-in.
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

Still to confirm before phase 1 (recommendation in brackets):

3. **Auth logout:** ends only the account session, and app sessions continue
   ("sign out everywhere" is the explicit kill). [yes]
4. **2FA:** a handoff trusts the 2FA already passed by the account session. [yes]
5. **Local dev:** cookies ignore ports, so each app needs a distinct cookie name
   on `localhost` (`auth_session`, `cms_session`, `grenmet_session`, `events_session`). [yes]

## Verification (per phase)

- `uv run --frozen --package fast-back pytest tests/auth/`, `./scripts/lint.sh`
- `pnpm fix:changed`, `pnpm type-check`, `pnpm guardrails:staged`, `pnpm check:drift`
- Host stack, manual: sign in at auth → open cms then admin with no prompt; devtools
  shows separate cookies without `Domain`; sign out of cms → admin still signed in;
  "sign out everywhere" → both signed out; resident account → no access page for admin.
