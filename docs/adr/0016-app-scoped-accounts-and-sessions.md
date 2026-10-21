# ADR-0016: App-scoped accounts and sessions

## Status

Accepted (2026-10-03). Applies to Barrels Events now; other apps migrate later,
one at a time, each with its own review.

Amended 2026-10-21 for app tokens on organisation routes (last section). Amended by ADR-0017 (single sign-on handoff) on decision 1 ("no cross-app SSO"). Updated 2026-10-20: `src/auth/apps.py` now registers `events`, `gaa-admin`, `cms` and `barrels-admin`.

## Context

All web apps share one sign-in (`auth.barrels.gd`) and one session cookie on
`.barrels.gd` (ADR-0002). That suits staff tools but not public products:
Barrels Events opens sign-up to residents, who must never reach GAA or GMS staff
tools, and the owner wants each subdomain to have its own sign-in, session,
cookie and analytics, with access granted per subdomain and then per module.

Access tokens were not tied to an app, so any signed-in account's token worked
on every endpoint that only required "signed in".

## Decision

1. **Shared accounts, separate sessions.** One `user` table. A self-service app
   signs people in on its own pages through `/api/v1/auth/apps/{app}/...` and
   stores the session secret in its own host-only cookie (for Events,
   `events_session` with no `Domain`). There is no cross-app single sign-on.
2. **App registry.** `src/auth/apps.py` lists the scoped apps (key, URL,
   self sign-up, default role, Google redirect URI, enabled methods).
   Free-form `app_name` values on legacy sessions are not scoped; legacy
   `/auth/sessions` may not claim a registered key.
3. **Access is a permission.** `app.<key>.access` grants the app; module keys
   (`events.member.write`, `events.organiser.manage`, `events.moderate`) narrow
   it. Self sign-up grants only the app's default role (`events-member`) as a
   plain role link, never an organisation-scoped assignment.
4. **Tokens carry the app.** App sessions mint access tokens with an `app`
   claim. `get_current_user` (every staff route) refuses them; app routes use
   `app_user(key)` / `optional_app_user(key)`, which accept only their own app's
   tokens and require an active account holding the app permission (email
   verification is not required; see the 16 October 2026 amendment in ADR-0017).
5. **Staff approval stays separate.** Self-service accounts keep
   `registration_pending=True`, so the existing staff gate continues to refuse
   them everywhere else. App eligibility ignores that flag.
6. **Sign-in methods.** Email one-time code (passwordless; the account is
   created only after the code is verified), email and password, Google (per-app
   redirect URI; Google is trusted only for addresses it manages), and phone or
   WhatsApp codes for numbers linked to an existing account. Phone delivery is
   provider-agnostic and `disabled` until a provider is chosen, because every
   message costs money; `console` logs codes in local development only.

## Consequences

- Residents and staff share identity but not sessions or access; revoking the
  app role or deactivating the account ends app sessions at the next exchange.
- Each app must implement its own sign-in pages, cookie handling and
  `/auth/logout` routes (pattern: `apps/web/events`).
- Phone-only sign-up is not possible while `user.email` is required; changing
  that is a separate decision.
- Passkeys are the recommended next method; they need a new dependency.
- Migrating a staff app means adding it to the registry, its access permission
  and default role, and switching its pages to app-scoped sign-in.

## App tokens on organisation routes (amended 2026-10-21)

Decision 4 kept app tokens out of every staff route. Barrels Bookings needs its
own sign-in (decision 1) to reach organisation-zone routes, because a studio's
staff are organisation members. The rule:

- An app token may reach an organisation route only where that route opts in
  for the same app through `session_app` on `require_org_app` or `org_or_key`
  (`src/organisations/dependencies.py`, `api_key_auth.py`). Without
  `session_app` every app token is a 401, and so is a token whose `app` claim
  names a different app than the one the route opted in for.
- The opt-in path is `resolve_org_caller`: `decode_bearer` validates the JWT,
  then `user_for_app` requires an active account holding `app.<key>.access`,
  then the unchanged organisation checks run: membership (404 for outsiders),
  role, suspension and the organisation's entitlement. The app token adds no
  organisation access of its own.
- `get_current_user` and `AccountUser` still refuse app tokens, so nothing
  outside an opted-in route changes.
- The audit actor is set to the resolved user on this path, as it is for an
  account token.
- Bookings opts in (`session_app="bookings"`) on its six organisation aliases:
  four in `bookings/router.py` and two in `bookings/settings.py`. Its
  `GET /bookings/me/organisations` (zone `me`) accepts the same session through
  `resolve_org_caller`. Storage and models_guidance are the older precedents
  (they accept an app token with their own resolution); moving them onto the
  shared helper is pending.
- Considered and rejected: (B) exchanging the app token for an account token at
  the organisation boundary, which would hand a self-service session a general
  account credential; and (E) hosting the studio inside the auth app, which
  would drop the per-app cookie and sign-in this ADR set out to give each app.
- Adding another app: register it in `src/auth/apps.py`, then pass
  `session_app="<key>"` only on the route families it needs. Do not widen
  `get_org_context`. Each such route needs a denial test for another app's
  token and for a non-member.
