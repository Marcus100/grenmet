# Commit (`@barrelsgd/web-commit`)

Port **3019** (local dev only). Static export (`output: "export"`, written to
`out/`) hosted on Cloudflare Pages at `commit.barrels.gd`, production only, no
staging (ADR-0036 amendment). Response headers live in `public/_headers`. Lane
spec: `docs/design/commit.md`.

Commit is the Barrels Grenada engineering blog: one post per release (starting
with 1.0.0) on the technical implementation of the platform. It is a Barrels
property; never add GAA or GMS marks, and never publish anything that is not
already public (release notes, merged PRs, public docs). No client-confidential
detail, personal data or internal hostnames.

## Content

- One MDX file per post in `content/posts/`, compiled by Content Collections
  (`content-collections.ts`, like `apps/web/signal`). Front matter: `title`,
  `summary` (also the RSS description), `date` (ISO), optional `release`
  (`x.y.z`, unique) and `draft`.
- The file name is the post's anchor (`/#v1-0-0`) and RSS link: never rename a
  published post. Name release posts `v<major>-<minor>-<patch>.mdx`.
- Copy is draft until the owner edits it. Do not invent features; summarise the
  GitHub release notes for the tag.

## Code

- Single page (`src/app/page.tsx`) listing published posts newest first
  (`src/lib/posts.ts`), plus `/feed.xml` (static RSS, `src/lib/feed.ts`),
  `robots.ts` and `sitemap.ts`. No API calls, no analytics, no forms.
- Everything must stay static: no server actions, no dynamic route handlers,
  no `next/image` optimisation. `next build` fails the export otherwise.
- Cloudflare Pages project settings: build command
  `pnpm --filter @barrelsgd/web-commit build`, output directory
  `apps/web/commit/out`, Node 24. `COMMIT_SITE_URL` is optional.
- `src/env.ts` is the only place that reads `process.env` (`COMMIT_SITE_URL`,
  default `https://commit.barrels.gd`).
- Server Components only, except `providers.tsx` and `theme-toggle.tsx`
  (next-themes). The star field animates with CSS and stops under
  `prefers-reduced-motion`.
- Layout and components derive from the Tailwind Plus "Commit" template, used
  under the owner's licence (`TEMPLATE-LICENSE.md`). Keep this app an end
  product; never extract its components into a shared package or a starter.
- Tests: `pnpm --filter @barrelsgd/web-commit test`. Dev: `pnpm dev:web:commit`
  (host only).
