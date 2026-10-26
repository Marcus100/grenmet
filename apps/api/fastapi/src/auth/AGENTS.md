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
- **Email verification never gates access** (owner, 16 October 2026): no check on `email_verified_at` / `email_verification_required` in sign-in, handoff, join, app eligibility, the staff gate or staff approval. Verification itself (emails, `/auth/password/setup`, Security) stays.
- **Joining:** every app asks "Join" once. Self-service apps join instantly; `scope="staff"` (GAA Admin) Join records a staff access request for an administrator; CMS is superuser-granted and cannot be joined.
- **Every auth route lives under `/api/v1/auth`.** No new top-level prefixes (the old `/login`, `/2fa`, `/password-recovery`, `/reset-password` and `/auth/modern` paths were removed on 16 October 2026 with no aliases). Never put an email address or other personal data in a path; send it in the body.
- **Activation:** administrator approval never sets `email_verified_at`; use hashed, expiring, one-use challenges and audit lifecycle events without secrets. See `docs/operations/staff-onboarding.md`.
- **CMS access:** `User.cms_access` is superuser-managed and independent of employment. CMS issues app-scoped tokens; live identity and session exchange recheck grants, and changes revoke CMS sessions.
- `permissions.py` is the single catalogue. Every key passed to `require_permission(..., permission_key=...)` must exist in `PERMISSIONS`; `tests/auth/test_permission_registry.py` fails otherwise. Seeders are idempotent and run at prestart.
- Authorization matches on `Permission.key` only; `action`/`entity`/`access` columns are derived metadata.
- Keys with `binding="organisation"` (ADR-0044, e.g. `events.door.scan`) are held inside one organisation and are denied by `has_permission`/`require_permission`; product keys resolve only through `organisations.grants` (`require_org_permission`). API-key scope aliases (`bookings.read`, `payments.write`, ...) also carry `binding="organisation"` but resolve through API-key scopes (ADR-0029); `grants` excludes them.
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
`barrels-admin` (Barrels control plane, `apps/web/admin`) is a staff-scope app with `AppDefinition.superuser_only`: staff tokens, but only active superusers pass `app.allows(user)` at handoff, session exchange/refresh, account "Join" and the account app list (non-superusers get 403 "Barrels staff only", never an access request). Tests: `tests/auth/test_app_handoff.py`.

`app_router.account_router` (`/auth/account/apps`, `/{app}/join`, `/{app}/leave`) manages memberships for the auth.barrels.gd account session; `_account_session_user` rejects app sessions. Leaving removes only the app's default role link and ends that app's sessions (`sessions.revoke_user_app_sessions`); staff-scope apps cannot be left. Tests: `tests/auth/test_account_apps.py`.

`bookings` (Barrels Bookings, `apps/web/bookings`) is a self-service `app`-scope site (instant Join, role `bookings-member`, permission `app.bookings.access`).

`gmsdash` (GMS Dashboard, `apps/web/gmsdash`) is a self-service `app`-scope site like the others (instant Join, role `gmsdash-member`). The gate to its data is the organisation entitlement and a staff-approved access request, not the Join; see `src/models_guidance/AGENTS.md`.

## Tests
`tests/auth/` (routers, 2FA, lockout, devices, modern auth, token TTL, user management, permission registry).

## Related
ADR-0002 (shared auth session), `packages/auth/AGENTS.md`, `apps/web/auth/AGENTS.md`, `docs/security.md`.

## Email verification gates (ADR-0018)
`email_verification.require_verified_email(user, action)` raises `EmailNotVerifiedError` (403, detail starts `email_verification_required:`). Sign-in and browsing never call it. Gates: `assignments.create_user_role_assignment` (staff role), `organisations.members.accept_invitation` and `change_role` (admin or owner), `bookings.public.create_booking` (signed-in payer when a deposit is due; guests have no account, so they are not gated). Staff approval (`baseline.service`) is administrator-mediated and deliberately exempt. Payout details: none exist (`payments.create_payout` only appends a superuser ledger entry), so no gate yet; add one where payee details are first stored. Tests: `tests/auth/test_email_verification_gates.py`.

**Owner/admin membership and the exempt list.** `organisations.service.add_member` now requires a verified email for OWNER and ADMIN (the events organiser request goes through it), unless the caller passes `skip_email_check=True`. Exempt callers (administrator-mediated, ADR-0018): `src/events/backfill.py` and `events.service.create_organiser` (admin-created organisers and the demo seed). The self-service `request_organiser` checks `require_verified_email` itself, so it stays gated. Tests and fixtures use verified users.

**The deposit gate is advisory until a host forwards the session.** `optional_account` treats a missing, invalid, app-scoped or activation-pending token as a guest, and the public booking site sends no bearer today, so nothing is refused in production yet.

**Role editors.** `PermissionDef` has no hidden or key-only flag, so the ten API-key `<product>.<read|write>` keys show as grantable in the staff Permission table although granting them does nothing. Follow-up.

**Administrator-activated accounts are exempt (owner decision 2026-10-21).** The staff-role gate (`create_user_role_assignment`) and the owner/admin membership gates (`add_member`, `accept_invitation`, `change_role`) use `require_verified_or_admin_activated`: a verified email, or an `account_activation`/`activated` audit entry for the account. Only `onboarding.confirm_activation` writes that entry, and only for a link issued by an active superuser, so no schema change is needed. Self-registered accounts never have it and stay gated. The deposit gate and the self-service `request_organiser` stay strict. The exemption lapses when the account's email changes: `is_admin_activated` also requires `email_verification_required` to be false, which `confirm_activation` clears and both email-change paths in `auth.service` set again.

## Staff operations keys (ADR-0050, Proposed)
`events.ops.door|till|refunds|settlement|listings` are `binding="global"` staff keys held through `events-staff-*` roles. They are accepted only by `require_org_permission_or_staff` on Events org-zone routes, which resolves them through `effective_roles` (honours `user_role_assignment.effective_to`) and never through `has_permission` or `has_effective_permission` (those imply every global key for a superuser, and `has_permission` ignores expiry). MFA uses `privileged_mfa.require_mfa_session(..., app_key="events")` directly, whatever `AUTH_PRIVILEGED_MFA_MODE` says. Open gap: role assignments need an `hr.organisation` and employment, so event-night helpers with an end date are unresolved (ADR-0050 decision 8). Staff have no `events.team.manage` counterpart.

## Privileged MFA default (issue #501, 2026-10-25)
`AUTH_PRIVILEGED_MFA_MODE` is unset by default and resolves to `enforce` outside `ENVIRONMENT=local` (`disabled` locally; set `disabled` explicitly to opt out). Unenrolled privileged accounts get 403 whose detail starts `Set up two-step verification` and ends `(mfa_enrolment_required)`; web apps match the prefix, so keep it. Account security and sign-in use `get_account_user` and stay open so people can enrol. Enrolling on a privileged account emails the owner (`devices.schedule_authenticator_added_alert`, detection only). Superusers are also gated on Events `require_moderator`/`require_organiser`. Open gap: a stolen password can still enrol an attacker's authenticator (no confirmation code).
