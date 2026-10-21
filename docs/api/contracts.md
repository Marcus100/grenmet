# API Contracts

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-07

This guide documents the current FastAPI contract conventions. It complements the generated OpenAPI schema at `apps/api/fastapi/openapi.json` and the generated TypeScript client in `packages/api-client`.

## When to update this document

Update this document whenever you:
- Add or remove a public or CAP endpoint
- Change authentication requirements on an existing endpoint
- Change the error shape or add a new error category
- Change pagination defaults or response structure
- Add a webhook endpoint or change its verification behaviour

This document must stay in sync with the code. Do not mark a gap as resolved until the implementation exists.

## Scoped HR account administration

`GET /api/v1/auth/users` calculates rows and counts from the caller's active employer and department `user.manage` assignments; per-ID reads and profile corrections use the same boundary. Global account creation, activation, credentials, app/platform privilege changes and deletion require a superuser. Unplaced and personal accounts are excluded from departmental management.

`GET /api/v1/auth/roles` permits scoped managers to list only canonical ordinary roles eligible for delegation. Role definition reads by ID and all definition mutations remain superuser-only. Role assignment create/update/revoke permits managers to grant `staff` with `SELF` scope to another employee in scope, bounded by canonical permissions and the issuer's active authority. Explicit managerial and special-duty appointments require a superuser.

Role assignment responses include `authority_assignment_id` (null for explicit grants) and `is_effective`, which list/get calculate from live authority and expiry. Revoking authority disables its dependent grants immediately. See [department authority](../hr/department-authority.md) for scope and audit rules.

`GET /api/v1/auth/access/me` returns the compatible, default-empty
`all_scope_permission_keys` projection alongside `permission_keys` and the
explicit `is_superuser` bypass. Only permissions from live `ALL` assignments and
never-scoped legacy roles enter the projection; department/SELF authority cannot
borrow the scope of another role, and expired/revoked authority cannot fall back
to its legacy role link. This field does not remove any organisation boundary or
permission-specific rule. The compatible, default-empty `global_permission_keys`
projection includes only preserved never-scoped legacy authority; canonical
department-manager appointments require live scoped grants and cannot enter it.
Shared HR shift and public-holiday definitions require this global
`roster.manage` authority or a superuser for writes; organisation `ALL`,
department and SELF grants cannot mutate definitions shared by other employers.

## Base URLs

| Environment | API base URL |
| --- | --- |
| Local | `http://localhost:8000` |
| Staging | `https://api.staging.barrels.gd` |
| Production | `https://api.barrels.gd` |

Versioned FastAPI routes use `/api/v1`. Public CAP feed routes use `/api/cap`.

## Email delivery webhook

`POST /api/v1/webhooks/resend` is a provider callback excluded from OpenAPI and
the generated browser client. Outside local development it requires a configured
Resend signing secret and valid Svix headers. Verification accepts only `v1`
HMAC signatures over the original bytes, supports multiple rotation signatures,
and rejects timestamps outside the five-minute tolerance. Invalid credentials or
signatures return 401; signed invalid JSON, invalid encoding or malformed event
envelopes return 400. Valid events return `{"received": true}`. Delivery events
are logged. `email.bounced` with `bounce.type` `Permanent` and `email.complained`
add the address to `email_suppression` (idempotent on replay); complaints also
unsubscribe it from every mailing list. Non-transactional outbox mail skips
suppressed addresses; transactional mail does not.

## Public forms

Anonymous, rate-limited (per IP) endpoints back public site forms. They
never read existing data and return a fixed acknowledgement. Since PF1
(ADR-0025 N1/N2), forms name an organisation-owned **public site** in the path.
The site row (`org.public_site`) holds the inbox, the origin and the Turnstile
policy (`inherit`, `off`, or `enforce` with the site's own encrypted secret).
`GET /api/v1/organisations/public/sites/{site_key}` (`organisationsGetPublicSite`)
returns what a site needs to render its forms (name, accepted forms, Turnstile
site key), never a secret. Superusers manage sites through
`/api/v1/organisations/admin/sites`; organisation admins read theirs through
`GET /api/v1/organisations/org/sites`.

- `POST /api/v1/contact/public/{site_key}/messages`
  (`contactSendSiteContactMessage`) and `POST /api/v1/subscriptions/public/{site_key}`
  (`subscriptionsSubscribeToSite`) are the site-keyed forms. Both return 404 for an
  unknown site, a suspended owner, or a form the site does not accept.

- `POST /api/v1/subscriptions` (`subscriptionsSubscribe`, **deprecated**; use the site route): double opt-in sign-up
  for a list key (`signal`, `barrels`, `gms-alerts`); the reply is identical for every address state.
  `GET /subscriptions/confirm` and `/subscriptions/unsubscribe` take a signed
  `token` and 303-redirect to the list's site.
- `GET /api/v1/push/vapid-public-key` (`pushVapidPublicKey`), `POST` and
  `DELETE /api/v1/push/subscriptions` (`pushSubscribe`, `pushUnsubscribe`):
  browser Web Push for the `gms-alerts` list. Endpoints must belong to a known
  push service; `enabled: false` / 503 until the `WEBPUSH_*` keys are set.
- `POST /api/v1/contact/messages` (`contactSendContactMessage`, **deprecated**; use the site route): stores a
  website message and emails it to the inbox of its `site` (`mbia` by default,
  or `barrels`). `turnstile_token` is verified when `TURNSTILE_ENABLED` (400 "Verification failed").
- `POST /api/v1/contact/data-requests` (`contactSendDataRequest`): GMS climate
  data request (structured fields, required `consent`, hidden `website`
  honeypot). Emails `GMS_DATA_REQUEST_RECIPIENT` and confirms to the requester.
- `POST /api/v1/feedback` (`feedbackSendPageFeedback`): anonymous "Was this page
  helpful?" answer (`site`, `page_path`, `helpful`, optional `comment` up to
  1000 characters); 10/min per IP; stores no personal data.

See [integration readiness](../operations/integration-readiness.md) for matching
environment endpoints and provider setup. Changes to this hidden callback's
implementation do not alter generated client types; changing its registration,
signature or schema exposure still invokes the contract companion gate.

## Public flight board

`GET /api/v1/flights/board?airport=TGPY&board=arrivals|departures`
(`flightsGetFlightBoard`) is anonymous and rate-limited (60/min per IP). It
returns Redis-cached OpenSky "recent movements" (`rows` with callsign,
`time` seen, `other_airport_icao`), `source`, `fetched_at` and `is_sample`
(always false). `available` is false when `FLIGHTS_OPENSKY_ENABLED` is off
(the default) or nothing is cached; clients must show their own labelled
sample then. Data is previous-day-or-earlier and research-licensed; see
`docs/strategy/integration-opportunities.md`.

`GET /api/v1/environment/marine?point=` and `GET /api/v1/environment/air?point=`
(`point` is one of `st-georges`, `grenada-east`, `grenada-south`, `carriacou`)
are anonymous and rate-limited (60/min per IP). They return stored Copernicus
Marine (waves, swell, sea surface temperature) and CAMS (UV index, dust AOD)
forecast series with `latest`, `provenance` (`source`, `issued_at`,
`fetched_at`, `status: external`), `attribution`, `stale` and
`is_gms_product: false`. `available` is false when credentials are unset or
nothing has been fetched; clients must show an unavailable state, never sample
data. Responses carry `Cache-Control` with `s-maxage` for Cloudflare. See
`apps/api/fastapi/src/environmental/AGENTS.md`.

## Model guidance (gmsdash)

`GET /api/v1/models/meteogram?point=&model=` returns a stored point series
(ECMWF IFS open data, ECMWF AIFS, NOAA GFS) with run time, units, attribution
(ECMWF CC-BY-4.0; GFS public domain) and the disclaimer "Raw model guidance, not
an official GMS forecast." `GET /models/catalogue` lists points and models.
Access: a member of an organisation entitled to the `gmsdash` app (header
`X-Barrels-Organisation`, `gmsdash` app token or account token), or GMS staff
with `gmsdash.guidance.view` (no organisation header). A non-member gets 404, a
member of a non-entitled organisation 403. Organisation owners and admins
request access with `POST /models/access-requests`; staff with
`gmsdash.access.review` list them (`GET /models/access-requests`) and decide
(`POST /models/access-requests/{id}/decision`), which enables the `gmsdash`
entitlement. `GET /models/organisations` and `GET /models/access` support the
gmsdash app. Ingestion is off unless `MODELS_GUIDANCE_ENABLED`. See
`apps/api/fastapi/src/models_guidance/AGENTS.md`.

## Public weather products

`GET /api/v1/wxproducts/public/products` is anonymous. Optional `kind` filters
morning, midday, evening, outlook, cyclone, marine, flood, thunderstorm, wind,
heat, dust, coastal, or tsunami products. An omitted or empty filter lists all kinds.

Success is `{ "products": [...] }`, including an empty list when nothing is current.
Each snapshot has `id`, `revision`, `publishedAt`, `kind`, and `values` (string values).
Drafts, actor details and revision history are never selected. Products are ordered
by descending stored `values.issuedAt`. Invalid kinds return 400;
unconfigured/unavailable storage returns 503. Errors use `{ "error": "..." }`.
Responses use `Cache-Control: no-store`.

Publication must have occurred, issue/validity start must be reached, and validity
end is exclusive. Form timestamps use Grenada UTC−04:00. Morning (07:00) and
midday (12:00) forecasts expire the next day at 07:00; evening (18:00) forecasts
expire at 07:00 five days after the issue date, covering tonight plus four days.
Forecast boundaries are derived from the issue date, matching the existing editor.
Other product kinds use their explicit issue and validity fields.

`GET /api/v1/wxproducts/public/products/{id}` (added 30 Sep 2026) is the anonymous
read behind editorial links (CMS desk posts and report write-ups). It returns
the same snapshot fields plus `current` (boolean). Unlike the feed, it stays
readable after the validity window ends; `current` is then false. A republished
product returns its newest revision. Withdrawn, unpublished, future-dated or
unknown IDs return 404, a malformed ID returns 422, and unavailable storage
returns 503. Errors use `{ "error": "..." }`, with `Cache-Control: no-store`.

GAA Admin's existing `/api/public/products` forwards anonymously to this FastAPI
route using its configured `AUTH_API_URL` and `AUTH_API_V1_STR`. The GMS website's
URL and response shape are unchanged. FastAPI needs `WXPRODUCTS_DATABASE_URL`
pointing to the existing separate weather database before this forwarding route
can serve products. FastAPI owns authored-product writes and migrations in the separate weather database.
Weather models use isolated metadata and never enter the main database migration
history. Weather editor requests now use browser HTTP calls through runtime same-origin rewrites (`/_backend/weather/*`). FastAPI accepts either the existing bearer token or the opaque session cookie on private weather endpoints. An explicitly supplied invalid Authorization header never falls back to cookies.

`GET /api/v1/auth/browser/session` validates the session cookie and returns `{userId, csrfToken}` with `Cache-Control: no-store`. It never returns the session secret or a bearer token. Cookie-authenticated weather mutations require `X-CSRF-Token`, bound to that session; a supplied Origin must match FastAPI's configured CORS origins. Session expiry/revocation and live account restrictions are checked on every request. Other domains remain bearer-only. Login, session rotation, logout and cross-domain SSO are unchanged in this slice. Hono is deferred.

## Weather authoring

These endpoints require a bearer token and evaluate the existing live GMS product
access policy on every request. Account activation alone grants no authoring access.

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/wxproducts/products` | `{ products: StoredProduct[] }`; all authorized authored product kinds/dates, including drafts and historical products; newest update first with ID tie-break. Optional `kind` and `issue_date` filters (date includes undated drafts), `limit` (1–100, default 100), `offset` (default 0). |
| `POST /api/v1/wxproducts/products` | Body: `id`, `expectedRevision`, `kind`, `values`, `action` (`draft`, `publish`, `withdraw`), `changeSummary`, `reviewed`; returns `StoredProduct` |
| `GET /api/v1/wxproducts/products/{id}/history` | `{ history: [...] }`; up to 100 newest permitted revisions, exposing action, revision, actor name, note and timestamp, never revision content or actor IDs |

`StoredProduct` preserves the editor shape: `id`, `kind`, `values`, `revision`,
`publishedRevision` (nullable), and `updatedAt`. Errors use `detail`: a string for
application errors, or an array for request-schema errors. Statuses include 401
(authentication), 403 (access), 409 (stale revision/invalid withdrawal), 422
(validation), and 503 (storage unavailable). Successful private responses are
`no-store`. Inaccessible/missing history returns an empty list without exposing
another product's content.

Drafts can be incomplete. Publication requires valid visible fields, preview
confirmation, non-expired validity, and a note after the first save. Withdrawal
requires a reason and retains the saved draft. FastAPI derives scheduled forecast
boundaries and actor identity; client-supplied actor fields are rejected. Saving a
new draft preserves the previous published snapshot. Product changes and immutable
revision history commit in one weather-database transaction. Concurrent first
saves and updates produce a conflict instead of silently overwriting records.

Kubb generates the request and response types from these Pydantic/OpenAPI schemas.
The editor's field definitions are checked against FastAPI's `fields.json`; browser
validation provides feedback, while FastAPI enforces the publication rules.

During the typed-products rollout, the `outlook` kind uses a discriminated union
with a typed `OutlookValuesDraft` payload for authoring and preview requests. Its
published values require the fields marked `requiredOnPublish` in `fields.json`.
The remaining kinds temporarily use the legacy string-value branch and will be
migrated independently. The anonymous public feed intentionally retains its
legacy-compatible `values: { [key: string]: string }` response until external
consumers of that feed have been inventoried.

## Documentation Endpoints

FastAPI docs are enabled only when `ENVIRONMENT` is `local` or `staging`:

| Endpoint | Purpose |
| --- | --- |
| `/swagger` | Swagger UI |
| `/redoc` | ReDoc |
| `/scalar` | Scalar API reference |
| `/api/v1/openapi.json` | OpenAPI JSON |

In production, the app disables `openapi_url`, Swagger, and ReDoc. Do not rely on production API docs being available.

## Generated Client Contract

`@barrelsgd/api-client` is generated by Kubb from `apps/api/fastapi/openapi.json`.

Source files:

- `packages/api-client/kubb.config.ts`
- `packages/api-client/src/gen/`
- `scripts/api/check-api-drift.mjs`
- `.github/workflows/ci-api-client.yml`

Rules:

1. Never manually edit `packages/api-client/src/gen/`.
2. After changing FastAPI route contracts, update `apps/api/fastapi/openapi.json`.
3. Run `pnpm generate:api-client`.
4. Run `pnpm check:drift`.
5. Run `node scripts/api/check-api-breaking.mjs --base origin/dev`. CI runs the same check on PRs into `dev` (`api-breaking-changes` workflow) and fails on a removed route or method, new required input, or removed or retyped output. Prefer an additive change; if a break is intended, update every consumer and label the PR `breaking-change`.
6. Commit `openapi.json` and generated client changes together.

CI also regenerates the client and fails if `packages/api-client/src/gen` differs from the committed output.

## Authentication

The API supports two auth paths:

| Flow | Endpoint | Use |
| --- | --- | --- |
| OAuth2 password grant | `POST /api/v1/auth/token` | Direct API consumers and tests |
| Web session | `POST /api/v1/auth/sessions` then `POST /api/v1/auth/sessions/access-token` | Browser apps using an opaque session cookie |

Every auth route lives under `/api/v1/auth`. On 16 October 2026 the remaining
outliers moved, with no aliases (operation IDs unchanged unless noted):

| Before | After |
| --- | --- |
| `/login/access-token` | `/auth/token` |
| `/login/session`, `/login/session/{access-token,refresh,logout,logout-all}` | `/auth/sessions`, `/auth/sessions/{access-token,refresh,logout,logout-all}` |
| `POST /login/test-token` (`authTestToken`) | `GET /auth/staff/me` (`authGetStaffMe`): the staff gate check |
| `POST /password-recovery/{email}` | `POST /auth/password/recovery` with `{ "email" }` in the body |
| `POST /password-recovery-html-content/{email}` | `POST /auth/password/recovery/preview` with `{ "email" }`; subject in `X-Email-Subject` |
| `POST /reset-password/` | `POST /auth/password/reset` |
| `/auth/modern/email/{request,confirm}` | `/auth/password/setup`, `/auth/password/setup/confirm` |
| `/auth/modern/{email-code,google}/*` | `/auth/{email-code,google}/*` |
| `/auth/modern/security*` | `/auth/users/me/security*` |
| `GET /2fa/status`, `POST /2fa/{setup,activate,disable}` | `GET /auth/users/me/security/2fa`, `POST /auth/users/me/security/2fa/{setup,activate,disable}` |

### App-scoped sign-in (ADR-0016)

**Joining apps (16 October 2026).** Every app with sign-in asks "Join <app>?"
once: the handoff returns 409 until it is called with `join: true`.
Self-service apps (Events, weather, mbia, signal, docs, elections) then join
instantly. GAA Admin (`scope="staff"`): the 409 detail starts "Request access";
`join: true` records `staff_access_requested_at` and returns 403
`"Your request is waiting for an administrator to approve it."` until an
administrator approves. CMS cannot be joined (superuser grant). On
`POST /auth/account/apps`, `AccountAppPublic` adds `can_join` and `pending`;
`POST /auth/account/apps/{app}/join` returns `{joined, pending}`. Email
verification never gates any of these. `OnboardingStatus` no longer reports an
`email_verification` blocker.

Self-service apps (Barrels Events first) sign people in on their own pages and keep
their own host-only cookie. All routes are public and rate-limited:

| Endpoint | Use |
| --- | --- |
| `GET /api/v1/auth/apps/{app}` | Sign-in methods offered and whether sign-up is open |
| `POST /api/v1/auth/apps/{app}/email-code/start` · `/verify` | Passwordless email code; account created on first verified code |
| `POST /api/v1/auth/apps/{app}/login` | Email and password |
| `POST /api/v1/auth/apps/{app}/google/start` · `/complete` · `/finish` | Google with the app's redirect URI |
| `POST /api/v1/auth/apps/{app}/phone-code/start` · `/verify` | SMS/WhatsApp code for linked numbers (disabled until a provider is configured) |
| `POST /api/v1/auth/account/apps` | List single sign-on apps with `joined` and `can_leave`; body is the auth.barrels.gd account `session_token` (an app session gets 401) |
| `POST /api/v1/auth/account/apps/{app}/join` · `/leave` | Join (default role) or leave (remove it and end that app's sessions only) a self sign-up app; `leave` returns `still_has_access` when another role keeps access; staff apps return 403 |
| `POST /api/v1/auth/apps/{app}/phone/link/start` · `/verify` | Signed-in member links a phone number |
| `POST /api/v1/auth/apps/{app}/handoff` | Single sign-on (ADR-0017): auth's server swaps the account session plus a `state` for a one-use, 60-second code and the app's `callback_url`. 409 = join required (retry with `join: true`), 403 = no access |
| `POST /api/v1/auth/apps/{app}/handoff/redeem` | The app's server swaps `code`, `state` and its `client_secret` for a new session in that app only |

Responses are `SessionLoginResponse`. Access tokens from these sessions carry an
`app` claim: staff routes return 401 for them, and app routes accept only their own
app's tokens. `/auth/sessions/access-token` and `/auth/sessions/refresh` keep the
claim for app sessions. The cookie-authenticated routes (`/auth/browser/session` and
the `BrowserUser` routes) refuse app-scoped sessions, matching the token rule.
Single sign-on is available only for apps with a configured client secret
(`EVENTS_SSO_CLIENT_SECRET`, `GAA_ADMIN_SSO_CLIENT_SECRET`, `CMS_SSO_CLIENT_SECRET`).
Only the account session from auth.barrels.gd (a session belonging to no registered
app) can start a handoff. Staff apps (`gaa-admin`, `cms`) have no sign-in routes of
their own: their handoff requires an approved staff account and their sessions mint
ordinary staff tokens without an `app` claim. `POST /auth/sessions` ignores an
`app_name` that names any registered app. The cookie-authenticated routes read
GAA Admin's host-only cookie, `admin_session` (`BROWSER_SESSION_COOKIE_NAME`).

**Public accounts (ADR-0017 step 4).** Any active account can sign in at
auth.barrels.gd (`POST /auth/sessions`, Google) and hold an *account session*:
a session that belongs to no registered app. Its token has no `app` claim, but
staff approval (`registration_pending=false`) is still required by every staff
route. Only these self-service routes accept unapproved accounts (`AccountUser`):
`GET /auth/users/me`, `PATCH /auth/users/me/password`, `/auth/users/me/security/2fa*`,
`GET /auth/users/me/security`, `POST /auth/users/me/security/recovery-codes`,
`DELETE /auth/users/me/security/sessions/{id}`, `GET /auth/access/me` and
`POST /auth/users/me/staff-access-request`. The last one sets
`UserPublic.staff_access_requested_at` (idempotent); staff setup
(`GET /setup/staff`) lists approved staff plus accounts that asked.
`POST /auth/token` (machine clients) still requires staff approval.
`POST /auth/email-code/start` and `/verify` sign in to the account with a
6-digit emailed code (the first verified code creates the account when sign-up is
open); they open the same account session as password and Google sign-in.

Public sites registered for single sign-on (`weather`, `mbia`, `signal`, `docs`,
`elections`) have no sign-in routes of their own and `join_prompt=False`: the
handoff grants their `<key>-member` role (`app.<key>.access`) on first visit
instead of returning 409. Events keeps the "Join" prompt.

Browser apps should store only the opaque session token in an `httpOnly` cookie. Server Components or route handlers exchange that session token for a short-lived bearer token before calling FastAPI.

Session login, refresh, and session-token exchange responses return the deliberately
reduced `SessionUserPublic` projection (`id`, `email`, `full_name`, `is_active`, and
`is_superuser`), not the full `UserPublic` profile. `token_type` is the literal
`"bearer"`; both shapes are generated into the shared client.

## Error Shape

The current API uses FastAPI-style JSON errors, not RFC 7807 Problem Details.

Implemented examples:

| Situation | Shape |
| --- | --- |
| `AppException` | `{"detail":"message"}` |
| Pydantic validation handler | `{"detail":"Validation error","errors":[...]}` |
| Database integrity error | `{"detail":"Resource already exists or constraint violation"}` |
| FastAPI `HTTPException` | `{"detail": ...}` |
| Rate limit exceeded | SlowAPI's 429 response |

The generated FastAPI `ValidationError` schema includes optional `input` and
`ctx` fields alongside required `loc`, `msg` and `type`. Clients must tolerate
those optional fields; they do not change application route definitions.

Contract rule for new endpoints: return structured JSON errors and document non-obvious status codes in the route `responses` metadata.

## Request IDs

Every response carries an `X-Request-ID` header (exposed to browsers through CORS).
A caller may supply its own `X-Request-ID` of 8–64 characters from `A-Z a-z 0-9 . _ -`
and the API echoes it back; anything else is replaced with a random 32-character
ID, so the header cannot inject log content. The same ID is written to every log
line for that request (`request_id` in JSON logs) and set as the `request_id`
Sentry tag, so a failed call can be traced from the browser to the API log and
the Sentry event. It is random and carries no user data. The header is not part
of the OpenAPI schema.

## Organisations (ADR-0022)

Platform organisations live in the `org` schema. `GET /api/v1/organisations/mine`
returns the signed-in account's active memberships (`membership_id`, `role`
`owner | admin | member`, `status`, `joined_at`) each with an organisation summary
(`id`, `slug`, `name`, `kind` `barrels | client | business`, `status`,
`verified_at`). It needs any active Barrels account, not staff approval. Existing
HR employers keep their `hr.organisation` id (for example `gaa`); new
organisations get immutable `org_<hex>` ids.

Control plane (superuser only, used by `apps/web/admin`): `GET /api/v1/organisations`
lists every organisation ordered by name (`page`, `size`, `q` on name or slug,
`status`, `kind`) with `active_member_count`, and `GET /api/v1/organisations/{id}`
adds the app entitlements (`apps`). Both return 403 to non-superusers, including
organisation owners, and 404 for an unknown id. They read across organisations on
purpose and take no `X-Barrels-Organisation` header. The detail also lists
`available_apps` (every key in the app registry).

Control-plane writes (superuser only, all return the refreshed detail and are
audited under the `platform_organisation` history subject): `POST /organisations`
(`name`, `kind` barrels, client or business, optional `slug`; 409 when taken),
`PATCH /organisations/{id}` (`name`, `slug`, `kind`, `status` active or
suspended; at least one field), `POST /organisations/{id}/verify` and
`/unverify` (body `{reason}`, 3 to 500 characters; 409 when already in that
state), `PUT /organisations/{id}/apps/{app_key}` (body `{enabled}`; 422 for a key
outside the registry) and `GET /organisations/{id}/admin/members` (roster of any
organisation). A suspended organisation is refused with 403 by every
`X-Barrels-Organisation` route. A verified organisation shows its linked Events
organiser as `verified`.

### Organisation context

Routes that act for one organisation read it from the `X-Barrels-Organisation`
request header (an `org_<hex>` id, or a legacy HR key such as `gaa`) through the
`OrgContext` dependency (`src/organisations/dependencies.py`). Browsers may send
the header cross-origin (it is in the CORS allow list).

| Situation | Status |
| --- | --- |
| Header missing or blank | 400 |
| Organisation unknown, or caller is not an active member | 404 `Organisation not found` (identical, so existence is not revealed) |
| Organisation suspended | 403 |
| Member whose role is too low for the route (`owner` > `admin` > `member`) | 403 |

There is no superuser bypass. The caller needs any active Barrels account (the
same as the account routes), not staff approval. A route family may opt in to the session of its own app
(`session_app=` on `require_org_app` / `org_or_key`; `/bookings/org/*` accepts the
bookings app session, issue #472): that JWT then needs an active account with
`app.<key>.access`, and the membership, role and entitlement rules above are
unchanged. Every other app's token stays 401. The resolved organisation id is
written to every log line for the request as `organisation_id`. A route is only
described as organisation-isolated if it uses `OrgContext` and has a
cross-organisation denial test.

`GET /api/v1/organisations/current` returns the header's organisation and the
caller's role.

### Members and invitations (F4)

All routes below need `OrgContext` with at least the `admin` role, and the path
`{organisation_id}` must equal the header's organisation (otherwise 404).

| Route | Behaviour |
| --- | --- |
| `GET /organisations/{id}/members` | Active members (`page`, `size`) |
| `GET /organisations/{id}/invitations` | Pending invitations |
| `POST /organisations/{id}/invitations` | `{email, role}`; emails a single-use link valid 7 days; re-inviting replaces the pending one; 409 if already a member |
| `DELETE /organisations/{id}/invitations/{invitation_id}` | Revoke (409 once accepted) |
| `PATCH /organisations/{id}/members/{membership_id}` | `{role}` |
| `DELETE /organisations/{id}/members/{membership_id}` | Sets the membership to `removed` |
| `POST /organisations/invitations/accept` | `{token}` in the body, any signed-in account; 400 unknown, expired, used or revoked; 403 when the invitation was sent to another email address |

Admins manage members and admins; only owners invite owners or grant, change or
remove the owner role. The last active owner cannot be demoted or removed (409).
Only a SHA-256 of the token is stored; the token appears only in the email link
(`/organisations/accept?token=` on the auth app). Changes are audited under the
`organisation` history subject (`GET /audit/organisation/{id}`, admins and owners).

### Events organisers (F5)

Events organiser payloads carry `organisation_id` (the platform organisation
backing the organiser, null for legacy organisers). `GET /events/manage` also
returns `organisers` (every organiser the member manages), and `GET /events/manage`,
`POST /events/manage/listings` and `PUT /events/manage/listings/{id}` accept an
optional `?organiser=<slug>` to act for one of them. Access is the
`events.organiser.manage` permission or an active admin/owner platform membership.
`POST /events/manage/organiser` (any Events member) creates an unverified organiser
backed by a new platform organisation with the caller as owner (409 for a taken
address or a second pending request); moderators verify it through
`PATCH /events/moderation/organisers/{id}`. Publishing, cancelling or rescheduling a
listing and approving an organiser also write `outbox` rows (same Events transaction)
that the worker turns into notifications; no endpoint is involved.
`GET /events/manage/{listing_id}/activity` returns that listing's append-only history
(`ActivityEntry`: action, actor id and current display name, changed-field summary),
newest first, for its organiser only.

### Events tickets (E1)

`POST /events/listings/{slug}/orders` (Events member, 20/minute) claims free or
registration tickets: `{items: [{tier_id, quantity}]}`, 201 with the order and its
tickets. 409 when a tier is sold out, the claim exceeds the tier's `per_account_limit`
(set by the organiser on the tier, default 4, counted over the account's valid
tickets and unpaid holds), a paid tier cannot be collected online (the organiser has
no platform organisation or no `payments` entitlement) or the event ended.
`TierPublic` carries `remaining` and the viewer's `held` count. `GET /events/me/tickets`
lists the member's tickets; `GET /events/me/tickets/{id}` adds `qr_token`, a signed
token (`BT1.<code>.<tag>`, no personal data) to render as the QR code;
`POST /events/me/tickets/{id}/cancel` cancels an unused ticket before the event
starts and puts the seat back on sale. `TierInput.id` updates an existing tier in
place; tiers with tickets issued cannot be removed or shrunk below their valid tickets.
Issuing tickets writes a `ticket.issued` outbox row for the buyer's notification.

### Events paid tiers (N4b, ADR-0027)

A paid tier makes the same call return an order with `status: "pending_payment"`,
`payment_required: true`, `tickets: []`, `payment_expires_at` and `checkout_url`
(Stripe test-mode Checkout; null when the organiser's staff record the payment by
hand through `POST /payments/org/intents/{id}/manual-payments`). The stock is held
until the hold (`EVENTS_ORDER_HOLD_MINUTES`, default 30) ends. All five fields are
additive and default to the free-order values (`confirmed`, false, null).
An optional `Idempotency-Key` header makes a retry return the same order (same key,
different items: 409). `GET /events/me/orders/{order_id}` (the owner only, else 404)
returns the order for polling after checkout: `confirmed` with its tickets once the
payment is captured, `expired` when the hold ran out, `refunded` after a full refund.
A payment that arrives after expiry is refunded in full and issues nothing. Paid
tickets cannot be self-cancelled (409); a refund through the payments core
(`POST /payments/org/intents/{id}/refunds`) cancels them. The settlement report gains
`online_payments` (orders paid, pending, collected and refunded, next to the payments
ledger's own totals and a `reconciled` flag), an `online_ledger_mismatch` discrepancy
and `online_collected_minor` on the overview rows.

### Events door admission (E2)

`POST /events/manage/{listing_id}/admissions` (organiser access, that organiser's event
only) admits a ticket from `{code, idempotency_key?}`; `code` is the scanned QR token or a
typed ticket code. 200 returns the holder, tier and who admitted it; repeating the same
`idempotency_key` replays that success (`repeat: true`). Any other second scan, a cancelled
ticket or another event's ticket is 409 (`Already admitted at HH:MM by <name>`); an unknown
code is 404. `GET /events/manage/{listing_id}/manifest` returns every valid ticket with its
holder, tier and admission time plus `issued`, `admitted`, `waiting` and `cancelled` counts.
Each admission writes a `ticket.admitted` row to the listing's activity history, and the
member's ticket carries `admitted_at`; used tickets cannot be cancelled.

### Events outlet cash (E3)

Organiser admins and owners (the door-admission gate; plain members are refused because
they would handle cash) sell for cash. `GET /events/manage/{listing_id}/outlet` returns tier
stock, the caller's till and recent outlet sales. `POST .../outlet/till`
(`{opening_float_minor}`) opens the caller's till for the Grenada day (one per staff member,
event and day; 409 if already opened) and `POST .../outlet/till/close` (`{counted_minor, note?}`)
closes it, returning expected cash and the difference. `POST .../outlet/sales`
(`{items, amount_collected_minor, buyer_name?, buyer_phone?, idempotency_key?}`) issues tickets
against the same inventory as online claims and returns the tickets with QR tokens;
`amount_collected_minor` must equal the price total, a till must be open, and a repeated
`idempotency_key` replays the original sale (`repeat: true`). `GET .../outlet/sales/{order_id}`
reprints a sale. Outlet buyers need no account (tickets have no `user_id`); the per-account limit
does not apply. Another organiser's event is 404.

### Events settlement (E4)

`GET /events/manage/{listing_id}/settlement` (organiser admins/owners; another organiser's
event is 404) returns tickets by channel (`online`, `outlet_cash`: `issued`, `claimed`,
`admitted`, `waiting`, `cancelled`, `refunded`, `value_minor`, plus cash taken), per-tier
stock, every till with expected, counted and difference, cash totals and `discrepancies`
(`till_short`, `till_over`, `till_open`). `GET .../settlement.csv` downloads the same report
as CSV. `GET /events/manage/settlement` returns one summary row per ticketed event.

### Events cancel, postpone and refund (E5)

`POST /events/manage/{listing_id}/cancel` (`{confirm: true}`) cancels a published event and all
its valid tickets (`tickets_cancelled` in the response) and notifies going, saved and
ticket-holding members through the outbox. `POST .../postpone` (`{starts_at, ends_at}`) moves a
published event to future times and keeps tickets valid. `POST .../tickets/{ticket_id}/refund`
(`{amount_minor, method: "cash"|"bank", reference?}`, 201) records a manual refund for an outlet
cash ticket: 409 for online tickets (free), free tickets, amounts above the price, a bank refund
without a reference, a ticket already refunded or cancelled by its holder, or a used ticket unless
the event was cancelled. Ticket `status` can now be `refunded`; refunded tickets are not
admitted. The settlement report lists `refunds` and per-channel `refunded`/`refunded_minor`.

## Platform foundations (PF-series, 2026-10-20)

Shared APIs for every Barrels app. Zones follow ADR-0025.

- **Public sites** (PF1): see [Public forms](#public-forms). Organisation routes of
  products require the organisation's entitlement (`org.organisation_app`, keys in
  `src/organisations/entitlements.py`: `bookings`, `rewards`, `contacts`); a missing
  entitlement answers 403 after membership is proven.
- **Organisation API keys** (PF5, ADR-0029): `/organisations/org/api-keys` (list,
  create, `{key_id}/rotate`, `{key_id}/revoke`), `/organisations/org/api-key-scopes`,
  `/organisations/org/key-info` and superuser `/organisations/admin/api-keys`. The
  secret `bk_<prefix>_<random>` is returned once; only its SHA-256 is stored. Keys
  authenticate with `Authorization: Bearer bk_…`, never as a user, and carry scopes
  `<product>.<read|write>`. Selected organisation routes accept either a signed-in
  member or a key (`organisations.api_key_auth.org_or_key`; a `bk_` bearer takes the
  key path, other errors keep their order for members): the bookings reads under
  `/bookings/org/` (`bookings.read`), `GET /rewards/programs` (`rewards.read`) and
  `POST /rewards/redemptions/confirm` (`rewards.write`). A key acts on its own
  organisation only (the organisation header is ignored), needs the scope and the
  organisation's entitlement (403), and a revoked or expired key is 401.
- **Feature flags** (PF7, ADR-0020): superuser `/feature-flags/admin` (CRUD,
  `/admin/stale`) and `GET /feature-flags/org/evaluate` and `/feature-flags/me/evaluate`,
  which return only flags marked exposed. `GET /feature-flags/public/evaluate?keys=a,b`
  is the unauthenticated variant for static sites (at most 20 keys, rate limited,
  `Cache-Control: public, max-age=30`; 600/minute per IP): callers must cache it (Next
  `revalidate` ~60 s) rather than call per visitor, and treat 429 or any error as flag
  off (fail closed). Anonymous subject, so only environment and
  `everyone` rules can be on; unknown and non-exposed keys are absent.
- **Rewards earn sources, Passport and achievements** (PF8/PF9, ADR-0030): programmes take
  a `qualifying_source_type` from the catalogue in `src/rewards/sources.py`.
  Organisation routes under `/rewards/org/...` manage venues, trails, stops,
  achievements, programme pause and resume, entries and redemptions;
  `GET /rewards/org/venues/{id}/qr-token` issues the rotating venue code. Account
  routes: `POST /rewards/me/check-ins` (one per venue per Grenada day, real-world
  only), `GET /rewards/me/passport`, `/me/achievements` and `/me/streak`.
- **Rewards social layer** (PF10, ADR-0030): every route answers 404 until its flag
  (`rewards-leaderboards`, `rewards-challenges`, `rewards-gifting`) is on; gifting also
  needs `REWARDS_GIFTING_ENABLED`, refused in production. Opt-in boards:
  `PUT|DELETE /rewards/me/leaderboard-opt-ins/{scope_kind}/{scope_id}` (withdrawal is
  never flagged), `GET /rewards/me/leaderboards/{scope_kind}/{scope_id}` (action counts
  only, max 50 rows, empty below 10 participants) and `GET /rewards/org/leaderboard`.
  Challenges: `/rewards/org/challenges` (create, pause, resume) and
  `GET /rewards/me/challenges` (collective totals, no identities). Gifting:
  `POST /rewards/me/gifts`, `GET /rewards/me/gifts/sent|received`,
  `POST /rewards/me/gifts/{id}/reverse` (passport souvenirs, never ledger entries).
- **Payments core** (PF4, ADR-0027, Stripe test mode only): organisation routes under
  `/payments/org/...` (intents, manual payments, refunds, balance; `payments`
  entitlement and organisation admin); signed provider callbacks at
  `POST /payments/public/webhooks/{provider}` (idempotent through the ledger, hidden
  from OpenAPI); superuser reconciliation, ledger, balances and payouts under
  `/payments/admin/...`, including `reconciliation.csv`. The ledger is append-only. A payout
  needs a client-generated `request_id`: repeating it returns the first entry (no double
  payout), and reusing it for different details is 409.
- **Reliability and public booking** (PF2, ADR-0026): writes that create things accept
  `Idempotency-Key`; repeating a request with the same key and body replays the first
  answer (`Idempotency-Replayed: true`), the same key with a different body is 409.
  Public booking (`/bookings/public/{slug}/bookings` and
  `/bookings/public/bookings/{token}` with `/cancel`, `/reschedule`, `/ics`) uses it; the
  manage token is returned once and only its hash is stored. Side effects (emails,
  reminders) run through the transactional outbox (`platform.outbox`, drained by the
  worker every 30 seconds), which gives at-least-once delivery.
- **Organisation contacts** (PF3, ADR-0028): `/contacts/org/contacts` (upsert, list,
  get, patch, consents, merge, erase) and superuser `/contacts/admin/contacts`. There
  are no public contact routes.

## Pagination

The standard helper is `src.pagination`:

- Query params: `page` and `size`.
- Defaults: `page=1`, `size=100`.
- Max size: `1000`.
- Response shape: `data`, `count`, `page`, `size`, `total_pages`.

Some older auth endpoints still use `skip` and `limit`. New list endpoints should use `get_pagination_params()` and `PaginatedResponse` unless there is a domain-specific reason not to.

## Health Endpoints

| Endpoint | Meaning | Expected response |
| --- | --- | --- |
| `GET /api/v1/utils/health-check/` | Liveness | JSON `true` |
| `GET /api/v1/utils/ready/` | Database readiness | `{"status":"ready"}` or 503 |

Deployment smoke checks currently use liveness. Operational diagnosis should use readiness when database access matters.

## Rewards (Barrels ID)

Stamp cards funded by organisations; non-monetary, non-transferable. Domain
rules: `apps/api/fastapi/src/rewards/AGENTS.md`.

| Endpoint | Authentication | Contract |
| --- | --- | --- |
| `GET /api/v1/rewards/me`, `/me/entries`, `/me/badges`, `/me/tickets` | Any active account | Cards with SQL-computed balances; history; derived trust badges; the account's Events tickets (read-only) |
| `POST /api/v1/rewards/me/redemptions`, `/me/redemptions/{id}/cancel` | Any active account | Hold a full card behind a one-time code; cancel an open redemption |
| `GET/POST /api/v1/rewards/programs`, `PATCH /programs/{id}` | `X-Barrels-Organisation`; list for members, write for admin/owner | Configure the organisation's stamp card |
| `POST /api/v1/rewards/redemptions/confirm` | `X-Barrels-Organisation`, any member | Staff confirm a customer's code (other organisations' codes 404) |
| `/api/v1/rewards/admin/programs`, `/admin/adjustments`, `/admin/flags`, `/admin/flags/{id}/resolve` | Superuser or `rewards.manage` | Read all programmes, audited adjustments, velocity review flags |

## Bookings (ADR-0024)

Shared, organisation-scoped appointments for every app and client site.
Frontend-agnostic: UTC times with the profile's IANA `timezone`, money in minor
units with `currency`, no HTML, links to a business's own pages only from profile
settings. Domain rules: `apps/api/fastapi/src/bookings/AGENTS.md`.

| Endpoint | Authentication | Contract |
| --- | --- | --- |
| `GET/PUT /api/v1/bookings/org/profile` | `X-Barrels-Organisation`; read for members, write for admin/owner | Public slug, timezone, currency, step, lead time, horizon, cancellation cutoff, confirmation rule, notification email, `manage_url_template` (HTTPS, contains `{token}`); slug taken by another organisation 409 |
| `GET/POST /api/v1/bookings/org/services`, `PATCH /services/{id}` | Same | Duration, buffers, price and deposit (minor units; deposit at most the price); deactivate with `active: false` |
| `GET/POST /api/v1/bookings/org/providers`, `PATCH /providers/{id}` | Same | Providers and the services they perform; another organisation's service 404 |
| `GET/PUT /api/v1/bookings/org/providers/{id}/hours` | Same | Replace the weekly plan; overlapping periods on one day 422 |
| `GET /api/v1/bookings/org/settings` | Member or API key `bookings.read` | Settings screen in one call: profile (null before it exists), services, providers with `service_ids` and `working_hours`, and `deposits_available` (false without the `payments` entitlement, where deposits are stored but not collected) |
| `PUT /api/v1/bookings/org/services/order`, `PUT /providers/order` | Admin member or API key `bookings.write` | Body `{ids}`: each `sort_order` becomes its position; a foreign or unknown id 404, duplicates or an empty list 422 |
| `GET/POST /api/v1/bookings/org/providers/{id}/exceptions`, `DELETE /studio/exceptions/{id}` | Same | Dated `time_off` and `extra_hours` |
| `GET /api/v1/bookings/org/bookings?starts_from&ends_before` | `X-Barrels-Organisation`, any member | Agenda of bookings overlapping the range |
| `GET /api/v1/bookings/public/{slug}` | None (60/minute) | Storefront: active services and providers; unknown or disabled 404 |
| `GET /api/v1/bookings/public/{slug}/availability?service_id&first_day&last_day[&provider_id]` | None (60/minute) | Open slots (UTC) with free provider ids; at most 14 local days |

| `GET /api/v1/bookings/org/agenda?from_date&to_date[&provider_id&status&limit&offset]` | Member or API key `bookings.read` | Bookings grouped by local day; at most 62 days (422), paged with `limit` and `offset` |
| `GET /api/v1/bookings/org/bookings/{id}` | Same | Studio view with customer contact details, history and deposit state; another organisation's id 404 |
| `POST /api/v1/bookings/org/bookings` | Admin member or API key `bookings.write`; `Idempotency-Key` required | Staff entry (phone, walk-in, re-entered appointment): `confirmed`, source `studio`, no deposit; ignores lead time, horizon and weekly hours, but an overlap is 409; provider must offer the service (422); optional customer email, emailed only with `send_confirmation` |
| `POST /api/v1/bookings/org/bookings/{id}/confirm`, `/decline`, `/cancel`, `/no-show`, `/complete` | Admin member or API key `bookings.write` | Studio actions through the status machine; decline and cancel need a `reason`, email the customer and emit `booking.cancelled`; an illegal move 409 |

Overlapping active bookings for one provider are refused by the database
(`booking_no_overlap`).

Deposits: when a service has a deposit and the organisation holds the `payments`
entitlement, `POST /bookings/public/{slug}/bookings` answers a booking in
`pending_payment` with `payment_required: true` and a `checkout_url` (Stripe test
mode; null when the business records payment itself). Unpaid bookings are cancelled
and their slot released after `BOOKINGS_DEPOSIT_HOLD_MINUTES` (30). Both receipt
fields are additive.

## Billing

The first billing vertical slice uses Stripe-hosted Checkout for one configured
recurring Price. It proves subscription Checkout and signed webhook delivery; it
does not persist customers/subscriptions or provision paid access yet.

| Endpoint | Authentication | Contract |
| --- | --- | --- |
| `POST /api/v1/billing/checkout-sessions` | Bearer token required | Creates a Stripe Checkout Session in `subscription` mode and returns `{"id":"cs_...","url":"https://checkout.stripe.com/..."}` |

The Checkout Session associates the authenticated user with Stripe using
`client_reference_id` plus `user_id` metadata on both the Session and resulting
Subscription. Stripe API failures return 502. Missing billing configuration returns
503.

Local Stripe test-mode flow:

1. In the Stripe test Dashboard, create a recurring Price (the product brief's test
   target is XCD 5/month) and set its `price_...` ID as
   `BILLING_STRIPE_PRICE_ID`.
2. Set `BILLING_STRIPE_SECRET_KEY` to the test `sk_test_...` key.
3. Forward Stripe events to the local API:

   ```bash
   stripe listen \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
     --forward-to localhost:8000/api/v1/billing/webhooks/stripe
   ```

4. Set `BILLING_STRIPE_WEBHOOK_SECRET` to the `whsec_...` value printed by the
   listener, restart FastAPI, authenticate in Scalar, and call the Checkout endpoint.
5. Open the returned URL and use Stripe's interactive test card
   `4242 4242 4242 4242`, any future expiry, and any three-digit CVC.

### Barrels invoicing (P1-P3)

Barrels invoices its own service-line clients; a customer is a platform
organisation. Every route below needs a superuser or the `billing.manage`
permission (403 otherwise). Money is integer minor units (XCD cents). Totals and
tax are computed on the server (`Decimal`, half-up per line); clients never send
or trust a total.

| Endpoint | Contract |
| --- | --- |
| `GET/POST /api/v1/billing/customers`, `GET/PATCH /api/v1/billing/customers/{customer_id}` | One customer per organisation (409 if already a customer, 404 for an unknown organisation) |
| `GET /api/v1/billing/invoices` | Paginated, newest first; filters `status`, `customer_id`, `q` (number or customer name), `overdue` |
| `POST /api/v1/billing/invoices` | Create a draft with lines (`description`, `quantity` up to 3 dp, `unit_price_minor`, optional `tax_rate` percent up to 2 dp, default from `BILLING_INVOICE_DEFAULT_TAX_RATE`) |
| `GET/PUT/DELETE /api/v1/billing/invoices/{invoice_id}` | Read; replace a draft; delete a draft (409 once issued) |
| `POST /api/v1/billing/invoices/{invoice_id}/issue` | Draft only. Assigns the gapless `<prefix>-YYYY-NNNN` number, issue date (optional body) and due date (net 30), stores the PDF privately when storage is configured and queues the customer email |
| `POST /api/v1/billing/invoices/{invoice_id}/void` | Issued and unpaid only; `reason` required and audited |
| `POST /api/v1/billing/invoices/{invoice_id}/payments` | Manual `bank_transfer`, `cash` or `cheque`; 422 when above the outstanding balance or dated in the future; 409 on a non-open invoice |
| `GET /api/v1/billing/invoices/{invoice_id}/pdf` | `application/pdf`, rendered on demand |
| `GET /api/v1/billing/receivables` | Open invoices with ageing buckets `current`, `days_1_30`, `days_31_60`, `days_61_90`, `over_90` and a paginated list |

Status machine: `draft -> issued -> partially_paid -> paid`, and `issued -> void`.
Reminder emails (7 days before due, on the due date, 7 days overdue) are sent by
the worker once per invoice and stage. The legal entity name, VAT rate and number
format are provisional settings (`docs/env.md`).

## Change history and notifications (platform core)

Shared services (ADR-0009) that any module can use; HR is the first. Both require an
authenticated session.

**Change history.** Registered models (`src/hr/audit.py`) are captured field by field on
every flush into `public.audit_entry`, attributed to the signed-in user (or "System" for
worker jobs). Bulk `update()`/`delete()` statements are not captured; call
`src.audit.service.record_change` for those.

| Endpoint | Access and purpose |
| --- | --- |
| `GET /api/v1/audit/{entity_type}/{entity_id}` | Paginated history, newest first. Readable by anyone who may read the record (module read check). Sensitive field values return `masked: true` with `old`/`new` null unless the reader holds `audit.view_sensitive`. Unknown `entity_type` → 404 |

HR `entity_type` values: `employee` (user id; profile, address, employment, approval
authority), `leave_request`, `absentee_report`, `shift_swap`, `status_report`,
`timesheet` (incl. entries), `parking_permit`, `training_record`, `employee_document`,
`department`, `grade`, `workflow_template` (incl. steps), `calendar_event`,
`public_holiday`.

**Notifications.** `notify()` writes in-app rows plus an email outbox inside the
caller's transaction; the worker sends email every 30 s (React Email `notification`
template via web-auth, Jinja fallback, delivered through Resend/SMTP) and runs the daily
reminder sweep at 10:00 UTC. Emails carry only a summary and a portal link.

| Endpoint | Access and purpose |
| --- | --- |
| `GET /api/v1/notifications?unread=` | Own notifications, paginated |
| `GET /api/v1/notifications/unread-count` | `{count}` for the header badge |
| `POST /api/v1/notifications/{id}/read` | Mark own notification read; another person's → 404 |
| `POST /api/v1/notifications/read-all` | Mark all own notifications read |
| `GET/PUT /api/v1/notifications/preferences` | Own email opt-outs per event; approval events (`email_mutable: false`) cannot be muted → 400 |
| `GET /api/v1/notifications/settings?organisation_id=` | `notifications.manage` in the organisation: every event with effective settings, plus staff whose email domain is outside `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS` |
| `PUT /api/v1/notifications/settings/{event_key}?organisation_id=` | `notifications.manage`: on/off, email on/off, extra recipient roles, title/body Jinja templates (validated), timings (`remind_after_days`, `escalate_after_days`, `expiry_days_before`) |
| `GET/POST /api/v1/notifications/snoozes?organisation_id=` | `notifications.manage`: list active snoozes / silence an event, or one entity of it (`entity_type` + `entity_id` together), until a future `until`; unknown event → 404 |
| `DELETE /api/v1/notifications/snoozes/{id}?organisation_id=` | `notifications.manage`: end a snooze (204); another organisation's → 404 |

## HR Contract

All HR routes are under `/api/v1/hr`, require an authenticated session, and are gated
by permission keys from `src/auth/permissions.py` (`tests/auth/test_permission_registry.py`
fails if a key used in code is missing from the catalog). Routers:
`profile`, `rosters`, `calendar`, `timesheets`, `attendance`, `leave-requests`, `shift-swaps`,
`absentee-reports`, `status-reports`, `parking-permits`, `documents`, `workflows`.

### Form prefill endpoints

Read-only helpers that let the HR forms start from stored data. Each returns suggestions; the requester still edits and signs the figures.

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/leave/working-days?start=&end=&leave_type=` | `leave.request.create.self` | Working days for the caller (≤ 366 days). Uses the caller's published or closed roster work shifts when the roster covers every day in the range (`method: roster`), otherwise Monday to Friday (`method: weekdays`). Public holidays are excluded and listed; `provisional: true` marks dates HR has not verified. With `leave_type=VACATION`, `suggested_extra_days` (and `suggested_extra_days_note`) counts holidays on would-be working days as a provisional hint for HR; it is never posted to a balance |
| `GET /api/v1/hr/timesheets/prefill?period=YYYY-MM` | `timesheet.submit.self` | The caller's published or closed roster work shifts for the month with shift times, scheduled hours and leave/absence availability. `roster_published: false` and no entries when there is none. Rostered days that are public holidays carry `holiday_name` and `holiday_provisional`; `holidays` lists every holiday in the month. Visibility only, no pay rule |
| `GET /api/v1/hr/signed-documents/me?entity_type=` | authenticated | Existing list, narrowed to one form type (for example `leave_request`, `timesheet`) before paging |

### Manual shift attendance

`PUT /attendance` saves actual arrival/departure against a published work roster
assignment. `POST /attendance/{attendance_id}/submit` starts per-shift supervisor
review through the department `TIMESHEET` workflow. Identical saves/submits are
idempotent; changed saves require `expected_revision`, and submitted/approved time
is locked. Existing timesheet self/proxy permissions and subject scope apply.

`GET /attendance/week?day=YYYY-MM-DD` returns the Sunday–Saturday collection,
scheduled context, actual times, break duration, elapsed/net recorded hours and
review status. Overnight grouping uses the roster's local shift-start date.
Approved totals exclude pending/rejected/returned/cancelled records; hours do not
determine payroll. `GET /attendance/week/pdf` renders the same collection in Python
with private/no-store headers. `GET /attendance/review?attendance_id=…` (or
`correction_id=…`) lets the owner, scoped reader/approver or named approver inspect
retained corrections. `POST /attendance/{attendance_id}/corrections` requires a
reason and starts a separate supervisor workflow; original time stays in effect
until approval atomically advances its revision. See [manual attendance](../hr/manual-attendance.md).

### Department calendar

The calendar is the department's own record — meetings, training, inspections, visits,
maintenance windows, deadlines. The duty roster is a **separate layer** read onto the
same calendar; rostered shifts are never copied into `hr.calendar_event`.

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/calendar/events` | `calendar.view` | Entries overlapping a date range (≤ 92 days) |
| `POST /api/v1/hr/calendar/events` | `calendar.event.create` | Add an entry |
| `PATCH /api/v1/hr/calendar/events/{event_id}` | author, or `calendar.manage` | Edit, or `cancelled: true` to strike it |

Any member of staff holds `calendar.event.create` and may record what they consider
important; the author may edit or cancel their own entry, and changing anyone else's
requires `calendar.manage`. Entries are **cancelled, never deleted** — the calendar is
a record of what was planned as well as what happened, so cancelled entries are
omitted from reads unless `include_cancelled=true`.

### Employee documents

The initial release supports contracts, identification, certificates, licences,
qualifications and signed forms. Medical, disciplinary, appraisal and `OTHER`
records remain stored but are unavailable through these endpoints, including by
ID. New uploads in those categories are rejected. Generic form attachment fields
are retained for compatibility but non-null values are rejected until the
attachment consumer and its access policy are implemented.

| Endpoint | Access and purpose |
| --- | --- |
| `GET /api/v1/hr/document-employees` | Paginated, name-searchable employee choices filtered by active document assignments before counting |
| `POST /api/v1/hr/documents` | `hr.document.create` for self; filing for another employee also requires scoped `hr.document.manage` |
| `GET /api/v1/hr/documents` | Own documents by default; explicit employee/department filters can only narrow access |
| `GET /api/v1/hr/documents/{document_id}` | Same category and scope policy as listing |
| `GET /api/v1/hr/documents/{document_id}/download` | Rechecks access; private, no-store 307 redirect to a 120-second signed URL |
| `PATCH /api/v1/hr/documents/{document_id}` | Subject who uploaded it, or scoped document manager; metadata only |
| `POST /api/v1/hr/documents/{document_id}/archive` | Same management check; retains both metadata and stored file |

Department readers see only certification, licence and qualification records of
other staff. Scoped document managers see all six launch categories. An employee
can read their own launch-category documents, but can only edit/archive those
they uploaded. Revoked or expired assignments confer no authority over others;
flat role membership is insufficient for cross-employee access. An explicit
department grant can cover a department other than the manager's own.

Lists include `can_upload`; document rows include `can_manage` for UI controls.
Mutations independently recheck permissions. Uploads use multipart/form-data,
accept the existing PDF/image/Word/Excel allowlist, cap file bytes at 25 MiB and
reject empty files or expiry before issue. Titles cannot be blank or null on
update. Category and file bytes cannot be replaced through PATCH.

These checks enforce the current GAA department model, not organisation
isolation. See [organisation boundary](../hr/organisation-boundary.md) for the
separately approved migration prerequisite. Do not enable another organisation
on the strength of these document checks alone.


### Opening leave balance import

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `POST /api/v1/hr/setup/staff/balances/import` | Superuser | Check, or apply, opening leave balances from a CSV |

The body carries `organisation_id`, a `source` description, an `as_of` date, the CSV
text and `apply`. The CSV needs `employee_number`, `leave_type` and `balance` columns;
other columns (such as names) are ignored and never stored. `leave_type` must be an
exact leave type code, because mapping another system's leave names is a policy
decision HR has not made. With `apply` false the call only reports each row. With
`apply` true nothing is posted unless every row is valid, then every balance is
posted through the leave ledger (`OPENING`, or `ADJUSTMENT` when an entry exists) with
the source and as-of date in the reason and the baseline audit. The ledger has no
separate as-of column yet.

### Clock-in

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `POST /api/v1/hr/attendance/clock` | `timesheet.submit.self` | Record a PENDING arrival, or departure when a shift is open |
| `GET /api/v1/hr/attendance/clock-punches/pending` | `timesheet.approve` (named supervisor, or department scope) | Pending phone punches the caller may review; never their own |
| `POST /api/v1/hr/attendance/clock-punches/{punch_id}/approve` | `timesheet.approve` (named supervisor, or department scope) | Approve a punch; it then counts as attendance |
| `POST /api/v1/hr/attendance/clock-punches/{punch_id}/reject` | `timesheet.approve` (named supervisor, or department scope) | Reject a punch with a reason; it never counts |
| `GET /api/v1/hr/attendance/clock-sites` | `roster.manage` in the department scope | List a department's clock points (no tokens) |
| `POST /api/v1/hr/attendance/clock-sites` | `roster.manage` in the department scope | Create a clock point; the token is returned once |
| `POST /api/v1/hr/attendance/clock-sites/{site_id}/rotate` | `roster.manage` in the department scope | Replace the token; the old one stops working |
| `PUT /api/v1/hr/attendance/clock-sites/{site_id}/active` | `roster.manage` in the department scope | Activate or deactivate a clock point |

A clock point proves presence with a static token on an NFC tag or QR poster; only
its SHA-256 hash is stored. A phone punch is **pending** until a supervisor approves
it (ADR-0040): the scan stores a `hr.clock_punch` row and writes no attendance, so
hours and timesheets ignore pending and rejected punches. Approval calls
`save_attendance` as the employee (an arrival creates the record, a departure closes
it), so roster, revision and the supervisor workflow are those of manual attendance.
A departure can be approved only after its arrival; rejecting an arrival also
rejects its pending departure, and the employee may then punch again. Only the
employee's named supervisor (`supervisor_id`) or a `timesheet.approve` holder whose
assignment covers the employee's department may decide, and nobody may decide their
own punch (superusers included). Approve and reject are idempotent for the same
outcome and return 409 for the opposite one. Arrival needs a published work shift that
started at most two hours ago or ends within the next hour; with none, the call
returns 409 and no shift is invented. A second scan within 60 seconds changes
nothing. The clock point must belong to the caller's own department. `late_minutes`,
`early_departure_minutes` and `overtime_minutes` are informational and not stored.
`ClockResult` gains `punch` (with `status`); `attendance` stays but is a provisional,
unsaved view (`attendance_id` null) until the punch is approved. Terminal punches
(import not built yet) will count immediately and do not use this table.

### Roster rule limits and check

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/rosters/departments/{department_id}/rules` | `roster.view` in the department scope | Read the department's limits |
| `PUT /api/v1/hr/rosters/departments/{department_id}/rules` | `roster.manage` in the department scope | Replace the limits |
| `GET /api/v1/hr/rosters/periods/{period_id}/rule-check` | `roster.view` in the department scope | Violations for one period |

### Public holidays

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/rosters/public-holidays` | `roster.view` | List holidays, optionally by `year` |
| `POST /api/v1/hr/rosters/public-holidays` | global `roster.manage` | Add a holiday (optional `source`, `needs_verification`) |
| `PUT /api/v1/hr/rosters/public-holidays/{holiday_id}` | global `roster.manage` | Edit name, date, source or verification flag; a date already in use returns 400 |
| `POST /api/v1/hr/rosters/public-holidays/provisional` | global `roster.manage` | Add the provisional Grenada calendar for `year` (2000-2100), skipping dates already present; rows carry `source` "provisional - verify with GAA HR" |
| `DELETE /api/v1/hr/rosters/public-holidays/{holiday_id}` | global `roster.manage` | Remove a holiday |

Limits are `min_rest_hours`, `max_consecutive_days` and `max_weekly_hours`, stored
on `hr.department_policy`. A null limit disables that rule and no defaults are
assumed, because GAA HR has not confirmed any values. The check is warn-only: it
never blocks saving, publishing or swaps. It also reads neighbouring published
periods so a run or rest gap that crosses a period boundary is seen. Weeks run
Sunday to Saturday by shift start date. Publishing also runs the check and records any
warnings on the `PUBLISHED` revision (summary and a `rule_warnings` snapshot entry,
present only when there are warnings); a shift exchange can be checked with `GET /api/v1/hr/shift-swaps/{shift_swap_id}/rule-check`,
which reports only the breaches the exchange would introduce for the two employees
(visible to them and to `roster.view` holders in the department) and never blocks
approval; the approvals inbox shows it for shift exchanges. Changes
to the limits are audited under entity `roster_rules` for the department.

### Roster calendar feed

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/rosters/assignments` | none for `scope=me`; `roster.view` for `scope=department` | Rostered days in a range, expanded to concrete times |

Draft periods are returned only to callers holding `roster.manage`, flagged
`is_draft: true`. For everyone else a roster is not real until it is published.

Roster period/grid, calendar entries and roster-linked timesheet entries include
`availability`: `SCHEDULED`, `ABSENT`, `PARTIAL_ABSENCE`, or `LEAVE`. This is a
read projection of approved absentee/leave records; the stored shift code and
timesheet hours remain unchanged. Linked workflows must still be approved;
cancelled, returned, pending and rejected reports do not supply approved markers.
Legacy approved records without a workflow remain supported. Absence matches
employee, filing department, local shift-start date and optional expected shift;
paired absence times distinguish partial absence. Full absence takes precedence
over leave, then partial absence. The department roster/grid/calendar reads check
the caller's scoped `roster.view` access. No reason or medical notes are exposed
by this projection. Saturday night keeps its Saturday assignment date even when
the scheduled end is Sunday. The grid keeps the shift code and marks an approved
exception; the calendar's Leave & absence view also includes these exceptions.

Bulk assignment saves retain existing IDs so repeated grid saves/imports do not
break timesheet or attendance links. They reject duplicate employee/date cells,
unknown shift codes, dates outside the selected period, closed periods, and
overwriting a cell owned by a different period. Amend the original period instead
of importing an overlapping period over its assignments.

Once attendance exists, bulk saves may retain the shift and update remarks but
cannot replace its shift code. Material catalogue timing/category changes are
also blocked for shifts with linked attendance; use a new code for future
schedules. Exchange approval and reversal apply the same recorded-attendance
guard. These checks preserve historical scheduled and actual times together.

### Local wall-clock times

`starts_at_local` / `ends_at_local` on both the calendar and roster feeds are ISO-8601
**without an offset**. They are department-local wall-clock times, the frame the shift
catalog and the printed roster already use: a 05:30 morning shift is 05:30 on the wall
in Grenada. They are deliberately **not** `UtcDateTime` — stamping them UTC would move
every shift four hours. Real timestamps (`created_at`) remain `UtcDateTime`. On write,
an offset supplied by a client is dropped rather than converted, so one calendar never
carries two time bases.

## Barrels Events

`/api/v1/events/*` (ADR-0016; `events` schema in the main database, ADR-0003). Settlement `online_payments` description now says orders and the ledger are compared, not joined (wording only, no shape change).

| Access | Endpoints |
| --- | --- |
| Public (an Events token personalises) | `GET /listings` (`when`, `category`, `parish`, `price`, `tag`, `q`, `organiser`, `limit`, `offset`), `GET /listings/{slug}`, `GET /organisers/{slug}`, `GET /groups`, `GET /groups/{slug}`, `GET /people/{handle}`, `POST /suggestions` |
| Events member | `POST /manage/organiser`, `GET`/`PATCH /me/profile`, `GET /me/plans`, `GET /me/network`, `PUT`/`DELETE /listings/{slug}/rsvp` and `/save`, `PUT`/`DELETE /organisers/{slug}/follow`, `PUT`/`DELETE /groups/{slug}/membership`, `POST /connections`, `POST /connections/{id}/accept`, `DELETE /connections/{id}`, `PUT`/`DELETE /blocks/{handle}`, `POST /reports`, `GET`/`POST /threads`, `GET /threads/{id}`, `POST /threads/{id}/messages` |
| `events.organiser.manage` + organiser membership | `GET /manage`, `POST /manage/listings`, `PUT /manage/listings/{id}`, `GET /manage/{id}/activity` |
| `events.moderate` | `GET`/`PATCH /moderation/reports`, `GET`/`PATCH /moderation/suggestions`, `GET /moderation/organisers`, `PATCH /moderation/organisers/{id}` |

Prices are integer minor units (`price_from_minor`, tier `price_minor`); datetimes are UTC and
clients render Grenada time. Direct threads open only between accepted connections or members
of a shared group, and the rule is re-checked on every send; blocks hide both members from
each other.

## Public CAP Feed Contract

Public CAP routes are mounted outside `/api/v1`. They expose **only `scope == Public`
alerts** — Restricted/Private alerts (and their raw XML snapshots) are never served on
these anonymous endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cap/warnings` | Active public messages grouped by hazard, with `activeCount` counting Actual messages only; each carries `status`, `product` (`Outlook`/`Watch`/`Warning`/legacy `Advisory`) and `colour` (`green`/`yellow`/`orange`/`red`), null when not set. Exercise messages remain in groups for labelled drill display but do not set the public status line. |
| `GET /api/cap/latest-active` | Active published alerts |
| `GET /api/cap/alerts` | Published, expired, and cancelled alerts |
| `GET /api/cap/past` | Expired and cancelled alerts, including naturally expired messages; a replaced message carries `replaced_by_identifier`, and a cancelled message carries `cancellation_reason` when its CAP Cancel includes a note |
| `GET /api/cap/alerts/{identifier}` | Public alert by CAP identifier; `replaced_by_identifier` links an earlier message to its published Update, and `cancellation_reason` exposes the Cancel note |
| `GET /api/cap/alerts/{identifier}/attachments/{kind}` | Actual public alerts in published, expired or cancelled state only. `kind` is `pdf`, `social` or `map`; redirects with `Cache-Control: no-store` to a private object URL valid for 60 seconds. Draft/private/restricted/exercise alerts are denied. Previously issued links can remain usable for up to 60 seconds after a visibility change. Missing objects return the storage provider's not-found response. Worker results now use this API path instead of direct bucket URLs; historical stored job URLs are not rewritten. |
| `GET /api/cap/alerts.geojson` | Active Actual alerts as GeoJSON; exercises are excluded |
| `GET /api/cap/active-map` | Active Actual alerts as GeoJSON for map consumers |
| `GET /api/cap/rss.xml` | Active Actual alerts plus Actual Cancel messages published within 24 hours; exercises are excluded |
| `GET /api/cap/{identifier}.xml` | Latest CAP XML snapshot for an identifier |

CAP management routes are under `/api/v1/cap` and require authenticated users plus permission checks.
`POST /alerts/{id}/publish` accepts only an `APPROVED` alert whose approver is not its author (409 otherwise); `POST /alerts/{id}/emergency-publish` (`{"reason": "..."}`, permission `cap.alert.publish_emergency`) publishes a Draft, Submitted or Approved alert without approval and records an `emergency_publish` audit event (ADR-0023). Editing a Submitted or Approved alert returns it to `DRAFT`.

Only Public alerts with `status=Actual` create CAP publish side-effect jobs. The
worker also skips previously queued jobs for any other status or scope, so an
Exercise/Test/System or Restricted/Private message cannot reach webhook or other
publish handlers through the job outbox. Public
JSON alert routes retain CAP status so the GMS site can label drills. XML remains
retrievable by identifier for a public Exercise message; RSS and GeoJSON omit it.
RSS cancellation retention is 24 hours, so consumers needing guaranteed complete
message history must use a durable CAP delivery integration rather than treat RSS
as an event log.

An authored CAP alert may cite one exact published weather bulletin revision in
each info block. The optional `GMS:source-bulletin-kind`,
`GMS:source-bulletin-id` (canonical UUID), and
`GMS:source-bulletin-revision` (positive integer) CAP parameters must appear
together, once each. Validation checks the reference's shape but does not read
the separate wxproducts database, so publication is independent of bulletin
availability. The link does not publish, withdraw, or cancel either product.

**GMS product and colour transition.** The current, unmerged implementation
reads `GMS:product` (`Outlook` | `Watch` | `Warning` | legacy `Advisory`) and
`awareness_level` from CAP `<parameter>`s. It binds colour to CAP severity and
omits colour for Outlook. GMS has since chosen a 4 × 4 impact × likelihood
matrix for every product, including Outlook; colour and CAP severity must be
assessed independently. This contract must be revised before the level model
is released. Alerts without `GMS:product` currently validate with a warning.

## Webhooks

`POST /api/v1/webhooks/resend` receives Resend delivery events. It is excluded from OpenAPI. If `RESEND_WEBHOOK_SECRET` is set, Svix signature headers are required and verified. If the secret is not set, the endpoint accepts events and logs a warning.

- `POST /api/v1/billing/webhooks/stripe` receives Stripe snapshot events and is
  excluded from OpenAPI. It verifies the raw request body against the
  `Stripe-Signature` header with `BILLING_STRIPE_WEBHOOK_SECRET`, including Stripe's
  five-minute timestamp tolerance. Missing configuration returns 503; unsigned,
  stale, malformed, or tampered events return 400. Valid events are logged only in
  this proof—there is no subscription persistence or entitlement provisioning yet.

## Current Gaps

These are not implemented as universal API contracts yet:

- Propagating the request ID into ARQ jobs (each enqueue site must pass it; not done yet).
- RFC 7807 Problem Details.
- Idempotency keys.
- Global response validation middleware.
- API deprecation headers or a formal deprecation policy.
- Contract tests against generated clients.

Do not claim these exist in downstream docs until the code implements them.


### HR dashboard

`GET /api/v1/hr/dashboard` requires an authenticated, active account. It returns the current user's recorded vacation balance (null when absent), recent personal HR records and open-request count, published roster entries for the active employment department, and permission-scoped actionable approvals. A superuser without employment sees organisation-wide roster and employment counts; an ordinary account without employment sees only its own records. Dates use America/Grenada. Roster entries describe scheduled work/time away, not observed attendance. No sample statistics or inferred leave entitlement are returned.

### HR leave ledger (2026-09-25)

Leave balances come only from the append-only `hr.leave_balance_event` ledger, written through `src/hr/leave/ledger.py`. Each entry has an `entry_kind` (`OPENING`, `ADJUSTMENT`, `APPROVAL_DEBIT`) and a per-employee, per-leave-type `sequence`; the latest sequence is the current balance. A leave request can be debited once, whether approved through a workflow or the legacy action route; a repeated or concurrent approval posts nothing further. `GET /api/v1/hr/profile/me` returns `leave.balances` as decimal day strings from the ledger, matching the dashboard's `vacation_balance`. `leave.unverified_carry_over` (formerly `carry_over`) shows legacy carry-over days that have not been reconciled and are not part of the balance (policy rule GAA-LV-VAC-CARRY-01). Apply Alembic migration `c9d0e1f2a3b4` before deploying; it stops, listing the request IDs, if any request already has more than one debit.

### Employee membership and account security

Employment records may represent confirmed department/grade membership with a null employee number or employment type. `EmploymentPublic` includes `grade`, `supervisor_name` and `details_complete`; clients must display unknown fields explicitly rather than infer values. `GET /api/v1/auth/users/me/security` returns current-account security status and active-session metadata (app, client type, recorded `user_agent` and `ip_address`, last-used and expiry times), never bearer tokens, session secrets or TOTP secrets. The IP and user agent are shown only to the account owner so they can recognise their own devices. The response also carries `password_changed_at` (null until the password is next changed, reset or set up after the column shipped). Password and Google sign-in remember the browser/OS family of each device (`user.known_device_keys`, capped at 20); a sign-in from an unfamiliar family after the first ever device emails the account owner a "New sign-in" alert in the background, linking to `/sessions`. Alert failures are logged and never block sign-in. Existing `/auth/users/me/security/2fa/setup` and `/auth/users/me/security/2fa/activate` endpoints provide enrollment; setup rejects an already-enabled authenticator.

Managed HR workflows must be created through their form submission endpoints. Public generic workflow creation cannot attach a new workflow to a managed HR record. Finalization validates the record's authoritative workflow and department before status or balance changes. The dashboard honours `roster.view` for department data and preserves personal roster access when that permission is absent.

HR form submission dates: leave, shift swap, absentee, daily status and parking public responses include nullable `submitted_at`, projected from the linked workflow (including list and mutation responses). Timesheets retain their existing field. Missing legacy timestamps remain null; creation/update dates are never substituted. Printable HR documents and submission lists display the date in America/Grenada, with drafts marked Not submitted and missing historical dates marked Not recorded. Signature lines remain unsigned.


### Registration approval and recovery

Public signup creates an active but `registration_pending` account and sends a verification email; verification is recorded (`email_verified_at`) but never blocks sign-in, joining, app access or staff approval (16 October 2026). `ALLOW_PUBLIC_SIGNUP` defaults to true; explicitly setting it false closes registration. Pending accounts cannot obtain sessions, use bearer-authenticated endpoints, or complete Google sign-in. Existing accounts default to approved when the migration is applied. Signup accepts passwords of 12–128 characters and ignores privilege fields. Verification delivery failure preserves the pending account so verification can be requested again.

An administrator saves department/grade membership and issues the permanent staff credential, then calls `POST /api/v1/hr/setup/staff/{user_id}/approve-registration`. Approval requires active employment and a non-revoked credential, grants the existing `staff` role with self scope, and writes an audit entry. It does not infer management privileges from a grade. Missing employee number, employment type or start date does not block credential activation; `StaffCard.employment_ready` reports this separately from account approval and email verification. HR submission readiness rules still apply.

Password recovery uses a hashed, expiring, single-use challenge. Resetting or changing a password invalidates outstanding challenges and saved sessions. Old JWT-based reset links must be replaced by requesting a new link. New and changed passwords require 12–128 characters.

`POST /api/v1/auth/users/me/security/recovery-codes` requires the current password and an authenticator or existing recovery code. It returns eight new codes once, stores only their hashes and invalidates previous codes. Recovery codes can replace the authenticator code at password or Google sign-in and are consumed once. `/auth/users/me/security/2fa/disable` requires both password and a factor code, and clears recovery codes. `DELETE /api/v1/auth/users/me/security/sessions/{session_id}` revokes only a session owned by the caller; foreign or missing sessions return 404. Already-issued bearer tokens retain their configured short lifetime.

Apply Alembic migrations through `c3d5e7f9a1b2` before deploying these account controls. Configure the email provider and Google OAuth callback for the target environment before advertising those flows; application code alone does not configure providers.

### HR creation responses

Creating a leave request, absentee report, daily status report, shift swap, or timesheet returns `201 Created` with its public response model, including when saving a draft. These routes do not advertise a separate untyped `200` response. Kubb generates the corresponding success types from this contract.

### Dependency readiness

`GET /api/v1/utils/ready/` retains its existing response contract but now requires the committed Alembic revision and readable auth/HR tables. Empty operational datasets are valid. Missing schemas, stale revisions and unavailable databases return 503. Liveness remains `/api/v1/utils/health-check/`.

### Private weather images

`GET /api/v1/wxwatch/images/{storage_path}` accepts an active browser session or bearer identity. It returns private/no-store local image bytes when `WXWATCH_LOCAL_IMAGES_DIR` is configured, or a 60-second signed object-storage redirect otherwise. Raster paths are validated; local paths and symlinks must remain inside the configured root. Missing files return 404, invalid paths 400, and missing storage configuration 503. Gaa-admin uses a same-origin `/_backend/wxwatch/` rewrite and disables image optimization so browser credentials reach FastAPI.

### Authored product grade policies

Under /api/v1/hr, GET /product-access/me returns the current user's allowed
product kinds. Superusers can GET /setup/product-access and PUT
/setup/product-access/{kind} with a grade_ids array. Unknown kinds and inactive
or non-GMS grades return 400; policy writes require administrator access.
An empty policy permits only superusers. Policies use ingested employment grades,
are evaluated on each request and are audited. CAP permissions remain independent.
See [GMS authored products](../operations/gms-products.md) for publication behavior.


## GMS onboarding reference data

`GET /api/v1/hr/setup/catalogue?department_id=<id>` previews missing ingested
GMS grades, safe-default approval policies and standard two-stage HR workflow
templates. `POST /api/v1/hr/setup/catalogue` accepts `{"department_id":"<id>"}`
and adds missing records atomically. Both endpoints require an active superuser.
Recognized existing department IDs are `gms` and `meteorological_department`;
identity is not inferred from editable names. Conflicting grade identities block
import with 409. Existing records, disabled grades, staff, role assignments and
operational data remain unchanged. Repeated imports are no-ops.

New HR/CAP submissions require their approval policy; missing policies return
409. Staff setup can save partial verified personnel details, but HR workflow
readiness still requires a staff credential and complete active employment.


## GAA governance

Authenticated `GET /api/v1/auth/access/me` returns effective role names, permission keys and the independent superuser flag. `GET /api/v1/hr/organisation` returns the source organisation catalogue without employee identities.

Superuser-only endpoints: `GET`/`POST /api/v1/hr/setup/organisation` preview/apply an additive import; `GET /api/v1/hr/setup/workflows` and `PUT /api/v1/hr/setup/workflows/{template_id}` read/save future workflow configurations; `GET /api/v1/auth/access-reviews` lists scoped and legacy grants plus review history; `POST /api/v1/auth/access-reviews/{assignment_id}` records RETAIN or REVOKE with a reason. Self-review is forbidden. Workflow inbox items expose purpose, label, blocking status and step ID; action requests may identify the exact step so nonblocking recording remains addressable after final approval.

See the [GAA governance launch procedure](../operations/gaa-governance-launch.md) for scope semantics, source uncertainties and preservation guarantees.


### HR organisation ownership

`GET /api/v1/hr/organisations` lists the authenticated user's available organisation
contexts. Employment, department, document and role-assignment responses include
`organisation_id`; departments also expose their organisation-scoped `code`.

Department lists, employee-document lists and document employee choices accept
`organisation_id`; document uploads accept it as a multipart field. Omitting it is
supported only when the caller's context is unique. Explicit inaccessible context
returns 403; ambiguous omitted context returns 400. Document detail, download,
metadata correction and archive validate the stored filing organisation.

Role assignment creation accepts an organisation ID or derives ownership from its
department/employment when unambiguous. Management and listing use active scoped
`user.manage` grants. `ALL` is organisation-wide; platform superusers remain global.
An assignment's organisation is immutable, department/org mismatches are rejected,
and explicit null scope returns 400. Employment derives organisation from its
department; transfers and supervisors across organisations are rejected.


### CAP hazard profiles

Authenticated `/api/v1/cap/hazard-profiles` provides version history (GET),
`/{key}/versions` creates an immutable DRAFT version (POST, optimistic
`base_version`), `/{profile_id}/approve` records independent approval (POST),
and `/{profile_id}/draft` starts an alert draft from an approved subtype/template
(POST). Reads require `cap.alert.read`; saves require `cap.settings.manage`;
approval also requires `cap.alert.approve` and a different actor from the author;
draft creation requires `cap.alert.create`. Conflicting versions return 409.

Profiles contain subtypes, CAP category mappings, per-message-level assessment
rules, impacts, affected groups, responses, templates, authority names and intended
channels. Incomplete profiles are savable drafts but cannot be approved. Approved
versions remain immutable when a newer draft is created. The selected profile
version is recorded in the resulting alert's `GMS:hazard-profile` parameter.
Threshold evaluation and transport/channel enforcement are not performed here.
Creating a draft never publishes it; its assessment remains Unknown.


### Employee training history

- `GET /api/v1/hr/training-employees`: organisation-scoped, paginated employee search (`organisation_id`, `search`, `page`, `size`). Includes employees with accessible historical records after department transfers; masks a current department outside the viewer's scope.
- `GET /api/v1/hr/training-records`: paginated employee history (`organisation_id`, optional `user_id`, `include_archived`, `page`, `size`). Defaults to the current employee. Authorisation precedes counts and pagination; responses include `can_create` and per-record `can_manage`.
- `POST /api/v1/hr/training-records`: records course/provider text, training end date (`completed_on`), result (`completed`, `attended`, `failed`), optional certificate expiry and notes. Requires an active `hr.training.manage` organisation/department grant. Department is derived from employment, never accepted from the client. Future training end dates and expiry before successful completion are rejected.
- `POST /api/v1/hr/training-records/{record_id}/archive`: requires management of the filing department and a reason (5–500 characters). Retains the original row, actor and archive timestamp. Repeated archive calls preserve the first reason. Corrections are replacement records, not edits.

Employees read their own history. `hr.training.read.department` allows scoped department reads; `hr.training.manage` also permits reads. SELF grants do not become department access. Expired/revoked assignments confer no authority. HR administrators receive management in the default permission bundles; supervisors and management receive read access. Existing seeding applies these keys to role bundles without creating new scoped assignments.

The single feature is training history, not a course catalogue, competency assessment, skills matrix or reminder system. Certificate files remain in Employee Documents; this record does not grant document access or certify operational competence. Migration `c1d2e3f4a5b6` adds only `hr.training_record`; no workflow enum changes are needed because this is an HR-maintained register rather than an approval request.


### HR saved signatures and signed submissions

Authenticated `GET/PUT/DELETE /api/v1/hr/signature/me` reads, replaces or deletes
only the caller's reusable PNG signature. PNGs are decoded, size/dimension limited,
checked for blank content, and re-encoded before private database storage.

The six HR form create/submit contracts accept optional `signature_version` as
explicit consent to apply that version of the caller's saved signature. Draft
saves never sign. Stale/deleted versions fail the submission transaction. Omission
preserves legacy unsigned API submissions; gaa-admin requires a signature for its
Sign & submit action. Proxy submitters sign as themselves, never as the employee.

`GET /api/v1/hr/signed-documents/me` lists the caller's signed/subject records.
`GET /api/v1/hr/signed-documents/{id}/pdf` returns the original PDF to the signer,
subject, or an HR document reader scoped over the subject and organisation.
Authorized HR form responses include `signed_document_id` when a signed copy exists.
All signature and PDF responses use private, no-store caching. Signed PDFs, signer
identity, signature version, timestamp, canonical form snapshot and SHA-256 are
committed with submission and remain unchanged when the saved signature changes.

Signed PDFs are server-rendered submission records, including stored form fields
and timesheet/status entries; they do not depend on browser print settings or
editable display-only fields. `POST /api/v1/hr/leave-requests/preview-pdf`
accepts `LeaveRequestCreate`, requires `leave.request.create.self` and an employment
department matching the request, and returns an inline `application/pdf` with
private, no-store caching. It saves neither a request nor a signature. The leave
editor uses this Python renderer for its draft preview and retrieves the immutable
signed PDF after submission. The rendered leave sheet resolves employee, supervisor
and department names from HR records and shows dates in America/Grenada.

`POST /api/v1/hr/absentee-reports/preview-pdf` similarly accepts
`AbsenteeReportCreate`, checks `absentee.report.create` subject scope and the
subject's employment department, and returns a private, no-store Python PDF
without saving a report or signature. Both forms download the Python PDF rather
than printing the editor. Absentee submission snapshots distinguish the absent
employee from the reporter/signature owner. Drafts can save incomplete reason
notes; creation as submitted and later submission enforce the required reasons.
Times must be a valid paired local HH:MM interval within the expected shift, or
both blank for a full shift; overnight times remain on the shift-start report date.
The expected work shift is inferred from a unique published/closed roster
assignment when omitted. Reporter-owned proxy drafts are included in the default
list, alongside reports about the caller; department lists require scoped access.
Other HR forms still use their existing unsigned paper previews. Signing a
submission does not apply signatures for approvers; submission PDFs retain the
approval state at submission, while later decisions live in the workflow.


## WxWatch gallery reads

`GET /api/v1/wxwatch/metadata?day=YYYY-MM-DD` accepts the existing bearer token or session cookie and returns `{groups: [{productKey, name, synopticImages}]}`. Each group contains all eight UTC three-hour slots, with null for missing images. Selection floors observations into their three-hour bucket; GOES-19 uses the closest observation to the bucket start, other sources use the latest fetch. Date bounds are inclusive midnight to exclusive next midnight. Responses are private/no-store; missing database configuration returns 503. Raw collector metadata is not exposed.

`GET /api/v1/wxwatch/public/latest?product=` (added 18 Oct 2026) is anonymous and returns `{images: [...]}`: the newest ingested GOES-19 image per product (optional `product` filter), each with `id`, `product`, `title`, `observed_at`, `image_url`, `media_type`, size, `source` and the NOAA/NESDIS public-domain attribution. Only `goes19` rows are exposed; no storage paths. An empty list means nothing has been ingested. `Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400`; a missing database is 503. `GET /api/v1/wxwatch/public/images/{image_id}` serves that image from the local archive or as a 60-second signed redirect (404 for unknown or non-GOES ids). The GMS site proxies images at `/api/satellite/{id}`.

`GET /api/v1/wxwatch/ready` is an anonymous availability check returning 204 or 503 without image data. FastAPI uses its own `WXWATCH_DATABASE_URL`. Gaa-admin no longer connects directly to this database. FastAPI owns archive writes and migrations through `src/wxwatch/alembic.ini`. Legacy Drizzle history is verified before adoption. The collector has no SQL writer. Existing three-hour selection is retained for compatibility; product identities are source-qualified and each image reports timestamp provenance. Legacy records are explicitly `legacy_unknown`.

### WxWatch collector API

`POST /api/v1/wxwatch/runs`, `POST /api/v1/wxwatch/ingest`, and `POST /api/v1/wxwatch/runs/{id}/finish` require a worker bearer secret matching `WXWATCH_INGEST_TOKEN` (minimum 32 characters). Browser sessions do not authorize ingestion. Run creation returns an expiring source lease; overlap returns 409. Ingestion requires an active lease, validates paths/source and metadata, serializes duplicate URL/checksum checks transactionally, and returns `{id, created}`. Run completion records finished/failed. No automatic deletion policy is enabled.

### WxWatch image viewer evidence

The authenticated WxWatch gallery metadata includes nullable catalogue evidence:
`archiveObservedAt`, `archiveNominalTime`, `firstRetrievedAt`,
`latestRetrievedAt`, `verificationStatus`, `verifiedSha256`, `verifiedByteSize`,
and `replicaState`. Latest retrieval is computed for the exact edition, not the
whole product. Legacy records without catalogue entries retain null evidence.
SHA-256 and size describe the catalogued asset; they do not assert that a file
has been rechecked during the metadata request. Replica state is the last
recorded check of the local file at the gallery's path. The viewer labels
estimated times separately and presents all timestamps explicitly in UTC.

### WxWatch archive browsing

Authenticated `GET /api/v1/wxwatch/archive` lists catalogue editions with
`source` (exact collector key), `product` (literal case-insensitive title/key
substring), inclusive UTC calendar dates `start`/`end`, `unknown_time`, `offset`
(default 0, maximum 100000) and `limit` (default 30, maximum 100). Dates filter
nominal product time, never receipt time. Unknown-time-only queries reject date
bounds. Ordering is nominal time descending, unknown times last, UUID as tie
breaker. Offset pagination may shift while new editions arrive; it is not a
snapshot export. Responses contain `items`, `offset`, and `has_more`.

Authenticated `GET /api/v1/wxwatch/archive/{edition_id}/retrievals` uses the same
pagination bounds, orders by retrieval time then UUID descending, and returns
404 for an absent edition. Empty history means no recorded retrieval events,
not that the edition was never downloaded. Both endpoints are private/no-store.

The staff page `/wxwatch/archive` presents these records and supports selecting
two editions for visual comparison. Existing image delivery still authorizes
requests; storage failures retain metadata and display an unavailable image.
No numerical comparison, spatial co-registration, correction equivalence or
historical retrieval reconstruction is implied. Legacy catalogue links remain
the compatibility path to assets during this pilot.

### NHC guidance in gaa-admin

`/wxproducts/nhc` is the primary NHC guidance surface. The existing authoring
workflow remains at `/wxproducts/nhc?view=editor`; unavailable archive data does
not prevent opening that editor. Guidance always filters the catalogue to
`source=nhc`. Shared archive navigation and comparisons also support NHC text.

Archive edition metadata now includes optional `issued_at`, `storm_id`,
`bulletin_code` and `has_bulletin`. Full bulletin bodies are excluded from lists.
Authenticated `GET /api/v1/wxwatch/archive/{edition_id}/bulletin` returns
`edition_id` and plain `text`, with private/no-store caching and 404 when no
bulletin exists. The browser loads text on demand through the existing session
proxy and renders it as escaped text, including in comparison panels.

Edition retrieval history now combines image retrievals with edition-linked
NHC import events. `event_kind` distinguishes downloaded and checked-unchanged;
`checked_at` is separate from `retrieved_at`. `is_imported` distinguishes import
time (in `recorded_at`) from an original API-recorded retrieval. Events are
ordered by check time where present, otherwise retrieval time. Failed NHC
attempts without an edition link remain in the database and are not attributed
to a specific bulletin by this reader. Raw importer metadata is not exposed.
No original file is served through the image route for NHC text editions.

### WxWatch asset delivery and processing lineage

`GET /api/v1/wxwatch/archive/{edition_id}/assets` lists the edition's asset IDs,
roles, hashes, sizes and registered media types for authenticated staff.
`GET /api/v1/wxwatch/assets/{asset_id}` delivers a registered asset independently
of its storage filename. Both use the existing browser/session authentication.
Unknown IDs return 404; assets without an available, verified local replica
return 503. Locations and credentials are never returned.

The API copies the selected local file into a temporary snapshot and checks its
SHA-256 and size before responding. Validated PNG/JPEG/GIF/WebP images render
inline; other bytes download as `application/octet-stream` with `nosniff` and a
sandbox policy. This adds disk I/O and temporary storage proportional to the
asset size, but prevents an altered file from being served under a verified ID.
Responses are private and not cached. Existing image-path URLs remain supported.

`WXWATCH_LOCAL_ASSET_ROOTS` is a server-only JSON object mapping registered
backend keys to absolute directories visible inside the API runtime, for example
`{"nhc-local":"/app/nhc-archive"}`. The directory must be visible inside the API container; local Compose supplies
the `nhc-local` read-only mount described below. `WXWATCH_LOCAL_IMAGES_DIR` continues to
supply `local-primary`. Unconfigured backends are skipped. Cloud replication and
cloud delivery through asset IDs remain future work.

`POST /api/v1/wxwatch/derivations` uses the existing collector bearer credential.
It accepts `input_asset_ids` (1–100 unique UUIDs, unordered), `output_asset_id`,
`processor`, `processor_version`, `options` (JSON object, at most 16 KiB), and an
optional timezone-aware `generated_at`. Assets must already have verified
replicas; this endpoint neither uploads nor processes bytes. Each output is
identified by its registered content hash. Inputs cannot include the output,
and registrations cannot introduce lineage cycles.

Identical input/output IDs, processor/version and canonical options return the
same derivation ID. Different versions/options create different records.
Conflicting generation evidence returns 409; unknown/unverified assets return
422. `recorded_at` is assigned by the database and never substituted for unknown
`generated_at`. Registration does not create a meteorological edition. Existing
NHC decoded outputs are not automatically backfilled into these records.

### NHC raster imagery

The manual NHC importer now accepts `kind=image` records alongside its existing
text/bulletin/outlook records. It checks original SHA-256 and size, the decoded
record's source hash and image reference, and the actual raster format before
registering the original asset. Image dimensions, frame count and MIME type come
from the bytes rather than the remote HTTP content type. The current per-file
limit is 10 MiB; larger artifacts require a separate streaming-import extension.

`ArchiveEdition.image_asset_id` is nullable and identifies an NHC original raster
for authenticated delivery through `/api/v1/wxwatch/assets/{asset_id}`. It does
not expose filesystem paths. GAA Admin's existing NHC Products archive renders
these assets and offers a full-size link; legacy WxWatch image paths still work.
No derived image is created by this import, so no derivation record is invented.

Image issue time comes only from the manifest's explicit `issued_at`. If absent,
issue and nominal time remain unknown. HTTP 304 records preserve the earlier
retrieval time and record a separate check event. Reimporting the same manifest
is idempotent. Failed image records create failed events without new editions.

Local Docker Compose now mounts `data/gms-ingest/nhc` at `/app/nhc-archive`
read-only and configures the `nhc-local` backend. Recreate the API container to
apply the mount. This local setup does not configure production or cloud storage.

From `apps/api/fastapi` on the host, apply the local runtime configuration:

```bash
docker compose -p grenmet-api --env-file .env.local up -d --no-deps api
```

Preview the existing run before applying it:

```bash
docker compose -p grenmet-api --env-file .env.local exec api \
  uv run --frozen --package fast-back python scripts/import_nhc_archive.py \
  --root /app/nhc-archive \
  --manifest runs/20260905T123318776004Z-313e70ba/manifest.json
```

Repeat that import command with `--apply` to register the eligible records.
No additional Alembic migration beyond `wxwatch_0006` is required for this slice.

### Public forecast selection

`GET /api/v1/wxproducts/public/forecast` is an anonymous, `no-store` endpoint.
FastAPI selects five periods using one server-clock instant (`as_of`). It reads
only published snapshots from the separate wxproducts database. An unavailable
store returns 503; an available store without a current publication returns five
periods with null sources and no invented forecast values. Each period also carries
`conditions`: display-ready tiles (`icon` lucide name, `value`, `label`) built by
`src/wxproducts/presentation.py`, the same text the PDF sheet prints (public units
first, WMO units in brackets). weather.gd renders them; older products fall back
to `details`.

The forecast-day boundary is 07:00 America/Grenada. Morning, midday and evening
issues become eligible at 07:00, 12:00 and 18:00 respectively, subject to their
publication timestamps. A late replacement leaves the previous eligible issue
in place until expiry. At 07:00 the following day, yesterday's current-period
forecast is no longer selected. Evening outlook periods remain eligible for
their corresponding future dates. Selection is ordered by issue time,
publication time, revision, and product ID for deterministic ties.

Each period includes its date, UTC `valid_from`/`valid_to`, numeric high/low,
a limited dictionary of display details, and a nullable source containing product
ID, revision, kind, issue time and publication time. Null source means awaiting
publication; its times describe the expected forecast slot, not issued evidence.
The separately selected midday temperature carries `time_basis=product_issue`:
its source issue timestamp must not be represented as a measured observation time.

`today_issues` lists every current issue for the base date (newest revision per
kind, oldest issue first); its last entry is `periods[0]`. weather.gd offers the
earlier issues as Morning / Midday / Evening tabs beside the newest.

### Public current conditions

`GET /api/v1/eregister/public/current` is anonymous and `no-store`. It returns the
newest SYNOP for MBIA (station 78958) that is not rejected or superseded (by state
or by a newer row's `supersedes_id`) and is not timed more than 15 minutes ahead,
decoded into public units: temperature/dew point (°C), relative humidity (Magnus),
wind (compass, kt, mph; `wind_calm`), MSL pressure (hPa) with 3-hour trend,
precipitation with its period (trace flagged), 24-hour rainfall, plain-English
present weather and cloud cover. `status` is `provisional` until the reading is
`accepted`, following real-time practice; weather.gd labels it so. Staff fields
(actor, QC notes, raw TAC, WIS2 data) never leave `src/eregister/public.py`. No
reading returns `{"observation": null}`; an unavailable register returns 503.

### Public month summary

`GET /api/v1/eregister/public/month-summary[?month=YYYY-MM]` is anonymous, rate
limited (60/minute per IP) and cached (`public, max-age=300,
stale-while-revalidate=600`; 503 is `no-store`). It aggregates, in SQL, the same
non-rejected, non-superseded MBIA SYNOPs as `/public/current` for one UTC month
(default: the current month to date; future months are empty). Rainfall is the sum
of one daily total per UTC date, taken from the 24-hour rainfall group (RRR, trace
990 counts as 0 mm); a rain day is a daily total of at least 0.2 mm (WMO-No. 100,
`rain_day_threshold_mm`). Temperature extremes are the highest/lowest of the
section 3 maximum/minimum groups and decimal air temperatures, with the time of
each. `provisional` is true unless every contributing reading is `accepted`.
`rain_report_days` out of `days_elapsed` shows completeness. No readings returns
`{"summary": null}`; unreported figures are `null`, never zero.

GMS now fetches this endpoint directly from the existing FastAPI origin
`AUTH_API_URL` and prefix `AUTH_API_V1_STR`, without cookies. Its published-product
pages use `/wxproducts/public/products` at the same origin and generated Kubb
validators. GMS never calls GAA Admin; the old `WXPRODUCTS_API_URL` proxy
origin has been removed. The GAA Admin public-products compatibility route remains
available to other callers.

The website formats labels, icons and units; it no longer selects forecast
revisions or applies expiry rules. During an unreachable/malformed API response,
its navigation uses empty calendar-day placeholders labelled unavailable, never
sample forecast data. No database migration is required.

The GAA forecast editor can append selected headline, description, or instruction
text from `/api/cap/latest-active` to its summary or an evening day’s weather.
The existing authenticated proxy forwards this request to the shared FastAPI
origin. The picker displays CAP status, area, and validity; the active feed may
include test/exercise bulletins. Staff must check applicability. It refreshes the
feed before insertion (the backend feed has a 30-second cache), preserves source
identifier/sender/sent in the copied text, and invalidates the forecast preview.
This is an editable snapshot, not an automatically synchronized CAP reference.
Normal draft saving and publication review still apply. No schema migration.

### Aviation working drafts

FastAPI owns aviation draft persistence in the separate wxproducts database.
`GET /api/v1/wxproducts/aviation/drafts?kind=METAR&station=TGPY` returns up to 50
latest drafts for the exact station/type; kinds are METAR, SPECI and TAF.
`POST` to the same path saves `{id, expected_revision, kind, station, message,
observed_at?, issued_at?, valid_from?, valid_to?}`. A new UUID starts at expected
revision zero. Existing identity (station/type) cannot change. Competing saves
return 409; draft and revision snapshot commit together.
`GET /api/v1/wxproducts/aviation/drafts/{id}/history` returns up to 100 latest
revision snapshots with author identity and recorded time.

`POST /api/v1/wxproducts/aviation/drafts/validate` takes the same fields without
`id`/`expected_revision` and returns `{valid, issues[]}`; each issue has
`severity` (`error` for a code violation, `warning` for reporting practice),
`code`, the offending `group` (or null), a `message` and the `rule` source
(WMO-No. 306 FM 15/16/51, ICAO Annex 3). Findings are advisory: saving a draft
is never blocked, and nothing is saved or transmitted by the check. The
optional `previous_message` (the preceding METAR/SPECI, validate only) lets a
SPECI be compared with the Annex 3 App. 3 2.3 criteria (`speci_no_change`
warning); TAF change groups are checked against App. 5 1.3 (`taf_change_criteria`
warning). Rules and gaps: `docs/operations/eregister-wmo-conformance.md`.

All four routes require the separate `aviation` product-access policy, using
the existing configurable GMS-grade controls (manager, assistant manager and
senior technician defaults). Browser mutations use the existing session/CSRF
flow. Responses are no-store; no aviation draft is included in public products.

Time fields require explicit offsets and normalize to UTC. Unknown times remain
null; validity bounds must be paired and ordered. They are staff-supplied draft
metadata, not decoded or independently verified times. `updated_at` and history
`recorded_at` are backend save times. Exact message text is retained. This does
not implement full WMO/ICAO message validation, issuance, or transmission.

GAA's aviation page can import a browser draft as a new unsaved draft. It retains
the local original and asks staff to check time metadata before saving. Apply
wxproducts Alembic revision `wxproducts_0002` before using API draft storage:

```bash
docker compose -p grenmet-api \
  --env-file apps/api/fastapi/.env.local \
  -f apps/api/fastapi/docker-compose.yml exec api \
  uv run --frozen --package fast-back alembic \
  -c src/wxproducts/alembic.ini upgrade head
```

### Public CAP warning selection

`GET /api/cap/warnings` returns `{as_of, activeCount, groups}` for GMS. FastAPI
owns eligibility, selection of the information block, hazard grouping and
severity ordering. It selects Public-scope, PUBLISHED Alert/Update records
whose sent time is not in the future. Information blocks must be effective
and not expired at the selection clock; an onset in the future does not hide
an already-effective warning. An active English block is preferred, then
sequence/ID order, with one displayed warning per alert. Existing display
hazard groups are retained, with unmatched events under Other warnings.
These event-name groups are presentation categories, not CAP event codes.

CAP status is preserved, including exercise/test messages, which GMS labels
using its existing banners. Missing/invalid response status is a contract
failure, never an implicit Actual warning. Only display fields are exposed;
private records, staff IDs and internal notes are omitted. `activeCount`
counts displayed Actual alerts only; non-Actual alerts remain visible in groups
with their CAP status for drill labelling. Lifecycle state remains
owned by the existing CAP workflow; this endpoint does not change it.

The endpoint and GMS request use no-store. Database/validation failures return
503; malformed responses, HTTP errors and timeouts render Unavailable in GMS,
not No active warnings. GMS validates the generated Kubb contract. Existing
`/api/cap/latest-active` consumers are unchanged. Publishing an Update retires
only the local messages it validly references. Cancelling publishes a distinct
CAP Cancel message that references the original and requires a reason in its
`note`; it preserves the original message identity and XML snapshot. The past endpoint also includes messages
whose information blocks have naturally expired, while replacement links keep
superseded messages out of GMS's Ended list. No database migration.


### Weather product preview

`POST /api/v1/wxproducts/products/preview` accepts `kind`, `values`,
`expectedRevision`, and `changeSummary`. It uses the same browser session/CSRF
and product-kind permissions as authoring. It returns normalized `values`,
publication-readiness `errors`, and UTC `checked_at`, with `Cache-Control: no-store`.
It does not save, issue, reserve a revision, or grant publication approval.
Content errors return 200 with a nonempty errors list; malformed input returns
422 and unauthorized requests return 401/403. The editor requires a successful
preview before human acknowledgement. Publication rechecks content, expiry,
acknowledgement, and optimistic revision in the existing write operation.
Local form defaults remain editing conveniences; the API supplies the reviewed
schedule. GAA uses the generated Kubb request/response contracts.

### Saved weather revision PDFs (2026-09-17)

FastAPI owns `GET /api/v1/wxproducts/products/{product_id}/revisions/{revision}/pdf`. Staff session and product-kind access are required. It renders the exact stored revision, includes draft/withdrawal/archive labels and preserves forecast text, copied CAP attribution, and validity fields. Downloads do not publish or mutate data. Responses are private/no-store; unknown and inaccessible revisions return 404.

GAA Admin offers separate saved and published revision downloads. Unsaved edits must be saved before export; the published copy remains available independently. The legacy Node sample-page export command is retired. No database migration is needed.

### Forecast and bulletin PDF sheets and draft preview (2026-09-24)

Forecast (morning, midday, evening), hazard bulletin and tropical weather outlook revisions render as GMS sheets with WeasyPrint: Jinja2 templates in `src/wxproducts/templates/` (`base`, `forecast`, `bulletin`, `sheet.css`), prepared by `src/wxproducts/forecast_pdf.py`. Forecasts: navy header, headline, conditions, impact-based forecast matrix, alerts and advisories in force, evening four-day cards, contact footer. Bulletins: level banner, synopsis, conditions/details, the bulletin's own IBF assessment, impacts and response. Outlook: special-interest region, systems, formation outlook, source and next update. Colours are `--gm-*` custom properties generated from a token mirror (a test fails on drift). WeasyPrint needs Pango/HarfBuzz/fontconfig system libraries (installed in both API images and in CI).

`POST /api/v1/wxproducts/products/preview/pdf` (operation `wxproductsPreviewProductPdf`) accepts the `/products/preview` body for every product kind and returns `application/pdf` rendered with the same layout, labelled "DRAFT PREVIEW — NOT FOR ISSUE". Same session/CSRF and product-kind access; no-store; nothing is saved. The editor shows this PDF as its live preview, so the reviewed document is the issued layout.

Structured forecast parameters (flat string values, no contract change): `windDirFrom`/`windDirTo` (16-point compass or `Variable`), `windSpeedMin`/`windSpeedMax`/`windGust` in knots, `seaStateFrom`/`seaStateTo` (WMO code table 3700 terms), `waveHeightMin`/`waveHeightMax`/`swellHeight` in metres, `swellDir`, `swellPeriod` (s), `tide1..4Type/Time/Height`, `condition`, `rainChance`; evening days use the same names with a `dayN` prefix. Marine bulletins use the wind, sea and tide groups, wind bulletins the wind group, coastal bulletins `swellDir`/`swellPeriod`/`swellHeight`; marine and dust bulletins take `visibilityMin`/`visibilityMax` in km (composed `visibility` adds nautical miles and the marine term). The outlook adds optional `formationChance48h`/`formationChance7d` (percent), printed as NHC low/medium/high chips. Saved revisions are written as PDF/A-3b; live previews are plain PDF. FastAPI composes the legacy `wind`, `seaState`, `swell`, `visibility`, `highTides`, `lowTides` (and `dayN…`) text from them, only for keys the kind defines, so existing consumers are unchanged (a cyclone's `wind` stays free text). FastAPI stamps the signed-in `forecaster` on every product; for forecasts it also stamps `area` and `advisories`: a JSON summary of active public CAP alerts and current GMS bulletins (`{capturedAt, complete, items[]}`) that the PDF draws. CAP and bulletins remain the authoritative warnings.

### Time-aligned observations

`GET /api/v1/wxproducts/observations` is the staff read contract for SYNOP, METAR and SPECI while the SURFACE adapter is being introduced. It returns one canonical record shape with observation and issue times, the source payload, and provenance for TAC, BUFR, IWXXM and WIS2 publication. The endpoint is read-only; SURFACE remains authoritative for operational capture, quality control and WIS2box publication.

### eRegister structured SYNOP workbook

`POST /api/v1/eregister/observations/validate-synop` accepts the structured
FM-12 workbook model used by GAA Admin. Observers key coded groups as on the
paper register (dd=07, TTT=254, PPPP=0149, VV=65, ww=05). The endpoint checks
each entry against the FM-12 code tables and the WMO-No. 306 Vol. I.2 B/C1
regulations and returns `valid`, field-level `issues`, the normalized workbook
and `decoded` SI values (K, Pa, m s-1, m, kg m-2) for later BUFR, TAC and IWXXM
encoders. Each issue has a `severity`: `error` entries are impossible or
malformed and make the workbook invalid; `warning` entries are reporting
practice advice and never change `valid`. Beyond code ranges the endpoint checks
cross-field rules: the iR/ix indicators against the groups present, the pressure
tendency against its change, cloud type and layer amounts against N and Nh,
and wind speeds of 99 or more as three-digit 00fff. GAA Admin validates before saving and
blocks the save on errors only. A workbook with only identification fields is a
NIL report (`decoded.is_nil_report`). Optional entries beyond the original
workbook are the wet bulb (`wet_bulb`), wind gust (`wind_gust`), relative
humidity (`relative_humidity`) and observer initials (`observer_initials`, not
an observation value). The endpoint does not save, publish, or
transmit an observation; `POST /api/v1/eregister/observations` still stores a
draft.

#### eRegister send actions

`POST /api/v1/eregister/observations/{id}/email` and `.../publish` (permission
`eregister.send`, body `{"resend": false}` optional, `202` with an
`ObservationSend`) queue a saved SYNOP: the first emails the FM 12 text and a
decoded summary to `EREGISTER_OBS_RECIPIENTS` through the notifications outbox,
the second writes a csv2bufr CSV for wis2box through an ARQ job with retries.
`GET /api/v1/eregister/observations/{id}/sends` lists the history (`target`
`email` or `wis2`, `status` `queued`, `sent` or `failed`). Errors: `404` unknown
observation, `409` no recipients or WIS2 not configured, rejected or superseded
or non-SYNOP observation, or already sent without `resend`, `422` the stored
workbook fails validation. Details: `docs/operations/eregister-wmo-conformance.md`.

#### eRegister QC

`POST /api/v1/eregister/observations/{id}/accept`, `.../reject` and `.../reopen`
(permission `eregister.qc`, body `{"reason": "..."}`, `200` with the
`RegisterObservationRead`) move a SYNOP between `draft`/`qc_pending`,
`accepted` and `rejected`. `reject` and `reopen` need a reason. The observer who
saved an observation can never accept it (`403`, superusers included).
`409` wrong state or non-SYNOP, or reopen after a WIS2 send; `422` missing
reason or the workbook fails validation. `GET /api/v1/eregister/observations`
takes `state=` (the QC queue is `draft` and `qc_pending`). `.../publish` (WIS2)
now answers `409` unless the observation is `accepted`; `.../email` still
accepts a validated draft unless `EREGISTER_SEND_REQUIRE_ACCEPTED` is set.
`RegisterObservationRead` gains `qc_by` and `qc_at`. Every decision is audited
(`eregister_observation`).

### GAA operational catalogues

`GET /api/v1/janitorial/spec` and `GET /api/v1/transport/spec` are authenticated
read contracts for the GAA Admin Janitorial and Staff Transportation pages.
FastAPI owns the database connections, Alembic histories, SQL reads, and
response shapes; the web app only renders the generated Kubb contracts. Existing
catalogue rows are adopted in place by the domain migrations, and no write or
seed operation is exposed by these routes. `GET /api/v1/transport/spec` is
deprecated: it reads the frozen v1 catalogue and does not follow published
timetable versions.
`GET /api/v1/janitorial/spec` keeps its v1 shape for any signed-in user but now
omits inactive buildings, sections, areas and tasks; gaa-admin reads the scoped
`/janitorial/catalogue` instead (below).

### Staff transport timetable

The versioned staff-bus timetable (`transport_0003`) backs the gaa-admin bus
portal and will back the driver and staff apps. Routes, shifts, stops and
service calendars are a registry edited in place; trips and stop times belong
to a timetable version.

| Route | Access | Contract |
| --- | --- | --- |
| `GET /transport/access` | signed in | Which portal actions the caller may take; UI hint only, the API still enforces each permission |
| `GET /transport/timetable/current` | signed in | Timetable in force today (Grenada): the published version with the latest effective date on or before today, latest publication winning a same-day tie; 404 before any is in force |
| `GET /transport/catalogue` | signed in | Routes, shifts, stops (with routes serving them today), service calendars — reference data the staff and driver apps also need |
| `POST /transport/routes`, `PUT /transport/routes/{route_id}` | `transport.timetable.manage` | Route numbers unique (409) |
| `POST /transport/stops`, `PUT /transport/stops/{stop_id}` | `transport.timetable.manage` | Stop codes unique (409); latitude and longitude given together or not at all (422) |
| `GET /transport/timetable/versions[/{version_id}]` | `transport.view` | Versions newest first with `state` (`draft`, `scheduled`, `current`, `superseded`, `discarded`); detail adds trips and validation `issues` |
| `POST /transport/timetable/versions` | `transport.timetable.manage` | Starts the single draft as a copy of the version in force; 409 if a draft exists |
| `PUT …/{version_id}`, `POST …/{version_id}/discard` | `transport.timetable.manage` | Draft only (409 otherwise) |
| `POST/PUT/DELETE …/{version_id}/trips[/{trip_id}]` | `transport.timetable.manage` | Draft only; references checked (422); a PUT replaces the whole ordered stop list |
| `POST …/{version_id}/publish` | `transport.timetable.publish` | Effective date today or later (422); `error` issues block publishing (422), `warning` issues do not |

Times are `HH:MM` after service-day midnight and may pass `24:00` (GTFS
convention) for night trips. Stop `timepoint: false` marks an approximate time;
the v1 group times are migrated as approximate. Route 6 trips are migrated as
`awaiting_confirmation` pending GAA HR.

### Stores requisition

The gaa-admin Stores module (routes still under `/salesbus`) is backed by the
`stores` schema of the main database. Callers are placed by their HR employment
record; a client never supplies an organisation or department.

| Route | Access | Contract |
| --- | --- | --- |
| `GET /stores/access` | employed staff | Organisation, department and which actions the caller may take; UI hint only |
| `GET /stores/items`, `/locations`, `/stock`, `/stock-movements` | `stores.view` | Organisation-scoped reads; items carry total `on_hand` |
| `POST /stores/items`, `PATCH /stores/items/{item_id}`, `POST/PATCH /stores/locations[/{location_id}]` | organisation-wide `stores.manage` | SKU and location code unique per organisation (409); items and locations are deactivated, never deleted |
| `POST /stores/stock-movements` | organisation-wide `stores.manage` | `RECEIPT` adds, `ISSUE` removes (reason required), `ADJUSTMENT` sets the counted level (reason required); stock below zero is refused (409) |
| `GET /stores/requisitions[/{requisition_id}]` | `stores.view` | Own requisitions plus submitted-or-later ones of departments where the caller holds `stores.approve` or `stores.manage`; others get 404. `can_*` flags tell the UI what the caller may do |
| `POST /stores/requisitions`, `PATCH …/{id}`, `POST …/{id}/submit`, `POST …/{id}/cancel` | `stores.request`, requester only | `submit: true` on create files and submits at once; edits only while a draft |
| `POST …/{id}/approve`, `POST …/{id}/reject` | `stores.approve` for the requisition's department | Never the requester (403); approval may lower line quantities; rejection needs a note |
| `POST …/{id}/deliver` | `stores.manage` for the requisition's department | Partial delivery allowed; stock is decremented in the same transaction; shortfall 409, over-delivery 422 |

## OpenAPI and generated-client rules

FastAPI is the source of truth for the committed OpenAPI document. Regenerate it
before running Kubb:

```bash
cd apps/api/fastapi
uv run --frozen --package fast-back python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"
cd ../..
pnpm generate:api-client
pnpm check:drift
```

Operation IDs use a stable domain-prefixed camel-case convention such as
`capGetAlert`, `hrCreateLeaveRequest`, and `authLogin`. They are unique public
contract identifiers because Kubb uses them for generated clients and hooks.

Public request and response shapes use Pydantic schemas derived from
`src.models.BaseModel`; SQLAlchemy models remain persistence-layer types.
Datetime responses use `UtcDateTime` and retain OpenAPI `format: date-time`.
Meaningful finite values use named enums, and intentionally opaque maps must be
listed in the schema guard exemption registry.

Every operation should declare a useful summary, description, response model or
explicit raw-media response, success status, and realistic error responses.
Validation failures use the typed `ValidationErrorResponse` envelope; application
errors use the typed `ApiError` envelope.
## eRegister persistence verification — 23 September 2026

Observation creation now uses native datetime values and typed JSONB SQL
bindings. The request/response contract is unchanged. Host-backed tests verify
save/reopen of nested workbook data and optional artifact metadata, UTC response
serialization, draft state and anonymous write denial. Caller-supplied artifact
metadata is not proof of generated or validated BUFR/IWXXM. Lifecycle and
domain-level author/reviewer permissions remain separate acceptance gaps.

### Janitorial portal

`janitorial_0002` adds sites (GND, CRU), area codes, space types, APPA target
levels, contractor staff, building grants, shifts and a `change_events` history
to the separate janitorial database. It backs the gaa-admin `/janitor` portal and
will back the janitor PWA. Every edit sends `expectedRevision`; a stale revision
or duplicate is 409, and each accepted write records history in the same
transaction. Records are deactivated, never deleted. Staff and grant holders are
Barrels Login users referenced by id; names come from the auth service.

**Scope:** role permissions say what a user may do; active building grants say
where. Superusers and `janitorial.scope.manage` holders act on every building;
anyone else only on granted buildings (none by default).

| Route | Access | Contract |
| --- | --- | --- |
| `GET /janitorial/access` | signed in | Portal flags plus `buildingIds` (null = every building); UI hint only |
| `GET /janitorial/catalogue?site=` | `janitorial.view` | Sites, then buildings in scope with sections, areas (`code`, `spaceType`, `cleanlinessLevel`, `quantity`), tasks and bundles; inactive rows included |
| `POST /janitorial/buildings` | `janitorial.catalogue.manage` + all-building scope | New building at a site |
| `PATCH /janitorial/buildings/{id}`, `POST/PATCH /janitorial/sections[/{id}]` | `janitorial.catalogue.manage` + building in scope | |
| `POST/PATCH /janitorial/areas[/{id}]` | `janitorial.catalogue.manage` + building in scope | Code assigned on create (`GND-A0010`); omitted space type and level inferred from the name |
| `POST /janitorial/areas/{id}/tasks`, `PATCH /janitorial/tasks/{id}` | `janitorial.catalogue.manage` + building in scope | Activity names matched by slug, never duplicated |
| `GET /janitorial/staff` | `janitorial.view` | Contractors and staff with Barrels Login name, email and account state |
| `POST/PATCH /janitorial/contractors[/{id}]`, `POST/PATCH /janitorial/staff[/{id}]` | `janitorial.staff.manage` | Staff added by Barrels Login email (404 if no account; 409 if already staff or badge taken) |
| `GET/POST /janitorial/grants`, `POST /janitorial/grants/{id}/revoke` | `janitorial.scope.manage` | Grants by email and building ids; held buildings skipped; revoke is 204 and kept in history |
| `GET /janitorial/shifts?site&from&to` | `janitorial.view` | Shift patterns, zones whose areas are all in scope, and their assignments (range ≤ 62 days) |
| `POST/PATCH /janitorial/shift-patterns[/{id}]` | `janitorial.shifts.manage` | `HH:MM`; a shift ending before it starts runs past midnight |
| `POST/PATCH /janitorial/zones[/{id}]` | `janitorial.shifts.manage` + every area in scope | Areas must be at the zone's site (422) |
| `POST/PATCH /janitorial/shift-assignments[/{id}]` | `janitorial.shifts.manage` + zone in scope | One scheduled assignment per person, shift and date (409); cancel via `status` |

### Approved timestamp/input corrections

CAP create/update and XML import require explicit timezone offsets for supplied
sent/reference/info times. Invalid or mixed offset-free request timestamps return
validation errors before time ordering; historical naive-UTC database output
remains readable. Duplication converts stored timestamps through the UTC public
representation before constructing a new draft.

eRegister creation trims station IDs and rejects blank IDs, offset-free observed
or issued times, and unknown top-level fields. The nested draft `body` remains
an extensible map; read schemas retain historical compatibility. No lifecycle,
permission or database migration is introduced by these validation changes.

Public wxproducts `publishedAt` is a validated timezone-aware timestamp serialized
as UTC with a Z suffix (second precision, matching the shared API serializer).
Security-session `last_used_at` and `expires_at` use the same UTC response format,
including naive-UTC database values. Generated TypeScript fields remain strings
and generated validation schemas carry the date-time constraint.

### CMS editorial feeds — September 29

The single CMS `content` collection and `GET /api/public/content` are retired.
Editorial content lives in bounded collections (`desk-updates`, `stories`,
`questions`, `discover`) plus `weather-now` and `homepage` globals. Anonymous,
published-only feeds: `GET /api/public/home` (every homepage part, each
`{status: "ok", items}` or `{status: "unavailable"}`; `settings` also carries
`sectionCopy` — editor kicker/title/intro by section key, blanks omitted — and
`exploreReading` — published read-more links by Explore today activity;
`reportNotes` and `livePosts` parts added 30 Sep 2026; articles carry
`linkedProduct: {productId, kind} | null`, resolved by GMS through
`/wxproducts/public/products/{id}`),
`/api/public/articles`,
`/api/public/questions` and `/api/public/quizzes`. Reports and imagery are
FastAPI data; the homepage reads reports from `/wxproducts/public/products`.
No FastAPI contract changes; the permission catalogue replaces
`cms.article.publish.*` with `cms.publish.*`, `cms.weather-now.note` and
`cms.homepage.manage`.

### CMS editorial links — September 23 (superseded by the feeds above)

CMS `GET /api/public/content` additionally returns nullable `category` selected
from the post's editorial section and `relatedLinks` (empty for older posts).
Each link exposes only `title`, `category` and `url`; internal Payload row IDs
are omitted. Links use existing HTTP/HTTPS destinations, not product revision
lookups. Staff must check the destination's audience access. Existing anonymous
publication filtering remains unchanged; no FastAPI contract changes occur.

### Daily status shift reporting

Daily status uses `shift_code=M|E|N`; legacy `shift_period=AM|PM` remains readable
for compatibility. `GET /api/v1/hr/status-reports/staffing` takes department,
local report date and shift code, returning published/closed roster staff and
approved absence/leave availability. D assignments remain D in both M/E coverage;
M covers arrival and E covers departure/final verification. Schedules never
prove attendance: unconfirmed staffing is `UNCONFIRMED`, and submission requires
confirmation of all personnel entries and operational answers. This report does
not create or approve the employee's attendance record.

Staffing also returns the linked actual attendance ID, arrival/departure and
workflow review status. M/E coverage references the same D attendance. These
times prefill report observations in Grenada local time; the reporter still
confirms personnel status. Report edits never change actual attendance. The
staffing feed omits employee attendance notes and correction reasons.

`POST /api/v1/hr/status-reports/preview-pdf` renders unsaved form values in Python
without storing a report, workflow or signature. The same renderer serves signed
output, including original equipment/remedy and incident-report fields, resolved
employee names, reporter, supervisor and submission timestamp. Creation, editing,
reading, listing and staffing require scoped department access; personnel rows
must belong to that department. Draft details return persisted personnel rows
with resolved names, arrival/departure observations and notes.

Shift exchanges: `POST /api/v1/hr/shift-swaps/preview-pdf` renders an unsaved,
authenticated PDF with resolved department, employee, counterpart and supervisor
names, using the same Python renderer as the immutable signed submission. It does
not persist a request or signature. Codes are limited to 10 characters; reasons
to 1000. Both employees must belong to the request department. Submission always
adds the counterpart as a required first-stage approver, before the department
approval chain; duplicates are removed and the requester cannot co-approve.
Final approval validates published, open roster assignments again, swaps the
employees' shift codes on the stated local start dates, and records before/after
values and the request reference in roster revisions in the same transaction.
Different-date exchanges require each employee to be off on the date they take
over; same-date exchanges swap their work shifts. Approved leave/absence blocks
the exchange. Overlap checks include adjacent overnight shifts;
recorded actual hours and submitted/approved timesheets require an HR correction
before roster reassignment or reversal. Permanent roster-pattern changes are not handled by this dated
temporary-exchange journey. Pending, rejected and returned exchanges leave the
roster intact. Scoped managers can cancel an approved exchange through its action
route or workflow action; reversal refuses closed rosters or later roster edits
instead of overwriting corrections. The signed submission is not rewritten by
approval or cancellation; agreement, recommendation, decisions and dates remain
in the workflow. A returned signed form can be corrected as a draft and re-signed as a new
immutable revision; prior approval cycles and submitted PDFs remain available.

### Recorded HR service facts

Authenticated employment create/read/update, HR profile, and administrator-only
staff setup expose optional `continuous_service_date`, `probation_end_date`,
`probation_completed_date` and `service_details_source`. Unknown facts remain
null. Recorded dates require an HR source; expected probation end does not imply
completion or determine leave/pay eligibility. PATCH validates merged facts and
preserves omitted fields. Supervisors must have active employment and accounts;
self-supervision and reporting cycles are rejected. See
[recorded service facts](../hr/staff-service-facts.md).

### Legacy manual timesheet integrity

The authenticated legacy timesheet create API verifies active employment in the
filing department and self/proxy authorization before any policy write. Policy,
timesheet and entries commit together. Entry dates must be unique shift start
dates within an ordered period; recorded hours are finite, nonnegative, at most
24 per date with two decimal places. Break duration cannot exceed actual hours,
and recorded hours worked must equal actual hours minus break duration.
Catalogue shifts must exist and match any linked roster assignment. Roster links
are restricted to the filing department's published or closed periods; draft and
foreign-department schedules are not treated as approved work. Submitted legacy
drafts revalidate dates, hours and roster employee/date/department/shift links;
department lists enforce organisation and department
scope. These checks do not derive overtime entitlement or pay. New shift
attendance is the primary arrival/departure journey; historical manual periods
retain their existing date range rather than being rewritten into weeks.
Historical reads, summaries and approvals use the timesheet's filing department,
so transferring an employee does not grant the new department access to old
records. Employees retain access to their own records, and explicitly named
reviewers retain access to the current workflow; approvals still require
`timesheet.approve` and the workflow's stage rules.

Returned leave, absentee, exchange, daily status and parking forms become editable
drafts while their workflow remains `RETURNED`. Resubmission uses the form's
validated submit route and creates a fresh approval cycle; prior workflow logs
remain intact. `workflow_status` on form responses distinguishes a returned draft.
Signed corrections require renewed consent and append an immutable document with
`revision` and `supersedes_document_id`. `signed_document_id` resolves to the latest
revision; every earlier document keeps its original ID, PDF, snapshot and access
checks, and remains in the signed-document history. Same-submission replay cannot
append a duplicate revision. Apply `signed20260928` after `reversal20260928`.

Cancelling approved leave through the scoped workflow or legacy action route
appends one `CANCELLATION_REVERSAL` for the exact recorded `APPROVAL_DEBIT`, rather
than recalculating from mutable form values. Pending cancellation posts no credit;
retry cannot duplicate the reversal. No opening balance, entitlement or pay rule
is inferred. The reversal migration is `reversal20260928`, after `staff20260928`.

### Parking applications

Authenticated parking applications support `POST /hr/parking-permits/preview-pdf`,
reporter-owned `PATCH /hr/parking-permits/{id}` draft edits and
`POST /hr/parking-permits/{id}/submit` with fresh signature consent. Python renders
the supplied Vehicle Pass fields and original security conditions for both draft
previews and signed evidence. Previews save no rows and use `private, no-store`.
The employee must belong to the filing department; proxy filing uses the existing
employee scope. Other actions need an explanation on submission; registration,
insurance date order and issuance validity are validated.

Personal lists include the employee's applications and applications filed by the
reporter; department lists and decal issuance require active organisation and
department scope. `POST /hr/parking-permits/{id}/issue` requires an approved
application and approved linked workflow. Identical issuance retries preserve
the issuer and date; changed issuance is rejected, with renewal/replacement filed
as a new application. Issuance does not rewrite the original signed evidence.

Roster writes and CSV/grid imports enforce the filing department scope and employee membership. They preserve assignment IDs and protect actual attendance and legacy recorded/submitted/approved timesheets. Catalogue and assignment locks serialize timing edits with first punches. Attendance history reads use the recorded filing department after transfers; unchanged terminal reviews reopen as a fresh cycle, retaining prior steps. Generic workflow submission cannot bypass the attendance submit route.

Signed document history also uses the original filing department after an employee transfer. Department read/manage grants do not expose the former department's documents to the new department; SELF-only and expired grants cannot read another employee's history. Existing owner and named counterpart access remains available.


### Explicit CMS access

`PATCH /api/v1/auth/users/{user_id}` accepts `cms_access` (`none`, `writer`,
`publisher`); only superusers may set it, including when the caller otherwise
has `user.manage`. User responses expose the stored level. Public registration
and self-service profile updates cannot grant CMS access.

`GET /api/v1/auth/apps/{app}/me` returns live app-scoped identity and, for CMS,
editorial permission keys. It requires a bearer token for the named app and
rechecks admission. CMS handoff and session exchange require an active,
account with a usable sign-in method and an explicit grant (or a system
administrator). Email verification is not required. CMS tokens cannot access
staff APIs.
Access changes revoke CMS sessions; already-issued tokens read current grants.
The additive `cmsaccess20261007` migration defaults existing users to `none`;
system administrators retain full CMS access.


### Administrator-mediated account activation

- `POST /api/v1/auth/onboarding/accounts` (`authCreateOnboardingAccount`): superuser creates an active, staff-approved account with an unusable random password and password setup pending; no roles or CMS grants are assigned. Existing email/username conflicts return 409.
- `GET /api/v1/auth/onboarding/{user_id}` (`authGetOnboardingStatus`): superuser receives email/activation state and typed GAA Admin/CMS blockers. This is app admission, not HR workflow readiness.
- `POST /api/v1/auth/onboarding/{user_id}/activation` (`authIssueActivation`): requires explicit `identity_confirmed: true`; returns a private URL and expiry once with `Cache-Control: no-store`. The URL uses a fragment so its secret is not sent in page requests. Valid for 30 minutes; replacement invalidates earlier links.
- `DELETE /api/v1/auth/onboarding/{user_id}/activation` (`authRevokeActivation`): superuser revokes outstanding links.
- `POST /api/v1/auth/onboarding/activate` (`authConfirmActivation`): public, rate-limited; takes the one-use token and a 12–128 character password. Requires an active eligible target and an active superuser issuer, unchanged email and credentials. Atomically consumes proof, sets password, clears password setup/email requirement, revokes sessions and outstanding challenges. Does not verify email, approve pending staff, grant roles, change CMS access or reset MFA.

Activation is limited to incomplete or unverified non-superuser accounts. Established verified accounts use the existing recovery process. Issuance, revocation and completion are audited under `account`; links and passwords are excluded from history. No new database migration is required: challenges, account flags and audit storage already exist.


### HR onboarding readiness

`StaffSetup` adds `account_active` and `staff_approval_ready`. `mailbox_ready` is persisted on the staff credential and defaults to unconfirmed for existing records; it is never inferred from account activity. `StaffInput.mailbox_ready` may be omitted or null to preserve the recorded value. HR setup saves never modify account activity, password/email requirements or sessions. Staff approval accepts verified email or completed, audited administrator-issued activation while retaining active membership/grade requirements and ordinary staff-only grants.

### Privileged MFA session evidence

Session responses add optional `session.mfa_verified_at`, preserving compatibility while distinguishing an actual factor challenge from `totp_enabled` enrolment. Account security adds `privileged_mfa_required`, `privileged_mfa_enforced` and `authenticator_storage_ready`; active security sessions expose optional MFA timestamps without secrets. In enforce mode, privileged staff requests and GAA Admin/CMS admission return 403 until encrypted enrolment and a live session challenge are present. Account security/enrolment, recovery and logout remain available. See [rollout and recovery](../operations/privileged-mfa.md).

`AppPhoneCodeVerify` adds optional `totp_code` for enrolled authenticators/recovery codes. Email and phone challenges remain locked until factor verification succeeds and are consumed in that transaction; a missing factor keeps the valid primary code available for the MFA prompt. Failed-factor attempts use the existing account lockout.

Target onboarding app status adds `mfa_enrolment` when enforce mode requires an encrypted enabled factor, and `requires_mfa_sign_in` to distinguish account prerequisites from a future session challenge. Enrolment can make an account ready to sign in; it never declares a target session authenticated. Explicit account `reauth=1` renders a fresh sign-in challenge while preserving the validated return destination.

### HR organisation setup

`POST /hr/organisations` registers an employer identity (permanent ID, unique code,
display name); `PATCH /hr/organisations/{organisation_id}` changes only its name.
Both are superuser-only and audited. Registration does not assign accounts,
activate an app, or grant permissions. Existing organisation IDs remain stable.

HR Setup selects an accessible organisation before loading its departments,
staff, grades and notification settings. Staff, grade and policy setup queries
accept optional `organisation_id`; legacy omitted context remains superuser-only.
`StaffSetup.organisation_id` reports employment ownership, or an initial credential
department if employment has not yet been recorded. `StaffInput.organisation_id`
is optional for compatibility but, when supplied, must match the saved department.

`unassigned=true` on staff setup returns eligible accounts with neither employment
nor staff credentials and cannot be combined with `organisation_id`. Assigning
such an account requires an explicitly chosen department; email domains and
subdomains never establish employer membership. Grade and HR policy reads filter
in SQL before returning data. Shift definitions remain shared reference data;
roster ownership and authorisation still belong to each department.

The effective-access projection adds optional `all_scope_permission_keys` for
controls requiring organisation-wide authority, and `global_permission_keys` for
preserved unscoped legacy authority. A flattened `permission_keys` entry alone
does not prove either scope. Shared roster references require superuser or global
authority; an organisation-wide grant is insufficient. Neither field
overrides the employer and object checks on organisation-owned endpoints. Missing
projection fields keep shared editing disabled. Grade creation/update reports
HTTP 409 for a conflicting department grade definition instead of surfacing a
raw constraint error.


## NHC guidance workspace and reviewed GMS content

`/wxproducts/nhc` in gaa-admin is an NHC collection/viewing workspace. The four
families are tropical development, active cyclones, marine and aviation/reconnaissance.
The outlook and existing hazard bulletin editors live at `/wxproducts/alerts`;
`/wxproducts/bulletins` and the old NHC `?view=editor` URL redirect there. NHC
Products has no authoring link. Authors choose exact source editions inside Alerts.

The authenticated FastAPI interfaces are:

| Method and path (`/api/v1` prefix) | Contract |
| --- | --- |
| `GET /wxwatch/nhc/editions` | `NhcPage`; family/product/storm/UTC dates, latest or collected history, offset/limit |
| `GET /wxwatch/nhc/editions/{edition_id}` | `NhcContent`; preserved text, decoded metadata, verified assets |
| `POST /wxwatch/nhc/pulls` | `NhcPullRequest` → `202 NhcJob`; selected families, one coalesced pull per archive |
| `GET /wxwatch/nhc/jobs/{job_id}` | Durable queued/running/success/partial/failed state and per-product outcomes |
| `POST /wxwatch/nhc/points` | `NhcPointRequest` → `202 NhcJob`; selected grid, native-cell coordinates, distance, units and source validity |
| `POST /wxwatch/nhc/prefill` | `NhcPrefillRequest` → `NhcPrefill`; exact editions, optional marine zone/period, proposals only |
| `GET /wxwatch/nhc/source-checks` | Repeated `edition_ids`; flags a newer edition without modifying content |

Reads use existing staff archive access. Pulls and points require authority for at
least one of outlook/cyclone/marine; prefills require authority for the requested
kind. Existing draft/publish/withdraw policy, CSRF and explicit preview review stay
in force. Assets use the existing authenticated `/wxwatch/assets/{asset_id}` route,
which verifies local checksums before serving originals or derived data.

`NhcEdition` distinguishes issuance, header issuance, observation/analysis,
forecast validity, first receipt and collection checks. Unknown times stay null.
Corrections retain distinct edition identities; failed pulls preserve successful
source bytes and their timestamps. History includes only locally collected editions.
Decoded content/result maps intentionally preserve varying official decoder metadata
and per-product outcomes; measurements are not inferred from graphical pixels.

Optional `ProductGuidance` accompanies the existing scalar values on authored
writes, previews and saved drafts/revisions. It contains exact checksum-bearing
source references, typed facts, stable GMS system UUIDs, parent/embedded relationships,
local assessments and selected graphics/captions. A relationship or cross-edition
system link requires explicit forecaster confirmation. Quantities retain units,
ranges, qualifiers and source passages; observations, analyses and forecasts have
distinct record types and optional reference/validity times. Source facts remain
in WxWatch; reviewed content is snapshotted in WxProducts without cross-database
foreign keys. Source-update checks flag changes without rewriting drafts or issues.

FastAPI composes compatible public scalar summaries. Structured outlook probabilities
are rendered beside their own system and suppress the older bulletin-wide pair;
legacy records retain their original scalar interpretation. Regional marine source
prefills require a GMS local assessment before publication. The live and saved PDF
paths use the same immutable guidance snapshot and verified source graphics.

The separate `nhc-worker` ARQ process drains persisted operator requests on
`grenmet:nhc`; its dispatcher schedule does not initiate collection. There is no
NHC collection schedule, historical backfill, AI extraction, automatic publication
or CAP generation. `gms-ingest` retains its file lock, conditional requests and
size/discovery limits. Durable leases recover interrupted work (up to three claims).
The API mounts the NHC archive read-only; this worker alone gets write access.
Run the WxWatch `0007` migration before using these interfaces.

Grid-prefill requests may supply `point_job_ids` from successfully completed point
jobs for their selected editions. Supported NDFD wind speed/direction, gust and wave
height records become forecast facts with typed `GuidanceGridSample` evidence:
requested/native coordinates, distance, parameter, source value/units, GRIB data and
validity date/time, step range, job ID and record index. Unsupported hazard codes stay
in the viewer. Save/preview validate this evidence against the persisted worker
result. Reviewed values may be edited while native sample evidence stays unchanged;
no interpolated values or automatic regional-to-local scalar inference is made.

GRIB `dataDate`/`dataTime` identify reference cycles, not publication time. Grid edition issuance stays unknown unless explicitly advertised; available forecast validity timestamps are retained separately and native records preserve their exact validity and step range.

## Organisation uploads (F8)

Images for an organisation (Events organiser logo, listing image) go straight to
object storage. Send `X-Barrels-Organisation` (active member of any role) with an
account token or an app-scoped token for the same app.

| Call | Behaviour |
| --- | --- |
| `POST /storage/uploads` | `{app, purpose, content_type, size_bytes}`; purposes `organiser-logo` (2 MB) and `listing-image` (5 MB), JPEG/PNG/WebP only (422 otherwise); returns `{id, method: "PUT", url, headers, expires_at, max_bytes}`. The presigned PUT expires in 15 minutes and signs the content type and exact size. 503 `Uploads are not configured` without storage settings |
| `POST /storage/uploads/{id}/complete` | Checks the object (HEAD) matches the declared type and size, then marks it complete. 409 until the object exists or after the link expires; 422 (object deleted) on a mismatch; repeatable |
| `GET /storage/files/{id}` | `{url, expires_in}`: a 5-minute presigned GET for a completed file of the caller's organisation. Other organisations, pending files and unknown ids are all 404 |
| `GET /storage/public/{id}` | No sign-in. 307 to a 5-minute presigned GET with `Cache-Control: public, max-age=120`, only for completed files of public purposes (logo, listing image); 404 otherwise |

Events stores the resulting file ids: `ListingUpsert.image_file_id`,
`PUT /events/manage/organiser/logo` (`{file_id}`, null clears), returned as
`ListingCard.image_file_id` and `OrganiserPublic.logo_file_id`. A new id must be a
completed upload of that organiser's organisation and purpose, else 409.

## Outbound webhooks (PF6, ADR-0029)

`/webhooks-out/org/*` (owner or admin of an organisation entitled to `webhooks`):
`POST`/`GET /endpoints`, `PATCH`/`DELETE /endpoints/{endpoint_id}`,
`POST .../rotate-secret`, `POST .../test`, `GET .../deliveries` and
`GET /event-types`; superusers also get `GET /webhooks-out/admin/endpoints` and
`POST .../{endpoint_id}/disable`. The signing secret (`whsec_...`) appears only in
the create and rotate responses. Receivers get `POST` JSON
`{id, type, created_at, organisation_id, data}` with `Barrels-Signature:
t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`, `Barrels-Event-Id` and
`Barrels-Event-Type`; answer 2xx within 10 seconds. Redirects are not followed, 410
disables the endpoint, other failures retry (1 minute doubling to 1 hour, 5 attempts)
and 15 failed attempts in a row disable it. Verify the timestamp (reject beyond five
minutes) to stop replays. Adding an event type or a data field is additive.

- **Verified email for money and power** (ADR-0018): `POST /bookings/public/{slug}/bookings` stays anonymous, but a caller who sends a valid sign-in bearer and books a service with a deposit gets 403 `email_verification_required: ...` until the account has verified its email (guests and no-deposit bookings are not gated; a bad token is treated as a guest). The same 403 code answers accepting or being promoted to an organisation admin or owner role, and assigning a staff role. Sign-in and browsing never need verification.

- The deposit gate above is advisory until a host forwards the session: a missing, invalid, app-scoped or activation-pending token is treated as a guest, and the public booking site sends no bearer today. `organisations.service.add_member` also refuses OWNER and ADMIN for an unverified account (403, same code).

## eRegister WIS2 publish gate (ADR-0032)

`POST /api/v1/eregister/observations/{id}/publish` now passes the station-hour
publish gate before queueing. It returns 409 when the station schedule gives
the hour to the automatic source (SURFACE), when the station is not in the
registry, or when another observation already holds the hour. A WIS2 file is
never queued twice, so `resend` no longer repeats a queued or sent publish. The
request and response shapes are unchanged; the optional request body is accepted and ignored.
