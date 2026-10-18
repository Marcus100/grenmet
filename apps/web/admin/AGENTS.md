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
- **Invoicing (P1-P3).** `/invoices` (list with status, search and overdue
  filters), `/invoices/new` and `/invoices/[id]` (draft editor with eight line
  rows, issue, delete draft, record payment, void with reason, PDF download via
  the proxy route `/invoices/[id]/pdf`), `/receivables` (ageing buckets) and
  `/customers`. Same plain-form pattern as C2: server actions in
  `invoices/actions.ts` validate with `src/lib/invoice-form.ts`, proxy through
  `src/lib/billing-api.ts` and redirect with a fixed `?notice=` code. Amounts are
  typed in dollars and converted to minor units by string parsing; this app never
  computes a total or tax figure, FastAPI does. Backend: `src/billing/AGENTS.md`.
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

Not deployed. There is deliberately no Traefik router or compose service: the
`admin.*` host still serves the GAA staff portal until the move to
`gms-admin.*` finishes (plan, "Host move"). The Dockerfile builds the image for
when that happens. To deploy: add the service and `admin.${BASE_DOMAIN}` router
to `infra/docker/docker-compose.deploy.yml`, wire `BARRELS_ADMIN_SSO_CLIENT_SECRET`
(API and web, GitHub environment secrets, env examples, `docs/deployment.md`),
add the app to `scripts/ci/release-scope.mjs` and `select-images.mjs`, set
`BARRELS_ADMIN_APP_URL` on the API, and add `barrels-admin` to the auth app's
directory (`apps/web/auth/src/components/app-directory.tsx`) for its friendly name.
