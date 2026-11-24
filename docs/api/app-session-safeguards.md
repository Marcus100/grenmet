# App session safeguards

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-16

Per-app settings on `AppDefinition` (`apps/api/fastapi/src/auth/apps.py`), from
ADR-0061. Moved here from `src/auth/AGENTS.md`, whose instruction chain is at the
Codex byte budget.

All three default off, so no existing app changes. Tests: `tests/auth/test_app_session_safeguards.py`
and `tests/auth/test_app_handoff.py`.

- **`max_session_hours`** (session cap). `sessions.create_session` sets
  `expires_at = min(normal expiry, signed_in_at + cap)` for every new session of the app.
  `rotate_session` carries `signed_in_at` through each refresh. `session.signed_in_at`
  (nullable, migration `authsessionsignedin20261116`) is the original sign-in; NULL rows
  fall back to `created_at`, so there is no backfill.
  - A handoff redeem counts from the account session's original sign-in
    (`source.signed_in_at or source.created_at`), so a handoff never restarts the cap.
    A handoff whose account session is already past the cap is refused with 401.
  - Refusal revokes the session. `sessions.app_refuses` decides, and
    `sessions.end_refused_session` revokes. Refresh (`/auth/sessions/refresh`) and the
    access-token exchange (`/auth/sessions/access-token`) both call it, so no token is
    minted from a refused session afterwards.
- **`require_authenticator`**. A person with `totp_enabled` false is refused, with
  `apps.authenticator_required_error`:
  - HTTP 403, with the sentence "Add an authenticator at auth.barrels.gd/security to
    sign in to <app label>." in `detail` and the stable code `authenticator_required`
    in the body's `code` field. The code is not in the OpenAPI schema, which still
    documents only `detail`; the change is additive.
  - Sign-in (`app_service`): email code, password, Google and phone check it after the
    proof of identity and before any role grant, and `_session_response` checks it again
    (the backstop that covers handoff). A refused sign-in creates no session.
  - A brand-new address with a correct code is refused before the account is created,
    and the code is not spent. An unknown address and a known one get the same refusal,
    because the code proves the mailbox.
  - Handoff redeem refuses when the account session has `mfa_verified_at` null, with
    the sentence "Sign in on auth.barrels.gd with your authenticator, then open <app
    label> again." and the same code. Sign-in and authenticator setup live on the auth
    app (account only does single sign-on); when ADR-0057 moves security into the
    account app, change these sentences, their pinned tests and this page together.
  - Per request, `app_dependencies.user_for_app` refuses a token whose person has lost
    the authenticator (403, same code). Refresh revokes the session and refuses (401).
- **`privileged_members`**. Holders of the app's `app.<key>.access` follow the privileged
  enrolment rules through `privileged_mfa.is_enrolment_privileged` (`is_privileged` or
  such an app). `totp_enrolment` uses only this, so the first authenticator needs an
  emailed code (or a session opened by an emailed code in the last 10 minutes, ADR-0059
  rule 2). A successful enrolment ends the person's other sessions, and the email change
  is blocked until two-step is on. Sign-in enforcement (`require_privileged_mfa`),
  `mfa_rollout` and the sign-in-setup ceiling keep `is_privileged`, so a holder who is
  not privileged does not need an authenticator to use other apps.

Printix is switched on in `src/auth/apps.py` with `max_session_hours=12,
require_authenticator=True, privileged_members=True` (tests:
`test_printix_*` in `tests/auth/test_app_session_safeguards.py`). Every other app keeps the
defaults.
