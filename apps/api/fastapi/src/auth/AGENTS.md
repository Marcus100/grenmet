# auth domain — agent context

**Owner:** Barrels platform. Consumed by every app through `packages/auth` and the generated client.

## What lives here
- Users, roles, permissions, role assignments (`models.py`, `routers/`), 2FA/TOTP (`totp.py`, `routers/twofa.py`), lockout, devices, account security.
- Modern sign-in flows (`modern.py`, `modern_service.py`: email codes, Google, recovery codes) under `/api/v1/auth/modern`.
- Browser session auth for web apps (`browser.py`) — opaque sessions per ADR-0002.
- App-scoped sign-in (`apps.py`, `app_router.py`, `app_service.py`, `app_dependencies.py`, `otp.py`) under `/api/v1/auth/apps/{app}` — ADR-0016; single sign-on handoff (`/handoff`, `/handoff/redeem`) — ADR-0017.
- Authorization: `policy.py` (`has_permission`, `require_permission`, `can_act_on_user…`) and `access.py` (effective roles, access reviews).

## Invariants
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

## Tests
`tests/auth/` (routers, 2FA, lockout, devices, modern auth, token TTL, user management, permission registry).

## Related
ADR-0002 (shared auth session), `packages/auth/AGENTS.md`, `apps/web/auth/AGENTS.md`, `docs/security.md`.
