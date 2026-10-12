# admin-gms (`@barrelsgd/web-gaa-admin`)

Internal GMS operations dashboard. Port **3001**. Requires `pnpm start` (FastAPI + Postgres).

The heaviest app in the monorepo — HR management, staff calendars, charts, and data tables. Integrates auth directly rather than delegating to `web-auth`. Only web app with a Vitest + Playwright test suite.

Based on the TailAdmin Next.js template (MIT licensed).

Weather-product editors show a live text preview of populated fields, grouped by
the product's existing sections. Read-only forecaster, area, issue and validity
details appear only in the preview, without a duplicate block above the form.
Editing does not render PDFs. Save draft refreshes
the full PDF with saved values; successful Validate and preview refreshes and opens
it for review. Preview PDF renders the current draft without saving or approving
publication. Further edits mark the previous PDF as “Changes pending”; rendering
failures keep that copy available and offer an explicit retry.

See [AGENTS.md](./AGENTS.md) for conventions, auth model, route structure, testing, and key dependencies.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
