# admin-gms (`@grenmet/web-admin`) — Claude context

Port **3001**. The heaviest app in the monorepo.

**Design-system role: internal dashboard lane.** Preserve operational density; map TailAdmin aliases back to GrenMet `--gm-*` tokens (highest migration debt). Charts use `var(--gm-*)` directly. See `docs/design-workflow.md`.

## Key dependencies

| Package | Purpose |
| --- | --- |
| `@fullcalendar/*` (6 packages) | Calendar views — daygrid, timegrid, list, interaction |
| `recharts` | Charts (bar, area, statistics) — colors via `var(--gm-*)` tokens directly |
| `@tanstack/react-form` + `zod-form-adapter` | Forms with Zod validation |
| `@tanstack/react-query` | Server state — via `QueryProvider` in `src/providers/` |
| `@tanstack/react-table` | Data tables with `Pagination` component |
| `@tanstack/react-virtual` | Virtualised lists |
| `react-dropzone` | File upload |
| `react-error-boundary` | Error boundaries around data-heavy sections |
| `sonner` | Toast notifications |
| `swiper` | Carousels |
| `flatpickr` | Date pickers |
| `@react-jvectormap` | World map (demographics card) |
| `date-fns` | Date formatting |
| `resend` | Email (server-side) |
| `msw` | API mocking in tests |
| `@faker-js/faker` | Test data generation |

## Auth

Uses `@grenmet/auth/server` directly — not a redirect-delegating app.

- Session management: `src/lib/server-session.ts`
- Auth helpers: `src/lib/auth.ts`, `src/lib/auth-config.ts`, `src/lib/auth-redirect.ts`
- API proxy: `src/app/api/[...path]/route.ts` + `src/proxy.ts`
- Logout routes: `src/app/auth/logout/route.ts`, `src/app/auth/logout-all/route.ts`
- Auth-related env vars: `AUTH_APP_URL`, `AUTH_API_URL`, `AUTH_API_V1_STR`, `SESSION_COOKIE_NAME`, `NEXT_PUBLIC_API_URL`, `RESEND_API_KEY`

## API consumption

Consumes FastAPI HR + Auth endpoints via `@grenmet/api-client`. Initialised in `src/components/providers/ApiProvider.tsx`. Configured via `src/lib/api.ts`.

## Route groups

```
src/app/
  (admin)/           ← main authenticated layout (AppSidebar + AppHeader)
    page.tsx         ← dashboard
    (others-pages)/  ← calendar, charts, forms, tables, profile
    (ui-elements)/   ← alerts, avatars, badges, buttons, images, videos, modals
  (full-width-pages)/
    (auth)/          ← signin, signup (full-width, no sidebar)
    (error-pages)/   ← 404
```

## Consolidated apps (folded in 2026-06)

The former `cap`, `hr`, `wxwatch`, `wxproducts`, and `salesbus` apps now live here as
path-prefixed, auth-gated routes under `(admin)/`. All are gated by
`(admin)/layout.tsx` — no per-page auth code.

| Prefix | Source app | Data | Notes |
|---|---|---|---|
| `/hr` | hr | FastAPI HR API (via api-client) | Print forms; components in `components/hr/` |
| `/cap` | cap | FastAPI `/api/cap/*` (server-side direct) | `CAP_API_URL` env + `getCapApiBaseUrl()`; components in `components/cap/` |
| `/salesbus` | salesbus | mock data (api-client planned) | `CartProvider` scoped via `(admin)/salesbus/layout.tsx`; keeps own `AppShell`; PWA dropped |
| `/wxwatch` | wxwatch | wxwatch Postgres (`WXWATCH_DATABASE_URL`) | client `src/db/wxwatch/` → `wxwatchDb`; `getImageUrl` serves `/wxwatch/<path>` assets |
| `/wxproducts` | wxproducts | wxproducts Postgres (`WXPRODUCTS_DATABASE_URL`) | client `src/db/wxproducts/` → `wxproductsDb`; PDF via `scripts/wxproducts-export-pdf.mjs` (auth-gated; pass `PDF_SESSION_COOKIE`) |

- **DB conventions:** two separate Drizzle clients (never merged). Configs
  `drizzle.{wxwatch,wxproducts}.config.ts`, output `drizzle/{wxwatch,wxproducts}/`,
  scripts `db:{wxwatch,wxproducts}:{generate,migrate}`. Production migrations run from
  the `migrate` Dockerfile stage (image `grenmet-web-admin-migrate`, compose service
  `web-migrate`) via `scripts/migrate-{wxwatch,wxproducts}.mjs`.
- **Fonts:** `Noto_Sans` is loaded in the root layout to back the `--gm-font-document`
  token used by wxproducts forecast/bulletin documents.

## Testing

This is the **only app with tests**. Run from the app directory or via turbo filter.

```bash
# From repo root
turbo run test --filter=@grenmet/web-admin

# Unit tests only (from apps/web/admin-gms)
pnpm vitest run
pnpm vitest run src/path/to/test.test.ts   # single file

# Coverage
pnpm test:coverage

# Playwright e2e (requires running dev server)
pnpm test:e2e
```

Test setup: `src/test/setup.ts`. Uses `jsdom`, `@testing-library/react`, `msw` for API mocking.

## Important conventions

- **No direct `process.env`** — use `src/env.ts` (typed via `@t3-oss/env-nextjs`)
- **`@grenmet/ui` for primitives** — custom UI components in `src/components/ui/` are app-specific wrappers or extensions
- **React Query for client-side server state** — initialised in `QueryProvider`, not for data that can be Server Component fetches
- **`src/lib/query-client.ts`** — shared query client config; do not create new instances
