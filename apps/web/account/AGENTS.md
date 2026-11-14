# account (`@barrelsgd/web-account`) — agent context

Port **3018**. A person's Barrels account at `account.barrels.gd` (ADR-0057): the
profile (name, email, profile photo) today; security, sessions, organisations
and apps move here in later PRs. Sign-in stays on `auth.barrels.gd`
(`apps/web/auth`): this app never shows a password or code form.

## Auth pattern

- Single sign-on (ADR-0017): `/auth/start` hands off to `auth.barrels.gd`,
  `/auth/callback` redeems the one-use code with `ACCOUNT_SSO_CLIENT_SECRET`,
  `/auth/logout` ends this app's session only. Registry key `account`
  (`apps/api/fastapi/src/auth/apps.py`). The callback returns 503 while the
  secret is empty, so nobody can complete sign-in.
- The session is a host-only `ACCOUNT_SESSION_COOKIE_NAME` cookie
  (`account_session`). `src/lib/session.ts` exchanges it for an app-scoped
  access token on the server; FastAPI checks the token on every call.
- `src/proxy.ts` is closed by default: only `/signin`, `/auth/*` and `/api/*`
  pass without a cookie. Every page needs a session.

## Browser-to-API calls

- The browser calls `/api/v1/*` on this host. `src/app/api/[...path]/route.ts`
  checks the Origin on writes, exchanges the cookie for a bearer token and
  forwards to FastAPI. Only `/api/v1/` paths are forwarded; the body is read with
  a 6 MB cap; redirects (the 307 for a photo) pass through and are never followed.
  The helpers come from gaa-admin (`api-proxy-target.ts`, `request-guards.ts`)
  and are copies; extracting one shared proxy is a follow-up.
- The generated client points at the same origin (`src/lib/api-client-setup.ts`).
  Only mutations (upload, remove) use React Query hooks from
  `@barrelsgd/api-client`. The photo is read on the server
  (`src/lib/profile-photo-api.ts`, `authApiFetch` with the generated Zod schema).
- Photos are shown with a plain `<img>` (through `profilePhotoSrc`, which adds
  `size=256` and a `v=<version>` cache-buster), never `next/image`.

## Profile photo

- `src/lib/profile-photo-rules.ts`: the format (JPEG, PNG, WebP) and the 5 MB
  limit are checked in the browser before any request. The API decides the real
  format and dimensions from the bytes.
- `src/lib/profile-photo-error.ts`: shows the API's `detail` only for 413, 415,
  422 and 503, and only when it is a string; 401/403 ask for a fresh sign-in;
  anything else gets the fallback sentence.
- `src/components/profile-photo/profile-photo-panel.tsx`: the client panel.
  Its Content-Type comes from the chosen file, matching the generated literal.

## Routes

```text
src/app/
  page.tsx                     ← profile: name, email, photo upload/replace/remove (server read, client mutations)
  signin/page.tsx              ← hand-off to auth; `sign_in=expired` says so and offers a retry
  auth/start|callback|logout   ← single sign-on (ADR-0017)
  api/[...path]/route.ts       ← same-origin proxy to /api/v1/* (session → bearer)
  api/health/route.ts
  error.tsx, global-error.tsx, not-found.tsx
```

## Errors and telemetry

- Unexpected errors throw to `error.tsx` / `global-error.tsx`.
- A caught failure that shows a fallback calls `reportError(error, "<area>")`
  from `src/lib/report-error.ts` (the photo read does; the proxy does for an
  unreachable auth service).
- No personal data in Sentry: the page never passes names or emails to it.

## Not built yet (follow-ups)

- Security, sessions, my organisations and my apps pages, with redirects from
  `auth` (ADR-0057 migration steps 2 and 3).
- Content-Security-Policy `img-src`: profile photos redirect to presigned object
  storage; add that origin before the account policy is enforced.
- `render-env.py` and `deploy.yml` do not carry `ACCOUNT_SSO_CLIENT_SECRET` yet;
  the Better Stack monitor and DNS are production-only steps (ADR-0057 step 5).

## Tests

`pnpm --filter @barrelsgd/web-account test` (vitest, jsdom, MSW). The upload
panel tests assert what is sent (method, URL, Content-Type) rather than re-parsing
jsdom file bodies. Run `pnpm exec tsc --noEmit -p apps/web/account` for types.
