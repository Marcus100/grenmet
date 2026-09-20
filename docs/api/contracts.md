# API Contracts

This guide documents the current FastAPI contract conventions. It complements the generated OpenAPI schema at `apps/api/fastapi/openapi.json` and the generated TypeScript client in `packages/api-client`.

## When to update this document

Update this document whenever you:
- Add or remove a public or CAP endpoint
- Change authentication requirements on an existing endpoint
- Change the error shape or add a new error category
- Change pagination defaults or response structure
- Add a webhook endpoint or change its verification behaviour

This document must stay in sync with the code. Do not mark a gap as resolved until the implementation exists.

## Base URLs

| Environment | API base URL |
| --- | --- |
| Local | `http://localhost:8000` |
| Staging | `https://api.staging.barrels.gd` |
| Production | `https://api.barrels.gd` |

Versioned FastAPI routes use `/api/v1`. Public CAP feed routes use `/api/cap`.

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
| `GET /api/v1/wxproducts/products?kind=marine&issue_date=2026-09-17` | `{ products: StoredProduct[] }`; selected kind/date plus undated drafts, newest update first |
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
5. Commit `openapi.json` and generated client changes together.

CI also regenerates the client and fails if `packages/api-client/src/gen` differs from the committed output.

## Authentication

The API supports two auth paths:

| Flow | Endpoint | Use |
| --- | --- | --- |
| OAuth2 password grant | `POST /api/v1/login/access-token` | Direct API consumers and tests |
| Web session | `POST /api/v1/login/session` then `POST /api/v1/login/session/access-token` | Browser apps using an opaque session cookie |

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

## HR Contract

All HR routes are under `/api/v1/hr`, require an authenticated session, and are gated
by permission keys from `src/auth/permissions.py` (`tests/auth/test_permission_registry.py`
fails if a key used in code is missing from the catalog). Routers:
`profile`, `rosters`, `calendar`, `timesheets`, `leave-requests`, `shift-swaps`,
`absentee-reports`, `status-reports`, `parking-permits`, `documents`, `workflows`.

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


### Roster calendar feed

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/hr/rosters/assignments` | none for `scope=me`; `roster.view` for `scope=department` | Rostered days in a range, expanded to concrete times |

Draft periods are returned only to callers holding `roster.manage`, flagged
`is_draft: true`. For everyone else a roster is not real until it is published.

### Local wall-clock times

`starts_at_local` / `ends_at_local` on both the calendar and roster feeds are ISO-8601
**without an offset**. They are department-local wall-clock times, the frame the shift
catalog and the printed roster already use: a 05:30 morning shift is 05:30 on the wall
in Grenada. They are deliberately **not** `UtcDateTime` — stamping them UTC would move
every shift four hours. Real timestamps (`created_at`) remain `UtcDateTime`. On write,
an offset supplied by a client is dropped rather than converted, so one calendar never
carries two time bases.

## Public CAP Feed Contract

Public CAP routes are mounted outside `/api/v1`. They expose **only `scope == Public`
alerts** — Restricted/Private alerts (and their raw XML snapshots) are never served on
these anonymous endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cap/latest-active` | Active published alerts |
| `GET /api/cap/alerts` | Published, expired, and cancelled alerts |
| `GET /api/cap/past` | Expired and cancelled alerts |
| `GET /api/cap/alerts/{identifier}` | Public alert by CAP identifier |
| `GET /api/cap/alerts.geojson` | Active alerts as GeoJSON |
| `GET /api/cap/active-map` | Active alerts as GeoJSON for map consumers |
| `GET /api/cap/rss.xml` | Active alerts RSS feed |
| `GET /api/cap/{identifier}.xml` | Latest CAP XML snapshot for an identifier |

CAP management routes are under `/api/v1/cap` and require authenticated users plus permission checks.

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

- Request IDs and correlation IDs.
- RFC 7807 Problem Details.
- Idempotency keys.
- Global response validation middleware.
- API deprecation headers or a formal deprecation policy.
- Contract tests against generated clients.

Do not claim these exist in downstream docs until the code implements them.


### HR dashboard

`GET /api/v1/hr/dashboard` requires an authenticated, active account. It returns the current user's recorded vacation balance (null when absent), recent personal HR records and open-request count, published roster entries for the active employment department, and permission-scoped actionable approvals. A superuser without employment sees organisation-wide roster and employment counts; an ordinary account without employment sees only its own records. Dates use America/Grenada. Roster entries describe scheduled work/time away, not observed attendance. No sample statistics or inferred leave entitlement are returned.

### Employee membership and account security

Employment records may represent confirmed department/grade membership with a null employee number or employment type. `EmploymentPublic` includes `grade`, `supervisor_name` and `details_complete`; clients must display unknown fields explicitly rather than infer values. `GET /api/v1/auth/modern/security` returns current-account security status and active-session metadata, never bearer tokens, session secrets or TOTP secrets. Existing `/2fa/setup` and `/2fa/activate` endpoints provide enrollment; setup rejects an already-enabled authenticator.

Managed HR workflows must be created through their form submission endpoints. Public generic workflow creation cannot attach a new workflow to a managed HR record. Finalization validates the record's authoritative workflow and department before status or balance changes. The dashboard honours `roster.view` for department data and preserves personal roster access when that permission is absent.

HR form submission dates: leave, shift swap, absentee, daily status and parking public responses include nullable `submitted_at`, projected from the linked workflow (including list and mutation responses). Timesheets retain their existing field. Missing legacy timestamps remain null; creation/update dates are never substituted. Printable HR documents and submission lists display the date in America/Grenada, with drafts marked Not submitted and missing historical dates marked Not recorded. Signature lines remain unsigned.


### Registration approval and recovery

Public signup creates an active but `registration_pending` account and requires email verification. `ALLOW_PUBLIC_SIGNUP` defaults to true; explicitly setting it false closes registration. Pending accounts cannot obtain sessions, use bearer-authenticated endpoints, or complete Google sign-in. Existing accounts default to approved when the migration is applied. Signup accepts passwords of 12–128 characters and ignores privilege fields. Verification delivery failure preserves the pending account so verification can be requested again.

After email verification, an administrator saves department/grade membership and issues the permanent staff credential, then calls `POST /api/v1/hr/setup/staff/{user_id}/approve-registration`. Approval requires active employment and a non-revoked credential, grants the existing `staff` role with self scope, and writes an audit entry. It does not infer management privileges from a grade. Missing employee number, employment type or start date does not block credential activation; `StaffCard.employment_ready` reports this separately from account approval and email verification. HR submission readiness rules still apply.

Password recovery uses a hashed, expiring, single-use challenge. Resetting or changing a password invalidates outstanding challenges and saved sessions. Old JWT-based reset links must be replaced by requesting a new link. New and changed passwords require 12–128 characters.

`POST /api/v1/auth/modern/security/recovery-codes` requires the current password and an authenticator or existing recovery code. It returns eight new codes once, stores only their hashes and invalidates previous codes. Recovery codes can replace the authenticator code at password or Google sign-in and are consumed once. `/2fa/disable` requires both password and a factor code, and clears recovery codes. `DELETE /api/v1/auth/modern/security/sessions/{session_id}` revokes only a session owned by the caller; foreign or missing sessions return 404. Already-issued bearer tokens retain their configured short lifetime.

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
editable display-only fields. Existing paper preview layouts remain available for
unsigned drafts. Signing the submission does not apply signatures for approvers.


## WxWatch gallery reads

`GET /api/v1/wxwatch/metadata?day=YYYY-MM-DD` accepts the existing bearer token or session cookie and returns `{groups: [{productKey, name, synopticImages}]}`. Each group contains all eight UTC three-hour slots, with null for missing images. Selection floors observations into their three-hour bucket; GOES-19 uses the closest observation to the bucket start, other sources use the latest fetch. Date bounds are inclusive midnight to exclusive next midnight. Responses are private/no-store; missing database configuration returns 503. Raw collector metadata is not exposed.

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
periods with null sources and no invented forecast values.

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

GMS now fetches this endpoint directly from the existing FastAPI origin
`AUTH_API_URL` and prefix `AUTH_API_V1_STR`, without cookies. Its published-product
pages use `/wxproducts/public/products` at the same origin and generated Kubb
validators. `WXPRODUCTS_API_URL` (the old GAA Admin proxy origin) is no longer used
by these fetchers. The GAA Admin public-products compatibility route remains
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

All three routes require the separate `aviation` product-access policy, using
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
includes displayed non-Actual bulletins as before. Lifecycle state remains
owned by the existing CAP workflow; this endpoint does not change it.

The endpoint and GMS request use no-store. Database/validation failures return
503; malformed responses, HTTP errors and timeouts render Unavailable in GMS,
not No active warnings. GMS validates the generated Kubb contract. Existing
`/api/cap/latest-active` consumers are unchanged. No database migration.


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

GAA Admin offers separate saved and published revision downloads. Unsaved edits must be saved before export; the published copy remains available independently. The PDF uses a server-generated text layout, not a pixel-identical browser preview. The legacy Node sample-page export command is retired. No database migration is needed.

### Time-aligned observations

`GET /api/v1/wxproducts/observations` is the staff read contract for SYNOP, METAR and SPECI while the SURFACE adapter is being introduced. It returns one canonical record shape with observation and issue times, the source payload, and provenance for TAC, BUFR, IWXXM and WIS2 publication. The endpoint is read-only; SURFACE remains authoritative for operational capture, quality control and WIS2box publication.

### eRegister structured SYNOP workbook

`POST /api/v1/eregister/observations/validate-synop` accepts the structured
FM-12 workbook model used by GAA Admin. It validates the identification fields,
Section 1 global groups, and Section 3 regional/national groups and returns
`valid`, field-level `issues`, and the normalized workbook. Draft creation
remains available through `POST /api/v1/eregister/observations`; validation is
currently advisory while the full WMO code-table encoder is being added. The
validation endpoint does not save, publish, or transmit an observation.

### GAA operational catalogues

`GET /api/v1/janitorial/spec` and `GET /api/v1/transport/spec` are authenticated
read contracts for the GAA Admin Janitorial and Staff Transportation pages.
FastAPI owns the database connections, Alembic histories, SQL reads, and
response shapes; the web app only renders the generated Kubb contracts. Existing
catalogue rows are adopted in place by the domain migrations, and no write or
seed operation is exposed by these routes.

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
