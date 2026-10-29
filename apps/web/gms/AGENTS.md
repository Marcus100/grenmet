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
  forecast, current conditions, the MBIA month summary behind Grenada in data
  (`fetchMonthSummary`, mapped by `src/lib/month-summary.ts`), published products (`src/lib/products.ts`,
  `src/lib/weather-snapshot.ts`); CAP alerts via `CAP_API_URL` (`src/lib/cap.ts`).
  Types/validators come from `@barrelsgd/api-client`; new data = new FastAPI
  public endpoint.
- **Payload CMS = the words around it** (`CMS_API_URL`, `src/lib/cms.ts`):
  desk updates, stories, questions, quizzes, Discover, weather-now note, home
  settings, report write-ups, Weather now live posts. The homepage reads CMS
  content in one call (`fetchHomeContent`). The CMS holds no figures: a post's
  a post's main related link (`isMain`) is a card: `components/featured-link.tsx` shows an issued product (`linked-product.tsx`, live via
  `fetchPublishedProduct`), a warning (`linked-alert.tsx`, live via `fetchPublicAlert`) or a GMS page (`linked-page.tsx`, from `NAV_SECTIONS`); site addresses are built from the stored id/identifier/path (`lib/related-link-href.ts`), never the pasted host. Older CMS builds send `linkedProduct`, kept as a fallback. Live media are click-to-load (`media-player.tsx`,
  allowlist in `lib/media-embed.ts`).
- Each home section fetches copy and data separately; either may be unavailable
  without hiding the other. An unavailable feed says so. It never falls back to
  sample figures, and alert pages never render an empty list as "no alerts in
  effect".
- Static reference data remains in `src/lib/forecast-data.ts` (tests and the
  outage layout only) and `src/lib/events.ts`; neither may reach a public page
  as a measurement or forecast.

## Routes

Seven sections, one URL root each (Bold sky IA, 28 Sep 2026; Warnings became
Alerts and moved first on 29 Sep): `/alerts`, `/weather`, `/marine`, `/climate`, `/services`, `/explore`, `/about`.

```text
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
- **No invented figures (owner rule, 18 Oct 2026):** the public site never
  shows invented or sample figures; every page shows real data or an honest
  notice. This reverses the 30 Sep 2026 decision that allowed sample content on
  the home page. A page or home section whose product is not yet issued keeps
  its structure and explanatory text and renders `<PlaceholderNotice />`
  ("Not yet available from GMS"; `compact` inside an otherwise live page; the
  optional `source` prop links a live page meanwhile). Never put placeholder
  numbers, tables or stat tiles beside it. The sky hero shows real register
  and issued-forecast values only, sun times computed by `src/lib/sky.ts`, and
  "Not available yet" for fields no feed carries (UV, AQI, tides, swell, rain
  chance, gusts, rainfall). Plan your week (Explore today) shows,
  per sector, the GMS alerts and CAP warnings that apply over the next seven
  days from FastAPI `GET /wxproducts/public/sector-outlook` (`fetchSectorOutlook`,
  tiles built by `lib/sector-outlook.ts`; the six sectors are `SECTORS` in
  `@barrelsgd/gms/sectors`). An untagged item shows under every sector as
  "Affects everyone"; an unreachable feed says so and a partial one says the
  lists may be incomplete; an empty sector says "No alert or warning impacts
  published for this sector", never "minimal". Nothing is typed in the CMS.
  Tests: `placeholder-notice.test.tsx`, the "hero readings" block in
  `sky-hero-panels.test.tsx` and `data-sections.test.tsx` guard this.
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
- **Units (28 Oct 2026):** every hero measurement is metric or imperial,
  metric until a visitor chooses (owner first chose imperial, then metric) (header button, saved in `localStorage`
  `gm-units`). The API sends WMO units (°C, knots, metres, km, hPa, mm). A figure
  is a `Measure` (`lib/units.ts`) rendered by `components/measure.tsx` in both
  systems; `globals.css` shows one by `<html data-units>`, so static pages never
  flash. Forecast panels show only what a forecast issues (wind, gusts, chance of
  rain, seas, swell, sun, tides). Not yet converted: the 3-day/7-day,
  conditions, observations and marine text tables (`lib/weather-pages.ts`, still
  metric text). New numbers go through `Measure`, never a hand-built string.
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

- **Provenance and staleness (foundations plan NFRs):** every public data block
  carries `<Provenance>` (`components/pages/provenance.tsx`): source, observed or
  issued time in Grenada time, status (provisional, verified, external) and, for
  external sources such as NOAA GOES, "Not a GMS product". Limits live in
  `lib/current-conditions.ts`: observations 90 min (`STALE_AFTER_MS`), forecasts
  12 h since issue, satellite 30 min. A stale product says so in words ("Last
  observed", warning line), never only by colour. Home page exception (owner,
  28 Oct 2026): the hero Now card carries only its top line ("Last observed …
  · provisional") and Grenada in data only its caption; detail pages keep the
  full block. GMS forms store offset-less
  Grenada times; read them with `parseGrenadaTime`, never `new Date()`.
- **Satellite:** `/weather/satellite` reads FastAPI `wxwatch/public/latest`
  (`lib/satellite.ts`) and shows images through `app/api/satellite/[id]` (a proxy;
  the API host and bucket are never exposed). No image is the "Not yet available"
  notice; an unreachable feed is the unavailable notice.
- **Storm mode:** alert pages (`next.config.ts` headers), the CAP feed proxies and
  the satellite proxy send the cache headers in `lib/storm-cache.ts` so Cloudflare
  can serve the last good copy while the origin is down; errors are `no-store`.
  Setup: `docs/operations/cloudflare-storm-cache.md`.

## Forms

`/climate/data-request` renders `DataRequestForm` (`components/pages/data-request-form.tsx`), which posts to `src/app/api/data-request/route.ts`, a validate-and-proxy handler for FastAPI `POST /api/v1/contact/data-requests` (stored, emailed to `GMS_DATA_REQUEST_RECIPIENT`, confirmation to the requester). Schema in `src/lib/data-request.ts`; hidden honeypot field `website`; consent is required.

`/alerts/get-alerts` has email sign-up (`AlertEmailSignup` -> `src/app/api/alerts/subscribe/route.ts` -> FastAPI list `gms-alerts`, double opt-in) and a "Get browser notifications" button (`BrowserNotifications` -> `src/app/api/alerts/push/route.ts`, service worker `public/sw.js`). The service worker is registered and permission asked only on the button click. The confirm and unsubscribe links redirect to `/subscribe/status?result=`, which `ROUTE_MOVES` sends to `/alerts/get-alerts` (query kept) where `AlertSignupResult` shows the outcome. CAP stays the source; WhatsApp and SMS are not offered.

## Key dependencies (unique to this app)

- `lucide-react` — icons (migrated off `@heroicons/react`)
- `motion` — drawer and page transitions; honour reduced motion via `MotionProvider`. Warning surfaces use plain CSS, not motion.

## Special conventions

- Forecast days come from the FastAPI public forecast (`src/lib/weather-snapshot.ts`); `src/lib/forecast-days.ts` maps them to `/weather/YYYY/MM/DD`.
- `src/lib/utils.ts` contains date utilities shared across components.
- Interactive components use Base UI primitives (`@base-ui/react`, via `@barrelsgd/ui` where wrapped): the mega menu, drawer accordion.
- Playwright smoke tests live in `e2e/` (`smoke.spec.ts`) and are excluded from Vitest; run them from the repo root with `pnpm e2e` while `pnpm dev:web:gms` is up.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
