# gms (`@barrelsgd/web-gms`) — agent context

Port **3003**. Public weather dashboard for Spice Island (Grenada) — daily forecasts, weather conditions, alerts, and news.

**Design-system role: public web reference app.** Lowest-drift baseline — prototype and validate new public-facing patterns here first before reusing them elsewhere. See `docs/design-workflow.md`.

## Auth pattern

"Sign in" with the Barrels account (ADR-0017): `AccountButton` in the main bar
on desktop and in the nav drawer on phones and tablets,
routes `src/app/auth/{start,callback,me,logout}`, config `src/lib/auth-config.ts`
(registry key `weather`). Off until `WEATHER_SSO_CLIENT_SECRET` is set. The
button loads the account in the browser (`/auth/me`), so pages stay static.

## Data sources — no database

No DB access. Two backends, never gaa-admin (it only authors into FastAPI):
- **FastAPI = weather data** (`AUTH_API_URL` + `AUTH_API_V1_STR`, no cookies):
  forecast, current conditions, published products (`src/lib/products.ts`,
  `src/lib/weather-snapshot.ts`); CAP alerts via `CAP_API_URL` (`src/lib/cap.ts`).
  Types/validators come from `@barrelsgd/api-client`; new data = new FastAPI
  public endpoint.
- **Payload CMS = the words around it** (`CMS_API_URL`, `src/lib/cms.ts`):
  desk updates, stories, questions, quizzes, Discover, weather-now note, home
  settings, report write-ups, Weather now live posts. The homepage reads CMS
  content in one call (`fetchHomeContent`). The CMS holds no figures: a post's
  `linkedProduct` is an id that `components/linked-product.tsx` resolves live via
  `fetchPublishedProduct`. Live media are click-to-load (`media-player.tsx`,
  allowlist in `lib/media-embed.ts`).
- Each home section fetches copy and data separately; either may be unavailable
  without hiding the other. An unavailable feed says so. It never falls back to
  sample figures, and alert pages never render an empty list as "no alerts in
  effect".
- Static samples remain in `src/lib/forecast-data.ts` (tests/reference),
  `src/lib/events.ts`, and `src/components/home/sample-sections.tsx`
  (to be replaced by FastAPI data + CMS copy).

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
  Owner exception (30 Sep 2026): the home Explore today and Grenada in data
  sections carry no notice, and the sky hero fills fields FastAPI does not
  carry yet from `src/lib/hero-samples.ts` (only inside a real reading or
  issued day, never during an outage). Delete a sample once FastAPI supplies it.
- **Home hero:** table layout at every width (9 Oct 2026): a Now tab, then five
  day tabs, then the selected tab's panel inside the hero (`SkyHero selected=`).
  Now is selected on `/`; dated routes select their day, `/weather` selects
  today. Phones show a picture card for the selected tab above a strip whose
  first column is Now; wider screens put the Now card beside the day tabs.
  Panels share `ReadingGrid` (`components/home/reading-grid.tsx`, items from
  `lib/hero-readings.ts`). Forecast panels carry max/min only, no feels like
  or UV. No provenance chips or issue tabs (owner, 30 Sep 2026); a reading over
  3 h old still says "Last observed". No other hero tabs (marine lives at
  `/marine`). The website has no bottom tab bar; `MobileTabBar` is kept for
  the app.
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
  `system`, `ThemeToggle` in the main bar beside search and the alert pill). Headings use
  `text-gm-heading`, not `text-gm-navy`; printable products sit in `.gm-paper`.

## Key dependencies (unique to this app)

- `lucide-react` — icons (migrated off `@heroicons/react`)
- `motion` — drawer and page transitions; honour reduced motion via `MotionProvider`. Warning surfaces use plain CSS, not motion.

## Special conventions

- Forecast days come from the FastAPI public forecast (`src/lib/weather-snapshot.ts`); `src/lib/forecast-days.ts` maps them to `/weather/YYYY/MM/DD`.
- `src/lib/utils.ts` contains date utilities shared across components.
- Interactive components use Base UI primitives (`@base-ui/react`, via `@barrelsgd/ui` where wrapped): the mega menu, drawer accordion.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
