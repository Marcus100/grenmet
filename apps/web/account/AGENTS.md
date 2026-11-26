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
  secret is empty, so nobody can complete sign-in. That is the state on
  production (14 Nov 2026): the secret is not set there, so sign-in is off. On
  staging sign-in works; the account app asks no "Join" question, since its
  default role is granted on first sign-in (#1335).
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
  page.tsx                     ← profile: name, email, "Finish your profile" checklist, photo upload/replace/remove (server reads, client photo mutations)
  profile/name|phone/page.tsx  ← one-field editors; server actions in `profile/actions.ts` PATCH `/auth/users/me/profile`
  bookings/page.tsx            ← My bookings: Upcoming, Past and Cancelled tabs (?view=), grouped by day, server read; each row links to its manage page
  signin/page.tsx              ← hand-off to auth: renders "Taking you to sign in" (`SignInHandOff`, a client leaf that moves the browser on, with a link); `sign_in=expired` says so and offers a retry
  auth/start|callback|logout   ← single sign-on (ADR-0017)
  api/[...path]/route.ts       ← same-origin proxy to /api/v1/* (session → bearer)
  api/health/route.ts
  error.tsx, global-error.tsx, not-found.tsx
```

## Finish your profile

`ProfileChecklist` (email, name, phone, photo; `src/lib/profile-checklist.ts`) reads `GET /auth/users/me/profile`; the API decides `name_is_placeholder`. The phone is a contact number (`user.contact_phone`), not the sign-in number; the UI says nothing about verification. Actions report failures with no typed value. States and copy: `docs/design/account.md`.

## My bookings (ADR-0058, slice 1)

- Three tabs, one list per load: Upcoming (`upcoming=true&cancelled=false`,
  soonest first), Past (`upcoming=false&cancelled=false`, newest first) and
  Cancelled (`cancelled=true`). The tab is `?view=upcoming|past|cancelled`
  (`src/lib/booking-tabs.ts`; anything else is Upcoming) and the page is
  `?page=` (`size=20`). A cancelled booking is listed under Cancelled only: the
  API applies the filter in SQL, so paging stays correct.
- Rows are grouped by the local day they start (`src/lib/booking-days.ts`,
  `BookingDayList`, a client leaf). The API's order is kept inside each group.
  Before hydration the days and times are UTC and the times say "UTC"; after
  hydration they switch to the viewer's zone. The API sends no timezone, so
  nothing is assumed.
- Each row's main action is `manage_url` (the booking's manage page on the
  bookings app: Reschedule, Cancel, Add to calendar), a signed link the API mints
  per row and that works until a week after the booking ends. The business page
  stays a second link. A row with no `manage_url` (the stored token was cleared
  or the link lapsed) shows only the business link.
- `BOOKINGS_APP_URL` (server env, `docs/env.md`; compose sets it on `web-account`)
  builds each business link, `src/lib/bookings-site.ts`.
- Empty states say what each tab holds and what to do (`BOOKING_TABS`). Each
  tab's list fails on its own.
- A first 401 redirects to sign-in once, with `reauth=1` in the return path. A
  401 that arrives with that marker shows the section's inline message and does
  not redirect again (no sign-in loop). Other 4xx show the inline message without
  a report; anything else is reported with `reportError(error, "account-my-bookings")`.
- `AccountNav` (Profile, My bookings) sits at the top of both pages.

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
- Production wiring (#1335, ADR-0057 step 5): `render-env.py` and `deploy.yml`
  carry `ACCOUNT_SSO_CLIENT_SECRET` (PR #1360), but the secret is not set on
  production yet. The Cloudflare origin-secret rule must be re-applied for
  production before the host goes live there (done for staging on 14 Nov 2026;
  `docs/operations/cloudflare-proxy.md`, step 3). The Better Stack monitor and
  DNS are production-only steps too.
- No "Join" prompt for this app: `join_prompt=False` in the API registry (#1335).

## Tests

`pnpm --filter @barrelsgd/web-account test` (vitest, jsdom, MSW). The upload
panel tests assert what is sent (method, URL, Content-Type) rather than re-parsing
jsdom file bodies. Run `pnpm exec tsc --noEmit -p apps/web/account` for types.
