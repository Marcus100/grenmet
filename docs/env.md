# Environment Configuration

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-18

This document is the human-readable reference for supported environment variables
in the Grenmet monorepo: what each variable does, where it is supplied, and which
service reads it. Typed settings modules, Compose files, and deployment workflows
remain the executable source of truth and must be updated together with this guide.

For the current staging/production integration inventory, repeatable metadata audit
and provider setup steps, see [Integration readiness](operations/integration-readiness.md).

---

## Public settings at run time

The web images are the same for staging and production (build once, promote by
digest; see [release runbook](operations/release-runbook.md#build-once-promote-by-digest)),
and eleven public settings are read when the app runs, not when the image is built: `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_RELEASE`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY` (auth app only) and the three cookieless funnel settings
`NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY`, `NEXT_PUBLIC_FUNNEL_ANALYTICS_HOST` and `NEXT_PUBLIC_FUNNEL_ANALYTICS_ENABLED` (see [Funnel analytics](#funnel-analytics-bookings-events-account)).

- **Server code** reads them with `readPublicEnv(key)` from
  `@barrelsgd/ui/lib/public-env` (each app's `env.ts`, `instrumentation*.ts` and
  `sentry.*.config.ts` do). It looks the key up dynamically in the process
  environment, so Next.js cannot inline it. Never write
  `process.env.NEXT_PUBLIC_<name>` for these keys in app code.
- **The browser** gets them from `/runtime-env.js`, served by each app's
  `src/app/runtime-env.js/route.ts` (dynamic, allow-listed keys only, escaped) and
  loaded before hydration by `<PublicEnvScript />` in the root layout. In the
  browser `readPublicEnv` reads that file's values; `onPublicEnv(callback)` waits
  for them (browser Sentry initialisation does).
- **Where the values come from.** `infra/docker/docker-compose.deploy.yml` passes
  them to every web container; `deploy.yml` and `render-env.py` supply the
  Turnstile key from the GitHub environment variable
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Changing a setting needs a redeploy, not a rebuild.
- **Caching.** `/runtime-env.js` may be cached for up to 60 seconds (browser and
  Cloudflare; the CAP app excludes it from the public-page edge cache rule), so a
  change reaches browsers within a minute of the redeploy.
- **Proxies.** An app whose proxy guards every path (admin, bookings, gmsdash,
  gaa-admin) must let `/runtime-env.js` through.
- **Exceptions.** Elections (Cloudflare Pages) is not part of the shared images and keeps
  build-time settings. PostHog keys (`NEXT_PUBLIC_POSTHOG_*`) are still build-time.
  `scripts/guardrails/runtime-env.test.mjs` lists the apps that must serve the
  script and the one exception.
- **Still build-time.** Pages prerendered at build keep the build's site address in
  their `metadataBase` links; the report-only CSP Sentry endpoint in `next.config.ts`
  and source-map upload also use build arguments in `build-web-images.yml`.
- **Check after a deploy.** `/runtime-env.js` on each app shows that environment's
  site, API, environment, Sentry and Turnstile values.

## Funnel analytics (bookings, events, account)

Cookieless PostHog events for the signed-in funnels (`@barrelsgd/ui/lib/funnel-analytics`).
They are sent with `fetch` to `<host>/capture/`, with no cookie, no web storage
and no SDK. Only ids and enums are sent (ADR-0037): organisation slug, service
id, listing id, page name and the step. Names, emails, phone numbers and free
text are never sent.

- `NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY`: the PostHog project key (public, not a
  secret). **Unset means off.** The value must look like a project key.
- `NEXT_PUBLIC_FUNNEL_ANALYTICS_HOST`: `https://us.i.posthog.com` (default) or
  `https://eu.i.posthog.com`. Any other host switches collection off.
- `NEXT_PUBLIC_FUNNEL_ANALYTICS_ENABLED`: the kill switch. `false`, `0`, `off`
  or `no` (any case) turn collection off even when a key is set. Any other value
  leaves it on.
- **Production only, enforced in code.** Collection runs only when
  `NEXT_PUBLIC_ENVIRONMENT=production` and the page is on `barrels.gd` or a
  subdomain of it without a `staging` label. Staging, localhost and preview hosts
  send nothing even with a key set.
- Browsers with Do Not Track (`1` or `yes`) or Global Privacy Control send nothing.
- The three settings are read at run time through `/runtime-env.js` like the
  other public settings. Deployment wiring (passing them to the web containers
  in `infra/docker/docker-compose.deploy.yml` and the GitHub environment) is a
  separate change; until it lands they are unset and nothing is sent.
- GA4 and the consent-gated PostHog provider on public sites are separate and
  unchanged. Set the key only in production. Staging and previews must stay
  without it, as the production-only browser analytics policy requires (see
  `docs/operations/analytics-monitoring.md`).

## Local dev setup (one-time)

Two env files are required by `pnpm start`: one for shared infrastructure
(Postgres, Adminer) and one for FastAPI. App-specific files are needed only when
running those apps locally.

```bash
# 1. Shared infrastructure
cp infra/docker/.env.local.example   infra/docker/.env.local

# 2. FastAPI backend
cp apps/api/fastapi/.env.local.example  apps/api/fastapi/.env.local

# 3. Next.js apps with committed examples (copy only the apps you run)
cp apps/web/auth/.env.local.example         apps/web/auth/.env.local
cp apps/web/gaa-admin/.env.local.example    apps/web/gaa-admin/.env.local
cp apps/web/cms/.env.local.example          apps/web/cms/.env.local
cp apps/web/docs/.env.local.example         apps/web/docs/.env.local
cp apps/web/gms/.env.local.example          apps/web/gms/.env.local
cp apps/web/signal/.env.local.example       apps/web/signal/.env.local
cp apps/web/account/.env.local.example      apps/web/account/.env.local
cp apps/web/admin/.env.local.example        apps/web/admin/.env.local
cp apps/web/gmsdash/.env.local.example      apps/web/gmsdash/.env.local

# 4. Printix scanner PWA (Vite; the API address is baked in at build time)
cp apps/pwa/printix/.env.local.example      apps/pwa/printix/.env.local

# 5. Scrapy collector (optional — only if using the Scrapy pipeline)
cp scripts/scrapy-wxwatch/.env.local.example  scripts/scrapy-wxwatch/.env.local
```

Then fill in real secret values where the examples say `changethis` or leave a
value empty. Values in the examples are placeholders; never commit a populated
copy (every real `.env.local` is git-ignored).

The other web apps (bookings, cap, events, mbia, elections, babydoll, barrels,
commit) have no committed example because every setting has a working local
default; each one's section below lists the optional overrides, for example the
`*_SSO_CLIENT_SECRET` that turns its sign-in on. Empty values in a FastAPI
`.env.local` count as unset (`env_ignore_empty`), so a blank placeholder is safe.

The examples are checked by hand against the code, not by a script: when you add
a setting to a typed env module or a FastAPI `Settings` class, add it to the
matching example and to this guide in the same change.

---

## Env file → service mapping

| Env file | Read by | Docker flag |
|---|---|---|
| `infra/docker/.env.local` | `infra/docker/docker-compose.yml` (Postgres, Adminer, tools) | `--env-file infra/docker/.env.local` |
| `apps/api/fastapi/.env.local` | `apps/api/fastapi/docker-compose.yml` (FastAPI container) | `--env-file apps/api/fastapi/.env.local` |
| `apps/web/<app>/.env.local` | Next.js development server (`pnpm dev`) | N/A |
| `scripts/scrapy-wxwatch/.env.local` | wxwatch crawler and database pipeline | N/A |
| `infra/docker/staging.env` | Staging non-secret deploy configuration | First `--env-file` in deploy workflow |
| `infra/docker/production.env` | Production non-secret deploy configuration | First `--env-file` in deploy workflow |
| Runtime `infra/docker/runtime/.env.local` | Deploy-only secrets and derived database URLs | Second `--env-file`; generated and deleted by CI |

> **Why two Docker files?** The infra compose needs database provisioning variables (`WXWATCH_DB_NAME`, `APP_DB_USER`, `ADMINER_DESIGN`) that don't belong in the FastAPI env. Sharing one file caused infra variables to be sourced from the wrong place.

---

## Variable reference

### Shared infrastructure (`infra/docker/.env.local`)

Read by `infra/docker/docker-compose.yml` only. FastAPI variables do **not** belong here.

Every variable has a default in the Compose file (`changethis` for passwords), so
the file is only needed to change a name or password. The `*_DB_*` triples must
match the database URLs in `apps/api/fastapi/.env.local` (and `DATABASE_URL` in
`apps/web/cms/.env.local` for the CMS).

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` | Root Postgres superuser (the example sets `postgres`; compose default `app`) |
| `POSTGRES_PASSWORD` | Root Postgres password |
| `POSTGRES_DB` | Optional. Database Postgres creates first (compose default `app`) |
| `APP_DB_NAME` | Database name for FastAPI app (must match `POSTGRES_DB` in FastAPI file) |
| `APP_DB_USER` | Database user for FastAPI app (must match `POSTGRES_USER` in FastAPI file) |
| `APP_DB_PASSWORD` | Password for the FastAPI app DB user |
| `WXWATCH_DB_NAME` | Database name for wxwatch app |
| `WXWATCH_DB_USER` | Database user for wxwatch |
| `WXWATCH_DB_PASSWORD` | Password for the wxwatch DB user |
| `WXPRODUCTS_DB_NAME` | Database name for wxproducts app |
| `WXPRODUCTS_DB_USER` | Database user for wxproducts |
| `WXPRODUCTS_DB_PASSWORD` | Password for the wxproducts DB user |
| `JANITORIAL_DB_NAME` | Database name for the janitorial cleaning-spec catalogue |
| `JANITORIAL_DB_USER` | Database user for janitorial |
| `JANITORIAL_DB_PASSWORD` | Password for the janitorial DB user |
| `TRANSPORT_DB_NAME` | Database name for the staff transportation timetable |
| `TRANSPORT_DB_USER` | Database user for transport |
| `TRANSPORT_DB_PASSWORD` | Password for the transport DB user |
| `EREGISTER_DB_NAME` / `EREGISTER_DB_USER` / `EREGISTER_DB_PASSWORD` | Database, user and password for the eRegister manual observation register |
| `CMS_DB_NAME` / `CMS_DB_USER` / `CMS_DB_PASSWORD` | Database, user and password for the Payload CMS (defaults `gms_cms` / `gms_cms` / `changethis`; created by `infra/postgres/init-cms.sh`) |
| `ADMINER_DESIGN` | Adminer UI theme (e.g. `pepa-linha-dark`) |

### FastAPI backend (`apps/api/fastapi/.env.local`)

Weather database migrations run with
`uv run --frozen --package fast-back alembic -c src/wxproducts/alembic.ini upgrade head`
from `apps/api/fastapi`. Set `WXPRODUCTS_DB_NAME` when the database name differs
from `wxproducts` (local/production) or `wxproducts_staging` (staging). The runner
rejects the main application database and mismatched target names. Local prestart
migrates weather when its URL is configured; staging/production require it.
The separate migration configuration is packaged under `src/wxproducts`, so both
the API image and the local source mount contain the same migration assets.


| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | One of `local`, `staging`, `production` |
| `PROJECT_NAME` | Human-readable title shown in API docs |
| `FRONTEND_HOST` | Client origin used in CORS and emails |
| `API_V1_STR` | API version prefix (default: `/api/v1`) |
| `BACKEND_CORS_ORIGINS` | Comma-separated or JSON array of allowed origins. The static Barrels site calls the API from the browser (contact and newsletter forms), so production lists `https://barrels.gd` and `https://www.barrels.gd`, and the Printix scanner (`https://scan.barrels.gd`) is listed too. Staging has no Barrels site origin yet; add one when it exists |
| `SECRET_KEY` | JWT signing secret — generate with `openssl rand -base64 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Legacy bearer-token lifetime in minutes (default: `60`) |
| `SESSION_ACCESS_TOKEN_EXPIRE_MINUTES` | Cookie-session access-token lifetime (default: `15`) |
| `SESSION_EXPIRE_DAYS` | Rotating session lifetime (default: `30`) |
| `BROWSER_SESSION_COOKIE_NAME` | GAA Admin's session cookie, read by the cookie-authenticated routes (default `admin_session`); must match gaa-admin's `ADMIN_SESSION_COOKIE_NAME` |
| `GAA_ADMIN_APP_URL` / `CMS_APP_URL` | Public URLs of the staff apps for single sign-on callbacks (ADR-0017). Defaults `http://localhost:3001` / `http://localhost:3006` |
| `CAP_APP_URL` / `CAP_SSO_CLIENT_SECRET` | CAP warning desk (`apps/web/cap`, pages under `/desk`, registry key `cap`, staff scope: ordinary staff tokens, so `/api/v1/cap/*` permissions apply). Default URL `http://localhost:3010`. Empty secret (the default) keeps the desk's sign-in off; the public alert pages are unaffected. Deployment sets the URL to `https://cap.${BASE_DOMAIN}` and passes the GitHub environment secret `CAP_SSO_CLIENT_SECRET` |
| `HR_APP_URL` / `HR_SSO_CLIENT_SECRET` | Barrels HR (registry key `hr`, staff scope). Default URL `http://localhost:3016`. Set the deployed origin to `https://hr.${BASE_DOMAIN}` and configure the matching secret on the API and HR web server. An empty secret disables handoff and redeem with HTTP 503 |
| `BARRELS_ADMIN_APP_URL` / `BARRELS_ADMIN_SSO_CLIENT_SECRET` | Barrels control plane (`apps/web/admin`, registry key `barrels-admin`, superusers only). Default URL `http://localhost:3012`. Empty secret (the default) leaves the app out of single sign-on; deployment sets the URL to `https://admin.${BASE_DOMAIN}` and passes the GitHub environment secret `BARRELS_ADMIN_SSO_CLIENT_SECRET` (docs/deployment.md, "Admin host move") |
| `GAA_ADMIN_SSO_CLIENT_SECRET` / `CMS_SSO_CLIENT_SECRET` | Secrets the staff apps present to redeem single sign-on codes; at least 32 characters (`openssl rand -base64 32`). Required GitHub environment secrets in staging and production, set to the same value in the matching web app. Empty locally switches single sign-on off for that app |
| `LOGIN_MAX_FAILED_ATTEMPTS` | Failed attempts allowed before lockout (default: `10`) |
| `LOGIN_LOCKOUT_SECONDS` | Account lockout duration (default: `900`) |
| `LOGIN_FAILURE_WINDOW_SECONDS` | Window used to count failed logins (default: `900`) |
| `FIRST_SUPERUSER` | Bootstrap admin email |
| `FIRST_SUPERUSER_PASSWORD` | Bootstrap admin password |
| `POSTGRES_SERVER` | DB host: `grenmet-postgres` in local Compose, `db` in deploy Compose, or `host.docker.internal` from the agent devcontainer |
| `POSTGRES_PORT` | DB port (default: `5432`) |
| `POSTGRES_DB` | FastAPI database name (matches `APP_DB_NAME` in infra file) |
| `POSTGRES_USER` | FastAPI DB user (matches `APP_DB_USER` in infra file) |
| `POSTGRES_PASSWORD` | FastAPI DB password (matches `APP_DB_PASSWORD` in infra file) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Main async connection pool per API or worker process (defaults `5` / `10`). Keep (size + overflow) × processes, plus the five domain engines, under Postgres `max_connections` (default 100). |
| `DB_POOL_TIMEOUT` | Seconds a request waits for a free pooled connection before failing (default `10`) |
| `DB_POOL_RECYCLE` | Seconds before a pooled connection is replaced (default `1800`); pre-ping is always on outside tests |
| `MIGRATION_LOCK_TIMEOUT` | Postgres interval a migration waits for a lock before it fails (default `10s`; `500ms`, `1min` also valid, `0` disables). Set on the main Alembic migration connection as a session setting, so it survives `autocommit_block` commits. Forwarded to `prestart`, `api` and `worker`. An invalid value fails at startup. Covers the main database only, not the Payload CMS migration or the weather, eRegister, janitorial and transport migrations (release runbook, "Migration lock timeouts"). |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT` | Seconds a main-database connection may stay idle inside an open transaction before Postgres ends it (default `300`; `0` disables). Applies only to connections opened by a release that sets it, so a leaked session from an older release is not ended. Forwarded to `prestart`, `api` and `worker`; the separate weather and register engines do not set it. |
| `MIGRATION_LOCK_RETRY_ATTEMPTS` / `MIGRATION_LOCK_RETRY_PAUSE_SECONDS` | Read by `scripts/production/core.sh` on the deploy runner, not by containers. A migration service that fails only with a lock timeout is run again, up to this many attempts (default `3`), pausing this many seconds between attempts (default `30`). The window is about 90 seconds, shorter than the 300-second idle limit, so a leaked idle session may need the manual steps in the release runbook. |
| `WEB_CONCURRENCY` | Uvicorn worker processes for the API container (read by uvicorn; default `1`). Rate limits and request metrics live in Redis, so more workers are safe; each worker opens its own pools. |
| `WXPRODUCTS_DATABASE_URL` | PostgreSQL URL for the separate existing weather-products database; required to serve the public product feed. Use a hostname reachable from FastAPI (`grenmet-postgres` in local Compose, `host.docker.internal` from the devcontainer). The API role needs read/write access to authored products, revisions and their identity sequence; the migration runner needs schema ownership. Weather migrations are owned by FastAPI. Missing configuration returns 503, not an empty feed. |
| `EVENTS_ORDER_HOLD_MINUTES` | How long an unpaid paid-tier order holds its tickets before the `expire_unpaid_event_orders` job cancels it and releases the stock (default `30`). The Stripe rail is test mode only (`PAYMENTS_STRIPE_*`). |
| `EVENTS_REFUND_CUTOFF_HOURS` | Refund policy for an organiser cancelling one paid order with `refund: follow_policy`: refunded when the event starts at least this many hours away, kept inside the window (default `48`). An event the organiser cancels is refunded in full. |
| `EVENTS_APP_URL` | Public URL of the Barrels Events web app (app-scoped sign-in, ADR-0016; also where Stripe Checkout returns an Events buyer, `/me/orders/<order id>`). Default `http://localhost:3009`. |
| `EVENTS_SSO_CLIENT_SECRET` | Secret the Events web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters (`openssl rand -base64 32`). Set the same value for the API and the Events web app (which also needs `AUTH_APP_URL`); deployment reads the GitHub environment secret of this name. Empty disables single sign-on into Events and hides "Continue with your Barrels account". |
| `GMSDASH_APP_URL` | Public URL of the GMS Dashboard web app (app-scoped sign-in). Default `http://localhost:3013`. |
| `GMSDASH_SSO_CLIENT_SECRET` | Secret the GMS Dashboard web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters. Set the same value for the API and `apps/web/gmsdash`. |
| `NEXT_PUBLIC_SITE_URL` (bookings) | `apps/web/bookings` only: its own public address (`docker-compose.deploy.yml` sets `https://bookings.${BASE_DOMAIN}`; read at run time). The booking page's sign-up link tells auth to return a new account to `<this address>/signin?returnTo=/<slug>`; auth accepts it only if that origin is in `AUTH_ALLOWED_RETURN_HOSTS`. Unset (local default): the link is the plain sign-up page with no return target. |
| `BOOKINGS_APP_URL` | Public URL of the Barrels Bookings web app (app-scoped sign-in). Also read by the account app (`web-account`) to link each business on the My bookings page, by the admin console (`web-admin`) to link each business on the listing review page, and by the Babydoll seed for the manage link. Default `http://localhost:3015`. |
| `BOOKINGS_SSO_CLIENT_SECRET` | Secret the Bookings web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters. Empty (the default) keeps sign-in off. Set the same value for the API and `apps/web/bookings`. |
| `ACCOUNT_APP_URL` | Public URL of the Barrels account web app (`account.barrels.gd`, ADR-0057; app-scoped sign-in). Default `http://localhost:3018`. `apps/web/bookings` (server env only) also reads it: the account menu's "Manage your Barrels account" link. |
| `PRINTIX_APP_URL` | Public URL of the Printix scanner and organiser app (`scan.barrels.gd`, ADR-0061; browser-only app with no client secret, sign-in by emailed code). Default `https://scan.barrels.gd`; `docker-compose.deploy.yml` sets `https://scan.${BASE_DOMAIN}` (so `https://scan.staging.barrels.gd` on staging). Its origin must also be on `BACKEND_CORS_ORIGINS`. |
| `ACCOUNT_SSO_CLIENT_SECRET` | Secret the account web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters. Empty (the default) keeps sign-in off. Set the same value for the API and `apps/web/account`. |
| `MODELS_GUIDANCE_ENABLED` | Worker fetch of ECMWF IFS/AIFS and NOAA GFS point guidance (`src/models_guidance`). Default `false`; a run downloads hundreds of MB, so enable deliberately. |
| `MODELS_GUIDANCE_MODELS` / `MODELS_GUIDANCE_POINTS` / `MODELS_GUIDANCE_POLL_MINUTE` / `MODELS_GUIDANCE_HORIZON_HOURS` / `MODELS_GUIDANCE_RETENTION_DAYS` / `MODELS_GUIDANCE_CACHE_DIR` | Optional. Models (`ifs,aifs,gfs`), JSON list of points (key, name, latitude, longitude; default MBIA, Lauriston, Petite Martinique), the minute of each hourly check (default 20), forecast length (default 240 h), stored-run retention (default 7 days) and the parent directory for temporary GRIB files. |
| `EVENTS_GOOGLE_REDIRECT_URI` | Google OAuth redirect for Events sign-in (e.g. `https://events.barrels.gd/auth/google/callback`); Google sign-in for Events is offered only when this and `GOOGLE_CLIENT_ID` are set. |
| `PHONE_OTP_PROVIDER` | `disabled` (default) or `console` (local only, logs codes). Phone/WhatsApp codes stay off until a paid provider is approved. |
| `META_PAGE_ID` | Facebook Page that receives social posts (numbers only, read by the worker). Empty (the default) keeps Facebook posts as dry runs. Live posting also needs the `social-live-posting` feature flag and `META_PAGE_ACCESS_TOKEN`. Owner checklist: `docs/operations/social-live-posting.md`. |
| `META_INSTAGRAM_ACCOUNT_ID` | Instagram business account linked to that Page (numbers only). Empty keeps Instagram posts as dry runs. |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page access token with the publishing permissions (secret; never logged, never put in a URL). Empty (the default) keeps every social post a dry run. |
| `META_GRAPH_API_VERSION` | Meta Graph API version used for every call. Not set by deployment; the code default is `v24.0` (`src/content_distribution/config.py`). Check it against Meta's version list before live posting. |
| `SOCIAL_LINK_HOSTS` | Comma-separated hostnames a social post's link may point to (for example `gms.example.org`; lower case, no scheme or port). Read by the API at intake. **Empty (the default) refuses every social post**, with a 422 that names the host. Set it before the CMS sends posts for social. |
| `SOCIAL_IMAGE_HOSTS` | Comma-separated hostnames a social post's image may come from (the CMS media host). Read by the API at intake. Empty refuses every image, so every post with an image is refused. |
| `RESEND_API_KEY` | Email provider key — takes priority over SMTP when set |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `SMTP_SSL` | Fallback email via SMTP (MailCatcher in local dev) |
| `EMAILS_FROM_EMAIL` | Sender address for outgoing emails |
| `EMAILS_FROM_NAME` | Optional display name for outgoing emails |
| `EMAIL_RENDER_URL` | Optional web-auth render endpoint for React Email templates |
| `EMAIL_RENDER_SECRET` | Optional shared secret sent to the email render endpoint |
| `EMAIL_RESET_TOKEN_EXPIRE_HOURS` | Password reset link lifetime |
| `EMAIL_TEST_USER` | Recipient used by email tests and diagnostics |
| `RESEND_WEBHOOK_SECRET` | Optional Svix signing secret for Resend webhook verification |
| `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS` | Comma-separated domains notification email may go to. Deployment reads the GitHub environment variable of this name; missing/blank staging values default to `barrels.gd`, while missing/blank production values allow all domains. Explicit values must be domain names (no wildcards, URLs or email addresses). Local development must configure its own restriction. |
| `NOTIFICATIONS_WEB_BASE_URL` | Staff portal base URL used for links in notification emails (local default `http://localhost:3001`). Deployment sets `https://gms.${BASE_DOMAIN}` for both API and worker. |
| `NOTIFICATIONS_BATCH_SIZE`, `NOTIFICATIONS_MAX_ATTEMPTS` | Worker email outbox batch size (50) and retry limit (5); also used for the public-flow outbox (subscriptions, contact) |
| `MBIA_CONTACT_RECIPIENT` | Inbox that receives MBIA website contact messages (`site: "mbia"`). Unset: messages are stored and logged only, nothing is emailed. Sent through the worker outbox as transactional mail |
| `BARRELS_CONTACT_RECIPIENT` | Inbox that receives Barrels Grenada website contact messages (`site: "barrels"`). Same behaviour as `MBIA_CONTACT_RECIPIENT`; each site has its own inbox and a message is never sent to another site's inbox |
| `GMS_DATA_REQUEST_RECIPIENT` | Inbox that receives GMS climate data requests (`POST /api/v1/contact/data-requests`). Unset: requests are stored and logged only; the requester's confirmation email is still queued. Transactional mail through the worker outbox |
| `TURNSTILE_ENABLED` | Default `false`. When `true`, contact messages, data requests, subscribe and page feedback require a valid Cloudflare Turnstile token (`turnstile_token`), verified server-side by `src/turnstile.py`: a missing or rejected token is 400 "Verification failed". A Cloudflare outage or timeout (5 s) also fails closed with 400, because every protected form sends email or stores visitor data. Enabled without `TURNSTILE_SECRET_KEY` is 503 and an error log |
| `TURNSTILE_SECRET_KEY` | Turnstile widget secret (free Cloudflare account). Secret: environment secret store only, never a committed file |
| `AUTH_TURNSTILE_SECRET_KEY` | Turnstile secret for the emailed sign-in code start (`POST /api/v1/auth/email-code/start`, issue #959). Separate from `TURNSTILE_ENABLED`, which never turns it on. Unset (default): no check. Set: a missing or rejected `turnstile_token` is 400 "Verification failed" before any account lookup, the same for every address; the rate limits and resend cooldown still apply, and the retired `POST /api/v1/auth/users/signup` (which cannot carry a token) answers the same 400. Per-app sign-in (`/auth/apps/{app}/email-code/start`, Events) is not checked. Pairs with the auth app's `NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY`: set the site key first, then this secret, or every code request is refused |
| `EMAIL_HASH_PEPPER` | Secret key for the HMAC-SHA256 hash of suppressed and unsubscribed email addresses (`src/utils/email_hash.py`). Generate with `openssl rand -base64 32 | tr -d '\n'` and store it without a trailing newline (`gh secret set EMAIL_HASH_PEPPER --env <env> < pepper-file`); the deploy's render-config step rejects a multi-line value. Never reuse `SECRET_KEY`. Unset is allowed only when `ENVIRONMENT=local` (a fixed dev key is used); elsewhere hashing raises `EmailHashPepperMissingError` and the subscribe, suppression and email-dispatch paths fail, so set it in staging and production before this release. Rotating or losing it makes every stored hash unmatchable, so keep a copy with the other backed-up secrets. |
| `CAP_DELIVERY_FAILURE_RECIPIENTS` | Worker. Comma-separated GMS addresses emailed (through the notifications outbox) when a warning delivery job (email, push, webhooks, PDF and so on) has failed on every attempt. One email per failed job and address, deduplicated by job id; it names the warning headline, channel, attempts and error class only. Every recipient must hold an active Barrels account to receive the alert: an address with no account (a shared mailbox, for example) is skipped, and when every recipient is skipped the worker logs an error that Sentry captures (with the count and job id, no address). Empty (default): no email; the worker still logs an error that Sentry captures. |
| `TRUSTED_WEB_SECRET` | Shared secret (at least 32 characters, `openssl rand -base64 32`) that Next.js web hosts send with `X-Visitor-IP` and `X-Visitor-Secret` so rate limits (`src/rate_limit.py`) key on the real visitor, not the web server. Empty or shorter than 32 characters (a startup warning is logged, never the value) ignores both headers and keys on the connecting address, as does a wrong or missing secret, a non-ASCII value, and every `/auth` route, so a spoofed header changes nothing. IPv6 visitors key on their /64; IPv4-mapped IPv6 maps to IPv4. Set the same value for the API, `apps/web/bookings`, `apps/web/events`, `apps/web/gms` and `apps/web/mbia` (mbia: the contact form; gms: the weather site's email and browser alert sign-ups; without it every visitor shares one bucket of 5 email and 10 push sign-ups a minute); a web-side value under 32 characters fails the bookings, Events, gms and mbia env validation (the auth app also reads it, but the API ignores the pair on every `/auth` route, so deployment does not pass it to `web-auth`). The owner sets it on web-gms. Deploys (`render-env.py`, `deploy.yml`, `docker-compose.deploy.yml`) require it for staging and production, at least 32 characters, different from `SECRET_KEY` and every `*_SSO_CLIENT_SECRET`, and pass it to `api`, `web-events`, `web-gms`, `web-mbia` and `web-bookings` only. Events forwards the pair on its server-side API calls (`apps/web/events/src/lib/api.ts`) but never on `/auth/email-code/*`, which the API ignores it on anyway. |
| `VISITOR_IP_PROXY_HOPS` | The API, `apps/web/bookings`, `apps/web/events`, `apps/web/gms` and `apps/web/mbia` (whole number 1 to 5, anything else fails startup; default 1). Number of reverse proxies in front of the server that append to `x-forwarded-for` (1: the right-most entry, as written by a Traefik that does not trust its peer). Behind Cloudflare and a Traefik that trusts it (`trustedIPs`), 2. The visitor is counted from the right; leading entries are visitor-controlled and ignored, and `x-real-ip` is not used. On the API it sets the address that rate limits fall back to (`src/rate_limit.py` `connecting_address`; at 1 that is uvicorn's address, unchanged). Deploys set it from `CLOUDFLARE_PROXY_ENABLED` (`render-env.py`) for `api`, `web-events`, `web-gms`, `web-mbia` and `web-bookings`. Babydoll is a static site with no server and does not read it. The auth app has its own, `AUTH_VISITOR_PROXY_HOPS`. |
| `DEFAULT_RATE_LIMIT_PER_MINUTE` | The API (whole number, default 1000; 0 turns it off). Requests a minute per client address, shared across every route that has no `@limiter.limit` of its own (`src/rate_limit.py` `DefaultRateLimitMiddleware`); 1000 leaves room for a venue where many people share one Wi-Fi address. Never counted: the health and readiness probes, the Stripe, Resend and payment-provider webhooks and the CMS hook (matched by route template), a direct call from our own containers on the compose network (no forwarding header), and a trusted web host's call that names no visitor. Unmatched paths and 405s are counted. Redis down: per-process counting, then allowed (fail open). |
| `DEFAULT_RATE_LIMIT_MODE` | The API (`log`, `enforce` or `off`; default `log`). `log` counts and logs `default rate limit would apply bucket_kind=... route=... suppressed=N` (at most once a minute per route and bucket kind; `N` counts the lines skipped) but never answers 429; `enforce` answers 429; `off` disables it. Read the logs, then switch to `enforce`. |
| `INTERNAL_CALLER_NETWORK` | The API (CIDR, default `172.31.250.0/24`). The compose `grenmet` network; keep it equal to the subnet in `infra/docker/docker-compose.deploy.yml` and uvicorn's `--forwarded-allow-ips`. |
| `FLIGHTS_OPENSKY_ENABLED` | Feature flag, default `false`. When `true` the worker polls OpenSky every 30 minutes and `GET /api/v1/flights/board` serves the Redis-cached rows. Research use only: commercial use needs a written OpenSky licence (owner decision pending). Needs `REDIS_URL` |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Optional OpenSky OAuth2 client credentials (free account). Unset: anonymous access with a very small daily quota. Set in the environment secret store, never in a committed file |
| `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` | Copernicus Marine free account (secrets). Both set enables the worker fetch (every 6 h) and `GET /api/v1/environment/marine`; unset: `available: false`, never sample data |
| `CDSAPI_URL`, `CDSAPI_KEY` | Copernicus Atmosphere Data Store (ADS) personal access token (`CDSAPI_KEY`, secret) and URL (default `https://ads.atmosphere.copernicus.eu/api`). Key set enables the CAMS UV and dust fetch (twice daily) and `GET /api/v1/environment/air`; unset: `available: false`. Accept the CAMS dataset licence on the ADS once |
| `COPERNICUS_WAVE_DATASET_ID`, `COPERNICUS_SST_DATASET_ID`, `CAMS_DATASET_ID`, `ENVIRONMENT_FORECAST_HOURS`, `ENVIRONMENT_STALE_AFTER_HOURS`, `ENVIRONMENT_REQUEST_TIMEOUT_SECONDS` | Optional overrides of the product ids (defaults in `src/environmental/AGENTS.md`), forecast horizon (120 h), stale limit (12 h) and ADS request timeout (600 s) |
| `OPENSKY_API_URL`, `OPENSKY_TOKEN_URL`, `OPENSKY_TIMEOUT_SECONDS` | Override OpenSky endpoints and the request timeout (defaults: public API, public token URL, 20 s) |
| `FLIGHTS_WINDOW_HOURS`, `FLIGHTS_CACHE_TTL_SECONDS` | History window requested from OpenSky (48, its maximum) and Redis cache lifetime (21600) |
| `SUBSCRIPTIONS_SITE_URLS` | JSON object of mailing-list key to public site origin, e.g. `{"signal":"https://signal.barrels.gd","barrels":"https://barrels.gd","gms-alerts":"https://weather.barrels.gd"}` (local default `{"signal":"http://localhost:3004","barrels":"http://localhost:4173","gms-alerts":"http://localhost:3003"}`; the Barrels entry is the static site's local preview origin). Confirm and unsubscribe links redirect only to these origins. Deployed: committed in `infra/docker/staging.env` and `production.env` (`gms-newsletter` also points at the weather site) |
| `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY`, `WEBPUSH_CONTACT` | Browser push for published CAP alerts (GMS Get alerts page). Generate the pair with `python -m src.push.cli generate-vapid` (prints only; never writes a file). `WEBPUSH_CONTACT` is a `mailto:` or `https:` URL sent to push services. Push is off, and `GET /api/v1/push/vapid-public-key` answers `enabled: false`, until all three are set. Also `WEBPUSH_MAX_FAILURES` (default 10): failures before a subscription is dropped |
| `SUBSCRIPTIONS_API_BASE_URL` | Public API origin used in confirmation-email links (falls back to `API_BASE_URL`, then `http://localhost:8000`) |
| `SUBSCRIPTIONS_CONFIRM_TTL_DAYS`, `SUBSCRIPTIONS_RESEND_MINUTES` | Confirmation link lifetime (7) and the window in which a pending address is not mailed again (10) |
| `NEWSLETTER_DIGEST_ENABLED` | Worker: the daily climate newsletter at 07:30 Grenada (ADR-0052, `src/worker/newsletter_digest.py`; default `false`, the job then queues nothing). Deployed: set the GitHub environment **variable** of the same name to `true` (empty or unset is `false`; anything else fails the deploy preflight); the deploy passes it to the `worker` service only. Switch off by setting it to `false` (or deleting it) and redeploying |
| `NEWSLETTER_POSTS_FEED_URL` | JSON feed of CMS posts ticked "Include in newsletter" (unset: the digest has no posts). Deployed: fixed to the CMS's internal `http://web-cms:3006/api/public/newsletter` for the API (test send) and the worker |
| `NEWSLETTER_BATCH_SIZE`, `NEWSLETTER_BATCH_INTERVAL_SECONDS` | Digest pacing: at most this many mails due per interval (50 per 60 seconds); defaults are used in deployment |
| `BILLING_STRIPE_SECRET_KEY` | Stripe secret API key; use an `sk_test_...` key locally |
| `BILLING_STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret; locally use the `whsec_...` value printed by `stripe listen` |
| `BILLING_STRIPE_PRICE_ID` | Recurring Stripe Price used by subscription Checkout Sessions |
| `BILLING_STRIPE_PRICES` | JSON object of app subscription prices (ADR-0065): `{"bookings-monthly:XCD": "price_..."}`. A plan with no entry answers 503 at checkout. Test-mode price ids only until the owner approves live mode |
| `BILLING_STRIPE_LIVE_ENABLED` | Owner switch for live money (ADR-0065, "Going live"). Default `false`: test keys only, live-mode webhook events refused. `true`: live keys only (`sk_live_`), live-mode events only; a test key or test event is refused with 503. Set it only after the live steps in ADR-0065 are done |
| `BILLING_CHECKOUT_SUCCESS_URL` | Stripe-hosted Checkout success redirect; may contain the literal `{CHECKOUT_SESSION_ID}` placeholder |
| `BILLING_CHECKOUT_CANCEL_URL` | Stripe-hosted Checkout cancellation redirect |
| `BILLING_INVOICE_LEGAL_ENTITY_NAME` | **Provisional.** Name printed on invoices and snapshotted onto each invoice when it is issued (default `Barrels Grenada`) |
| `BILLING_INVOICE_DEFAULT_TAX_RATE` | **Provisional.** VAT percent applied to lines that do not set their own rate (default `15`) |
| `BILLING_INVOICE_NUMBER_PREFIX`, `BILLING_INVOICE_NUMBER_PADDING` | **Provisional.** Invoice number is `<prefix>-YYYY-NNNN` (defaults `BG`, 4); the sequence is gapless and restarts each calendar year |
| `BILLING_INVOICE_CURRENCY`, `BILLING_INVOICE_PAYMENT_TERMS_DAYS` | Invoice currency (`XCD`, minor units) and net terms in days (30); owner decision 2026-10-18 |
| `BILLING_INVOICE_REMINDER_GRACE_DAYS` | Days after a reminder's trigger date (7 before due, due date, 7 after) in which a missed worker run may still send it (default 2). Reminders are sent by the 07:00 Grenada worker job, once per invoice and stage |
| `STORAGE_ENDPOINT_URL` | Optional S3-compatible endpoint; storage is disabled when required storage values are absent |
| `STORAGE_REGION` | S3 region label (default: `us-east-1`) |
| `STORAGE_BUCKET` | S3 bucket or DigitalOcean Space name |
| `STORAGE_ACCESS_KEY_ID` | S3 access key |
| `STORAGE_SECRET_ACCESS_KEY` | S3 secret key |
| `STORAGE_PUBLIC_BASE_URL` | Optional public or CDN base URL for stored objects |
| `STORAGE_PRESIGN_EXPIRY_SECONDS` | Presigned URL lifetime (default: `3600`) |
| `REDIS_URL` | Shared Redis URL for login lockout, rate limiting, and background work; optional locally |
| `CAP_JOB_BATCH_SIZE` | CAP worker batch size (default: `20`) |
| `CAP_JOB_MAX_ATTEMPTS` | Maximum CAP job attempts (default: `5`) |
| `CAP_JOB_POLL_SECONDS` | CAP worker polling cadence; must divide 60 (default: `10`) |
| `OUTBOX_STALE_MINUTES` | Worker `check_outbox_backlog`: pending outbox rows overdue this long count as stale (default: `30`) |
| `OUTBOX_DEAD_WINDOW_HOURS` | Worker `check_outbox_backlog`: dead rows counted from this window (default: `24`) |
| `OUTBOX_ALERT_THRESHOLD` | Worker logs `Outbox backlog above threshold` when dead or stale rows exceed this (default: `0`) |
| `SENTRY_CRONS_ENABLED` | Worker: send Sentry Cron check-ins for key jobs (default: `false`; each monitor may be billable). Deployed: set the GitHub environment variable of the same name to `true`; the deploy passes it to the `worker` service only. Check-ins are sent only when the worker's Sentry DSN is also set |
| `CAP_SIGNING_CERT` | Optional CAP XML signing certificate, as PEM content or a path |
| `CAP_SIGNING_KEY` | Optional CAP XML signing key, as PEM content or a path |
| `CAP_SIGNING_KEY_REF` | Human-readable key reference stored with signed snapshots |
| `SENTRY_DSN` | Sentry error tracking DSN (leave empty to disable) |

`STACK_NAME`, `DOMAIN`, `DOCKER_IMAGE_BACKEND`, `TAG`, `COMPOSE_PROJECT_NAME` and the
Traefik trio `EMAIL`, `USERNAME`, `HASHED_PASSWORD` belonged to the retired
prototype compose files and are no longer in the FastAPI example. Nothing in
`apps/api/fastapi` or its local compose reads them. `DOMAIN` and
`EMAIL`/`USERNAME`/`HASHED_PASSWORD` are still deployment inputs: see "Deploy and
GitHub settings" below.

### Further FastAPI settings

Read by the typed settings classes in `apps/api/fastapi/src` and not described in
the table above. All are optional unless stated; empty counts as unset.

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Public API origin (full URL). Sets the OpenAPI server address (default by `ENVIRONMENT`: `http://localhost:8000`, `https://api.staging.barrels.gd` or `https://api.barrels.gd`), CAP attachment links, and the subscription confirm-link fallback after `SUBSCRIPTIONS_API_BASE_URL` |
| `AUTH_FRONTEND_URL` | Auth app origin used in the email-verification and account-activation links the API sends (`/verify-email`, `/activate`; default `http://localhost:3000`). Deployment sets `https://auth.<base domain>` |
| `ALLOW_PUBLIC_SIGNUP` | Default `true`. Feeds the `self_signup` flag of the self-service app registrations (Events); `false` stops those apps offering sign-up |
| `BCRYPT_ROUNDS` | Password hash cost (default 12). Below 12 is refused outside `ENVIRONMENT=local`; tests lower it to 4 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth web client. All three must be set for Google sign-in; deployment supplies the redirect (`https://auth.<domain>/google/callback`) and the two credentials come from GitHub environment secrets |
| `WEATHER_APP_URL`, `WEATHER_SSO_CLIENT_SECRET` | Legacy: the weather site no longer signs in. Defaults `http://localhost:3003` and empty; see the sign-in section above |
| `MBIA_APP_URL`, `SIGNAL_APP_URL`, `DOCS_APP_URL` | Public URLs of those apps for single sign-on callbacks. Defaults `http://localhost:3005`, `3004` and `3002` |
| `AUTH_PRIVILEGED_MFA_MODE`, `AUTH_TOTP_ENCRYPTION_KEYS` | Privileged two-step verification; see "Privileged MFA rollout" |
| `ORG_SECRET_ENCRYPTION_KEYS`, `PAYSLIP_HMAC_KEYS` | Dedicated key sets; see "Organisation secrets" and "Payslip signing keys" |
| `SOCIAL_TOKEN_ENCRYPTION_KEYS` | JSON array of Fernet keys (newest first) for sealing platform tokens at rest (`src/utils/secret_box.py`). Secret. Stays empty until a token is stored that way; malformed keys fail at startup |
| `BOOKINGS_DEPOSIT_HOLD_MINUTES` | How long an unpaid deposit booking holds its slot before the sweeper releases it (default 30) |
| `BOOKINGS_ACCESS_FOLLOWS_SUBSCRIPTION` | Bookings access follows the subscription (ADR-0066 item 6; default `false`). While on, a business whose grant is `trial` or `subscription` and has no trial, no active or past-due subscription and no grace left (7 days) is paused: public booking is refused, nothing is deleted. Off clears every pause. Turn on only when live billing is ready |
| `WXWATCH_DATABASE_URL`, `EREGISTER_DATABASE_URL`, `JANITORIAL_DATABASE_URL`, `TRANSPORT_DATABASE_URL` | PostgreSQL URLs of the other FastAPI-owned databases (with `WXPRODUCTS_DATABASE_URL` above). Local examples use the `grenmet-postgres` host; deployment derives them (`WXWATCH_DB_URL`, `WXPRODUCTS_DB_URL`, `JANITORIAL_DB_URL`, `TRANSPORT_DB_URL`, `EREGISTER_DATABASE_URL`) from the committed names and the GitHub passwords. Missing configuration returns 503 for that domain |
| `EREGISTER_DB_NAME` | Expected eRegister database name for its Alembic guard and the import scripts (default `eregister`) |
| `WXWATCH_INGEST_TOKEN`, `WXWATCH_LOCAL_IMAGES_DIR`, `WXWATCH_LOCAL_ASSET_ROOTS`, `WXWATCH_NHC_ROOT` | Collector ingest secret (32+ characters; also set for the collector), local image directory, JSON map of local asset roots, and the NHC archive root (set by the local `nhc-worker` compose service) |
| `WXWATCH_ALERT_ORGANISATION_ID` | Organisation whose notification settings choose who is told about NHC job failures and quiet image collectors (default `gaa`) |
| `WXWATCH_FEED_STALE_MINUTES` | A weather image collector source is reported stale when its last finished run is older than this (default `180`; a value under `30` is treated as `30`). Raise it, or list the source below, for a collector scheduled less often |
| `WXWATCH_FEED_IGNORED_SOURCES` | Comma-separated collector sources never reported as stale (default empty) |
| `MODELS_GUIDANCE_TIMEOUT_SECONDS`, `MODELS_GUIDANCE_GFS_FILTER_URL`, `MODELS_GUIDANCE_GFS_DATA_URL`, `MODELS_GUIDANCE_GFS_REQUEST_PAUSE_SECONDS` | Model-guidance download tuning (defaults 60 s, the NOMADS 0.25-degree filter and data URLs, 0.5 s pause between GFS requests) |
| `REWARDS_GIFTING_ENABLED` | Stamp gifting hard switch (ADR-0030). Default `false`; refused in `ENVIRONMENT=production` whatever the feature flag says, until an accountant and legal sign off |
| `REWARDS_GIFT_DAILY_CAP_PER_SENDER`, `REWARDS_GIFT_LIFETIME_CAP_PER_RECIPIENT`, `REWARDS_GIFT_REVERSAL_HOURS` | Gifting limits (defaults 3 a day per sender, 10 lifetime per recipient, 24 hours to reverse) |
| `REWARDS_VELOCITY_MAX_EARNS`, `REWARDS_VELOCITY_WINDOW_MINUTES` | Earn-velocity rule: more entries than this (default 10) inside the window (default 60 minutes) flags the account for review; the entries are still recorded |
| `REWARDS_LEADERBOARD_MIN_COHORT`, `REWARDS_LEADERBOARD_MAX_ROWS` | Leaderboard privacy floor (default 10 people) and row cap (default 50) |
| `TELEMETRY_ENABLED` | Default `false`. `true` turns on bounded request and job counters in Redis (no visitor or employee identifiers). Deployed: GitHub environment variable of the same name, passed to the API, worker and nhc-worker |
| `TELEMETRY_WORKER_HEARTBEAT_URL`, `TELEMETRY_ENVIRONMENT`, `TELEMETRY_REDIS_URL` | The worker's Better Stack heartbeat URL (deployment fills it from the `WORKER_HEARTBEAT_URL` secret), the environment label (deployment sets `ENVIRONMENT`) and the counters' Redis (deployment sets `REDIS_URL`; default `redis://localhost:6379/0`) |
| `LOG_FORMAT`, `LOG_LEVEL` | Read from the process environment: `LOG_FORMAT=text` for readable local logs (default `json`); `LOG_LEVEL` (default `INFO`) |
| `SENTRY_RELEASE`, `SENTRY_LOGS_ENABLED` | Release label sent to Sentry (deployment sets the commit SHA) and the switch for forwarding logs (default `true`) |
| `PRESTART_SYNC` | Local compose only: `1` runs `uv sync` at prestart because the source and lockfile are bind-mounted. Never set in staging or production |

### Auth app (`apps/web/auth/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | Public URL of the auth app (e.g. `http://localhost:3000`); used for OAuth callback redirects |
| `AUTH_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`). Server-side only; deployment sets the internal `http://api:8000` for every web service (see below) |
| `AUTH_API_V1_STR` | API version prefix (e.g. `/api/v1`) |
| `AUTH_SESSION_COOKIE_NAME` | Host-only account session cookie (default `auth_session`). Every app keeps its own cookie (ADR-0017); none sets a `Domain` |
| `AUTH_ALLOWED_RETURN_HOSTS` | See section below |
| `TRUSTED_WEB_SECRET` | Optional, 32+ characters, same value as the API's. Sent as `X-Visitor-Secret` so the API can key rate limits on the visitor; the API ignores it on `/auth` routes, so deployment does not pass it to `web-auth` |
| `AUTH_VISITOR_PROXY_HOPS` | Whole number 1 to 5 (default 1): reverse proxies in front of this server that append to `x-forwarded-for`. Read only by the auth app; not passed by deployment |
| `EMAIL_RENDER_SECRET` | Optional shared secret required on FastAPI email-render requests |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingest host |
| `NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY` | Optional Cloudflare Turnstile site key for the emailed-code start step (sign-in and sign-up). Empty: no widget and no token (fine while the API has no `AUTH_TURNSTILE_SECRET_KEY`). Set: "Email me a code" and "Send a new code" wait for the check and send a fresh token each time. The password sign-in is unchanged. The auth app sends a Report-Only Content-Security-Policy that allows Turnstile, so no CSP change is needed |
| `BARRELS_ADMIN_APP_URL` | Optional Barrels staff console URL for the account-page app links and the signed-out "sign in again" link |
| `ADMIN_APP_URL` | Optional GAA Admin (GMS/GAA portal, `gms.*`) URL for the account-page app links and the "Edit in GAA Admin" profile button |
| `MBIA_APP_URL` | Optional airport website URL for the account-page app links |
| `GMS_APP_URL` | Optional GMS weather site URL for the account-page app links |
| `DOCS_APP_URL` | Optional docs site URL for the account-page app links |
| `SIGNAL_APP_URL` | Optional Signal URL for the account-page app links |
| `EVENTS_APP_URL` | Optional Events URL for the account-page app links |

The `*_APP_URL` links fall back to the local ports in `docs/ports.md` in development. In staging and production an unset URL leaves that app listed but not clickable.

### `AUTH_ALLOWED_RETURN_HOSTS` — how it works

After a successful sign-in, the auth app reads a `return_to` query parameter and redirects the user back to the originating app. `getSafeReturnTo()` in `apps/web/auth/src/lib/return-to.ts` validates that the redirect target's origin is in this allowlist. Matching is exact (ADR-0043): the origins of `AUTH_APP_URL` and the `*_APP_URL` settings are always accepted, plus each entry listed here; a leading-dot or wildcard entry such as `.barrels.gd` is ignored. Bare hosts mean `https`; `localhost` entries and the local ports in `ports.md` work outside production only.

**If a host is missing from the allowlist, the redirect silently falls back to `/` with no error.** The user signs in successfully but lands on the auth app home page instead of where they came from.

Local dev value (all apps):

```text
AUTH_ALLOWED_RETURN_HOSTS=localhost:3001,localhost:3002,localhost:3003,localhost:3004
```

Port map: 3001=gaa-admin, 3002=docs, 3003=gms, 3004=signal. See [`ports.md`](./ports.md) for the canonical allocation.

For staging/production, replace with the actual subdomain hosts (no port needed).

**Production** (exact hosts; list every app that sends users back to auth):

```text
AUTH_ALLOWED_RETURN_HOSTS=auth.barrels.gd,account.barrels.gd,admin.barrels.gd,gms.barrels.gd,bookings.barrels.gd,cap.barrels.gd,cms.barrels.gd,events.barrels.gd,docs.barrels.gd,weather.barrels.gd,signal.barrels.gd,mbia.barrels.gd,gmsdash.barrels.gd,babydoll.barrels.gd
```

Staging uses the same labels under `staging.barrels.gd`. The shared Compose file
gives the `web-auth` service the app-URL variables the code honours as they are
(auth, gms, docs, weather, signal, mbia, events) and one exact `https://` entry in
`AUTH_ALLOWED_RETURN_HOSTS` for each other app that signs in through it (admin,
bookings, cap, cms, gmsdash), all built from `${BASE_DOMAIN}`. A leading-dot
entry such as `.${BASE_DOMAIN}` is ignored by the code and reaches no app.
`EXTRA_RETURN_HOSTS`, if set, is appended as it is and must start with a comma.
`scripts/production/auth-return-origins.test.mjs` fails when an app in the API
registry is neither honoured nor named. Babydoll does not sign in through the auth
app, so it is not listed. Current production configuration does not add `.weather.gd`. Production CORS origins are the
frontend hosts listed in `infra/docker/production.env` (`BACKEND_CORS_ORIGINS`);
staging lists the staging equivalents of the apps it serves.

The superseded
weather.gd go-live plan is historical context, not an active allowlist recipe.

### Apps that sign in with a Barrels account

Each app signs in with the Barrels account through auth.barrels.gd (ADR-0017)
and keeps its own host-only session cookie. "Sign in" appears only when the
app's secret is set; the same value must be set for the API. Elections
(Cloudflare Pages) and the weather site (gms) have no sign-in and are not
listed here.

| Site | Registry key | Secret | Cookie (default) |
|---|---|---|---|
| docs | `docs` | `DOCS_SSO_CLIENT_SECRET` | `docs_session` |
| signal | `signal` | `SIGNAL_SSO_CLIENT_SECRET` | `signal_session` |
| mbia | `mbia` | `MBIA_SSO_CLIENT_SECRET` | `mbia_session` |
| gmsdash | `gmsdash` | `GMSDASH_SSO_CLIENT_SECRET` | `gmsdash_session` |
| bookings | `bookings` | `BOOKINGS_SSO_CLIENT_SECRET` | `bookings_session` |
| account | `account` | `ACCOUNT_SSO_CLIENT_SECRET` | `account_session` |
| events | `events` | `EVENTS_SSO_CLIENT_SECRET` | `events_session` |
| cap (desk) | `cap` | `CAP_SSO_CLIENT_SECRET` | `cap_desk_session` |
| admin | `barrels-admin` | `BARRELS_ADMIN_SSO_CLIENT_SECRET` | `barrels_admin_session` |
| gaa-admin | `gaa-admin` | `GAA_ADMIN_SSO_CLIENT_SECRET` | `admin_session` |
| cms | `cms` | `CMS_SSO_CLIENT_SECRET` | `cms_session` |

The weather site (gms) has no sign-in (owner, 1 Nov 2026), so it has no entry in
this table. The web app no longer reads `WEATHER_SHOW_SIGN_IN`,
`WEATHER_SESSION_COOKIE_NAME`, `AUTH_APP_URL`, `AUTH_ALLOWED_RETURN_HOSTS` or
`WEATHER_SSO_CLIENT_SECRET`. The API side remains: `src/auth/config.py` still
reads `WEATHER_APP_URL` and `WEATHER_SSO_CLIENT_SECRET`, `docker-compose.deploy.yml`
passes both (to the API, and the secret also to `web-gms`), and `deploy.yml` and
`render-env.py` still carry the secret. They are harmless while the secret is
empty and can be removed from those owner-merge files together with the API
registry entry.

The units switch is on the home page only (it lives in the home hero card, not
the header), so other pages show the saved choice without a control.

In `infra/docker/docker-compose.deploy.yml` every web service (and the CMS) sets
`AUTH_API_URL: http://api:8000`, never the public `https://api.<domain>`.
Calling the public hostname hairpins through Traefik, which replaces the
forwarded browser address with the web container's, so FastAPI rate limits and
audit logs would key every user on one address.
`scripts/production/internal-api-url.test.mjs` enforces this.

Each also needs `AUTH_API_URL`, `AUTH_API_V1_STR` and `AUTH_APP_URL`. The API
needs `<SITE>_APP_URL` (defaults to the local port) and the matching secret.
Secrets are optional GitHub environment secrets (32+ characters).

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `AUTH_ALLOWED_RETURN_HOSTS` | Safe redirect hosts used by shared auth helpers |
| `CAP_API_URL` | **gms only.** FastAPI base URL for the unauthenticated public CAP endpoints (`/api/cap/*`) that render the current-warnings panel. Separate from `AUTH_API_URL` because these endpoints need no session |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |
| `NEXT_PUBLIC_SITE_URL` | Canonical public address, used as `metadataBase` so share previews get absolute links. Read at run time from the container (`docker-compose.deploy.yml` sets `https://<host>.${BASE_DOMAIN}`); the image build passes an address only for pages prerendered at build. Elections (Cloudflare Pages) sets it in its build. Defaults to the local port. gms, docs, events, elections, signal and mbia read it. |

### gaa-admin (`apps/web/gaa-admin/.env.local`)

gaa-admin hosts the consolidated CAP/HR/wxwatch/wxproducts/eRegister/janitorial/transport/salesbus modules (2026-06), but FastAPI owns their database connections. The web app only needs API and auth settings.

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app (e.g. `http://localhost:3000`) |
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `ADMIN_SESSION_COOKIE_NAME` | Host-only session cookie (default `admin_session`); must match the API's `BROWSER_SESSION_COOKIE_NAME` |
| `GAA_ADMIN_SSO_CLIENT_SECRET` | Same value as the API's; without it `/auth/callback` returns 503 and nobody can sign in |
| `NEXT_PUBLIC_API_URL` | FastAPI public URL for client-side requests |
| `RESEND_API_KEY` | Email sending (server-side only) |
| `CAP_API_URL` | FastAPI base URL for the consolidated CAP module |
| `CAP_DESK_URL` | CAP warning desk URL and cutover destination (default `http://localhost:3010/desk`; `https://cap.${BASE_DOMAIN}/desk` in deployment) |
| `CAP_DESK_CUTOVER` | Server-only switch for GAA Admin. Set to `true` to redirect legacy CAP pages with HTTP 307 and link directly to the desk. Defaults to `false`. Set it back to `false` to restore portal routing |
| `JANITOR_APP_URL` | Optional janitor PWA origin. Area QR labels encode `<origin>/a/<area code>`; unset, they encode the bare code |
| `NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE` | `true` or `false` (code default `false`): whether weather images come from object storage. The Docker image build sets it to `true` (`ARG` in `apps/web/gaa-admin/Dockerfile`), so it is build-time |
| `WXPRODUCTS_ACCESS_TOKEN` | Only `scripts/publish-local-forecasts.mjs`: personal access token of an authorised local author. Not read by the app |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |

**Local production builds.** `next build` validates this env schema, so without `RESEND_API_KEY` a local `turbo run build --filter=@barrelsgd/web-gaa-admin` fails with `Invalid environment variables`. Export a placeholder in the shell for that one build (for example `RESEND_API_KEY=re_placeholder pnpm turbo run build --filter=@barrelsgd/web-gaa-admin`). Do not write it to any `.env*` file. The example file already carries `RESEND_API_KEY=dev-placeholder`.

### admin (`apps/web/admin/.env.local`)

The Barrels control plane. It holds no database credentials and calls FastAPI only.

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app (default `http://localhost:3000`) |
| `AUTH_API_URL` | FastAPI base URL (default `http://localhost:8000`); also the target of the status probes |
| `AUTH_API_V1_STR` | API version prefix (default `/api/v1`) |
| `BARRELS_ADMIN_SESSION_COOKIE_NAME` | Host-only session cookie (default `barrels_admin_session`) |
| `BARRELS_ADMIN_SSO_CLIENT_SECRET` | Same value as the API's; without it `/auth/callback` returns 503 and nobody can sign in |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting; the release label shows on the Overview. No analytics |

### cap (`apps/web/cap`, optional)

The public CAP alert hub plus the staff warning desk under `/desk`. No database. Public pages read the unauthenticated `/api/cap/*` feeds on the server and never read cookies. The desk signs in through auth.barrels.gd (ADR-0017, ADR-0054) and its browser calls go through the allow-listed proxy `/desk/api/...`.

| Variable | Purpose |
|---|---|
| `CAP_API_URL` | FastAPI base URL for the public CAP feeds (default `http://localhost:8000`; `http://api:8000` in deployment) |
| `GMS_SITE_URL` | GMS website, for "official source" and "how to get alerts" links (default `https://weather.barrels.gd`) |
| `AUTH_APP_URL` / `AUTH_API_URL` / `AUTH_API_V1_STR` | Desk only: the auth app (default `http://localhost:3000`), FastAPI (default `http://localhost:8000`) and its prefix (default `/api/v1`) |
| `CAP_SESSION_COOKIE_NAME` | Desk only: host-only session cookie (default `cap_desk_session`) |
| `CAP_SSO_CLIENT_SECRET` | Desk only: same value as the API's; without it desk sign-in says it is switched off and `/auth/callback` returns 503 |
| `NEXT_PUBLIC_SITE_URL` | Canonical address for absolute links (run time; default `http://localhost:3010`) |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional server-side error reporting. No client SDK and no analytics, to keep pages light |

### gmsdash (`apps/web/gmsdash/.env.local`)

GMS Dashboard (model meteograms for entitled organisations). No database; it calls the `/models/*` routes with the person's app-scoped token.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `GMSDASH_SESSION_COOKIE_NAME` | Host-only session cookie (default `gmsdash_session`) |
| `GMSDASH_SSO_CLIENT_SECRET` | Same value as the API's; without it `/auth/callback` returns 503 and nobody can sign in |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting |

### account (`apps/web/account/.env.local`)

Barrels account (ADR-0057): a person's profile and profile photo. Every page needs a Barrels sign-in; the photo is uploaded and read through the same-origin `/api/v1/*` proxy, which exchanges the session cookie for a bearer token. No database; the API is called from the server at `AUTH_API_URL`.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `ACCOUNT_SESSION_COOKIE_NAME` | Host-only session cookie (default `account_session`) |
| `ACCOUNT_SSO_CLIENT_SECRET` | Same value as the API's registration for `account`; without it `/auth/callback` returns 503. Optional in deployment (empty keeps sign-in off). A GitHub environment secret passed by `deploy.yml` and rendered by `render-env.py` |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting |
| `NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY` / `_HOST` / `_ENABLED` | Optional cookieless funnel events, off unless the key is set (see [Funnel analytics](#funnel-analytics-bookings-events-account)) |

### bookings (`apps/web/bookings`, optional)

Barrels Bookings. Only `/studio` needs sign-in; the public booking pages (`/[slug]`) need no sign-in. No database; the Bookings API is called from the server only, at `AUTH_API_URL`.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile key for the booking form. Unset: no widget and no token. Read at run time by the web container |
| `BOOKINGS_SESSION_COOKIE_NAME` | Host-only session cookie (default `bookings_session`) |
| `TRUSTED_WEB_SECRET` / `VISITOR_IP_PROXY_HOPS` | The visitor-address pair for the public booking form (see the FastAPI table) |
| `BOOKINGS_SSO_CLIENT_SECRET` | Same value as the API's registration for `bookings`; without it `/auth/callback` returns 503 and nobody can sign in. Optional in deployment (empty keeps sign-in off) |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting |
| `NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY` / `_HOST` / `_ENABLED` | Optional cookieless funnel events, off unless the key is set (see [Funnel analytics](#funnel-analytics-bookings-events-account)) |

### signal (`apps/web/signal/.env.local`)

Signal has no database; newsletter sign-up is proxied to FastAPI (`/api/v1/subscriptions`). All variables are optional with sensible defaults.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI origin the subscribe route proxies to (default `http://localhost:8000`) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default `http://localhost:3004`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (optional) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `AUTH_API_V1_STR` / `AUTH_APP_URL` | API prefix (default `/api/v1`) and the Barrels sign-in app (default `http://localhost:3000`) |
| `SIGNAL_SESSION_COOKIE_NAME` / `SIGNAL_SSO_CLIENT_SECRET` | Host-only session cookie (default `signal_session`) and the single sign-on secret (same value as the API's; empty keeps "Sign in" off) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile site key for the subscribe form; unset: no widget |

### events (`apps/web/events`, optional)

Barrels Events. No database; the Events API is called from the server at `AUTH_API_URL`. No committed example: every setting has a default.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `EVENTS_SESSION_COOKIE_NAME` | Host-only session cookie (default `events_session`) |
| `EVENTS_SSO_CLIENT_SECRET` | Same value as the API's; 32+ characters; empty keeps sign-in off |
| `TRUSTED_WEB_SECRET` / `VISITOR_IP_PROXY_HOPS` | The visitor-address pair (see the FastAPI table) |
| `NEXT_PUBLIC_SITE_URL` | Canonical address for absolute links (run time; default `http://localhost:3009`) |
| `NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY` / `_HOST` / `_ENABLED` | Optional cookieless funnel events, off unless the key is set (see [Funnel analytics](#funnel-analytics-bookings-events-account)) |

### MBIA (`apps/web/mbia/.env.local`, optional)

MBIA has no required server secrets and no committed env example. Its typed
defaults allow it to run without an env file.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI origin the contact route proxies to (default `http://localhost:8000`). The recipient inbox is FastAPI's `MBIA_CONTACT_RECIPIENT` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default: `http://localhost:3005`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile site key for the contact form. Unset: no widget and no token (fine while FastAPI has `TURNSTILE_ENABLED` off) |
| `AUTH_API_V1_STR` / `AUTH_APP_URL` | API prefix (default `/api/v1`) and the Barrels sign-in app (default `http://localhost:3000`) |
| `MBIA_SESSION_COOKIE_NAME` / `MBIA_SSO_CLIENT_SECRET` | Host-only session cookie (default `mbia_session`) and the single sign-on secret (same value as the API's; empty keeps "Sign in" off) |
| `TRUSTED_WEB_SECRET` / `VISITOR_IP_PROXY_HOPS` | The visitor-address pair for the contact form (see the FastAPI table) |

### Commit web (`apps/web/commit`, Cloudflare Pages)

Read through `src/env.ts` (hand-written, no schema library). The site is static and needs no variables in production.

| Variable | Purpose |
|---|---|
| `COMMIT_SITE_URL` | Public origin for metadata, the sitemap and RSS links (default `https://commit.barrels.gd`; only the origin of the value is kept) |

### Elections web (`apps/web/elections`, Cloudflare Pages)

Static, no sign-in, not part of the shared images. `NEXT_PUBLIC_SITE_URL` is its public address (build time; default `http://localhost:3007`); `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_RELEASE` are optional build-time reporting settings. No committed example.

### Barrels company site (`apps/web/barrels`, Cloudflare Pages, static)

No runtime variables. The Pages build passes the Turnstile site key to `build.mjs` as an argument (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, a Cloudflare Pages build variable), which writes `dist/turnstile-config.mjs`.

### Printix scanner (`apps/pwa/printix`, Vite, Cloudflare Pages)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Origin of the FastAPI service the scanner calls with its pairing secret. Build time: Vite writes `VITE_*` values into the browser bundle, so it is never a secret. `https` only, or `http` on `localhost`/`127.0.0.1` (`apps/pwa/printix/src/env.ts`); anything else, or unset, becomes empty and the scanner shows "not connected". Production build: `VITE_API_URL=https://api.barrels.gd pnpm --filter @barrelsgd/pwa-printix build`. The example file sets the local API |

### Babydoll web (`apps/web/babydoll`, static)

No environment variables. The site is a static export with no server code
(owner, 13 Nov 2026); the booking address is `ONLINE_BOOKING_URL` in
`src/data/site.ts`.

FastAPI: `BOOKINGS_BABYDOLL_SITE_URL` (default `https://babydollbeautybar.com`) is read only by the on-demand Babydoll seed (`src/bookings/seed.py`) for the public site row. The seed builds the booking manage link from `BOOKINGS_APP_URL` (`<app>/<public slug>/booking/{token}`), because the manage page lives in the bookings app.

### Staging demo seed (`apps/api/fastapi/scripts/seed_staging_demo.py`)

An operator opt-in for the staging API container only; it is not in the deploy workflow, `render-env.py` or any compose file, and nothing is stored as a secret.

| Variable | Description |
| --- | --- |
| `DEMO_SEED_ENABLED` | Set to `true` on the command line (`docker compose -p grenmet-staging exec -e DEMO_SEED_ENABLED=true api python scripts/seed_staging_demo.py --apply`) to allow the synthetic Bookings and Events demo data. Anything else, or unset, refuses. The script also refuses unless the API's own `ENVIRONMENT` is `staging`, and the configured database name must end with `_staging`, so production and local runs exit with status 2 before touching the database. Demo bookings are found by their `[demo] <key>` notes; editing those in the studio makes a re-run recreate them (possibly failing on a slot conflict). Never set it in a GitHub environment or a `.env*` file. |

### Scrapy script (`scripts/scrapy-wxwatch/.env.local`)

| Variable | Purpose |
|---|---|
| `WXWATCH_API_URL` | Archive endpoint base; default `http://127.0.0.1:8000/api/v1/wxwatch`; use HTTPS off localhost |
| `WXWATCH_INGEST_TOKEN` | Random secret of at least 32 characters (`openssl rand -hex 32`), also configured in FastAPI |
| `IMAGES_STORE` | Local image directory (default `data/images` under the collector). Ignored when the four object-storage values below are set |
| `STORAGE_ENDPOINT_URL`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Set all four together to store images in an S3-compatible bucket; a partial set is refused. Optional `STORAGE_REGION` (default `us-east-1`), `STORAGE_PREFIX` (default `wxwatch`) and `STORAGE_OBJECT_ACL` (`private` or `public-read`, default `private`) |

Collector `DB_*` variables are retired and no longer in the example. Only FastAPI
uses `WXWATCH_DATABASE_URL`. The stale-feed and alert settings
(`WXWATCH_ALERT_ORGANISATION_ID`, `WXWATCH_FEED_STALE_MINUTES`,
`WXWATCH_FEED_IGNORED_SOURCES`) are FastAPI settings, see the table below.

---

## Staging and production

The active deployment uses three layers:

1. `infra/docker/staging.env` or `infra/docker/production.env` supplies committed,
   non-secret topology such as domains, database names, image coordinates,
   volume names, and router suffixes.
2. `scripts/production/render-env.py` (run by `scripts/production/core.sh` during
   the deploy) writes `runtime/.env.local` on the host from the GitHub
   environment secrets and variables, and derives database URLs and image tags.
3. `infra/docker/docker-compose.deploy.yml` consumes both files; the later
   `runtime/.env.local` wins.

| Layer | Representative variables |
|---|---|
| Committed non-secret configuration | `ENVIRONMENT`, `BASE_DOMAIN`, `DOMAIN`, `ROUTER_SUFFIX`, `EXTRA_RETURN_HOSTS`, database names/users, `REGISTRY`, `IMAGE_NAME`, `GHCR_OWNER`, `PROJECT_NAME`, CORS origins, volume names |
| Required runtime inputs from GitHub environments | `SECRET_KEY`, Postgres and module database passwords, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, `RESEND_API_KEY`, `GAA_ADMIN_SSO_CLIENT_SECRET`, `CMS_SSO_CLIENT_SECRET` |
| Proxy and TLS inputs | `CLOUDFLARE_PROXY_ENABLED` (GitHub environment variable; `true` or `false`, unset is off; [Cloudflare proxy runbook](operations/cloudflare-proxy.md)), `CLOUDFLARE_ORIGIN_SECRET` (GitHub environment secret, required when the switch is on: 32 to 128 letters, digits, `-` or `_`, different from every other deployment secret; the header Cloudflare adds and Traefik's origin gate requires) and the optional `CLOUDFLARE_ORIGIN_SECRET_PREVIOUS` (also accepted during a rotation), `EMAIL`, `USERNAME`, `HASHED_PASSWORD` (Traefik dashboard, SSH tunnel only); staging only: `STAGING_BASIC_AUTH_USERS`, `ADMINER_BASIC_AUTH_USERS` (htpasswd bcrypt lines, validated by `render-env.py`), `STAGING_PROBE_CREDENTIALS` (`user:password` for the deploy smoke and probe) |
| Optional deployment integrations | `SENTRY_DSN` and `STORAGE_*` |
| Derived at deployment time | `TAG`, `WEB_TAG`, `WXWATCH_DB_URL`, `WXPRODUCTS_DB_URL`, `JANITORIAL_DB_URL`, `TRANSPORT_DB_URL`; from `CLOUDFLARE_PROXY_ENABLED`: `VISITOR_IP_PROXY_HOPS` (1 or 2), `TRAEFIK_FORWARDED_HEADERS` (`insecure=false` or `trustedIPs=` the ranges in `infra/cloudflare/ip-ranges.txt`), `TRAEFIK_CLIENT_IP_DEPTH` (0 or 1), `TRAEFIK_ACME_CHALLENGE` (TLS or HTTP challenge), `TRAEFIK_ORIGIN_GATE_RULE` (off: matches nothing; on: Cloudflare ranges without the origin secret header get 403) |

`infra/docker/.env.staging.example` and `.env.prod.example` are retired: they
feed only the retired prototype compose files (`docker-compose.staging.yml` and
`docker-compose.prod.yml`), are not inputs to the active deployment workflow, and
carry a banner saying so. Do not use them as the deployment source of truth.

---

## Build, test and platform switches

These are read by tooling or by the platform, not set per environment in the
example files.

| Variable | Read by | Purpose |
|---|---|---|
| `NODE_ENV` | Next.js, Vitest | `development`, `test` or `production`; set by the toolchain, never by hand. Declared in turbo's `globalEnv` |
| `NEXT_RUNTIME` | Next.js | `nodejs` or `edge`; set by Next.js, read by `instrumentation.ts` and the Sentry configs |
| `CI` | Playwright configs, `next.config.*` | Set by GitHub Actions; turns on CI behaviour (retries, quieter output) |
| `E2E_WEB_SERVER` | `apps/web/{auth,bookings,cap,gaa-admin,gms}/playwright.config.ts` | `start` serves the production build for the "Browser journeys" workflow; the default is `pnpm dev` |
| `SKIP_ENV_VALIDATION` | account, admin, bookings, cap, elections, events, gmsdash and others' `env.ts` | `true` skips the typed env check (Docker builds and unit tests). Never set at run time |
| `SENTRY_PROJECT` | web `next.config.*`, Dockerfile `ARG` | Sentry project name(s) for source-map upload at image build; empty disables the upload |
| `SENTRY_AUTH_TOKEN` | web image build (`secrets:` in `build-web-images.yml`), deploy marker | Environment-scoped token for source-map upload and the post-deploy release marker; build secret, never an `ARG` |
| `NEXT_PUBLIC_RELEASE` | web apps | Release label (commit SHA); the image build and compose set it |
| `NEXT_PUBLIC_ENVIRONMENT` | `readPublicEnv` | Environment label for the browser; one of the eight run-time public settings |
| `PORT` | Next.js, Dockerfiles | Listen port in containers; local `next dev` ports come from each app's `dev` script (docs/ports.md) |
| `CMS_TEST_DATABASE_URL` | `apps/web/cms` tests | Isolated database for the CMS test suite; unset skips those tests |
| `COMMIT_SITE_URL` | `apps/web/commit` | See the Commit section |

## Turbo cache and env vars

Turbo hashes env var **values** (not just names) when deciding whether to use a cached build. Only variables declared in `turbo.json` participate in this hash.

Current `turbo.json` declares only global env values:

```json
"globalEnv": ["NODE_ENV", "NEXT_PUBLIC_*"]
```

Server-side env vars such as `AUTH_API_URL`, `AUTH_APP_URL`,
the per-app session cookie names, `AUTH_ALLOWED_RETURN_HOSTS`,
`RESEND_API_KEY`, and the module-specific database URLs are validated by each
app's typed env module, but they are not currently listed as Turbo task env
inputs. If a build-time server variable starts affecting a Next.js build
artifact, add it to `turbo.json` before relying on cached builds across
environments.

---

## CI/CD (GitHub Actions)

GitHub environment secrets are written only to the host's `runtime/.env.local`
described above. Never commit populated `.env`, `.env.local`, `.env.secrets`, or
`.env.*.local` files.

Committed examples are safe templates. The active `staging.env` and
`production.env` files are also intentionally committed because they contain
reviewable non-secret deployment topology. Secrets belong in GitHub environment
secrets, not in either file.

`.gitignore` entries that must be present in every app:

```text
.env
.env.local
.env.*.local
```

## Storage alignment and CMS

Local migration commands explicitly load `.env.local` and use the same migration runners as deployment. Generic `DB_URL` fallbacks are unsupported. `python3 scripts/production/check-local-env.py` reports missing variable names and ignore coverage without displaying values.

CMS needs `DATABASE_URL` pointing only to its dedicated database and a stable `PAYLOAD_SECRET` of at least 32 characters in `apps/web/cms/.env.local`. `CMS_DB_NAME` defaults to `gms_cms`; deployment passes the environment-specific name. Optional shared-auth settings are `AUTH_API_URL`, `AUTH_APP_URL`, `CMS_URL`, `CMS_DEPARTMENT_ID`, `CMS_SESSION_COOKIE_NAME` (default `cms_session`) and `CMS_SSO_CLIENT_SECRET` (same value as the API's; required to sign in). `CMS_BASELINE_REFERENCE_URL` is only for explicit adoption of a matching existing schema, never routine startup. `GMS_PREVIEW_URL` (optional) is the weather site's preview page (`<weather site>/preview`); setting it turns on the Preview button for drafts. `GMS_SITE_URL` is the weather site's public origin, used for post addresses in the public newsletter route and the social send; without it the newsletter route answers 503 and no social post is sent. The deployment sets it for the CMS to `https://weather.${BASE_DOMAIN}` (the same value the CAP app uses). Setting it turns on that route, which then serves posts ticked "Include in newsletter"; the deployment points the API's and worker's `NEWSLETTER_POSTS_FEED_URL` at it inside the network, and the daily digest goes out only once the GitHub environment variable `NEWSLETTER_DIGEST_ENABLED` is `true`. `CMS_DISTRIBUTION_SECRET` (optional, at least 32 characters) is shared with FastAPI's content-distribution endpoint as `X-CMS-Secret`; without it nothing is sent to social platforms. The deployment passes the same GitHub environment secret to the API and to the CMS, and `render-env.py` refuses a value under 32 characters. Live posting also needs the feature flag `social-live-posting` and the `META_*` settings in the FastAPI table; without them every post stays a dry run.

The online environment additionally supplies `CMS_DB_PASSWORD`, `PAYLOAD_SECRET` and environment-scoped `DO_SPACES_*` backup secrets. Its temporary runtime `.env.local` is owner-readable and excluded from both Git and image build contexts. See [storage and delivery acceptance](operations/storage-delivery.md) for inventory, initialization, Traefik routing and restore requirements.

### CMS uploaded media

`CMS_MEDIA_DIR` selects the server-side upload directory (default `media` locally).
Deployment uses `/app/media` backed by the project-specific `cms-media` Docker
volume. The image creates that directory with the non-root runtime user's
ownership. Local uploads are excluded from the Docker build context.
Include this volume with the CMS database in backup and restore procedures;
a persistent volume alone is not an off-host backup. Existing container-local
uploads need explicit copying into the volume before replacing that container.

### CMS email

CMS uses Payload's official Resend adapter. In `apps/web/cms/.env.local`, configure `RESEND_API_KEY` and `EMAILS_FROM_EMAIL` (an address on your verified Resend domain). `EMAILS_FROM_NAME` defaults to `GMS Content`. Keep the API key private and restart the local CMS after configuring it. With no key, local development and migrations remain usable and Payload reports email as unconfigured. A key without a sender fails configuration validation.

Deployment supplies the existing environment-scoped `RESEND_API_KEY` secret and `EMAILS_FROM_EMAIL` setting to CMS. The adapter sends only when CMS calls its email API; startup and migration do not send test messages. Shared FastAPI sign-in remains responsible for account emails. Mailchimp campaigns are separate and have not been configured by this change.

## Integration separation for local, staging and production

Use app-specific local configuration for host-run development. Inside deployment
containers, localhost refers to that container: CAP uses `http://api:8000`,
GMS authored products use `http://web-gmsadmin:3001`, and email rendering uses
`http://web-auth:3000`. Browser API requests and redirects use public HTTPS
origins under `staging.barrels.gd` or `barrels.gd`. Local host processes use
localhost ports from [the port map](ports.md); agent-container processes use
`host.docker.internal` for host-published database and Redis ports.

| Integration | Local | Staging | Production |
|---|---|---|---|
| CAP / authored products | API :8000 / admin :3001 | Private service origins above | Same private service origins, separate databases |
| Google OAuth | Local callback registered separately | `https://auth.staging.barrels.gd/google/callback` | `https://auth.barrels.gd/google/callback` |
| Sentry | Empty disables reporting; use a development project if enabled | `SENTRY_DSN_STAGING`; project `grenmet-staging` | `SENTRY_DSN_PRODUCTION`; project `grenmet-production` |
| PostHog | Empty project key disables analytics | Separate staging project key and ingest host | Production project key and ingest host |
| Stripe | Test key and local webhook forwarding | Test key, matching test price and endpoint signing secret | Live key, matching live price and endpoint signing secret |
| Resend | Development sender or local SMTP | Environment-scoped key, verified sender, matching webhook secret | Production key, verified sender, matching webhook secret |
| Object storage | Optional local/test configuration | Staging bucket and scoped credentials | Production bucket and scoped credentials |

The renderer rejects partial Google, CAP-signing, Stripe, and storage credential
bundles. Stripe redirects must be HTTPS outside local; its secret key must match
the deployment mode. Provider endpoints must use HTTPS. CAP signing is optional;
configure both certificate and key to enable it. These checks establish valid
configuration, not provider-side connectivity or successful delivery.

`NEXT_PUBLIC_*` variables are public: Next.js compiles most of them into browser
bundles, so configure them in the build's GitHub environment and rebuild the image
after changes. The exception is the eight settings listed in "Public settings at
run time": the container supplies those, and a redeploy is
enough. PostHog keys stay build-time. Never put Stripe secret keys, webhook secrets,
Sentry upload tokens, or storage credentials in public variables.

The September 2026 release audit found Sentry and Resend secret names in both
GitHub environments, but no PostHog, Stripe, Google OAuth, CAP signing, Resend
webhook or email-render credentials. Production also lacked the new CMS and
FastAPI runtime database credentials and core infrastructure variables. Supply
these through GitHub environment settings before claiming those integrations
are connected. There is no APM agent: ddtrace was removed on 2026-10-20.

GMS reads forecasts, observations and published products from FastAPI via
`AUTH_API_URL`; it never calls gaa-admin. Publication authorization is configured through the
superuser-only grade policy API, not environment user-ID allowlists. Defaults
permit active staff in ingested GMS senior technician, assistant manager and
manager grades; each product can override its permitted grade IDs.

GMS's news pages read published editorial content from the CMS via
`CMS_API_URL` (optional; pointed at the `apps/web/cms` deployment's base URL).
With it unset, the editorial homepage sections say their content cannot be
retrieved. The CMS exposes anonymous, published-only feeds at
`/api/public/home`, `/api/public/articles`, `/api/public/questions` and
`/api/public/quizzes` (see `apps/web/cms/AGENTS.md`). The deploy smoke check
reads `/api/public/home`.

### GitHub environment secret names

Add credentials independently to **Settings → Environments → staging / production
→ Secrets**. Missing optional integrations stay disabled; do not copy production
credentials into staging.

- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, optionally `NEXT_PUBLIC_POSTHOG_HOST`. **Not wired today:** `deploy.yml` does not pass either name and `build-web-images.yml` sends no PostHog build argument, so a value stored in GitHub has no effect and deployed web images run with analytics off. Wiring it means adding the build argument (the key is build-time).
- Stripe app subscriptions (ADR-0065): `BILLING_STRIPE_SECRET_KEY`,
  `BILLING_STRIPE_WEBHOOK_SECRET` and `BILLING_STRIPE_PRICES` together (the deploy
  refuses a partial set or a malformed price map). `BILLING_STRIPE_PRICE_ID` and
  the fallback `BILLING_CHECKOUT_SUCCESS_URL` / `_CANCEL_URL` are optional; set
  URLs must be HTTPS.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Single sign-on (ADR-0017): `GAA_ADMIN_SSO_CLIENT_SECRET`, `CMS_SSO_CLIENT_SECRET`,
  `BARRELS_ADMIN_SSO_CLIENT_SECRET` (required); `EVENTS_SSO_CLIENT_SECRET`,
  `CAP_SSO_CLIENT_SECRET`, `DOCS_SSO_CLIENT_SECRET`, `SIGNAL_SSO_CLIENT_SECRET`,
  `MBIA_SSO_CLIENT_SECRET`, `GMSDASH_SSO_CLIENT_SECRET`, `BOOKINGS_SSO_CLIENT_SECRET`,
  `ACCOUNT_SSO_CLIENT_SECRET` (optional; each switches on "Sign in" there).
  Elections and the weather site have no sign-in.
- CAP signing: `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY` (PEM contents).
- Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_RENDER_SECRET`.
- Sentry: `SENTRY_DSN_STAGING` in staging, `SENTRY_DSN_PRODUCTION` in production,
  and environment-scoped `SENTRY_AUTH_TOKEN` for source-map upload.
- Storage: `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`,
  `STORAGE_BUCKET`, `STORAGE_ENDPOINT_URL`, optionally `STORAGE_REGION`
  and `STORAGE_PUBLIC_BASE_URL`.

Every environment reads application storage from `STORAGE_*`. On staging only,
and only until the owner adds the five `STORAGE_*` secrets there, the deploy falls
back to the matching `DO_SPACES_*` secret for each unset name and writes a
deprecation notice (names only) to the deploy summary. Production never falls
back: its `DO_SPACES_*` secrets name the backup store.
Keep the key ID and secret from the same Spaces key, and grant that key access
to the configured bucket. A configured value only proves presence: a worker
`head_bucket` response of HTTP 403 means storage access still needs correction.
After changing staging secrets, deploy again so the API and worker receive the
new values, then verify bucket access and a test object upload/download.
The optional staging weather deploy also reads `DO_SPACES_*` for its off-host
backup. Give that workflow separate backup credentials before enabling it;
the assets-only key cannot satisfy its retention check.

The Stripe price and checkout return URLs (`BILLING_STRIPE_PRICE_ID`,
`BILLING_CHECKOUT_SUCCESS_URL`, `BILLING_CHECKOUT_CANCEL_URL`) accept an
environment secret first, with an environment variable as a compatibility
fallback.


### Observability activation

Use separate staging and production projects for PostHog and Sentry. The browser
Sentry DSN is read at run time (see Public settings at run time). The PostHog key
is still embedded during the web image build: adding it requires rebuilding the
images, not just restarting containers.
PostHog remains disabled without its project key. Its shared provider disables
session recording, autocapture and person profiles and sends only allowlisted
page-section counts; preserve these controls when activating it.

The API image runs plain `uvicorn`; ddtrace and its `DD_*` defaults were removed
on 2026-10-20 because no Datadog Agent was ever provisioned. Adding APM later is a
new dependency and deployment decision.

Sentry preserves exception types and stack locations while redacting payloads,
local variables and log contents. Log-only events retain a generic safe title.
Readiness failures remain reported; do not suppress database or Redis outages to
make the issue feed look healthy. After deploying, verify a controlled test
error arrives in the correct environment and that no traces target localhost.

Google OAuth uses separate web clients (or separately approved callbacks) for
`https://auth.staging.barrels.gd/google/callback` and
`https://auth.barrels.gd/google/callback`. Configure the environment's
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together; the deployment supplies
the callback URL. Client creation, consent-screen/test-user setup, and a real
browser callback/MFA test remain required before declaring Google enabled.

## Complete environment and integration inventory

This document is the canonical inventory of variables currently referenced by
the repository. The same variable can be consumed by more than one service;
configure it once per environment and pass it only to the services that need
it. The names below are grouped by responsibility rather than repeated for
every application.

### Environment-specific responsibilities

| Environment | Required baseline | Optional integrations | Isolation requirements |
|---|---|---|---|
| Local development | Compose database users/passwords, FastAPI settings, shared session settings, local origins, Redis | Local Sentry, PostHog, Google OAuth, Stripe test mode, SMTP/Resend, test storage | Use `.env.local` files only; use test credentials and localhost callbacks |
| Staging | Deployment topology, all database passwords, bootstrap credentials, session settings, Resend, CMS database password, Payload secret | Sentry, PostHog, Google OAuth, Stripe test mode, storage, email rendering, CAP signing | Separate domains, databases, buckets, OAuth callbacks, analytics projects, webhooks, and provider keys |
| Production | Deployment topology, all database passwords, bootstrap credentials, session settings, Resend, CMS database password, Payload secret | Sentry, PostHog, Google OAuth, Stripe live mode, storage, email rendering, CAP signing | Never reuse staging credentials, callback URLs, buckets, analytics projects, or webhook secrets |

The deployment workflow derives `DATABASE_URL`, the module-specific `*_DB_URL`
values, image tags, and container service URLs. They are runtime inputs, but
they should not be manually maintained as independent GitHub secrets.

### Optional and future integrations

The following are potential integrations represented by the code or roadmap,
but they are not all deployment prerequisites:

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
- Google Analytics: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (read by the gms app, which has a build argument for it, but no workflow passes a value, so it is not wired).
- Stripe billing: `BILLING_STRIPE_SECRET_KEY`, `BILLING_STRIPE_WEBHOOK_SECRET` and `BILLING_STRIPE_PRICES` together; the price id and checkout URLs are optional.
- Resend webhooks and email rendering: `RESEND_WEBHOOK_SECRET`,
  `EMAIL_RENDER_SECRET`, `EMAIL_RENDER_URL`.
- CAP XML signing: `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY`,
  `CAP_SIGNING_KEY_REF`.
- CAP MQTT, outbound webhooks, WIS2Box, static maps, and social-image
  publication consumers; these are currently dormant and have no required
  runtime credentials.
- Republic ePay for Events payments; the provider contract, webhook protocol,
  and environment variables have not yet been selected.
- External uptime uses Better Stack (ADR-0037, `scripts/monitoring/betterstack.json`). Alerts go by email and the Better Stack phone app (`docs/operations/analytics-monitoring.md`); no on-call paging service is set up.

Do not invent credentials for dormant or unselected integrations. Add their
variables only when the provider contract, callback/webhook endpoints, staging
test path, and production ownership have been documented.

### Operator-only provider audit credentials

These credentials support the read-only integration checker and are separate
from application runtime configuration:

```text
SENTRY_READ_TOKEN
SENTRY_ORG
SENTRY_PROJECT
POSTHOG_PERSONAL_API_KEY
POSTHOG_PROJECT_ID
GOOGLE_ANALYTICS_ACCESS_TOKEN
GOOGLE_ANALYTICS_PROPERTY_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID
DIGITALOCEAN_ACCESS_TOKEN
RESEND_READ_TOKEN
```

Keep them in the operator's secure environment or secret manager. They are not
required for normal application startup or deployment unless a live provider
audit is explicitly requested.

For read-only Sentry investigation in the agent devcontainer, use the `sentry`
CLI. The container installs it in the persisted `/home/node/.config/sentry`
volume and links it into `PATH` on startup. Run `sentry auth login` once; its
OAuth session persists across devcontainer rebuilds. Check access with
`sentry auth status`, then list staging issues with
`sentry issue list grenmet/grenmet-staging --period 14d --fresh`. This operator
login is separate from the environment-scoped `SENTRY_AUTH_TOKEN` used by web
image builds to upload source maps. Inspect the Sentry upload messages in the
web image build logs and confirm artifact bundles appear in the staging project
after the next build.

### Completeness and verification checklist

For each staging and production variable, record whether it is required or
optional, secret or public, configured, and verified. A configured value is not
proof of connectivity: verify OAuth callbacks, email delivery, storage upload
and download, Stripe webhook signatures, analytics events, and Sentry events
separately. Browser `NEXT_PUBLIC_*` values require a new web image build after
they change, except the run-time settings above.


### WxWatch read migration

Configure `WXWATCH_DATABASE_URL` in the FastAPI environment with access to the separate wxwatch database. In local Docker use the database hostname reachable by the API (`grenmet-postgres`); the devcontainer uses `host.docker.internal`. FastAPI owns migrations and writes as well as reads, so its database role needs schema ownership. Missing configuration returns 503. Neither gaa-admin nor Scrapy needs database credentials for WxWatch. Set `WXWATCH_INGEST_TOKEN` in both API and collector environments; set `WXWATCH_LOCAL_IMAGES_DIR` only for local/shared filesystem storage. Local Compose mounts the collector images read-only automatically. No env files are changed automatically.

### eRegister database

`EREGISTER_DATABASE_URL` is the PostgreSQL URL for the dedicated manual observation register. `EREGISTER_DB_NAME` is the expected database name used by its Alembic guard (default `eregister`). Provision `EREGISTER_DB_USER`, `EREGISTER_DB_PASSWORD` and `EREGISTER_DB_NAME` alongside the other domain databases. The register stores manual SYNOP, METAR and SPECI entries, revisions, QC decisions and WIS2box publication state; it does not replace SURFACE's automated observation store.

### eRegister send actions

`EREGISTER_OBS_RECIPIENTS` is a comma-separated list of addresses that receive "Email observation" (one outbox email each, sent by the worker). Unset: the action answers 409 "No recipients configured". `EREGISTER_SEND_REQUIRE_ACCEPTED` (default `true`) requires QC state `accepted` for email too; set `false` to let email go out for any validated, non-rejected observation (internal use, marked provisional). WIS2 publication always requires `accepted`, whatever this says.

"Send last obs" writes a csv2bufr CSV for wis2box and needs one drop target, read by the API (to validate) and the worker (to transfer):

| Variable | Meaning |
| --- | --- |
| `WIS2BOX_INCOMING_DIR` | Local directory that is (or mounts) the wis2box incoming data; takes precedence over S3 |
| `WIS2BOX_S3_ENDPOINT_URL`, `WIS2BOX_S3_ACCESS_KEY_ID`, `WIS2BOX_S3_SECRET_ACCESS_KEY` | wis2box MinIO endpoint and credentials; the bucket defaults to `WIS2BOX_S3_BUCKET=wis2box-incoming` |
| `WIS2BOX_TOPIC_HIERARCHY` | Object key prefix; must equal the wis2box dataset topic (default `origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop`) |
| `WIS2BOX_WIGOS_ID` | Station WIGOS identifier (default `0-20000-0-78958`); only this station can be published |
| `WIS2BOX_STATION_LATITUDE`, `WIS2BOX_STATION_LONGITUDE`, `WIS2BOX_STATION_HEIGHT_M`, `WIS2BOX_BAROMETER_HEIGHT_M`, `WIS2BOX_THERMOMETER_HEIGHT_M`, `WIS2BOX_ANEMOMETER_HEIGHT_M` | Station metadata for the CSV (MBIA defaults: 12.0042, -61.7862, 12.0 m, 13.7 m, 1.7 m, 10.0 m) |
| `WIS2BOX_MAX_ATTEMPTS` | Transfer attempts before the send is marked failed (default 5, backoff 1 min doubling to 1 h) |

With none of the drop variables set, publish answers 409 "WIS2 publication is not configured". Grant the `eregister.send` permission (role `eregister-sender`) to people allowed to send, and `eregister.qc` (role `eregister-qc`, which also carries `eregister.send`) to the duty or senior forecasters who accept observations.

### Privileged MFA rollout

`AUTH_PRIVILEGED_MFA_MODE` (`disabled` or `enforce`) is unset by default, which
means `enforce` in `staging` and `production` and `disabled` when
`ENVIRONMENT=local` (issue #501, owner decision 2026-10-25). Under `enforce` a
superuser, or holder of a privileged permission, who has not enrolled an
authenticator gets 403 with `Set up two-step verification ... (mfa_enrolment_required)`
on every privileged route; account security and sign-in stay reachable so they can
enrol. Set `disabled` explicitly to opt out (local development, tests, or an
approved emergency rollback). Enforce refuses to start without
`AUTH_TOTP_ENCRYPTION_KEYS`. Complete the
[readiness and recovery gates](operations/privileged-mfa.md) before deploying.

The deployment renderer accepts `AUTH_PRIVILEGED_MFA_MODE` from the selected
GitHub environment's variable (the renderer still writes `disabled` when it is
unset, so set it to `enforce` to switch a deployment on; the API's own default
applies only when the variable is not passed at all) and
`AUTH_TOTP_ENCRYPTION_KEYS` from its secret. Keys are a JSON array of dedicated
Fernet keys, current encryption key first and retained decryption keys after it.
Do not reuse `SECRET_KEY` or share keys across environments. These values reach
API, worker and migration/prestart services, not web applications.

While enforcement is disabled, missing keys leave enrolment unavailable. Enforcement
with missing or malformed keys is rejected before deployment. Provision keys,
convert existing secrets and verify privileged enrolment/recovery readiness while
still disabled before enabling the gate; follow the MFA operator guide. This code
change does not provision secrets or enable enforcement in production.

### Organisation secrets (PF1)

`ORG_SECRET_ENCRYPTION_KEYS` is a JSON array of dedicated Fernet keys: the current key first, then retained decryption keys. Never reuse `AUTH_TOTP_ENCRYPTION_KEYS` or `SECRET_KEY`. It encrypts secrets that organisations store on the platform, starting with a public site's Turnstile secret (`org.public_site`, `src/utils/secret_box.py`).

- **Unset (the default):** saving such a secret returns 503. Sites keep the `inherit` Turnstile mode, which uses the global `TURNSTILE_*` settings.
- **Malformed keys:** the API refuses to start.
- **Deployment:** a GitHub environment **secret** named `ORG_SECRET_ENCRYPTION_KEYS` (`.github/workflows/deploy.yml`), validated by `scripts/production/render-env.py` (a JSON array of 32-byte Fernet keys; empty is allowed; the error never echoes values) and passed to the API, prestart, worker and nhc-worker (never the web apps). Generate a key with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and store `["<key>"]`; to rotate, put the new key first and keep the old one after it until every stored secret has been re-saved. **Losing the keys makes stored organisation secrets unreadable** (Turnstile then falls back to the global setting), so keep a copy in the password manager.

`MBIA_CONTACT_RECIPIENT`, `BARRELS_CONTACT_RECIPIENT` and `SUBSCRIPTIONS_SITE_URLS` are now fallbacks for the same values on the public site rows. Remove them once every environment sets `contact_recipient` and `site_url` through `PATCH /api/v1/organisations/admin/sites/{site_id}`.

### Payslip signing keys (payroll slice 4)

`PAYSLIP_HMAC_KEYS` is a comma-separated list of `keyid:secret` pairs, the current key first (for example `k2:<secret>,k1:<secret>`). A key id is letters, digits, `_` or `-` (up to 32); a secret is at least 32 characters with no spaces. It signs each payslip's snapshot (HMAC-SHA256) and the key id is stored on the payslip row, never the secret. It is a dedicated setting: never derive it from, or reuse, `SECRET_KEY`, `AUTH_TOTP_ENCRYPTION_KEYS` or `ORG_SECRET_ENCRYPTION_KEYS`.

- **Unset (the default):** issuing payslips (approving a pay period for issue) is refused with a 409 that names the setting. Nothing is written.
- **Malformed:** the API refuses to start (a short secret, a repeated key id, a missing `:`); the error never contains a secret.
- **Generate a secret:** `openssl rand -hex 32` (64 characters, no spaces). Keep it in the deployment's secret store, never in a file in the repository, a log or a ticket.
- **Rotation:** (1) add the new key at the front (`k2:...,k1:...`) and deploy; new payslips are signed with `k2`, and payslips already issued still verify with `k1`. (2) Keep `k1` for as long as its payslips may be opened, exported or audited. (3) Remove a key only when nothing signed with it needs checking: a payslip whose key id is not configured returns a 409 that names the missing key id (not its secret) on its PDF and on the bank and GL files.
- **Deployment wiring:** `deploy.yml` passes the GitHub environment secret `PAYSLIP_HMAC_KEYS`, `render-env.py` validates it (see the deploy table below) and `docker-compose.deploy.yml` hands it to the API service. Unset renders empty, so payslip issue stays refused.

### Payments (PF4, test mode only)

The payments core (`src/payments`, ADR-0027) is built, and its Stripe adapter runs in **test mode only**. They are wired into the deployment (`deploy.yml` → `render-env.py` → the API and worker in `docker-compose.deploy.yml`), but leave them **unset** in staging and production until the owner approves a payment rail. `render-env.py` refuses a `PAYMENTS_STRIPE_SECRET_KEY` that does not start with `sk_test_`, so a live key cannot be deployed by accident. It also refuses a half-set Stripe configuration: `PAYMENTS_STRIPE_SECRET_KEY`, `_WEBHOOK_SECRET`, `_SUCCESS_URL` and `_CANCEL_URL` are set together or not at all, and both URLs must be `https://`.

| Variable | Purpose |
| --- | --- |
| `PAYMENTS_STRIPE_SECRET_KEY` | Stripe test secret. A key that does not start with `sk_test_` is refused at use, so a live key cannot enable a live rail. Unset: the Stripe adapter is disabled (the `manual` provider still works). |
| `PAYMENTS_STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/v1/payments/public/webhooks/stripe` (503 when unset). |
| `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` | Fallback return pages (HTTPS) for a purchase type with no registered address; Checkout answers 503 until both are set. A purchase type can register its own address (`src/payments/return_urls.py`): Events returns the buyer to `{EVENTS_APP_URL}/me/orders/<order id>?payment=success\|cancelled`. Bookings returns the customer to `{BOOKINGS_APP_URL}/checkout/return?booking=<id>&result=paid\|cancelled`, which forwards to the manage page. Return addresses come from settings, never from a request. Outside `ENVIRONMENT=local`, an `http` or localhost address (registered or global) is refused. |
| `PAYMENTS_STRIPE_API_BASE` | Defaults to `https://api.stripe.com`; override only in tests. |
| `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` | How old a signed webhook may be (default 300). |
| `PAYMENTS_REQUEST_TIMEOUT_SECONDS` | Provider request timeout (default 10). |
| `PAYMENTS_REFUND_RECONCILE_WINDOW_DAYS`, `PAYMENTS_REFUND_RECONCILE_BATCH` | The daily refund reconciliation job checks captured provider payments created in the last this-many days (default 180), at most this many per run (default 200). |
| `PAYMENTS_REFUND_RECONCILE_BUDGET_SECONDS`, `PAYMENTS_REFUND_RECONCILE_PAGE_MARGIN_SECONDS` | The run stops cleanly after this long (default 240, under the worker's 300-second job limit); a payment's listing stops paging once less than the margin (default 20) of the budget is left. |
| `PAYMENTS_STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the Stripe Connect webhook endpoint (`POST /api/v1/payments/public/webhooks/stripe-connect`, events from connected accounts). Separate from `PAYMENTS_STRIPE_WEBHOOK_SECRET`; 503 when unset. Test mode only (`whsec_`). |
| `PAYMENTS_CONNECT_RETURN_URL` | HTTPS page a business returns to after Stripe onboarding, and where Stripe sends it when a link has expired. Onboarding answers 503 until it is set. |
| `PAYMENTS_CONNECT_PLATFORM_FEE_CAP_BPS` | The most Barrels may take on a New Zealand business's card payments, in basis points (default `0`: no fee can be set until the owner sets a cap). |
| `PAYMENTS_CONNECT_REFUND_APPLICATION_FEE` | Whether a refund on a connected charge also refunds Barrels' platform fee (default `false`: the fee is kept). |

## Deploy and GitHub settings

Every name that `deploy.yml`, `render-env.py`, `docker-compose.deploy.yml`, the
delivery scripts (`scripts/production`, `scripts/monitoring`) or the backup
workflows read. `deploy.yml` hands the GitHub values to `core.sh`, which runs
`render-env.py` to validate them and write the temporary runtime file; unset
optional values fall back to each setting's default. The expected names per
GitHub environment are checked daily against
`scripts/ci/environment-settings.json` ([environment settings check](operations/environment-settings.md)).

Where a setting lives:

- **Secret** or **variable**: a GitHub **environment** secret or variable of
  `staging` or `production`. The backup workflows also use the
  `production-backup` and `staging-backup` environments.
- **Committed**: a line in `infra/docker/staging.env` or `production.env`.
- **Compose**: set in `docker-compose.deploy.yml` from other values, or a
  default there.
- **Repository**: a repository-level secret, the same for every environment.

### Core topology, rollout and backup gate

| Name | Where | What it does | Required / default | Environments |
|---|---|---|---|---|
| `CORE_POSTGRES_IMAGE` | variable | The core database image, pinned by digest: `postgres:17` or `18`, or `postgis/postgis:17-3.5` or `18-3.7`, each `@sha256:<64 hex>`. `render-env.py` rejects anything else | Required | staging, production |
| `CORE_REDIS_IMAGE` | variable | Redis image, `redis:7-alpine@sha256:<64 hex>` | Required | staging, production |
| `CORE_PRIVATE_IP` | variable | RFC1918 address of the core host; Postgres publishes port 5432 on it only (`docker-compose.deploy.yml`) | Required | staging, production |
| `CORE_PGDATA_VOLUME` | variable | Docker volume of the database data. Unset keeps `PGDATA_VOLUME` from the committed file. A volume named `...pgdata18` holds PostgreSQL 18, any other name 17; it must match the image major. Set it only together with an 18 image ([PostgreSQL 18 upgrade](operations/postgres-18-upgrade.md)); never export `PGDATA_VOLUME` itself | Optional | set at each environment's upgrade |
| `POSTGIS_RESTORE_VERIFIED` | variable | `true` records that a PostGIS image was restored into an isolated database first; a `postgis/` image is refused without it | Required with a PostGIS image | staging, production |
| `ROLLING_DEPLOY` | variable | `1` or `true` replaces routed services without a gap; `0`, `false` or unset keeps the previous behaviour; anything else fails the deploy | Optional, default off | tried on staging first |
| `ROLLOUT_PARALLEL` | variable | Routed services roll out in batches of this size, 1 to 99 (1 is one at a time) | Optional; default 4 on staging, 2 on production | staging, production |
| `PULL_PARALLEL` | variable | Image pulls at a time, 1 to 99 | Optional, default 4 | staging, production |
| `DEPLOY_BACKUP_GATE` | variable | Pre-migration backup check: `off`, `warn` or `enforce`. Only `enforce` blocks a deploy whose newest backup is too old; anything else falls back to `warn` | Optional, default `warn` | staging, production |
| `DEPLOY_BACKUP_MAX_AGE_HOURS` | variable | Age after which the newest backup counts as too old | Optional, default 26 | staging, production |
| `DO_SPACES_READ_ACCESS_KEY_ID`, `DO_SPACES_READ_SECRET_ACCESS_KEY` | secrets | List-only key for the backup bucket: the backup gate (passed as `BACKUP_GATE_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`), the restore drill and the major-upgrade workflow. Never the write key | Needed when the gate is not `off` | staging, production |
| `ALLOW_UNPROMOTED_DEPLOY`, `DEPLOY_BACKUP_GATE_OVERRIDE`, `DEPLOY_IMAGE_DIGESTS` | workflow inputs | Not settings: `deploy.yml` sets them from its manual inputs (a manual redeploy without a digest list; a recorded reason to continue past an enforced gate; the digests the promotion verified) | n/a | n/a |
| `GITHUB_TOKEN` | repository (automatic) | Supplied by GitHub Actions to every run; `deploy.yml` passes it to `core.sh` as `GHCR_TOKEN` to pull images. Never stored as a secret | Automatic | all |

### Monitoring, telemetry and release markers

| Name | Where | What it does | Required / default | Environments |
|---|---|---|---|---|
| `MONITORING_DEPLOY_ENABLED` | variable | `true` installs the declared probes after the application is accepted (`scripts/monitoring/install.sh`, needs administrator rights on the runner). Anything else skips the step | Optional, default off | staging, production (see [launch inputs](operations/launch-monitoring-inputs.md)) |
| `PROBE_HEARTBEAT_URL` | secret | Better Stack heartbeat the probe timer pings; must match `https://(incidents\|uptime).betterstack.com/api/v1/heartbeat/<id>` | Required when monitoring is installed | staging, production |
| `PROBE_INCIDENTS_ENABLED` | variable | `true` lets the probe open and close incidents through Better Stack (needs `BETTERSTACK_API_TOKEN`) | Optional, default `false` | staging, production |
| `PROBE_MAINTENANCE` | variable | JSON of maintenance windows the probe respects; empty is none | Optional | staging, production |
| `BETTERSTACK_API_TOKEN` | secret | Better Stack API token for incidents and the provider sync (`monitoring-provider.yml`) | Required when `PROBE_INCIDENTS_ENABLED` is `true` | staging, production |
| `STAGING_PROBE_CREDENTIALS` | secret | `user:password` of one `STAGING_BASIC_AUTH_USERS` entry, so the smoke check and probes pass the staging gate | Staging only; never exported on production | staging |
| `WORKER_HEARTBEAT_URL` | secret | Better Stack heartbeat the worker pings; deployment passes it to the API container's `TELEMETRY_WORKER_HEARTBEAT_URL` after checking it is a Better Stack heartbeat address | Optional | staging, production |
| `BACKUP_HEARTBEAT_URL` | secret | Heartbeat pinged by a verified core backup (`backup-database.yml`) and required by `monitoring-maintenance.yml`. Read from the `production-backup`, `staging-backup` and `production` environments, not by `deploy.yml` | Required for scheduled backups and maintenance | those environments |
| `TELEMETRY_ENABLED` | variable | `true` or `false` (anything else fails the deploy); turns on the Redis request and job counters in the API, worker and nhc-worker | Optional, default `false` | staging, production |
| `SENTRY_CRONS_ENABLED` | variable | `true` makes the worker send Sentry Cron check-ins (default `false`; each monitor may be billable) | Optional | staging, production |
| `SENTRY_ORG` | variable | Sentry organisation slug for the post-deploy release marker | Optional, default `grenmet` | staging, production |
| `SENTRY_AUTH_TOKEN` | secret | Source-map upload at image build and the post-deploy release marker; the marker step is skipped without it | Optional | staging, production |
| `SENTRY_DSN_STAGING`, `SENTRY_DSN_PRODUCTION` | secrets | The environment's DSN. `render-env.py` routes it to each service as `SENTRY_DSN_<APP>` (API, worker and each web app) using `packages/ui/src/lib/service-catalogue.json`; `SENTRY_DSN` is the single-DSN form | Optional | one per environment |
| `WEATHER_STAGING_ENABLED`, `WEATHER_PRODUCTION_ENABLED` | variables | Must be unset or `false`: the core release scope refuses any other value (`scripts/ci/check-release-scope.mjs`); the weather pipelines read them too | Optional, default off | staging, production |

### Always-required secrets and the committed file

`render-env.py` refuses to render without these GitHub secrets: `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `FASTAPI_DB_PASSWORD`, `SECRET_KEY`, `FIRST_SUPERUSER`,
`FIRST_SUPERUSER_PASSWORD`, `RESEND_API_KEY`, `EMAIL`, `USERNAME`,
`HASHED_PASSWORD`, `PAYLOAD_SECRET` (32+ characters), `TRUSTED_WEB_SECRET`
(32+ characters) and `<DOMAIN>_DB_PASSWORD` for `WXWATCH`, `WXPRODUCTS`,
`EREGISTER`, `TRANSPORT`, `JANITORIAL` and `CMS`. `FASTAPI_DB_PASSWORD` is the
password of the least-privilege `FASTAPI_DB_USER` login (committed, `app_runtime`)
that the API and worker use; `POSTGRES_USER` stays the migration and admin role.
`EMAIL` is the Let's Encrypt contact and `USERNAME`/`HASHED_PASSWORD` the Traefik
dashboard login (SSH tunnel only; `htpasswd -nbB`).

The committed files `staging.env` and `production.env` carry the non-secret
settings. `TAG` and `WEB_TAG` are not in them: the workflow computes both
(`<environment>-sha-<commit>`) and writes them to the runtime file.

| Name | Purpose |
|---|---|
| `ENVIRONMENT`, `BASE_DOMAIN`, `DOMAIN`, `ROUTER_SUFFIX` | Environment label, base domain (`barrels.gd`, `staging.barrels.gd`), API host (`api.<base>`) and the Traefik router-name suffix (empty on production) |
| `POSTGRES_DB`, `POSTGRES_SERVER`, `POSTGRES_PORT`, `*_DB_NAME`, `*_DB_USER` | Main database name and per-domain database names and users (`WXWATCH`, `WXPRODUCTS`, `EREGISTER`, `JANITORIAL`, `TRANSPORT`, `CMS`). Passwords are GitHub secrets |
| `FASTAPI_DB_USER` | Dedicated runtime role (`app_runtime`); render refuses an administrator name |
| `DB_HEALTH_START_PERIOD` | Database health-check grace period (60s staging, 30s production) |
| `REGISTRY`, `IMAGE_NAME`, `GHCR_OWNER` | Image coordinates (`ghcr.io`, `marcus100/grenmet`) |
| `PROJECT_NAME`, `EMAILS_FROM_EMAIL`, `FRONTEND_HOST`, `REDIS_URL`, `BACKEND_CORS_ORIGINS` | API settings (see the FastAPI table). `BACKEND_CORS_ORIGINS` lists the browser origins allowed to call the API |
| `PGDATA_VOLUME`, `REDIS_VOLUME`, `CERTS_VOLUME` | Docker volume names; must match what already exists on the host. `CORE_PGDATA_VOLUME` overrides the first |
| `CMS_DB_USER`, `CMS_DB_NAME` | The CMS role and database |
| `SUBSCRIPTIONS_SITE_URLS` | Mailing-list redirect origins (JSON, single-quoted) |
| `COMPOSE_PROFILES`, `STAGING_WEB_MIDDLEWARES`, `STAGING_API_MIDDLEWARES` | Staging only: enable the Adminer profile and add basic-auth and noindex middlewares to the edge chains (production leaves them unset) |
| `EXTRA_RETURN_HOSTS` | Optional; appended as it is to the auth return-host allowlist, so it must start with a comma |
| `API_EXTRA_HOSTS_RULE` | Optional extra Traefik host rule appended to the API router |
| `WEB_CONCURRENCY`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, `DB_POOL_RECYCLE`, `DB_IDLE_IN_TRANSACTION_TIMEOUT`, `MIGRATION_LOCK_TIMEOUT` | Optional tuning the compose file passes to the API, worker and prestart (defaults in the FastAPI table) |
| `EMAILS_FROM_NAME` | Optional CMS sender name (compose default `GMS Content`) |

### Integration inputs

`deploy.yml` passes these to the services shown. Optional integrations stay off
when the value is empty.

| Setting | Kind | Goes to |
|---|---|---|
| `MBIA_CONTACT_RECIPIENT`, `BARRELS_CONTACT_RECIPIENT`, `GMS_DATA_REQUEST_RECIPIENT`, `EREGISTER_OBS_RECIPIENTS` | variables | API and worker |
| `NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS` | variable | API and worker; required on staging (blank defaults to `barrels.gd`) |
| `EREGISTER_SEND_REQUIRE_ACCEPTED`, `WIS2BOX_S3_ENDPOINT_URL`, `WIS2BOX_S3_BUCKET`, `WIS2BOX_TOPIC_HIERARCHY`, `FLIGHTS_OPENSKY_ENABLED` | variables | API and worker |
| `WIS2BOX_S3_ACCESS_KEY_ID`, `WIS2BOX_S3_SECRET_ACCESS_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD`, `CDSAPI_KEY` | secrets | API and worker |
| `CDSAPI_URL` | variable (optional) | API and worker |
| `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_CONTACT` | variables | API and worker |
| `WEBPUSH_VAPID_PRIVATE_KEY` | secret | API and worker |
| `NEWSLETTER_DIGEST_ENABLED` | variable (`true`/`false`, empty is `false`) | worker only |
| `ORG_SECRET_ENCRYPTION_KEYS` | secret | API, prestart, worker and nhc-worker |
| `PAYMENTS_STRIPE_SECRET_KEY`, `PAYMENTS_STRIPE_WEBHOOK_SECRET` | secrets | API and worker |
| `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` | variables | API and worker |
| `BILLING_STRIPE_SECRET_KEY`, `BILLING_STRIPE_WEBHOOK_SECRET` | secrets | API |
| `BILLING_STRIPE_PRICES`, `BILLING_STRIPE_PRICE_ID`, `BILLING_CHECKOUT_SUCCESS_URL`, `BILLING_CHECKOUT_CANCEL_URL` | secret first, then variable | API |
| `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID` | variables | worker only |
| `META_PAGE_ACCESS_TOKEN` | secret | worker only |
| `SOCIAL_LINK_HOSTS`, `SOCIAL_IMAGE_HOSTS` | variables | API only |
| `CMS_DISTRIBUTION_SECRET` | secret | API and the CMS (migration and runtime service) |
| `PAYSLIP_HMAC_KEYS` | secret | API only. Optional `keyid:secret` pairs (comma separated, current first), secrets of 32 or more letters, digits or `. _ ~ + / = -`; unset renders empty and the API then refuses to issue payslips. Never echoed by the deploy preflight. See the payslip signing keys section |
| `TURNSTILE_ENABLED` | variable (`true` or `false`) | API only. See the FastAPI table |
| `TURNSTILE_SECRET_KEY`, `AUTH_TURNSTILE_SECRET_KEY` | secrets (the second optional) | API only |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | variable; public by design | Every web container, read at run time (see "Public settings at run time"). A redeploy, not a rebuild, changes it |
| `NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY` | variable (optional); public | `web-auth` only, read at run time. Its Cloudflare widget must list the auth host (`auth.barrels.gd` and the staging auth host). Set the site key first, then `AUTH_TURNSTILE_SECRET_KEY`, or every code request is refused |
| `EMAIL_HASH_PEPPER` | secret | API, worker and prestart. Required in staging and production (see the FastAPI table). Must be a single line |
| `EMAIL_RENDER_SECRET` | secret | API, worker and `web-auth`; setting it also sets the API's `EMAIL_RENDER_URL` to `http://web-auth:3000` |
| `RESEND_WEBHOOK_SECRET` | secret | API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | API; set together |
| `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY` | secrets (PEM contents) | API and worker; set together |
| `CAP_SIGNING_KEY_REF` | variable | API and worker (default `cap-signing-key`) |
| `STORAGE_*` (`ENDPOINT_URL`, `REGION`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `PUBLIC_BASE_URL`) | secrets | API, worker and nhc-worker, in every environment. Staging alone falls back to `DO_SPACES_*` (all but `STORAGE_PUBLIC_BASE_URL`) with a deprecation notice until its `STORAGE_*` are set; the renderer rejects a partial bundle |
| `DO_SPACES_ACCESS_KEY_ID`, `DO_SPACES_SECRET_ACCESS_KEY`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION` | secrets | The backup store for the backup, restore, monitoring and weather workflows and the deploy backup gate; on staging also the temporary storage fallback (above). The write key is separate from the read-only `DO_SPACES_READ_*` pair |
| `WXWATCH_INGEST_TOKEN` | secret | API; the collector uses the same value |
| `MONITORING_PROBE_TOKEN` | secret | API. Bearer secret (32+ characters, `openssl rand -hex 32`) for `GET /api/v1/monitoring/admin/freshness/probe`, sent by Better Stack as an `Authorization: Bearer` request header. Unset or shorter than 32 characters, the route answers 404. Rotate by setting a new value and redeploying the API |
| `AUTH_PRIVILEGED_MFA_MODE`, `AUTH_TOTP_ENCRYPTION_KEYS` | variable, secret | API, worker and prestart. See "Privileged MFA rollout" |
| `*_SSO_CLIENT_SECRET` (`GAA_ADMIN`, `CMS`, `EVENTS`, `BARRELS_ADMIN`, `CAP`, `MBIA`, `SIGNAL`, `DOCS`, `GMSDASH`, `BOOKINGS`, `ACCOUNT`, `WEATHER`) | secrets | The API and the matching web app. Each 32 or more characters, different per app and different from `TRUSTED_WEB_SECRET` and `SECRET_KEY` |
| `TRUSTED_WEB_SECRET` | secret | API, `web-events`, `web-gms`, `web-mbia`, `web-bookings`; at least 32 characters |
| `CLOUDFLARE_PROXY_ENABLED`, `CLOUDFLARE_ORIGIN_SECRET`, `CLOUDFLARE_ORIGIN_SECRET_PREVIOUS` | variable, secrets | Edge: see "Staging and production" and [Cloudflare proxy](operations/cloudflare-proxy.md) |
| `STAGING_BASIC_AUTH_USERS`, `ADMINER_BASIC_AUTH_USERS` | secrets, staging only | Traefik basic-auth lists (htpasswd bcrypt lines, validated by `render-env.py`) |

### Set by the workflow or derived (never set by hand)

| Name | Set by | Purpose |
|---|---|---|
| `DEPLOY_ENV`, `COMPOSE_PROJECT` | `deploy.yml` | The environment (`staging` or `production`) and the Compose project (`grenmet-staging` or `grenmet`) |
| `DEPLOY_IMAGE_TAG` | `deploy.yml` | `sha-<full commit SHA>`; `render-env.py` turns it into `TAG`, `WEB_TAG` and `SENTRY_RELEASE` |
| `BACKUP_GATE_BUCKET`, `BACKUP_GATE_ENDPOINT`, `BACKUP_GATE_REGION`, `BACKUP_GATE_ACCESS_KEY_ID`, `BACKUP_GATE_SECRET_ACCESS_KEY` | `deploy.yml` | The backup gate's view of the `DO_SPACES_*` bucket, using the read-only key |
| `CORE_POSTGRES_DATA_MOUNT` | `render-env.py` | Data directory inside the database container, derived from the image major (`/var/lib/postgresql/data` for 17, `/var/lib/postgresql` for 18); never set by hand |
| `CMS_DATABASE_URL`, `EREGISTER_DATABASE_URL`, `WXWATCH_DB_URL`, `WXPRODUCTS_DB_URL`, `JANITORIAL_DB_URL`, `TRANSPORT_DB_URL` | `render-env.py` | Database URLs built from the committed names and users and the GitHub passwords (URL-encoded) |
| `SENTRY_DSN_API`, `SENTRY_DSN_WORKER`, `SENTRY_DSN_AUTH`, `SENTRY_DSN_ACCOUNT`, `SENTRY_DSN_ADMIN`, `SENTRY_DSN_BOOKINGS`, `SENTRY_DSN_CAP`, `SENTRY_DSN_CMS`, `SENTRY_DSN_DOCS`, `SENTRY_DSN_EVENTS`, `SENTRY_DSN_GAA_ADMIN`, `SENTRY_DSN_GMS`, `SENTRY_DSN_GMSDASH`, `SENTRY_DSN_MBIA`, `SENTRY_DSN_SIGNAL` | `render-env.py` | Each service's Sentry DSN, chosen from the environment's DSN secret by the service catalogue |
| `TRAEFIK_*`, `VISITOR_IP_PROXY_HOPS` | `render-env.py` | Edge settings derived from `CLOUDFLARE_PROXY_ENABLED` (see "Staging and production") |

### GitHub names nothing in the deploy reads

Stored in GitHub, but `deploy.yml` never reads them. Each is either read by
another workflow or script, or is a leftover that can be deleted by the owner:

| Name | Verdict |
|---|---|
| `BACKUP_HEARTBEAT_URL` | In use, from other environments: `backup-database.yml` (`production-backup`) and `monitoring-maintenance.yml` (`production`, `staging-backup`). The copy stored in the `staging` environment is read by nothing |
| `BOOTSTRAP_CMS` | Leftover. Only `scripts/production/backup-core.py` reads it from the host shell, and no workflow sets it |
| `EVENTS_DB_PASSWORD` | Leftover. Events lives in the main database; no code, compose file or script uses it. The environment settings manifest lists it as pending ("leftover: delete from both environments"), so deleting it never fails the check |
| `SESSION_COOKIE_NAME` | Leftover. Only the retired prototype compose file used it; each app now has its own cookie name. Pending in the manifest like `EVENTS_DB_PASSWORD` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Inert. The gms image has a build argument for it, but no workflow passes a value |
| `NEXT_PUBLIC_POSTHOG_KEY` | Inert. See the PostHog note under "GitHub environment secret names" |
