# gaa-admin (`@barrelsgd/web-gaa-admin`) — agent context

Port **3001**. The heaviest app in the monorepo.

**Design-system role: internal dashboard lane.** Preserve operational density; map TailAdmin aliases back to GMS `--gm-*` tokens (highest migration debt). Charts use `var(--gm-*)` directly. See `docs/design-workflow.md`.

## Key dependencies

| Package | Purpose |
| --- | --- |
| `@fullcalendar/react` (v7) | Calendar views — v7 consolidated package; plugins via `@fullcalendar/react/{daygrid,timegrid,list,interaction,multimonth}` subpaths + `useCalendarController`. Shared component: `components/calendar/event-calendar.tsx` (used by `/calendar`). Its three data layers are mapped in `components/calendar/calendar-sources.ts` — department events, the duty roster, public holidays — kept pure and React-free so they are unit-testable |
| `recharts` | Charts (bar, area, statistics) — colors via `var(--gm-*)` tokens directly |
| `@tanstack/react-form` + Zod standard schemas | Forms with Zod validation |
| `@tanstack/react-query` | Server state — via `QueryProvider` in `src/providers/` |
| `@tanstack/react-table` | Data tables with `Pagination` component |
| `react-error-boundary` | Error boundaries around data-heavy sections |
| `sonner` | Toast notifications |
| `date-fns` | Date formatting |
| `resend` | Email (server-side) |
| `msw` | API mocking in tests |

## Auth

Uses `@barrelsgd/auth/server` directly — not a redirect-delegating app.

- Session management: `src/lib/server-session.ts`
- Auth helpers: `src/lib/auth.ts`, `src/lib/auth-config.ts`, `src/lib/auth-redirect.ts`
- API proxy: `src/app/api/[...path]/route.ts` + `src/proxy.ts`
- Logout routes: `src/app/auth/logout/route.ts`, `src/app/auth/logout-all/route.ts`
- Auth-related env vars: `AUTH_APP_URL`, `AUTH_API_URL`, `AUTH_API_V1_STR`, `SESSION_COOKIE_NAME`, `NEXT_PUBLIC_API_URL`, `RESEND_API_KEY`

## API consumption

Consumes FastAPI HR + Auth endpoints via `@barrelsgd/api-client`. Initialised in `src/components/providers/ApiProvider.tsx`. Configured via `src/lib/api.ts`.

## Route groups

```
src/app/
  (admin)/           ← main authenticated layout (AppSidebar + AppHeader)
    page.tsx         ← GMS operations dashboard (live panels in `_components/`)
    cap/ hr/ roster/ salesbus/ wxwatch/ wxproducts/   ← consolidated GMS routes
    (others-pages)/  ← calendar (department calendar: events + roster + holidays), profile
    coming-soon/     ← placeholder page for target-IA nav items with no page yet
  (full-width-pages)/
    (auth)/          ← signin, signup (full-width, no sidebar)
    (error-pages)/   ← 404
```

The UI font is user-selectable via `@barrelsgd/theme`'s font switcher (registry in
`src/lib/fonts/registry.ts`, `data-font` CSS in `globals.css`); default Inter,
print documents always Noto Sans.

## Consolidated apps (folded in 2026-06)

The former `cap`, `hr`, `wxwatch`, `wxproducts`, and `salesbus` apps now live here as
path-prefixed, auth-gated routes under `(admin)/`. All are gated by
`(admin)/layout.tsx` — no per-page auth code.

| Prefix | Source app | Data | Notes |
|---|---|---|---|
| `/hr` | hr | FastAPI `/api/v1/hr/*` via `@barrelsgd/api-client` | Editors, submissions tables, approvals inbox, duty roster and HR Setup are all wired. The `/hr` dashboard reads `/api/v1/hr/dashboard` on the server; figures come from the leave ledger, personal requests, published roster and scoped approvals. `*-document.tsx` print components stay pure presentation. Components in `components/hr/` |
| `/cap` | cap | FastAPI `/api/cap/*` (server-side direct) | `CAP_API_URL` env + `getCapApiBaseUrl()`; components in `components/cap/` |
| `/salesbus` | salesbus | mock data (api-client planned) | `CartProvider` scoped via `(admin)/salesbus/layout.tsx`; keeps own `AppShell`; PWA dropped |
| `/wxwatch` | wxwatch | FastAPI `/api/v1/wxwatch/*` | generated metadata contracts; authenticated image downloads through `/_backend/wxwatch/` |
| `/wxproducts` | wxproducts | FastAPI `/api/v1/wxproducts/*`, separate wxproducts Postgres | Kubb-generated contracts; saved-revision PDFs via FastAPI `/products/{id}/revisions/{revision}/pdf` |

- **Notifications + change history (shared across modules):** the header bell (`components/notifications/notification-bell.tsx`, polls unread count every 60s) lives in the shared `AppShell`; inbox at `/notifications`, email opt-outs under Profile → Notifications, organisation settings in HR Setup → Notifications. `components/audit/record-history.tsx` (`RecordHistory` / `RecordHistoryButton`) shows `/api/v1/audit/{entity_type}/{entity_id}`; the API applies record access and masks sensitive values — never re-derive either client-side.
- **Weather ownership:** authored products and wxproducts migrations belong to FastAPI; do not introduce weather Drizzle writers or migrations.
- **DB conventions:** keep separate domain databases (never merged). FastAPI owns every module's schema and migrations (e.g. `src/wxproducts/alembic.ini`, `src/wxwatch/alembic.ini`). gaa-admin has no ORM and no database access: Drizzle was removed on 2026-09-23. Types come from `@barrelsgd/api-client`.
- **Fonts:** `Noto_Sans` is loaded in the root layout to back the `--brand-font-document`
  token (`font-document` Tailwind alias) used by wxproducts forecast/bulletin documents.
- **TAF/METAR composer:** Use the wxRegister-style data-entry and review layout; do not add a PDF preview to this working composer.
- **Field widths match data:** size inputs to their data type (numbers/times narrow, selects to their longest option, only prose full width); never stretch every field to the column.
- **Product parity:** a wxproducts improvement to forecasts also applies to bulletins (and the outlook) unless the user excludes them; they share `ProductDesk`.

## Testing

This app has a focused test suite; other apps and shared packages have their own suites. Run from the app directory or via turbo filter.

```bash
# From repo root
turbo run test --filter=@barrelsgd/web-gaa-admin

# Unit tests only (from apps/web/gaa-admin)
pnpm vitest run
pnpm vitest run src/path/to/test.test.ts   # single file

# Coverage
pnpm test:coverage

# Logic-only (fast) or component tests
pnpm --filter @barrelsgd/web-gaa-admin exec vitest run --project node
pnpm --filter @barrelsgd/web-gaa-admin exec vitest run --project dom
```

Two Vitest projects: `node` runs `.test.ts`, `dom` runs `.test.tsx` (jsdom). A DOM-dependent `.test.ts` must be added to the `dom` include list and excluded from `node`. Setup: `src/test/setup.ts`; `@testing-library/react`; `msw` (`msw/node` `setupServer`) for API mocking. Async Server Component pages are tested by rendering `await Page()` with the server-only query module mocked (pattern: `src/app/(admin)/janitor/page.test.tsx`). Don't call `mockReset()` in `beforeEach` on those mocks: under Vitest 5 it makes a caught rejection surface as a test failure. Set each test's implementation instead. There is no e2e script in this app (Playwright e2e exists only in `apps/web/auth`). See `docs/web/testing.md`.

## Important conventions

- **No direct `process.env`** — use `src/env.ts` (typed via `@t3-oss/env-nextjs`)
- **`@barrelsgd/ui` for primitives** — import per-file as `@barrelsgd/ui/components/ui/<name>`; there is no app-local `src/components/ui/`
- **React Query for client-side server state** — initialised in `QueryProvider`, not for data that can be Server Component fetches
- **`src/lib/query-client.ts`** — shared query client config; do not create new instances
- **Type-check mirrors CI on purpose** — `type-check` deletes the gitignored,
  generated `next-env.d.ts` before `tsc` so local runs match CI's fresh checkout
  (CI does not `next build` first). Ambient decls tsc needs must be **committed**
  (e.g. `src/types/next-image.d.ts` for `*.png`), never relied on from `next-env.d.ts`.
  `next dev`/`next build` regenerates `next-env.d.ts` afterward.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
