# cms (`@barrelsgd/web-cms`) — agent context

Port **3006**. Payload CMS for GMS editorial content (GMS is the client; Barrels delivers). Weather operations stay in gaa-admin/FastAPI; this app never creates or publishes operational products.

## Architecture
- Payload config: `src/payload.config.ts`; collections in `src/collections/` (`content.ts`, `media.ts`, `users.ts`).
- Dedicated `gms_cms` database and role inside the shared Postgres (`pnpm cms:setup-db`, idempotent). Payload migrations live in `src/migrations/`; the runtime graph for CI migration checks is `packages/cms-migrations`.
- Identity is **FastAPI's**: `src/lib/fastapi-strategy.ts` + `fastapi-identity.ts` authenticate staff through the shared session. Access rules in `src/access.ts` use FastAPI permission keys (`cms.article.publish.<section>`, `cms.article.edit.all`, `cms.article.manage`). New keys go in `apps/api/fastapi/src/auth/permissions.py`.
- Public feed: anonymous `GET /api/public/content` returns only published posts (read by the GMS site). Health: `/api/health`, `/api/ready`.

## Rules
- Env through `src/env.ts` only.
- After changing collections, run `generate:types` and `generate:importmap` and commit the generated `payload-types.ts` / import map.
- Schema changes need a Payload migration (`db:generate`) — this is Ask First, like any migration.
- Publication requires the section permission; authors edit only their own unpublished content. Keep `src/access.ts` tests in step with any change.

## Commands and tests
```bash
pnpm dev:web:cms                                   # host only; see README for DATABASE_URL/PAYLOAD_SECRET
pnpm --filter @barrelsgd/web-cms test              # unit
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test   # + integration (isolated schema)
```

## Related
`README.md` (setup and editorial workflow), `docs/portfolio/repository-delivery-map.md`.
