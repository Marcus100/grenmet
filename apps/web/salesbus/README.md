# salesbus (`@grenmet/web-salesbus`)

Sales and inventory management app for GMS. Port **3007**.

Routes: `/sales`, `/inventory`, `/settlements`, `/offline`.

## Development

From repo root:

```bash
pnpm install
cp apps/web/salesbus/.env.local.example apps/web/salesbus/.env.local
pnpm dev:web:salesbus
```

The app runs on `http://localhost:3007`.

## Environment Variables

See `.env.local.example` for required values:

- `NEXT_PUBLIC_API_URL` — FastAPI base URL for client-side requests
- `NEXT_PUBLIC_APP_NAME` — Application name
- `NEXT_PUBLIC_APP_VERSION` — Application version
- `NEXT_PUBLIC_ENABLE_DEBUG` — Enable debug output in development
- `NEXT_PUBLIC_ENABLE_ANALYTICS` — Enable analytics (disabled by default)

## Run from app directory

```bash
cd apps/web/salesbus
pnpm dev
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
