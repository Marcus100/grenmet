# WxProducts (`@grenmet/web-wxproducts`)

Structured meteorological products platform for GMS. Port **3005**.

Stores and serves the full range of GMS forecast and observational products — morning, midday, and evening forecasts; marine bulletins; METAR/SPECI; TAF; SYNOP; CAP alerts; IBF; BUFR; tropical outlook; hourly observations. Supports print-ready PDF export of forecast products.

Has its own PostgreSQL database (separate from FastAPI's DB and wxwatch's DB) managed with Drizzle ORM.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
pnpm dev:web:wxproducts
```

The app runs on `http://localhost:3005`.

## Run from app directory

```bash
cd apps/web/wxproducts
pnpm dev
```

## Environment Variables

See `.env.local.example` for required values:

- `DATABASE_URL` — wxproducts PostgreSQL connection string

## Routes

| Route | Description |
|---|---|
| `/` | Root — all forecast products |
| `/fcsts/morning` | Morning forecast view |
| `/fcsts/midday` | Midday weather report |
| `/fcsts/evening` | Evening forecast view |
| `/hourly` | Hourly observations |
| `/bulletins/marine` | Marine bulletin |
| `/pdf/morning` | Print-optimised layout for PDF export |

## Database Commands

```bash
pnpm db:generate    # Generate Drizzle migrations from schema changes
pnpm db:migrate     # Apply pending migrations
```

## PDF Export

```bash
pnpm pdf:morning    # Playwright headless export of the morning forecast to PDF
```

## Quality Commands

```bash
pnpm check          # Biome lint + format check
pnpm check:ci       # CI-mode check (no auto-fix)
pnpm type-check     # TypeScript type checking
```
