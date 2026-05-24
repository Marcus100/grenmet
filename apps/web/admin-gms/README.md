# admin-gms (`@grenmet/web-admin`)

Internal GMS operations dashboard. Port **3001**.

The heaviest and most complex app in the monorepo. Covers HR management (timesheets, rosters, shifts, leave, shift swaps), staff profiles, calendars, and charts. Integrates auth directly with FastAPI rather than delegating to `web-auth`.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
cp apps/web/admin-gms/.env.local.example apps/web/admin-gms/.env.local
pnpm dev:web:admin
```

The app runs on `http://localhost:3001`.

## Run from app directory

```bash
cd apps/web/admin-gms
pnpm dev
```

## Environment Variables

See `.env.local.example`. Required:

- `AUTH_APP_URL` — URL of the `web-auth` app (used for sign-out redirects)
- `AUTH_API_URL` — Base URL of the FastAPI backend
- `AUTH_API_V1_STR` — API prefix, e.g. `/api/v1`
- `SESSION_COOKIE_NAME` — Cookie name, e.g. `grenmet_session`
- `NEXT_PUBLIC_API_URL` — Public-facing URL for the API proxy (used by the client-side React Query layer)
- `RESEND_API_KEY` — Resend API key for server-side email sending

## Auth model

`admin-gms` integrates auth directly — it does **not** redirect to `web-auth` for sign-in. It manages the full sign-in flow internally.

Key files:

| File | Purpose |
|---|---|
| `src/lib/auth-config.ts` | `AuthConfig` object passed to all `@grenmet/auth/server` calls |
| `src/lib/server-session.ts` | Server-side session helpers (read cookie, exchange for access token) |
| `src/lib/auth.ts` | Auth utilities used across Server Components and Route Handlers |
| `src/lib/auth-redirect.ts` | Redirect helpers for unauthenticated requests |
| `src/app/api/[...path]/route.ts` | API proxy — forwards requests to FastAPI with the access token |
| `src/proxy.ts` | Proxy implementation used by the catch-all Route Handler |
| `src/app/auth/logout/route.ts` | `POST /auth/logout` — revokes current session |
| `src/app/auth/logout-all/route.ts` | `POST /auth/logout-all` — revokes all sessions |

The API proxy pattern means client components call `/api/*` (same origin), the Route Handler exchanges the session cookie for an access token, and forwards the request to FastAPI. This avoids exposing the access token to the browser.

## Route groups

```
src/app/
  (admin)/                  ← main authenticated layout (sidebar + header)
    page.tsx                ← dashboard
    (others-pages)/         ← calendar, charts, forms, tables, profile
    (ui-elements)/          ← alerts, avatars, badges, buttons, modals
  (full-width-pages)/
    (auth)/                 ← signin, signup (no sidebar)
    (error-pages)/          ← 404
```

## Key dependencies

| Package | Purpose |
|---|---|
| `@fullcalendar/*` | Calendar views — daygrid, timegrid, list, interaction |
| `apexcharts` + `react-apexcharts` | Charts (bar, line, statistics cards) |
| `@tanstack/react-form` + `zod-form-adapter` | Forms with Zod validation |
| `@tanstack/react-query` | Server state — initialised in `src/providers/QueryProvider.tsx` |
| `@tanstack/react-table` | Data tables |
| `@tanstack/react-virtual` | Virtualised lists |
| `react-dropzone` | File upload |
| `react-error-boundary` | Error boundaries around data-heavy sections |
| `sonner` | Toast notifications |
| `flatpickr` | Date pickers |
| `resend` | Server-side email sending |
| `msw` + `@faker-js/faker` | API mocking and test data generation |

## Testing

This is the **only web app with a test suite** — Vitest unit tests and Playwright e2e.

```bash
# From repo root
turbo run test --filter=@grenmet/web-admin

# Unit tests (from app directory)
pnpm vitest run
pnpm vitest run src/path/to/test.test.ts

# Coverage
pnpm test:coverage

# Playwright e2e (requires running dev server)
pnpm test:e2e
```

Test setup: `src/test/setup.ts`. Uses jsdom, `@testing-library/react`, and MSW for API mocking.

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```

## Notes

- Based on the [TailAdmin](https://tailadmin.com) Next.js template (MIT licensed).
- React Query client config: `src/lib/query-client.ts` — do not create additional instances.
- Consumes FastAPI HR and Auth endpoints via `@grenmet/api-client`.
