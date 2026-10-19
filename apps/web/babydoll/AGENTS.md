# Babydoll Beauty Bar

Port **3014**. Package: `@barrelsgd/web-babydoll`. Lane spec: `docs/design/babydoll.md`.
Hosted on Vercel at `babydoll.barrels.gd` (production only, no staging), like Elections.

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
- Booking is always the Acuity link. There is no backend: no forms, no FastAPI
  calls, no analytics. Contact and training interest go to Instagram DM.
- Portfolio and portrait photos go in `public/portfolio/` only with the client's
  confirmation that the people shown consented; add `image` and `alt` to the slot.

## UI rules

- Server Components by default. Client components only for the mobile menu,
  service tabs and portfolio filter. Every service panel stays in the HTML
  (inactive panels are `hidden`), so prices are indexable.
- Phone first: the fixed `BookBar` shows under 820px; keep the page's bottom
  padding (`--bar-h`) when changing it.
- Tests: `pnpm vitest run` from this directory.
