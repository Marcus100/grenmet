# gms (`@barrelsgd/web-gms`) — agent context

Port **3003**. Public weather dashboard for Spice Island (Grenada) — daily forecasts, weather conditions, alerts, and news.

**Design-system role: public web reference app.** Lowest-drift baseline — prototype and validate new public-facing patterns here first before reusing them elsewhere. See `docs/design-workflow.md`.

## Auth pattern

"Sign in" with the Barrels account (ADR-0017): `AccountButton` in the main bar
on desktop and in the nav drawer on phones and tablets,
routes `src/app/auth/{start,callback,me,logout}`, config `src/lib/auth-config.ts`
(registry key `weather`). Off until `WEATHER_SSO_CLIENT_SECRET` is set. The
button loads the account in the browser (`/auth/me`), so pages stay static.

**Button hidden by default (owner, 31 Oct 2026).** `WEATHER_SHOW_SIGN_IN`
(`src/lib/env.ts`, boolean `true`/`false`, default `false`) gates only the
button's visibility, read by `signInVisible()` in `src/lib/auth-config.ts` and
passed to `Header` (`showSignIn`) and `NavDrawer` (`showSignIn`), which hide the
button and the drawer's "Your account" block. The auth routes, callback,
`/auth/me` and account handling are unchanged. Tests: `header.test.tsx`,
`nav-drawer.test.tsx`, `auth-config.test.ts`. Documented in `docs/env.md`.

## Data sources — no database

No DB access. Two backends, never gaa-admin (it only authors into FastAPI):
- **FastAPI = weather data** (`AUTH_API_URL` + `AUTH_API_V1_STR`, no cookies):
  forecast, current conditions, the MBIA month summary behind Grenada in data
  (`fetchMonthSummary`, mapped by `src/lib/month-summary.ts`), published products (`src/lib/products.ts`,
  `src/lib/weather-snapshot.ts`); CAP alerts via `CAP_API_URL` (`src/lib/cap.ts`).
  Types/validators come from `@barrelsgd/api-client`; new data = new FastAPI
  public endpoint.
- **Payload CMS = the words around it** (`CMS_API_URL`, `src/lib/cms.ts`):
  desk updates, stories, questions, quizzes, Discover, the duty forecaster's note
  (a live post of kind `note`, read from `weatherNow`, with its related links), home
  settings, report write-ups, Weather now live posts. The homepage reads CMS
  content in one call (`fetchHomeContent`). The CMS holds no figures: a post's
  a post's main related link (`isMain`) is a card only for a warning or a GMS page: `components/featured-link.tsx` shows a warning (`linked-alert.tsx`, live via `fetchPublicAlert`) or a GMS page (`linked-page.tsx`, from `NAV_SECTIONS`); site addresses are built from the stored id/identifier/path (`lib/related-link-href.ts`), never the pasted host. An issued product is never a card (owner, 29 Oct 2026); it stays a plain related link, and the older `linkedProduct` field is ignored. Live media are click-to-load (`media-player.tsx`,
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
    help/ app-guide/ sitemap/ privacy/ accessibility/ disclaimer/
  (planned)/planned/[...planned]/ ← placeholders for nav links marked `planned` (reached by rewrites)
  (articles)/                    ← CMS items that 404 when missing: news, updates,
                                   reports, quiz/[slug], explained/[slug]
                                   (outside (pages) on purpose: see 404s below)
  layout.tsx                     ← root layout: masthead, footer, tab bar
  robots.ts, sitemap.ts          ← crawlers: all pages allowed; sitemap from lib/sitemap-paths.ts
  api/health/route.ts
```

- **404s and streaming (30 Oct 2026):** a `loading.tsx` streams its response
  before a page's `notFound()` runs, so that status is 200 (Next docs,
  "Status codes"). `(pages)/loading.tsx` covers the standing pages, so the
  planned placeholders (`(planned)/`) and the CMS items (`(articles)/`) live
  outside it: a missing item there is a real 404. Never add a loading file above
  a route that must 404 for an unknown URL. Trade-off: those routes have no
  navigation skeleton (the previous page stays until the item arrives).
  Static event pages and CAP alert ids under `(pages)` still answer 200 when
  missing (not fixed).
- **Unknown URLs never reach a page (30 Oct 2026):** a `notFound()` thrown
  while a page renders on the server (every gms page is dynamic: the root
  layout reads live alerts) makes Next 16 send an empty error document
  (`<html id="__next_error__">`) that stays blank until JavaScript runs. So no
  catch-all may sit at the site root: an unknown URL must match no page, and
  Next then serves `app/not-found.tsx` rendered on the server, status 404. The
  planned placeholders live under `/planned` and each planned link is rewritten
  there (`lib/planned-routes.ts`, `next.config.ts`); `/planned/*` is internal
  (`noindex`, canonical is the public address, never linked). `route-structure.test.ts`
  guards that no catch-all sits at the root, and `planned-routes.test.ts`
  enforces that no real route serves a planned address. The root single-segment
  `(weather)/[location]` route has `dynamicParams = false` and calls
  `notFound()` for other slugs: it answers unknown one-segment URLs with the
  server-rendered 404 only while it is prerendered (today no second place is
  enabled, so Next's router rejects every slug). If enabling a place makes it
  render on demand, recheck `/this-page-does-not-exist` with curl. A CMS item
  or other dynamic page that calls `notFound()` for a missing item still gets
  the empty error document (not fixed).
- **Masthead and /alerts status (30 Oct 2026):** the CAP warnings and the GMS
  outlook's Green counts are separate promises. `WithStatus`
  (`components/with-alerts.tsx`) shows a warning at once and awaits the outlook
  only when no warning is in effect. `fetchGreenStatus` / `fetchGreenAlerts`
  (`lib/green-status.ts`) never reject; an unread or incomplete outlook is never
  "No active alerts". The outlook call is cached per request; a short revalidate
  is a possible later improvement.
- **Canonical and Open Graph:** root metadata (`lib/site-metadata.ts`) sets
  `alternates.canonical: "./"`, which Next resolves against each page's own
  path. Share titles for pages without their own `openGraph` use the site name.
- **Moving a route:** add the old prefix → new home to `ROUTE_MOVES` in
  `src/lib/route-moves.ts` (it feeds `next.config.ts` redirects); never delete
  a public URL without one. `route-moves.test.ts` fails if an old route is still
  served or a destination has no page.
- **Nav:** `NAV_SECTIONS` in `src/lib/nav-sections.ts` feeds the mega menu,
  drawer, sitemap, breadcrumbs and section index pages. A link to a page that
  does not exist yet is marked `planned` and served by `planned/[...planned]`
  through a rewrite;
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
- **Home hero (owner design, 29 Oct 2026):** a card for the selected tab
  (`components/home/hero-card.tsx`), the tabs (Now, then five days, at every
  width) and the selected tab's details panel (`SkyHero selected=`). Phones
  stack card, tabs, panel and keep one height on every tab (`ByTab` stacks the
  panels); wider screens put the card on the left and the tabs over the panel
  on the right, as short as the selected tab (`ByTab fit`). Now card: "Now ·
  station" (or "Last observed …" past 90 minutes), temperature with today's
  lowest and highest so far either side, sky (observer's words, else cloud),
  feels like and wind with gusts, and a link to today's forecast. Day card:
  date, low, high, chance of rain, sky, wind with gusts, the forecaster's
  sentence. Tabs: high, a filled sky icon (`sky-glyph.tsx`) on the line, rain
  chance, low, then day and date. Panels (`lib/hero-readings.ts`) hold only
  what the card does not: Now = humidity, dew point, pressure with its trend,
  visibility (with haze or dust words), cloud base, rain over the register's
  period; a day = sunrise, sunset, high and low tides (each time over its
  height), seas, swell. A missing item is left out, never a dash. Homepage times
  read a.m./p.m. (`lib/clock.ts`): hero card, moon card, live posts, desk
  cards; the day tabs and the rest of the site keep the 24-hour clock. Times
  use the body font, never the monospace one. No UV, air quality or warnings here (warnings have their
  own section above). A Moon tile waits for the planned almanac data. No other
  hero tabs (marine lives at `/marine`). The website has no bottom tab bar;
  `MobileTabBar` is kept for the app.
- **Units (28 Oct 2026):** every hero measurement is metric or imperial,
  metric until a visitor chooses (owner first chose imperial, then metric) (switch in the top corner of the home hero card, above the tabs, `components/units-toggle.tsx` placed by `components/home/sky-hero.tsx`; it was in the header until 31 Oct 2026, so only the home page has the switch and other pages show the saved choice; saved in `localStorage`
  `gm-units`). The API sends WMO units (°C, knots, metres, km, hPa, mm). A figure
  is a `Measure` (`lib/units.ts`) rendered by `components/measure.tsx` in both
  systems; `globals.css` shows one by `<html data-units>`, so static pages never
  flash. Forecast panels show only what a forecast issues (wind, gusts, chance of
  rain, seas, swell, sun, tides). The 3-day forecast, current conditions,
  observations and sea-state tables are on the switch too (`lib/weather-pages.tsx`
  builds their cells as `Measure`; `InfoTable` and `StatTiles` take nodes).
  The heat page's sentence about 31°C is a `Measure` too (`Prose` takes nodes
  as well as text, for this). Still hand-typed metric text: the tropics-season
  table. New numbers go through `Measure`, never a hand-built string.
  Plain-text consumers see both renderings: search snippets, link previews,
  copied text and `textContent` read the metric and the imperial figure side by
  side, because CSS hides one, not the markup (`components/measure.test.tsx`
  pins this). So nothing built for metadata, JSON-LD, `alt`, `title` or
  `aria-label` may come from `Measure` or `bothUnits`. When such a string needs
  a number, use `formatMeasure(measure, DEFAULT_UNITS)` (metric) explicitly.
  `Reading.value` and `Condition.value` are that metric text. The forecast
  fallback's Max/Min Temp and the MBIA midday observation carry a `measure`
  (`lib/forecast-selection.ts`); its wind and sea-state text stays as the
  forecaster typed it, since the feed sends no numbers for it (an API change
  would be needed).
  The panels under the hero tabs are all rendered, stacked in one grid cell
  (`ByTab`, `hero-selection.tsx`), so the hero keeps the tallest panel's height
  and a tab change never moves the page. Only the selected panel is visible.
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
- **Draft preview:** `/preview?token=` (`app/(pages)/preview`) shows one unpublished
  post as it will read. The CMS signs the link (two hours, the CMS's own secret)
  and checks it; this app holds no secret. `lib/cms-preview.ts` sends the token to
  the CMS's `GET /api/public/preview`, refuses a malformed token without asking,
  and reads the CMS's 404 as invalid (forged, expired or deleted). The page renders
  through `CmsArticleBody`, the same body as the published article, with a banner
  saying it is a draft. It is `noindex`, `no-store` (page metadata and the
  `next.config.ts` header), never in the sitemap or nav. Set the CMS's
  `GMS_PREVIEW_URL` to this page's address. Tests: `lib/cms-preview.test.ts`
  (expired, forged, malformed, outage), `app/(pages)/preview/page.test.tsx`.
- **Missing CMS items (30 Oct 2026):** `src/proxy.ts` runs only on the CMS
  item addresses (`/explore/news|updates|reports/...`, `/explore/explained/<slug>`,
  `/explore/quiz/<slug>`). On a full page load it asks the CMS's public list
  endpoint whether the item exists (`lib/cms-item.ts` maps the address to the
  slug, `lib/cms-item-exists.ts` asks; found items are kept 60 s, missing ones 10 s
  so a newly published item shows within seconds, "could not tell" 5 s); a missing
  item is rewritten to Next's `/_not-found`, rendered on the server with status
  404. Reason: a `notFound()` thrown while a dynamic page renders makes Next 16
  send an empty error document (`<html id="__next_error__">`) that only fills
  in with JavaScript; moving live data into Suspense or a segment `not-found`
  does not change that. Client navigations and a CMS that cannot answer fall
  through to the page (which shows its "cannot be retrieved" message).
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

`/climate/newsletter` has the daily climate newsletter sign-up (`NewsletterSignup` -> `src/app/api/newsletter/subscribe/route.ts` -> FastAPI list `gms-newsletter`, double opt-in, Turnstile when enabled; the consent wording is `NEWSLETTER_CONSENT` in `src/lib/newsletter-signup.ts`; accepted sign-ups count as `newsletter_signup_submitted`). `/alerts/get-alerts` has email sign-up (`AlertEmailSignup` -> `src/app/api/alerts/subscribe/route.ts` -> FastAPI list `gms-alerts`, double opt-in) and a "Get browser notifications" button (`BrowserNotifications` -> `src/app/api/alerts/push/route.ts`, service worker `public/sw.js`). The service worker is registered and permission asked only on the button click. The confirm and unsubscribe links redirect to `/subscribe/status?result=`, which `ROUTE_MOVES` sends to `/alerts/get-alerts` (query kept) where `AlertSignupResult` shows the outcome. CAP stays the source; WhatsApp and SMS are not offered.

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
