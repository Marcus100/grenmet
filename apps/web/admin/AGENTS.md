# admin (`@barrelsgd/web-admin`) — agent context

Port **3012**. The Barrels control plane: a Barrels-wide, superuser-only
console. Lane spec: `docs/design/admin.md`. Plan: slice C1/C2 in
`docs/exec-plans/barrels-foundations-plan.md`; product shape in
`docs/exec-plans/barrelsgd-transition.md` ("Barrels hub and administration").

## Boundary

- **Barrels staff only.** No GMS or GAA business modules here, and it never
  merges with the client portal (`apps/web/gaa-admin`). Do not import
  `gaa-admin` code or `@barrelsgd/gms`.
- **Organisation management (C2).** Detail page actions: verify/unverify with a
  required reason, edit, suspend/reactivate (confirm), per-app entitlement
  toggles, members and change history; `/organisations/new` creates one. They are
  plain forms posting to server actions (`organisations/actions.ts`) that
  validate with `src/lib/organisation-form.ts`, proxy to FastAPI and redirect with
  a fixed `?notice=` code. Disclosures are native `<details>`; no client state.
  Never fake data.
- **Moderation (organiser verification).** `/moderation` (queue with
  Pending/Approved/Rejected tabs, paginated) and `/moderation/[id]` (case,
  owners, history), linked from the console nav. Reads and decisions proxy
  `/admin/moderation/organisers*` (`src/lib/moderation-api.ts`); Approve and
  Reject are server actions in `moderation/actions.ts` that re-check the staff
  gate, validate with `src/lib/moderation-form.ts` (reject needs a 3-500
  character reason) and redirect with a fixed `?notice=` code (`approved`,
  `rejected`, `already-decided`) or return a code (`invalid`, `mfa`,
  `not-allowed`, `suspended`, `missing`, `throttled`, `failed`) plus the typed
  reason. API 409 maps to `suspended` when the detail says so, else
  `already-decided` (decisions are transitions, never retried). Decisions need
  an MFA superuser: a superuser without MFA can read and gets the `mfa` guidance
  on a decision. A moderator who is not a superuser never reaches these pages
  (the staff gate is superuser-only, ADR-0039); FastAPI re-checks every call.
  Unexpected failures call `reportError(error, "admin-moderation")`.
- **Sites (C3).** The organisation detail page has a "Sites" section (streamed
  behind `Suspense`, with loading, empty and error states) for the organisation's
  public sites (`org.public_site`): list, create and edit via
  `organisations/site-actions.ts` and `src/lib/site-form.ts`. The key is permanent
  (a-z0-9 and hyphens, max 40). Edits are diffed against the stored site so
  `PATCH /organisations/admin/sites/{id}` only receives changed fields. The
  Turnstile secret is write-only: the form never has a value for it, an empty
  field means "keep", "Clear secret" sends `null`, and it never enters a redirect
  or report. A 503 means secret storage (`ORG_SECRET_ENCRYPTION_KEYS`) is not
  configured and shows an operator message. `bookings` and `rewards` entitlements
  arrive through `available_apps` and need no extra code.
- **Invoicing (P1-P3).** `/invoices` (list with status, search and overdue
  filters), `/invoices/new` and `/invoices/[id]` (draft editor with eight line
  rows, issue, delete draft, record payment, void with reason, PDF download via
  the proxy route `/invoices/[id]/pdf`), `/receivables` (ageing buckets) and
  `/customers`. Same plain-form pattern as C2: server actions in
  `invoices/actions.ts` validate with `src/lib/invoice-form.ts`, proxy through
  `src/lib/billing-api.ts` and redirect with a fixed `?notice=` code. Amounts are
  typed in dollars and converted to minor units by string parsing; this app never
  computes a total or tax figure, FastAPI does. Backend: `src/billing/AGENTS.md`.
- **Feature flags (PF7).** `/flags` lists flags (key, enabled, exposed, audience
  summary, owner, success metric, review/expiry, "Stale" badge from
  `GET /feature-flags/admin/stale`), with create, edit and delete. The form is a
  client component on `useActionState` (`flags/actions.ts`) so the API's 422
  (success metric required to enable outside local) is shown inline without
  going into a URL; edits send only changed fields (dates compare by day).
  Always show the warning that other API workers pick changes up within 30
  seconds. Needs `feature_flags.manage`; backend: `src/feature_flags/AGENTS.md`.
- **API keys (PF5).** The organisation detail page has an "API keys" section
  (Suspense, loading/empty/error): prefix, scopes, expiry, last used, state and a
  confirmed revoke (`organisations/api-key-actions.ts`). There is deliberately no
  create or rotate here: those are organisation-admin (org zone) actions because
  the one-time secret belongs to that admin. This app never has a key secret.
- **Payments (PF4).** `/payments`: balances per organisation, the ledger
  (paginated, filterable), reconciliation per period and organisation with the
  CSV through the proxy route `/payments/reconciliation.csv`, and "record
  payout" as two steps: a GET form proposes, the page shows a confirmation, and
  only `recordPayoutAction` (POST) writes. Amounts are typed in dollars, sent as
  integer minor units and shown as XCD with two decimals. A banner states the
  Stripe adapter is test mode only with no live card rail; do not remove it
  before the ADR-0027 gate. Backend: `src/payments/AGENTS.md`.
- Backend logic stays in FastAPI. This app validates, proxies and renders; it
  has no database access and no business rules.

## Auth (ADR-0017 single sign-on)

- Registry key `barrels-admin` in `apps/api/fastapi/src/auth/apps.py`:
  `scope="staff"` (ordinary staff tokens, so superuser routes work) plus
  `superuser_only=True`. Non-superusers are refused at the handoff on
  auth.barrels.gd ("Barrels staff only"), at session exchange and at account
  "Join"; there is no access-request path.
- Flow: `/signin` -> `/auth/start` -> auth.barrels.gd `/continue` ->
  `/auth/callback` (redeems the code with `BARRELS_ADMIN_SSO_CLIENT_SECRET`).
  A failed callback lands on `/signin?sign_in=expired`, which explains instead
  of redirecting again (no loop).
- `src/proxy.ts` only checks that the cookie exists. The real check is
  `src/lib/staff-gate.ts` (`getStaffGate`/`requireGate`): exchange the session
  for an access token and require `user.is_superuser`. Every page calls it
  itself, because layouts and pages render in parallel. A non-superuser gets
  `<StaffOnly />`; FastAPI re-checks on every call.
- Session cookie `barrels_admin_session` (host-only). Logout ends only this
  app's session (`POST /auth/logout`).

## API consumption

Server-side only, through `authApiFetch` with the session's access token and
Zod schemas from `@barrelsgd/api-client` (`src/lib/api.ts`):

- `GET /organisations`, `GET /organisations/{id}`, `POST/PATCH /organisations`, `POST /organisations/{id}/verify|unverify`, `PUT /organisations/{id}/apps/{key}`, `GET /organisations/{id}/admin/members`, `GET /audit/platform_organisation/{id}` (superuser only; see
  `apps/api/fastapi/src/organisations/AGENTS.md`).
- `/billing/customers`, `/billing/invoices` (+ `/issue`, `/void`, `/payments`, `/pdf`) and `/billing/receivables` (`billing.manage` or superuser; `src/lib/billing-api.ts`).
- Status probes (`src/lib/status.ts`): `GET /utils/health-check/` and
  `GET /utils/ready/`. The API has no worker heartbeat or deploy-history
  endpoint, so those cards say "Unknown"/"Not set". Add the endpoint first,
  then the card.

## Env and tests

Typed env in `src/lib/env.ts` (see `docs/env.md` -> admin). Tests run in jsdom
with `SKIP_ENV_VALIDATION` and fixed values from `vitest.config.ts`.
`pnpm --filter @barrelsgd/web-admin test | type-check`.

## Deployment

Compose service `web-admin` (image `barrelsgd-web-admin`, port 3012, health
`/api/health`) serves it at `admin.${BASE_DOMAIN}` (owner decision 2026-10-21;
it reaches production when the change is promoted to `main`). It is in
`scripts/ci/release-scope.mjs`. The GMS/GAA portal moved to `gms.*`
(service `web-gmsadmin`). Secret `BARRELS_ADMIN_SSO_CLIENT_SECRET` (GitHub
environment secret, same value for the API and this app; empty keeps sign-in
off). Host runbook, DNS and rollback: `docs/deployment.md`, "Admin
host move". Still open: a Sentry DSN for the app and an availability monitor.
