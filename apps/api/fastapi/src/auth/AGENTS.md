# auth domain — agent context

**Owner:** Barrels platform. Consumed by every app through `packages/auth` and the generated client.

## What lives here
- Users, roles, permissions, role assignments (`models.py`, `routers/`), 2FA/TOTP (`totp.py`, `routers/twofa.py`), lockout, devices, account security.
- Core account logic in `service.py` (user writes, `authenticate`, `set_password`, `update_password`), with the rest split by area and re-exported through `service.__all__`, so `service.<name>` still works everywhere: `user_queries.py` (lookups), `eligibility.py` (app and staff eligibility, effective permission), `totp_enrolment.py`, `sessions.py` (sessions and access tokens), `roles.py` (roles and permission catalogue), `assignments.py` (role assignments and delegated authority). Imports point one way: `sessions` ← `eligibility`, `user_queries`; `assignments` ← `roles`; never import `service` from these. Tests patch `service.verify_password_async`, so functions that call it (`authenticate`, `update_password`) stay in `service.py`, and so do the ones that log through `service`'s logger.
- Account sign-in flows (`modern.py`, `modern_service.py`: email codes, Google, password setup, account security and recovery codes) under `/api/v1/auth`.
- Sessions, tokens and passwords (`routers/login.py`): `/auth/sessions*`, `/auth/token` (OAuth2 `tokenUrl`), `/auth/staff/me` (staff gate check), `/auth/password/{recovery,reset}`. 2FA (`routers/twofa.py`) lives at `/auth/users/me/security/2fa`.
- Browser session auth for web apps (`browser.py`) — opaque sessions per ADR-0002.
- App-scoped sign-in (`apps.py`, `app_router.py`, `app_service.py`, `app_dependencies.py`, `otp.py`) under `/api/v1/auth/apps/{app}` — ADR-0016; single sign-on handoff (`/handoff`, `/handoff/redeem`) — ADR-0017.
- Authorization: `policy.py` (`has_permission`, `require_permission`, `can_act_on_user…`) and `access.py` (effective roles, access reviews).

## Invariants
- **Every auth route lives under `/api/v1/auth`.** No new top-level prefixes (the old `/login`, `/2fa`, `/password-recovery`, `/reset-password` and `/auth/modern` paths were removed on 16 October 2026 with no aliases). Never put an email address or other personal data in a path; send it in the body.
- **Activation:** administrator approval never sets `email_verified_at`; use hashed, expiring, one-use challenges and audit lifecycle events without secrets. See `docs/operations/staff-onboarding.md`.
- **CMS access:** `User.cms_access` is superuser-managed and independent of employment. CMS issues app-scoped tokens; live identity and session exchange recheck grants, and changes revoke CMS sessions.
- `permissions.py` is the single catalogue. Every key passed to `require_permission(..., permission_key=...)` must exist in `PERMISSIONS`; `tests/auth/test_permission_registry.py` fails otherwise. Seeders are idempotent and run at prestart.
- Authorization matches on `Permission.key` only; `action`/`entity`/`access` columns are derived metadata.
- JWT via PyJWT (`import jwt`) only. Never `python-jose`.
- Superuser-only actions (granting superuser, editing role/permission definitions) are enforced in routes, not by a permission key.
- App-scoped tokens carry an `app` claim; `get_current_user` must keep refusing them, and app routes must use `app_user(key)`/`optional_app_user(key)`. Self-service accounts keep `registration_pending=True`.
- Only a non-app-scoped account session may start a handoff; redeem requires the app's `client_secret`. Cookie routes (`browser.get_cookie_user`) refuse app-scoped sessions.
- Phone code delivery stays `disabled` in production until a provider is approved (cost).
- Rate-limited endpoints use `src.rate_limit.limiter`; keep limits on any new unauthenticated route.

## Change checklist
- New permission → add to `PERMISSIONS`, default role grants if needed, gate the UI in gaa-admin, and add a test.
- Session/cookie behaviour → verify `packages/auth`, `apps/web/auth`, and every delegating app (root Blast-Radius table).
- Route changes → `openapi.json`, client regen, `docs/api/contracts.md`.

## Account apps (join and leave)
`app_router.account_router` (`/auth/account/apps`, `/{app}/join`, `/{app}/leave`) manages memberships for the auth.barrels.gd account session; `_account_session_user` rejects app sessions. Leaving removes only the app's default role link and ends that app's sessions (`sessions.revoke_user_app_sessions`); staff-scope apps cannot be left. Tests: `tests/auth/test_account_apps.py`.

## Tests
`tests/auth/` (routers, 2FA, lockout, devices, modern auth, token TTL, user management, permission registry).

## Related
ADR-0002 (shared auth session), `packages/auth/AGENTS.md`, `apps/web/auth/AGENTS.md`, `docs/security.md`.
