# mbia (`@barrelsgd/web-mbia`) — agent context

Port **3005**. Public website for the **Grenada Airports Authority** (GAA) —
Maurice Bishop International Airport (GND) + Lauriston Airport, Carriacou (CRU).
Modern redesign of the old WordPress site; the scraped original lives in
`.source/` (gitignored, reference only). MVP: static MDX + sample flight data,
light mode, no DB. "Sign in" with the Barrels account (ADR-0017) via
`AccountButton` and `src/app/auth/*` (key `mbia`), off until
`MBIA_SSO_CLIENT_SECRET` is set. Deployment configured for `mbia.barrels.gd` and staging.

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

`src/lib/live-flights.ts` `loadFlightData()` calls FastAPI `GET /api/v1/flights/board`
(OpenSky "recent movements", flag `FLIGHTS_OPENSKY_ENABLED`, off by default) on `/`
and `/flights` (`revalidate = 1800`, pages stay static). It returns live rows only
when the API says `available`; otherwise (flag off, API down) the labelled sample
board. `FlightBoard` shows a banner per `source`: never remove the "sample" label
for sample data. Live data is previous-day-or-earlier and TGPY only, so Lauriston
shows an empty state when live. Licence: OpenSky is research-only (see
`docs/strategy/integration-opportunities.md`).

## Design system

- `src/app/globals.css` imports `@barrelsgd/ui/styles/globals` then **overrides**
  shadcn semantic tokens to the GAA palette: navy `--gaa-navy(-deep/-ink)` from
  the logo, sea teal `--gaa-sea`, spice gold `--gaa-gold`. Status colors
  (`--gaa-status-*`) are for the flight board only. Light mode only.
- Fonts: Manrope (display, `--font-display`) + Inter (body), via
  `next/font/google` in `layout.tsx`. Flight boards use `.tabular` (tabular
  numerals).
- Signature moves: navy `SectionHero` with gold runway rule on every interior
  page; full-bleed photo heroes on home/airport pages; dark navy flight board.
- Use `@barrelsgd/ui` primitives per-file (`@barrelsgd/ui/components/ui/<name>`),
  `cn` from `@barrelsgd/ui/lib/utils`. Button uses `asChild` for links.

## Contact form

`contact-form.tsx` → `POST /api/contact`, validation in `src/lib/contact.ts`
(Zod). The route validates and proxies to FastAPI `POST /api/v1/contact/messages`
(site `mbia`; `src/contact` stores it and emails `MBIA_CONTACT_RECIPIENT`
through the worker outbox). `turnstileToken` is forwarded but not verified yet
(`contact.service.verify_turnstile`). The form does not send a token today.

## Testing

Vitest + Testing Library + jsdom. Tests cover `lib/*` pure logic and
`FlightBoard` behaviour.

```bash
pnpm --filter @barrelsgd/web-mbia test
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
