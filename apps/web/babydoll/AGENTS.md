# Babydoll Beauty Bar

Port **3014**. Package: `@barrelsgd/web-babydoll`. Lane spec: `docs/design/babydoll.md`.
Static site at `babydoll.barrels.gd` (production only, no staging), on Cloudflare Pages since the cutover of 15 to 16 Nov 2026.

## Client boundary

- Babydoll Beauty Bar is a **client** (a lash, brow and skin studio in St. George's,
  Grenada; owner Jeriann Marryshow-Fleming). It is not a Barrels product. The
  software is Barrels IP; the client owns its name, logo, photos and copy.
- Keep the "Website by Barrels Grenada" footer credit. Never add Barrels or GMS
  branding elsewhere, and never use `--gm-*` tokens: this site uses the client's
  own brand tokens in `src/app/globals.css` (plain CSS, no Tailwind).
- The client's later domain is `babydollbeautybar.com`; update `SITE_URL` in
  `src/data/site.ts` when it moves.

## Content rules

- All client-editable content (booking link, address, hours, services and prices,
  packages, reviews, socials, courses, portfolio slots) lives in `src/data/site.ts`.
  Pages render from it; do not hard-code prices or the address in components.
- Prices mirror the client's Acuity booking page (`babydollgnd.as.me`). Do not
  invent services, prices, course dates or credentials; training content is draft
  until the client confirms it.
- Booking happens off this site, on the studio's page on the Barrels bookings
  site (`ONLINE_BOOKING_URL`, see "Booking"); the Acuity link (`BOOKING_URL`)
  is only the fallback. Contact and training interest go to Instagram DM. The pages
  make no API calls and use no analytics.
- Every Book call-to-action uses `siteBookingLink()` (Server Components) or a
  `CtaLink` prop (client components) from `src/lib/book-link.ts`. Never link
  `BOOKING_URL` directly.
- Portfolio and portrait photos go in `public/portfolio/` only with the client's
  confirmation that the people shown consented; add `image` and `alt` to the slot.

## UI rules

- Server Components by default. Client components only for the mobile menu,
  service tabs and portfolio filter. Every service panel stays in the HTML
  (inactive panels are `hidden`), so prices are indexable.
- Light theme only (client decision): no dark palette, no `prefers-color-scheme`,
  no theme toggle. `src/theme.test.ts` fails if one is added back.
- Phone first: the fixed `BookBar` shows under 820px; keep the page's bottom
  padding (`--bar-h`) when changing it.
- Tests: `pnpm vitest run` from this directory.

## Booking (static site, owner 13 Nov 2026)

This site takes no bookings and has no server code: it is a static export
(`output: "export"`, built to `out/`), served by Cloudflare Pages
(`docs/operations/vercel-exit-plan.md`). The on-site booking flow (`/book`,
`/booking/[token]`, the server actions, `src/env.ts` and the
`@barrelsgd/bookings-web` wiring) was removed.

- **Book links:** `src/lib/book-link.ts` decides where every Book CTA goes:
  `ONLINE_BOOKING_URL` in `src/data/site.ts` when it is set, else the Acuity page
  (`BOOKING_URL`). Both open in a new tab. Since v1.2.0 `ONLINE_BOOKING_URL` is
  `https://bookings.barrels.gd/babydoll-beauty-bar`, the studio's page on the
  Barrels bookings site (production was seeded on 15 Nov 2026). The remaining
  go-live steps are in `docs/operations/babydoll-cutover.md`.
- **Old addresses:** `/book` redirects to the booking page and `/booking/*` to
  `/contact`, in `public/_redirects` (Cloudflare Pages) and `vercel.json`
  (until the Vercel project is gone). When the booking address changes, change
  both; `src/pages-files.test.ts` checks the Pages file.
- **Headers:** `public/_headers` mirrors `vercel.json`'s headers
  (`src/pages-files.test.ts` fails if they drift).
- Do not add a route handler, server action, `cookies()` or anything else that
  needs a server; the export build fails on them.

## Vercel build (legacy)

The site is served by Cloudflare Pages. The Vercel project is kept only as the
rollback for about a week after the move, then deleted; its Git integration
has been disconnected since 13 Nov 2026, so pull requests get no Vercel check.
The rules below apply to `vercel.json` while it stays in the repo.

- Vercel clones the monorepo fresh, so no workspace package is built there. A
  workspace package whose `main`, `types` or `exports` point at `dist/` (today
  `@barrelsgd/api-client`) is absent at `next build` unless the build builds it
  first. `dist/` is gitignored and built only by that package's own `build`.
- `vercel.json`'s `buildCommand` therefore starts with
  `pnpm --filter '@barrelsgd/web-babydoll^...' run build` (every workspace
  dependency, not the app), then `pnpm build`. Add any new dist-producing
  workspace package to the closure automatically; do not hand-list it.
- Keep the build plain pnpm: no `turbo` and no remote cache in this command, so
  it needs no `TURBO_TOKEN`, signing key or other secret.
- `scripts/guardrails/vercel-build-dist.test.mjs` fails when a Vercel app's
  `buildCommand` skips this step. Run `pnpm test:guardrails` after changing
  `package.json` dependencies or `vercel.json`.
