# Web App Development

For infrastructure commands (Postgres, FastAPI, Docker): see the
[root README](../../README.md). This document covers the web apps only.

## Prerequisites

- Node.js 22+, pnpm 10+
- Docker (for `pnpm start` — required by apps that call FastAPI)
- `.env.local` in each app you're running — copy from `.env.local.example`

## Starting a web app

```bash
pnpm start                  # Start Postgres + FastAPI (required for admin-gms)
pnpm dev:web:auth           # auth           :3000
pnpm dev:web:admin          # admin-gms      :3001
pnpm dev:web:hurricane      # hurricaneplan  :3002
pnpm dev:web:spicewx        # spicewx        :3003
pnpm dev:web:signal         # signal         :3004
```

Apps that require `pnpm start` before running: `admin-gms`.
Apps that work standalone (no FastAPI): `auth`, `hurricaneplan`, `spicewx`,
`signal`.

## Environment variables

Each app has a `.env.local.example` at its root. Copy it:

```bash
cp apps/web/<app>/.env.local.example apps/web/<app>/.env.local
```

Full variable reference: [`docs/env.md`](../env.md).
Never commit `.env.local`. Never write to it programmatically.

## Special app notes

- **hurricaneplan**: Uses Turbopack. Content lives in `src/content/` via
  `@content-collections/next`. MDX plugins run in a separate Node.js process.
- **wxwatch**: Has its own Drizzle ORM + Postgres DB. Run `pnpm db:migrate`
  before first use (from within `apps/web/wxwatch/`).
- **wxproducts**: Has its own Drizzle ORM + Postgres DB and Playwright PDF export.
  Run `pnpm db:migrate` before first use.
- **All apps**: React Compiler is enabled — do not add `useMemo`/`useCallback`
  for performance; the compiler handles it.
- **All apps**: Sentry is wired in via `instrumentation.ts` and
  `instrumentation-client.ts`. Do not remove these files.
