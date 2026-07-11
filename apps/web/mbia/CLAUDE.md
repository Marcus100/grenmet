# mbia (`@grenmet/web-mbia`) — Claude context

Port **3005**. Public website for the **Grenada Airports Authority** (GAA) —
Maurice Bishop International Airport (GND) + Lauriston Airport, Carriacou (CRU).
Modern redesign of the old WordPress site; the scraped original lives in
`.source/` (gitignored, reference only). MVP: static MDX + sample flight data,
light mode, no auth, no DB. Dev only (no Dockerfile yet).

## Content pipeline

- `scripts/convert-scrape.py` (stdlib Python) converts scraped WordPress/
  Elementor pages from `.source/scrape/` into `content/<section>/<slug>.mdx`.
  Run via `pnpm content:convert`. `PAGE_MAP` in the script is the single
  old-URL → new-route mapping; `ROUTE_MAP` rewrites internal links.
- Re-running **overwrites** generated MDX. Hand-authored MDX (the three
  fee/schedule PDF pages in `content/business/`) must stay out of `PAGE_MAP`.
- PDFs live in `public/documents/`; curated photos in `public/images/`
  (originals in `.source/`, keep additions small and compressed).
- Collections: single `pages` collection (`content-collections.ts`), sections
  `travel | at-the-airport | business | corporate | development | news`.
  `news` requires `publishedAt`.
- **`type-check` and `test` require a `build` first** (or `dev`) so the
  generated `content-collections` module exists.

## Content model & routes

- IA lives in `src/lib/nav.ts` (`SECTIONS`, `NAV_GROUPS`, `QUICK_TASKS`) — nav
  hrefs must match MDX slugs produced by the converter.
- `src/lib/content.ts` wraps the generated collection; pure helpers in
  `src/lib/content-utils.ts` (unit-testable without the generated module —
  component tests must not import `content.ts`).
- Hand-crafted routes: `/` (home), `/flights`, `/airports{,/mbia,/lauriston,
  /pearls}`, `/contact`. MDX routes: `/[section]` + `/[section]/[slug]`.

## Flight data

`src/lib/flights.ts` is the FIDS seam: `SAMPLE_FLIGHTS` is honest sample data
(real carriers/routes for GND & CRU) clearly labelled in the UI. When a live
feed exists, swap the source in this one file; `FlightBoard` and `/flights`
consume it via `flightsFor()`.

## Design system

- `src/app/globals.css` imports `@grenmet/ui/styles/globals` then **overrides**
  shadcn semantic tokens to the GAA palette: navy `--gaa-navy(-deep/-ink)` from
  the logo, sea teal `--gaa-sea`, spice gold `--gaa-gold`. Status colors
  (`--gaa-status-*`) are for the flight board only. Light mode only.
- Fonts: Manrope (display, `--font-display`) + Inter (body), via
  `next/font/google` in `layout.tsx`. Flight boards use `.tabular` (tabular
  numerals).
- Signature moves: navy `SectionHero` with gold runway rule on every interior
  page; full-bleed photo heroes on home/airport pages; dark navy flight board.
- Use `@grenmet/ui` primitives per-file (`@grenmet/ui/components/ui/<name>`),
  `cn` from `@grenmet/ui/lib/utils`. Button uses `asChild` for links.

## Contact form

`contact-form.tsx` → `POST /api/contact`, validation in `src/lib/contact.ts`
(Zod). **Delivery deferred** — the route validates and logs only. Keep the
schema when wiring real delivery (email to gaa@gaa.gd).

## Testing

Vitest + Testing Library + jsdom. Tests cover `lib/*` pure logic and
`FlightBoard` behaviour.

```bash
pnpm --filter @grenmet/web-mbia test
```
