# hr (`@grenmet/web-hr`)

HR document printing app for GMS staff. Port **3006**. Requires `pnpm start` (FastAPI).

Renders print-ready A4 forms: timesheets, duty rosters, leave applications, shift exchange requisitions, and daily airport status reports. No own database — all data via `@grenmet/api-client`.

See [CLAUDE.md](./CLAUDE.md) for API consumption pattern and conventions.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
