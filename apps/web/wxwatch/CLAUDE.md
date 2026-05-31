# wxwatch (`@grenmet/web-wxwatch`) — Claude context

Port **3002**. Weather image scraper viewer — displays satellite and radar images grouped by name and synoptic time, scraped externally and stored in a dedicated Postgres DB.

## Auth pattern

Deep integration — uses `@grenmet/auth/server` directly (same pattern as admin-gms, not a redirect-delegating app).

- Session management: `src/lib/server-session.ts`
- Auth helpers: `src/lib/auth-config.ts`, `src/lib/auth-redirect.ts`
- Middleware proxy: `src/proxy.ts`
- Logout routes: `src/app/auth/logout/route.ts`, `src/app/auth/logout-all/route.ts`
- Sign-in page: `src/app/signin/page.tsx`

## Database

Own Drizzle ORM + Postgres (separate from FastAPI's DB and wxproducts' DB).

- Connection: `DATABASE_URL` via `src/lib/env.ts`
- DB instance: `src/db/index.ts`
- Schema: `src/db/schema.ts` — single table `weather_images`
- Queries: `src/db/queries.ts` — `getImagesGroupedByName()`, `getImagesByDateAndSynoptic()`

### `weather_images` table (key fields)

| Column | Type | Purpose |
|---|---|---|
| `storage_path` | text | Local file path |
| `spider_name` | text | Scraper identifier (e.g. `"goes19"`) |
| `fetched_at` | timestamptz | When scraped |
| `observation_time` | timestamptz | When the image was captured |
| `checksum` | text | Dedup key |
| `raw_metadata` | jsonb | Full scraper metadata |

Synoptic hours are 3-hour intervals: `00, 03, 06, 09, 12, 15, 18, 21` UTC.

### DB commands

```bash
# From apps/web/wxwatch
pnpm db:generate    # Drizzle Kit generate migration
pnpm db:migrate     # Apply migration (requires running Postgres)
```

**Never edit `src/db/schema.ts` without running `pnpm db:generate` afterwards.**

## Routes

```
src/app/
  page.tsx                    ← gallery (today's images)
  [year]/[month]/[day]/
    page.tsx                  ← gallery for a specific date
  signin/page.tsx
  auth/logout/route.ts
  auth/logout-all/route.ts
  api/health/route.ts
```

## Key dependencies (unique to this app)

- `drizzle-orm` + `pg` — DB access (no Prisma, no SQLModel)
- `server-only` — ensures DB queries never run client-side
- `@grenmet/auth` — deep auth integration

## Special conventions

- All DB queries are in `src/db/queries.ts` — do not write raw SQL or ad-hoc queries elsewhere.
- GOES-19 images use a timestamp prefix in their name (`20253391656_GOES19-...`); `getBaseName()` strips it.
- Scraper runs externally — this app is read-only against the DB.
- No client-side data fetching: all data loads in Server Components via `src/db/queries.ts`.
