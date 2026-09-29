# cms (`@barrelsgd/web-cms`) — agent context

Port **3006**. Payload CMS for GMS editorial content (GMS is the client; Barrels delivers). Weather operations stay in gaa-admin/FastAPI; this app never creates or publishes operational products.

## Architecture
- Payload config: `src/payload.config.ts`. One bounded collection per GMS homepage section, built by `collections/editorial.ts` from shared parts in `src/fields/` (workflow + review hook, fixed slugs, cover, topics, links, SEO, social): `desk-updates` (From the Desk), `stories`, `publications` (Latest reports). Plus `media`, `users`. Slugs carry a collection prefix (`updates/`, `stories/`, `publications/`) so all share GMS's `/explore/news/[...slug]`.
- Dedicated `gms_cms` database and role inside the shared Postgres (`pnpm cms:setup-db`, idempotent). Payload migrations live in `src/migrations/`; the runtime graph for CI migration checks is `packages/cms-migrations`.
- Identity is **FastAPI's**: `src/lib/fastapi-strategy.ts` + `fastapi-identity.ts` authenticate staff through the shared session. Access rules in `src/access.ts` use FastAPI permission keys: `PUBLISH_KEYS` (`cms.publish.<collection>`) per section, plus `cms.article.create`, `cms.article.edit.all`, `cms.article.manage`. New keys go in `apps/api/fastapi/src/auth/permissions.py`.
- Public feeds (anonymous, published only, no staff fields; shaped in `src/lib/public-feed.ts`): `GET /api/public/home` (every homepage part; each fails independently) and `GET /api/public/articles?collection=&slug=`. Health: `/api/health`, `/api/ready`.

## Rules
- Env through `src/env.ts` only.
- After changing collections, run `generate:types` and `generate:importmap` and commit the generated `payload-types.ts` / import map.
- Schema changes need a Payload migration — Ask First, like any migration. Older migrations were hand-written without snapshots; `20260929_210000_editorial_collections.json` is the current snapshot, so `db:generate` now diffs correctly. Verify a new migration on a scratch database before committing.
- Publication requires the section permission; authors edit only their own unpublished content. Keep `src/access.ts` tests in step with any change.

## Commands and tests
```bash
pnpm dev:web:cms                                   # host only; see README for DATABASE_URL/PAYLOAD_SECRET
pnpm --filter @barrelsgd/web-cms test              # unit
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test   # + integration (isolated schema)
```

## Related
`README.md` (setup and editorial workflow), `docs/portfolio/repository-delivery-map.md`.
