# Signal (`@barrelsgd/web-signal`) — agent context

Port **3004**. Grenada Signal is a free English-language, Grenada-rooted news
and entertainment publication for a broad local, diaspora, Caribbean and
international audience. Light mode; no reader account or subscription.

## Delivery order
- **Frontend first:** finish and review the reader design before implementing the dedicated Signal CMS; the owner explicitly deferred CMS work.
- **Demo material:** original June fixtures remain at their URLs and in the archive. The October 2026 homepage uses sixteen source-attributed editorial previews awaiting human review; keep notices and site-wide noindex.

## Reader
- **Human authorship:** every published story has a human author. AI assists internal editorial work; it is not a byline or a separate public content category.
- **Editorial balance:** Grenada leads, with selected Caribbean/global news, entertainment and sport; no compulsory local angle or fixed quota. Warm, clear English, without forced slang.
- **Audience and growth:** the owner wants broad general-interest appeal, traffic and repeat visits. Include news, entertainment, culture, sport, lifestyle and useful information; Grenadian identity does not restrict who the stories are for.
- Source Serif 4 headlines, Inter body, existing Signal green/gold tokens. See `docs/design/signal.md`; do not introduce GMS branding or new tokens.
- **Story cards:** no expandable “Behind the story” or “Why it matters” panels; the owner prefers concise cards with context inside articles. Omit story source/date lines on cards and Latest; retain metadata and sources on article pages.
- Desktop editorial columns, mobile single-column flow; 18px article/dek text and at least 14px metadata. Images are optional; never render placeholder image boxes.
- Homepage: dated Daily Signal → lead/supporting stories → selected collection → populated topics → archive invitation. Show all seven topics on `/topics`, including honest empty states.
- Preserve `/<section>/<slug>` and `/today/<date>` URLs. Discovery routes: `/briefs`, `/topics`, `/learn`, `/archive`, `/search`, `/collections/[slug]`.
- `src/lib/nav.ts` owns coverage and series; `src/lib/discovery.ts` owns explicit preview selections and browser-local search. Never send search queries to analytics or a server.
- **Images:** use `StoryImage` for selected demo photography, with alt text, archive context and linked credits. Photo captions use 12px (`text-xs`) with relaxed line spacing, per owner preference; keep linked credits. Asset provenance lives in `public/images/CREDITS.md`; never imply archive photographs document demo claims.
- `src/components/editorial.tsx` holds reader presentation. `SearchReader` is interactive; the rest of the reader uses Server Components.

## Temporary content pipeline
- Content Collections compiles trusted repository MDX through `content-collections.ts`. `src/lib/content.ts` queries it; `content-utils.ts` supplies draft-filtering helpers.
- Seven topic folders are supported. `getCurrentArticles` selects sourced editorial previews for discovery; `getPublishedArticles` retains both previews and legacy samples for archive/static paths. `draft: false` means preview-visible, not human publication approval.
- Test commands generate content before Vitest so clean CI checkouts exercise the real MDX fixtures. Keep originals for the later CMS import; do not implement a second publishing system during the frontend phase.

## Verification
`pnpm --filter @barrelsgd/web-signal build` and `test`; then root formatting,
workspace types, design and documentation gates. Test desktop at 1280px and 1440px, mobile at 320px, keyboard
navigation and 200% text. Host-only dev: `pnpm dev:web:signal`.
