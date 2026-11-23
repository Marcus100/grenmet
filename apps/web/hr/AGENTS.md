# hr (`@barrelsgd/web-hr`) — agent context

Port **3016**. Host `hr.barrels.gd`, planned and not deployed (S1 scaffold). Barrels
HR is a separate multi-organisation app: the organisation is in the path
(`hr.barrels.gd/<orgSlug>/...`). HR screens still live in `apps/web/gaa-admin`
(`/hr`) until a later slice moves them here. Backend and contract:
`apps/api/fastapi/src/hr/AGENTS.md` and `docs/api/contracts.md` ("HR organisation
ownership").

## Auth pattern

- Single sign-on (ADR-0017): `/auth/start` hands off to auth.barrels.gd,
  `/auth/callback` redeems the one-use code with `HR_SSO_CLIENT_SECRET`,
  `/auth/logout` ends this app's session only. Registry key `hr`, staff scope
  (`apps/api/fastapi/src/auth/apps.py`). The callback answers 503 while the
  secret is empty, so sign-in is off.
- The session is a host-only `HR_SESSION_COOKIE_NAME` cookie (default
  `hr_session`). `src/lib/session.ts` exchanges it for an app-scoped access token
  on the server. FastAPI checks that token on every call.
- `src/proxy.ts` is closed by default. Only `/signin`, `/auth/*` and
  `/api/health` pass without a cookie. Every other page needs a session.

## Organisations

- `src/lib/hr-organisations.ts` (server-only) reads
  `GET /api/v1/hr/me/organisations` with `authApiFetch` and the generated Zod
  schema. The list is decided by FastAPI from live employment and role
  assignments; the app never builds it.
- `/` is the organisation picker. Each organisation links to `/<slug>`. An empty
  list is the "No HR access yet" state (`src/components/no-access.tsx`). It is not
  an error and is not reported.
- `/<orgSlug>` only shows an organisation from the person's own list. Any other
  slug gets "No access to this organisation", with the same wording whether or
  not the organisation exists.
- A failed read says "could not load" and calls
  `reportError(error, "hr-organisations")`.
- `src/lib/organisation-access.ts` is the one slug check every organisation page
  uses. Staff: `src/lib/hr-staff.ts` reads `GET /api/v1/hr/setup/staff?organisation_id=`
  (`hr.setup.manage` in that organisation). A 403 is "HR administrators only", a
  404 is the same no-access wording as a foreign slug; neither is reported. It never looks like an empty list.
- Scope wording lives in `src/lib/organisation-scope.ts` (SELF, DEPARTMENT, ALL).

## Rules

- Types, fetch clients and Zod schemas come from `@barrelsgd/api-client`. Never
  hand-write an HR response type.
- Server Components by default. No React Query yet: there are no client
  mutations or polling in S1.
- Unexpected errors throw to `error.tsx` and `global-error.tsx`. A caught failure
  that shows a fallback calls `reportError` from `src/lib/report-error.ts`.
- No personal data in Sentry: pages never pass names or emails to it.
- Styling uses shadcn semantic tokens and `@barrelsgd/ui` primitives only, with
  the navy primary button (`docs/design/gaa-admin.md`, `docs/design/account.md`).
- Env is read only through `src/env.ts`. No `process.env` in app code.

## Routes

```text
src/app/
  page.tsx                 ← organisation picker (server read)
  [orgSlug]/page.tsx       ← one organisation's home (server read, slug checked)
  [orgSlug]/staff/page.tsx ← staff list for HR admins (read-only; API decides access)
  [orgSlug]/me/page.tsx    ← own employment and leave balances (slug checked first)
  signin/page.tsx          ← hand-off to auth; `sign_in=expired` says so
  auth/start|callback|logout
  api/health/route.ts
  runtime-env.js/route.ts  ← public settings for the browser
  error.tsx, global-error.tsx, not-found.tsx
```

Top-level folders must stay in the reserved-names list (`docs/ports.md`,
`apps/api/fastapi/src/utils/reserved_names.py`). `tests/test_reserved_names.py`
checks this for `hr`. Organisation slugs are dynamic, so they never become
folders here.

## Not built yet

- HR screens (roster, approvals, leave, timesheet, documents, setup) move here
  from gaa-admin in later slices.
- Deployment: no Dockerfile, release-scope entry, Compose service, Traefik route
  or Cloudflare origin rule. These are owner-merge deploy changes.
- Root `dev:web:hr` script (root `package.json` is owner-merge). Use
  `pnpm --filter @barrelsgd/web-hr dev`.

## Commands

```bash
pnpm --filter @barrelsgd/web-hr test        # vitest, jsdom, MSW
pnpm --filter @barrelsgd/web-hr type-check
node scripts/ci/check-ports.mjs             # 3016 must agree in every file
```

Dev server: `pnpm --filter @barrelsgd/web-hr dev` (host only).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
