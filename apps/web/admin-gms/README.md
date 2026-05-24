# admin-gms (`@grenmet/web-admin`)

Admin dashboard for GMS operations. Port **3001**.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
cp apps/web/admin-gms/.env.example apps/web/admin-gms/.env
pnpm dev:web:admin
```

The app runs on `http://localhost:3001`.

## Run from app directory

```bash
cd apps/web/admin-gms
pnpm dev
```

## Environment Variables

See `.env.example`. Required:

```
AUTH_APP_URL
AUTH_API_URL
AUTH_API_V1_STR
SESSION_COOKIE_NAME
NEXT_PUBLIC_API_URL
RESEND_API_KEY
```

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

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```

## Notes

- Heaviest app in the monorepo: FullCalendar, ApexCharts, TanStack Form/Query/Table/Virtual, react-dropzone, sonner, react-error-boundary.
- Integrates auth directly via `@grenmet/auth/server` — not a redirect-delegating app.
- Consumes FastAPI HR and Auth endpoints via `@grenmet/api-client`.
- Based on the [TailAdmin](https://tailadmin.com) Next.js template (MIT licensed).
