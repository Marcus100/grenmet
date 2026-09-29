# gms (`@barrelsgd/web-gms`) — agent context

Port **3003**. Public weather dashboard for Spice Island (Grenada) — daily forecasts, weather conditions, alerts, and news.

**Design-system role: public web reference app.** Lowest-drift baseline — prototype and validate new public-facing patterns here first before reusing them elsewhere. See `docs/design-workflow.md`.

## Auth pattern

Delegates to `web-auth` (`:3000`) via redirect — does not handle sign-in itself.

## No database

Static/mock data currently (`src/lib/mock-data.ts`, `src/lib/forecast-data.ts`,
`src/lib/events.ts`). No Drizzle, no direct DB access. The exception is the live
CAP warnings feed via `src/lib/cap.ts` — `/alerts`, `/alerts/cyclone`,
`/alerts/marine`, `/alerts/tsunami` and `/marine/small-craft` render real
alerts. When that feed is unreachable those pages say so; they must never render
an empty list as "no alerts in effect".

## Routes

Seven sections, one URL root each (Bold sky IA, 28 Sep 2026; Warnings became
Alerts and moved first on 29 Sep): `/alerts`, `/weather`, `/marine`, `/climate`, `/services`, `/explore`, `/about`.

```
src/app/
  (weather)/                     ← takeover + sky hero + day strip
    layout.tsx
    page.tsx                     ← home: today + Bold sky sections
    weather/page.tsx             ← today at /weather
    weather/[year]/[month]/[day] ← a dated forecast day
  (pages)/                       ← standing pages, breadcrumbs + max-w-6xl
    alerts/ weather/ marine/ climate/ services/ explore/ about/
    [...planned]/                ← placeholders for nav links marked `planned`
    help/ app-guide/ sitemap/ privacy/ accessibility/ disclaimer/
  layout.tsx                     ← root layout: masthead, footer, tab bar
  api/health/route.ts
```

- **Moving a route:** add the old prefix → new home to `ROUTE_MOVES` in
  `src/lib/route-moves.ts` (it feeds `next.config.ts` redirects); never delete
  a public URL without one. `route-moves.test.ts` fails if an old route is still
  served or a destination has no page.
- **Nav:** `NAV_SECTIONS` in `src/lib/nav-sections.ts` feeds the mega menu,
  drawer, sitemap, breadcrumbs and section index pages. A link to a page that
  does not exist yet is marked `planned` and served by `[...planned]`;
  `nav-sections.test.ts` fails if a built link has no route or a planned link is
  shadowed by one. Build the page, then drop `planned`.
- **Sample content:** a page or home section whose product is not yet issued
  renders `<PlaceholderNotice />` (`compact` inside an otherwise live page).
  Sample figures must never read as an operational product, and sample status
  chips never use hazard colours.
- **Bold sky:** the sky gradient and `bg-gm-scrim` are for the home hero only;
  see `docs/design/gms.md`.
- **Locations:** places live in `src/lib/locations.ts`, keyed internally by airport
  locator (TGPY, TGPZ) with readable slugs. The default place (Grenada) uses the
  unprefixed URLs; others get `/<slug>` routes (`(weather)/[location]`,
  `dynamicParams = false`). To add a place: wire its data in
  `src/lib/location-data.ts`, then set `enabled: true`. The switcher appears only
  when two or more places are enabled. Never show another station's reading for
  a place.
- **Search:** `SiteSearch` (masthead button or `/`) ranks `NAV_SECTIONS` pages plus
  published CMS articles from `/api/search` (read-only proxy) with
  `src/lib/search.ts`. New menu pages are searchable automatically.
- **Dark mode:** `<html class="gm-site">` scopes the GMS dark palette; the theme
  follows the device via `@barrelsgd/theme` (`ThemeBootScript` defaults to
  `system`, `ThemeToggle` in the utility bar and drawer). Headings use
  `text-gm-heading`, not `text-gm-navy`; printable products sit in `.gm-paper`.

## Key dependencies (unique to this app)

- `lucide-react` — icons (migrated off `@heroicons/react`)
- `motion` — drawer and page transitions; honour reduced motion via `MotionProvider`. Warning surfaces use plain CSS, not motion.

## Special conventions

- Forecast days come from the FastAPI public forecast (`src/lib/weather-snapshot.ts`); `src/lib/forecast-days.ts` maps them to `/weather/YYYY/MM/DD`.
- `src/lib/utils.ts` contains date utilities shared across components.
- Interactive components use Base UI primitives (`@base-ui/react`, via `@barrelsgd/ui` where wrapped): the mega menu, drawer accordion.
