# wxproducts (`@grenmet/web-wxproducts`) — Claude context

Port **3005**. Weather products app — GMS daily forecasts, aviation, surface obs, marine, and more.

**No auth.** Own Drizzle ORM + Postgres DB, separate from FastAPI's DB and wxwatch's DB.

## Database

- ORM: Drizzle with `node-postgres` (Pool), `casing: "snake_case"`
- Connection: `DATABASE_URL` env var via `src/lib/env.ts`
- DB instance: `src/db/index.ts`
- Migrations: `src/db/migrate.ts`
- Seed: `src/db/seed.ts`

```bash
# From apps/web/wxproducts
pnpm db:generate    # Drizzle Kit generate migrations
pnpm db:migrate     # Apply migrations
```

## Schema structure

All schemas exported from `src/db/schema/index.ts`. Two-file pattern per domain:
- `*.schema.ts` — Drizzle table definitions
- `*.model.ts` — TypeScript types / Zod models derived from the schema

| File pair | Domain |
| --- | --- |
| `morning` | GMS morning forecast |
| `midday` | GMS midday weather report |
| `evening` | GMS evening forecast |
| `metarSpeci` / `metar-speci` | METAR/SPECI aviation obs |
| `taf` | Terminal Aerodrome Forecast |
| `synop` | Surface synoptic obs |
| `marine` | Marine bulletin |
| `cap` | Common Alerting Protocol |
| `bufr` | BUFR encoded obs |
| `outlook` | Tropical outlook |
| `hourly` | Hourly obs |
| `product-metadata` | Shared metadata across products |
| `suite` | Product suite grouping |

Supporting primitives: `primitives.ts`, `zod-primitives.ts`, `iwxxm-primitives.ts`, `iwxxm.schema.ts`, `elements.ts`, `elements.schema.ts`, `db-helpers.ts`, `relations.ts`, `suite-types.ts`.

**Never edit schema files without running `pnpm db:generate` afterwards.**

## Routes

```
src/app/
  page.tsx              ← root
  fcsts/
    morning/page.tsx    ← morning forecast view
    midday/page.tsx     ← midday forecast view
    evening/page.tsx    ← evening forecast view
  hourly/page.tsx
  bulletins/
    marine/page.tsx
  pdf/
    morning/page.tsx    ← print-optimised layout for PDF export
```

## PDF export

Playwright headless browser renders `/pdf/morning` and exports to PDF.

```bash
# From apps/web/wxproducts
pnpm pdf:morning
```

The PDF page uses class `pdf-sheet` — do not remove or rename it; the Playwright script targets it.

## Example data

`src/data/` contains static example data files for each product type (`.example.ts`). Used for development and seeding — not production data.

## Adapters

`src/lib/adapters.ts` — transforms raw DB rows into component-ready types. When adding new schema fields, update the corresponding adapter.
