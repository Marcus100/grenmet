# WxWatch (`@grenmet/web-wxwatch`)

Weather image archive for GMS. Port **3002**.

Stores and displays scraped weather satellite and radar images. Images are ingested automatically via the Scrapy pipeline in `scripts/scrapy-wxwatch/` and browseable by date. Requires authentication via the shared GMS auth system.

Has its own PostgreSQL database (separate from FastAPI's DB and wxproducts' DB) managed with Drizzle ORM.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
cp apps/web/wxwatch/.env.local.example apps/web/wxwatch/.env.local
pnpm dev:web:wxwatch
```

The app runs on `http://localhost:3002`.

## Run from app directory

```bash
cd apps/web/wxwatch
pnpm dev
```

## Environment Variables

See `.env.local.example` for required values:

- `DATABASE_URL` — wxwatch PostgreSQL connection string
- `AUTH_APP_URL` — URL of the auth app
- `AUTH_API_URL` — FastAPI base URL
- `AUTH_API_V1_STR` — API version prefix
- `SESSION_COOKIE_NAME` — shared session cookie name
- `SESSION_COOKIE_DOMAIN` — cookie domain for cross-app sharing

## Image Ingestion

Weather images are scraped and stored by the Scrapy pipeline:

```bash
cd scripts/scrapy-wxwatch
uv sync
uv run python run_crawlers.py
```

See [`scripts/scrapy-wxwatch/README.md`](../../../scripts/scrapy-wxwatch/README.md) for full details.

## Database Commands

```bash
pnpm db:generate    # Generate Drizzle migrations from schema changes
pnpm db:migrate     # Apply pending migrations
```

## Quality Commands

```bash
pnpm check          # Biome lint + format check
pnpm check:ci       # CI-mode check (no auto-fix)
pnpm type-check     # TypeScript type checking
```
