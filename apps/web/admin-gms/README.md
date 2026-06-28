# admin-gms (`@grenmet/web-admin`)

Internal GMS operations dashboard. Port **3001**. Requires `pnpm start` (FastAPI + Postgres).

The heaviest app in the monorepo — HR management, staff calendars, charts, and data tables. Integrates auth directly rather than delegating to `web-auth`. Only web app with a Vitest + Playwright test suite.

Based on the TailAdmin Next.js template (MIT licensed).

See [CLAUDE.md](./CLAUDE.md) for conventions, auth model, route structure, testing, and key dependencies.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
