# cms (`@barrelsgd/web-cms`) — agent context

Port **3006**. Payload CMS for GMS editorial content (GMS is the client; Barrels delivers). Weather operations stay in gaa-admin/FastAPI; this app never creates or publishes operational products.

**Boundary:** FastAPI owns real data on the GMS site (observations, forecasts, products, reports, datasets, imagery). The CMS holds only editorial / social content (stories, desk notices, Q&A, history, quizzes, facts, the forecaster's note). If a field is measured, issued or operational, it belongs in FastAPI.

## Architecture
- Payload config: `src/payload.config.ts`. One bounded collection per GMS homepage section, built by `collections/editorial.ts` from shared parts in `src/fields/` (workflow + review hook, fixed slugs, cover, topics, links, SEO, social): `desk-updates` (From the Desk), `stories`, `questions` (Questions about the weather; optional science check), `discover` (On this day, quiz, Did you know, sky note; one `type` field shows that type's fields), `report-notes` (Latest reports: a write-up of one issued report) and `live-posts` (Weather now feed: update, or a YouTube/Facebook/SoundCloud link validated by `lib/media-links.ts`). Desk updates (optional) and report write-ups (required) carry `fields/linked-product.ts`: only a FastAPI product id + kind, picked in `components/product-picker.tsx` from the staff-only `GET /api/linked-products` (`lib/linked-products.ts`, proxies FastAPI's public list). Never copy product figures into a CMS field. Two globals: `weather-now` (duty forecaster's note, signed and expiring at the next 07/12/18 AST issue) and `homepage` (pins, Discover cards, hidden sections, per-section wording `sectionCopy`, and `exploreReading`: an optional published story/explainer per Explore today activity; activities and figures are FastAPI's). Warning words (warning/watch/advisory) in the note or a desk update need a CAP alert link (`fields/hazard-guard.ts`). Plus `media`, `users`. Slugs carry a collection prefix (`updates/`, `stories/`, `questions/`, `discover/`); GMS maps each to its own route (`/explore/updates`, `/explore/news`, `/explore/explained`, `/explore/quiz`) with `contentHref`/`questionHref` in `apps/web/gms/src/lib/cms.ts`.
- Dedicated `gms_cms` database and role inside the shared Postgres (`pnpm cms:setup-db`, idempotent). Payload migrations live in `src/migrations/`; the runtime graph for CI migration checks is `packages/cms-migrations`.
- Identity is **FastAPI's**: `src/lib/fastapi-strategy.ts` + `fastapi-identity.ts` authenticate staff through the shared session. Access rules in `src/access.ts` use FastAPI permission keys: `PUBLISH_KEYS` (`cms.publish.<collection>`) per section, plus `cms.article.create`, `cms.article.edit.all`, `cms.article.manage`. New keys go in `apps/api/fastapi/src/auth/permissions.py`.
- Public feeds (anonymous, published only, no staff fields; shaped in `src/lib/public-feed.ts`): `GET /api/public/home` (every homepage part; each fails independently), `GET /api/public/articles?collection=&slug=`, `GET /api/public/questions?slug=&topic=` and `GET /api/public/quizzes?slug=`. Latest reports and imagery are FastAPI data (reports come from `/wxproducts/public/products`), never CMS fields. Health: `/api/health`, `/api/ready`.

## Rules
- Env through `src/env.ts` only.
- After changing collections, run `generate:types` and `generate:importmap` and commit the generated `payload-types.ts` / import map. Commit them exactly as Payload writes them: Biome ignores both (`biome.jsonc`), so the dev server's rewrites never fail `check:ci`.
- Schema changes need a Payload migration. Additive migrations within the authorized task may proceed; ask first for destructive schema/data or breaking changes per root AGENTS.md. Older migrations were hand-written without snapshots; `20260929_210000_editorial_collections.json` is the current snapshot, so `db:generate` now diffs correctly. Verify a new migration on a scratch database before committing.
- Publication requires the section permission; authors edit only their own unpublished content. Keep `src/access.ts` tests in step with any change.

## Commands and tests
```bash
pnpm --filter @barrelsgd/web-cms seed:editorial        # starter questions etc. as Ready for review (idempotent; needs one CMS editor)
pnpm dev:web:cms                                   # host only; see README for DATABASE_URL/PAYLOAD_SECRET
pnpm --filter @barrelsgd/web-cms test              # unit
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test   # + integration (isolated schema)
```

## Related
`README.md` (setup and editorial workflow), `docs/portfolio/repository-delivery-map.md`.
