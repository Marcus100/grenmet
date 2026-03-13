# WxWatch (`@grenmet/web-wxwatch`)

Next.js app for weather watch workflows.

## Development

From repo root:

```bash
pnpm install
cp apps/web/wxwatch/.env.example apps/web/wxwatch/.env
pnpm dev:web:wxwatch
```

The app runs on `http://localhost:3002`.

## Run from app directory

```bash
cd apps/web/wxwatch
pnpm dev
```

## Environment Variables

See `.env.example` for required values, including:

- `DB_URL`
- `AUTH_APP_URL`
- `AUTH_API_URL`
- `AUTH_API_V1_STR`
- `SESSION_COOKIE_NAME`

## Database Utility Commands

```bash
pnpm db:generate
pnpm db:migrate
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
