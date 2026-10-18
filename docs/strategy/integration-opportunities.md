# Integration and API Opportunities

**Status:** Working strategy — options, not approved work  
**Recorded:** 2026-10-17  
**Owner:** Barrels Grenada  
**Last updated:** 2026-10-17

## Purpose

This document lists what the repository already integrates, the gaps worth
closing first, and the external and internal APIs that could support Barrels
products, [service lines](barrels-service-lines.md), and GAA/GMS client
delivery. It complements the
[provider integrations reference](../operations/provider-integrations.md) and
[integration readiness](../operations/integration-readiness.md), which remain
authoritative for configured providers and environment status.

Every entry here is an Explore option. Adding a provider or a dependency still
follows the portfolio rule that platform work is pulled by an approved product
or client need, plus the repository rules for new dependencies. Provider terms,
prices, and coverage come from desk research on 2026-10-17 and should be
verified before adoption.

## Current inventory

Snapshot from the committed `apps/api/fastapi/openapi.json` on 2026-10-17: 315
paths and 378 operations. A declared endpoint is not proof of production
readiness.

| Domain | Operations |
| --- | --- |
| `hr` | 136 |
| `auth` | 74 |
| `events` | 36 |
| `cap` (plus public feeds under `/api`) | 27 + 10 |
| `janitorial` | 26 |
| `wxwatch` | 19 |
| `transport` | 17 |
| `wxproducts` | 13 |
| `notifications` | 11 |
| `eregister`, `utils`, `billing`, `audit` | 4, 3, 1, 1 |

Existing external services: Resend (email and webhooks), Sentry, PostHog,
Google Analytics (GMS public site), Google OAuth, Cloudflare, DigitalOcean VMs
and Spaces, and Stripe groundwork in `billing`. Scientific sources include
WIS2box, GeoNetCast, and NHC ingestion.

The notifications domain already supports in-app notifications, preferences,
organisation-level settings, and snoozing. New messaging providers should
become delivery channels in that domain, not separate notification systems.

## Gaps to close first

| Gap | Evidence | Why it matters |
| --- | --- | --- |
| Signal subscriptions (closed on dev) | `src/subscriptions` (double opt-in, signed confirm and unsubscribe links, per-list keys); Signal's `/api/subscribe` proxies to it. No reader-facing form exists yet, by design | Remaining: a sign-up form in the reader, and sending broadcasts to confirmed subscribers |
| MBIA contact delivery (closed on dev) | `src/contact` stores each message and queues one email to `MBIA_CONTACT_RECIPIENT`; MBIA's `/api/contact` proxies to it | Remaining: set the recipient per environment and set `TURNSTILE_*` (`src/turnstile.py`) |
| Resend feedback (closed on dev) | Webhook writes hard bounces and complaints to `email_suppression`; complaints also unsubscribe list members; non-transactional outbox mail skips suppressed addresses | Remaining: the staff notification mailer does not check the list (transactional by decision) |
| Stripe settlement unproven | `billing` checkout and webhook groundwork; no reconciliation loop | Pay/Invoice and Events depend on it |
| NHC collection not scheduled end to end | Ingestion and operator APIs exist; no accepted periodic service | Operational acceptance before relying on it |

The first three are now implemented on `dev`. The last two need product or
operational acceptance first.

## External candidates

### Communications and publishing

| Provider | Use | Notes | Pulled by |
| --- | --- | --- | --- |
| Resend audiences and broadcasts | Newsletters, scheduled broadcasts | Already integrated; test before paying for Mailchimp | Signal, Events, Barrels |
| Mailchimp | Campaign automation, segmentation | Only if it adds value beyond Resend | Marketing at scale |
| Buffer (GraphQL API) | Scheduled social publishing from approved content | Content originates in the platform; Buffer distributes it | GMS outlooks, Signal, Events, Shop |
| OneSignal | Web and mobile push | Channel in `notifications` | GMS, Events, Delivery |
| WhatsApp Business Cloud API | Order updates, bookings, opt-in information | Template and messaging costs; extra Meta rules for government users and political content | Customer-facing services |
| Twilio | SMS, phone verification, SMS fallback | Test sender support, delivery, and cost on local networks | Verification, reminders |
| Cloudflare Turnstile | Bot protection on public forms | Server-side Siteverify | Sign-up, login, contact, booking |
| Chatwoot | Support inbox and site chat | Self-hostable | Barrels services, Shop, Events |

Marketing and social platforms are never the primary channel for official
weather warnings. The CAP workflow, the GMS website, and approved dissemination
channels operate independently of them.

### Commerce, location, and business

| Provider | Use | Notes |
| --- | --- | --- |
| Republic EPay | Local card checkout and reconciliation | Subject to merchant approval |
| Mapbox / OpenStreetMap | Maps, geocoding, place search | Public Nominatim is rate-limited; use a commercial provider or self-host |
| Google Routes API | Delivery distance and cost estimates | Validate Grenada coverage |
| Meilisearch | Typo-tolerant product, article, and directory search | Self-hostable |
| Open Food Facts | Barcode lookup for inventory onboarding | Volunteer data, ODbL licence; test local coverage |
| NHTSA vPIC | VIN decoding | Does not cover Japanese domestic-market chassis numbers |
| Google Business Profile APIs | Merchant listings, hours, reviews | Needs merchant authorization and API access |
| GTFS Schedule / Realtime | Public bus routes, stops, vehicle positions, alerts | For a future public bus product, not GAA staff transport records |

International geocoders lack local precision. A Grenada places dataset (village
names, landmarks, verified delivery points) is likely needed whichever provider
is chosen.

### Meteorology, aviation, oceans, Earth observation

| Source | What it enables | Priority |
| --- | --- | --- |
| Copernicus Marine | Marine forecasts, sea surface temperature, waves, currents, verification. Waves and SST built in `src/environmental`; see [Copernicus Marine and CAMS](#copernicus-marine-and-cams-environment-api) | High |
| NASA POWER | Solar, agricultural climate, historical rainfall, rainwater harvesting | High |
| Aviation Weather Center | Independent TGPY METAR/TAF retrieval, IWXXM | High |
| Planetary Computer STAC | Land use, coastal change, watershed and vegetation analysis | High |
| OGC SensorThings API | Standard access to the AWS network: stations, sensors, observations | High |
| OGC Environmental Data Retrieval | Standards-based weather data API by point, area, or time | High |
| USGS Earthquake GeoJSON | Caribbean seismic dashboard | Medium |
| NASA EONET | Natural-hazard situational awareness | Medium |
| NASA FIRMS | Thermal anomalies (detections, not confirmed fires) | Medium |
| NOAA Space Weather | Solar and geomagnetic context for aviation, GNSS, radio | Exploratory |
| Global Fishing Watch | Fisheries research | Non-commercial use only; partnership needed |
| OpenSky Network | Aircraft tracking research | Commercial use needs a written licence; check coverage. Built behind a flag, off by default; see [OpenSky flight board](#opensky-flight-board-experimental) |

Copernicus Marine, NASA POWER, STAC, SensorThings, and EDR fit the existing
Python, xarray, and PostGIS stack best.

### Copernicus Marine and CAMS (environment API)

Built in `src/environmental`; disabled until credentials are set. Both feeds
are external, never GMS products, and every response carries provenance
(`source`, `issued_at`, `fetched_at`, `status: external`), `is_gms_product:
false` and the licence attribution text.

| Item | Copernicus Marine | CAMS (Atmosphere Data Store) |
| --- | --- | --- |
| Owner | Barrels platform; consumed by the GMS public pages | Same |
| Provider | Copernicus Marine Service, `copernicusmarine` client | ECMWF/Copernicus ADS, `cdsapi` client |
| Products | `cmems_mod_glo_wav_anfc_0.083deg_PT3H-i` (waves: VHM0, VHM0_SW1, VTM01_SW1, VMDR_SW1); `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` (`thetao`, top level = SST) | `cams-global-atmospheric-composition-forecasts` (`uv_biologically_effective_dose`, `dust_aerosol_optical_depth_550nm`; 0.4 degree) |
| Auth | `COPERNICUSMARINE_SERVICE_USERNAME`/`PASSWORD` (free account) | `CDSAPI_URL`/`CDSAPI_KEY` (free ADS account, accept the dataset licence) |
| Licence | Copernicus Marine licence: free, full and open, attribution required (text returned in `attribution`) | Copernicus licence: free, attribution required with the CAMS disclaimer (returned in `attribution`) |
| Limits | Fair use; the worker makes 2 small subsets every 6 h | ADS queue: requests can wait minutes; the worker makes 1 request every 12 h |
| Cache | Postgres `environment.series` (one row per point), replaced each fetch; API sends `s-maxage=1800` for Cloudflare | Same |
| Fallback | `available: false` when unset or nothing fetched; `stale: true` after 12 h; a failed fetch keeps the last series; never sample data | Same |
| Cost | Free | Free |

Caveats: the UV index is the mean over each 3-hour forecast step (CAMS
exposes accumulated dose), so it is below the midday peak; dust is aerosol
optical depth, not surface concentration; marine `issued_at` is the newest
model step at fetch time because a subset does not expose the run time.

### OpenSky flight board (experimental)

Built behind `FLIGHTS_OPENSKY_ENABLED` (off by default) in `src/flights`,
consumed by the MBIA flight board.

| Item | Detail |
| --- | --- |
| Owner | Barrels platform; MBIA site belongs to GAA as client |
| Provider | OpenSky Network REST API, `GET /flights/arrival` and `/flights/departure` for ICAO `TGPY` |
| Auth | Optional OAuth2 client credentials (`OPENSKY_CLIENT_ID`/`SECRET`, free account); anonymous works but has a very small daily quota |
| Licence | OpenSky terms: research and non-commercial use; **commercial use needs a written licence**. **Owner decision needed** before enabling on any production GAA site. Keep the flag off until answered |
| Rate limits | Per-account credit quota, much smaller anonymously; the worker makes 2 calls per 30 minutes (arrivals, departures) |
| Cache | Redis keys `grenmet:flights:TGPY:<board>`, TTL 6 h; no `REDIS_URL` means unavailable |
| Fallback | API returns `available: false` (flag off, empty cache, or no Redis); MBIA then shows the sample board labelled "Demo flight board ... sample data". A failed poll keeps the last cache until its TTL lapses |
| Cost | Free |

What it can and cannot do. The arrival/departure endpoints are batch-processed
by OpenSky, so flights appear only after the nightly run: data is from the
previous day or earlier (windows of at most 2 days). It is **not live** and not
a FIDS. Rows carry callsign, the time the aircraft was last (arrivals) or first
(departures) seen near the airport, and an estimated other-airport ICAO code.
There is no schedule, airline name, gate or delay status. Coverage of TGPY
depends on volunteer ADS-B receivers near Grenada and is unproven: an empty
result is possible and is handled as "unavailable". The MBIA board therefore
presents it as "Recent movements ... not a live board or a schedule".

### Economic and statistical data

World Bank Indicators, IMF SDMX, and ECCB statistics (confirm machine-access
arrangements) can feed Signal, Elections, and economic dashboards as contextual
indicators with recorded provenance.

### Operations

n8n for webhook-driven automation, Home Assistant for building and equipment
monitoring (refrigeration, energy, water tanks), and Jellyfin for self-hosted
training and briefing video, subject to content rights.

## Proposed internal APIs

These are not implemented. Each starts as a module in the existing FastAPI
modular monolith, with its own data boundary where needed, not a new service.

| API | Builds on | Unlocks |
| --- | --- | --- |
| Weather Verification | `wxproducts`, `eregister`, model notebooks | Compare ECMWF, AIFS, GFS, and official forecasts against observations (bias, MAE, RMSE, probabilistic scores) |
| Weather Data | `wxproducts`, SURFACE, WIS2 | Station observations, climatologies, quality flags; needs a GAA redistribution agreement before any external or commercial use |
| Weather Impact | `cap`, `wxproducts` | Query published hazards and exposure at a location |
| Marine Conditions | GMS marine products, Copernicus Marine | Waves, swell, currents, sea surface temperature, buoys |
| Grenada Places | `transport` stops, new geospatial data | Addresses, villages, landmarks, delivery points, boundaries |
| Inventory and Orders | New commerce domain | Catalogues, stock, suppliers, barcode lookup, fulfilment, returns |
| Appointments | New booking domain | Garages, car washes, salons, hotels |
| Ticketing | `events` | Paid tickets, QR admission, refunds, settlement |
| Publishing | CMS, `wxproducts`, `notifications` | Controlled multichannel publication |
| Local Economy | New ingestion domain | Price monitoring and economic indicators |
| Offline Sync | `transport`, `events`, worker | Safe sync of field observations and ticket scans after connectivity loss |
| AI Knowledge | `auth`, CMS, `storage` | Organisation-scoped retrieval with citations (see [ADR-0014](../adr/0014-barrels-platform-core-direction.md)) |

## Product concepts

- **Event weather intelligence:** Events plus approved GMS forecasts and venue
  location give organisers rain, heat, and alert context. The organiser decides
  on postponement.
- **Weather-aware retail:** shop sales history plus forecasts suggest stock
  changes before heavy rain, holidays, or events. This is a hypothesis to test.
- **Water intelligence:** GMS rainfall, NASA POWER, and authorized utility data
  estimate roof harvesting potential, starting from `V = P × A × C` (litres =
  rainfall in mm × roof area in m² × collection coefficient). This is the start
  of a water-balance model, not a yield guarantee.
- **Grenada digital address:** stable location identifiers for delivery, taxis,
  mechanics, and events. Residential details are shared only with authorization.
- **Cost-of-living monitor:** voluntary retailer price feeds tracking a standard
  basket. Sampling, substitution, and retailer confidentiality are the hard parts.
- **Marine activity planner:** marine forecasts, Copernicus, buoys, and
  authorized schedules for fishing, yachting, diving, and ferries. Official
  marine warnings remain the authoritative safety products.

The strongest cross-product bets are Grenada Places, weather intelligence, and
water intelligence.

## Integration rules

- **One layer, many products.** Provider adapters, scheduled ingestion, webhook
  verification, retries, and validation sit behind domain services. Products do
  not call providers directly.
- **Shared code, not shared data.** GAA/GMS operational communications keep
  separate authorization, data, provider credentials, and approval controls
  from Barrels commercial products.
- **Reliable delivery.** Notifications use an outbox, record delivery status,
  retry transient failures, verify provider webhooks, and honour per-channel
  consent and unsubscribe.
- **Warnings stay independent.** CAP publication never depends on an optional
  external channel.
- **Provider registry.** For every external API record its owner, auth method,
  licence, data restrictions, rate limits, cache policy, expected latency,
  fallback, and monthly cost, so vendors stay replaceable.

## Ranked shortlist

| Rank | Option | Value | Effort | Risk |
| --- | --- | --- | --- | --- |
| 1 | Close the existing communication gaps (Signal, MBIA, Resend) | 5 | 2 | 1 |
| 2 | Grenada Places API | 5 | 3 | 2 |
| 3 | Weather Verification API | 5 | 3 | 2 |
| 4 | NASA POWER integration | 4 | 2 | 1 |
| 5 | Open Food Facts integration | 4 | 2 | 3 |
| 6 | Copernicus Marine integration | 4 | 3 | 2 |
| 7 | Economic indicators | 3 | 2 | 2 |

Scores (1–5) are an engineering judgement, not measured cost or delivery
estimates.
