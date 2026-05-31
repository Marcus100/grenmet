# WxProducts (`@grenmet/web-wxproducts`)

Structured meteorological products platform for GMS. Port **3005**.

Stores and serves the full range of GMS forecast and observational products — morning, midday, and evening forecasts; marine bulletins; METAR/SPECI; TAF; SYNOP; CAP alerts; IBF; BUFR; tropical outlook; hourly observations. Supports print-ready PDF export of forecast products.

Has its own PostgreSQL database (separate from FastAPI's DB and wxwatch's DB) managed with Drizzle ORM.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
cp apps/web/wxproducts/.env.local.example apps/web/wxproducts/.env.local
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

## Database

wxproducts manages its own PostgreSQL database — entirely separate from FastAPI's DB and wxwatch's DB.

### Schema-first workflow

**Every schema change requires a migration file.** After editing any file in `src/db/schema/`:

```bash
cd apps/web/wxproducts
pnpm db:generate    # generates a migration file in src/db/migrations/
pnpm db:migrate     # applies pending migrations
```

Commit both the schema change and the generated migration file together. Never skip `db:generate` — missing migration files will cause drift between the schema and the database.

### Schema structure

Each product domain follows a two-file pattern inside `src/db/schema/`:

- `*.schema.ts` — Drizzle table definition
- `*.model.ts` — TypeScript types and Zod models derived from the schema

All schemas are exported from `src/db/schema/index.ts`. See the CLAUDE.md in this directory for the full schema file list.

### Adapters

`src/lib/adapters.ts` transforms raw DB rows into component-ready types. When adding schema fields, update the corresponding adapter alongside the schema change.

### Example data

`src/data/` contains static example data files for each product type (`*.example.ts`). Used for development and seeding — not production data.

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
