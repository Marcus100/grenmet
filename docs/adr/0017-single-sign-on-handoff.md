# ADR-0017: Single sign-on handoff between app-scoped sessions

## Status

Proposed (2026-10-06). Amends ADR-0016 decision 1 ("There is no cross-app
single sign-on"). Implementation plan: `docs/exec-plans/app-sso-handoff.md`.

## Context

ADR-0016 gives every subdomain its own session and host-only cookie on top of
one shared account. The owner wants to keep that, while letting a person who is
already signed in at `auth.barrels.gd` open another app without typing their
password again. Each app's session must still be separate: ending it in one app
leaves the others signed in.

Today staff apps (gaa-admin, cms) still share one legacy cookie on
`.barrels.gd` (ADR-0002), so signing out anywhere signs out everywhere.

## Decision

1. **`auth.barrels.gd` holds an account session** in its own host-only cookie.
   It is the only session that can start a handoff.
2. **Handoff, not a shared cookie.** An app without a session redirects to
   `auth.barrels.gd/continue?app=<key>&state=<random>`. If the account session
   is valid and the user is eligible for the app, auth asks FastAPI for a
   one-use handoff code and redirects to that app's registered callback URL.
   The app redeems the code server-side and gets its own new session.
3. **Codes are single-use, hashed, valid for 60 seconds** and bound to the app
   and the `state` value (stored in `AuthChallenge`). The redirect target comes
   from the app registry (`src/auth/apps.py`), never from the request. Only the
   app's web server can redeem a code: it must present the app's client secret,
   as an OAuth confidential client does. Apps without a secret don't take part.
4. **The registry says which apps take part** (those with a client secret) and what token an app
   session mints: `scope="app"` (ADR-0016 app claim; Events) or `scope="staff"`
   (unscoped staff token with the staff approval gate; gaa-admin, cms), so
   existing staff routes keep working.
5. **Sign-out:** an app's logout ends only that app's session; signing out at
   `auth.barrels.gd` ends the account session and every app session.
   The sessions page lists sessions per app, each with its own end action.
6. **Eligibility is unchanged:** the handoff checks `app.<key>.access` exactly
   as a direct sign-in does, so a resident's account never reaches staff tools.
   Staff apps require an admin to grant access.
7. **Joining is explicit, once.** The first handoff to a self-sign-up app (Events)
   shows a one-click "Join <app>?" screen on auth; accepting grants the app's
   default role. Later visits are silent.
8. **Public accounts and staff requests (step 4).** Anyone can sign up and sign
   in at auth.barrels.gd; staff approval moves from sign-in to staff routes and
   staff-app handoffs. Accounts ask for staff access from their account page,
   and only those requests (plus approved staff) appear in staff setup.

## Consequences

- Each subdomain keeps its own cookie, session, logout and analytics (ADR-0016),
  with no password prompt when the account session is already live.
- A stolen account session can mint app sessions; the account session therefore
  keeps 2FA, new-device alerts and "sign out everywhere".
- `SESSION_COOKIE_DOMAIN` and the shared `.barrels.gd` cookie are gone (step 3):
  every app has its own cookie name, so leftover `grenmet_session` cookies are
  ignored and everyone signs in again once.
- Every participating app adds `/auth/start` and `/auth/callback` route
  handlers (helpers in `@barrelsgd/auth/server`).


## CMS access amendment — 7 October 2026

Owner-approved: system administrators may explicitly grant any existing Barrels
account Writer or Publisher access to CMS, independent of GMS employment.
Publishers manage all CMS content but cannot grant access. No grant is the default.
CMS therefore uses app-scoped tokens, replacing its initial staff-token path;
GAA Admin retains the staff gate. See the [CMS access guide](../../apps/web/cms/README.md).
