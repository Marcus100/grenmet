# HR (`@grenmet/web-hr`)

HR document printing app for GMS staff. Port **3006**.

Renders print-ready A4 forms: leave of absence applications, official timesheets, duty rosters, shift exchange requisitions, and daily airport status reports.

## Development

From repo root:

```bash
pnpm install
cp apps/web/hr/.env.local.example apps/web/hr/.env.local
pnpm dev:web:hr
```

The app runs on `http://localhost:3006`.

## Run from app directory

```bash
cd apps/web/hr
pnpm dev
```

## Environment Variables

See `.env.local.example` for required values:

- `AUTH_APP_URL` — URL of the auth app (e.g. `http://localhost:3000`)
- `AUTH_API_URL` — FastAPI base URL
- `AUTH_API_V1_STR` — API version prefix
- `SESSION_COOKIE_NAME` — shared session cookie name
- `AUTH_ALLOWED_RETURN_HOSTS` — allowlist for post-login redirects (e.g. `localhost:3006`)

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
