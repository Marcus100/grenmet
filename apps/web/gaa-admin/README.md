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

Weather forms group short inputs before narrative text, with compact section
dividers and short placeholders inside controls. After entry, a subtle caption
stays inside the box so values remain identifiable. Required markers and units
appear inside controls; wind's shared mph unit appears in its section heading.
Wind stays on one row when the form has enough space; sunrise and sunset share
a row. Wind inputs and the live text preview use mph; wave, swell and tide
heights use feet; temperatures stay in Celsius. Input/display conversion preserves
the existing canonical knots/metres transport and untouched saved precision.
Evening forecasts use Tonight and Day 1–4 subtabs to show one period at a time.
Switching periods retains all draft values; save and validation cover every period.

See [AGENTS.md](./AGENTS.md) for conventions, auth model, route structure, testing, and key dependencies.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
