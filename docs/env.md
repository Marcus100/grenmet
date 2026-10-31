# Environment Configuration

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-18

This document is the human-readable reference for supported environment variables
in the Grenmet monorepo: what each variable does, where it is supplied, and which
service reads it. Typed settings modules, Compose files, and deployment workflows
remain the executable source of truth and must be updated together with this guide.

For the current staging/production integration inventory, repeatable metadata audit
and provider setup steps, see [Integration readiness](operations/integration-readiness.md).

---

## Local dev setup (one-time)

Two env files are required by `pnpm start`: one for shared infrastructure
(Postgres, Adminer) and one for FastAPI. App-specific files are needed only when
running those apps locally.

```bash
# 1. Shared infrastructure
cp infra/docker/.env.local.example   infra/docker/.env.local

# 2. FastAPI backend
cp apps/api/fastapi/.env.local.example  apps/api/fastapi/.env.local

# 3. Next.js apps with committed examples
cp apps/web/auth/.env.local.example         apps/web/auth/.env.local
cp apps/web/gaa-admin/.env.local.example    apps/web/gaa-admin/.env.local
cp apps/web/docs/.env.local.example apps/web/docs/.env.local
cp apps/web/gms/.env.local.example      apps/web/gms/.env.local
cp apps/web/signal/.env.local.example       apps/web/signal/.env.local

# 4. Scrapy script (optional — only if using the Scrapy pipeline)
cp scripts/scrapy-wxwatch/.env.local.example  scripts/scrapy-wxwatch/.env.local
```

Then fill in real secret values where the examples say `changethis` or `your_password_here`.
MBIA currently uses typed defaults and has no committed local example; it does
not require an env file unless those defaults need to be overridden.

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

The local Compose file provides defaults for Janitorial and Transport. Their six
variables are optional local overrides even though they are not currently listed
in `infra/docker/.env.local.example`.

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` | Root Postgres superuser (default: `postgres`) |
| `POSTGRES_PASSWORD` | Root Postgres password |
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
| `STACK_NAME` | Docker Compose project name for FastAPI |
| `DOMAIN` | Root domain for routing |
| `FRONTEND_HOST` | Client origin used in CORS and emails |
| `API_V1_STR` | API version prefix (default: `/api/v1`) |
| `BACKEND_CORS_ORIGINS` | Comma-separated or JSON array of allowed origins. The static Barrels site calls the API from the browser (contact and newsletter forms), so production must list `https://barrels.gd` and `https://www.barrels.gd`. Staging has no documented Barrels site origin yet; add one when it exists |
| `SECRET_KEY` | JWT signing secret — generate with `openssl rand -base64 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Legacy bearer-token lifetime in minutes (default: `60`) |
| `SESSION_ACCESS_TOKEN_EXPIRE_MINUTES` | Cookie-session access-token lifetime (default: `15`) |
| `SESSION_EXPIRE_DAYS` | Rotating session lifetime (default: `30`) |
| `BROWSER_SESSION_COOKIE_NAME` | GAA Admin's session cookie, read by the cookie-authenticated routes (default `admin_session`); must match gaa-admin's `ADMIN_SESSION_COOKIE_NAME` |
| `GAA_ADMIN_APP_URL` / `CMS_APP_URL` | Public URLs of the staff apps for single sign-on callbacks (ADR-0017). Defaults `http://localhost:3001` / `http://localhost:3006` |
| `CAP_APP_URL` / `CAP_SSO_CLIENT_SECRET` | CAP warning desk (`apps/web/cap`, pages under `/desk`, registry key `cap`, staff scope: ordinary staff tokens, so `/api/v1/cap/*` permissions apply). Default URL `http://localhost:3010`. Empty secret (the default) keeps the desk's sign-in off; the public alert pages are unaffected. Deployment sets the URL to `https://cap.${BASE_DOMAIN}` and passes the GitHub environment secret `CAP_SSO_CLIENT_SECRET` |
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
| `WXPRODUCTS_DATABASE_URL` | PostgreSQL URL for the separate existing weather-products database; required to serve the public product feed. Use a hostname reachable from FastAPI (`grenmet-postgres` in local Compose, `host.docker.internal` from the devcontainer). The API role needs read/write access to authored products, revisions and their identity sequence; the migration runner needs schema ownership. Weather migrations are owned by FastAPI. Missing configuration returns 503, not an empty feed. |
| `EVENTS_ORDER_HOLD_MINUTES` | How long an unpaid paid-tier order holds its tickets before the `expire_unpaid_event_orders` job cancels it and releases the stock (default `30`). The Stripe rail is test mode only (`PAYMENTS_STRIPE_*`). |
| `EVENTS_REFUND_CUTOFF_HOURS` | Refund policy for an organiser cancelling one paid order with `refund: follow_policy`: refunded when the event starts at least this many hours away, kept inside the window (default `48`). An event the organiser cancels is refunded in full. |
| `EVENTS_APP_URL` | Public URL of the Barrels Events web app (app-scoped sign-in, ADR-0016; also where Stripe Checkout returns an Events buyer, `/me/orders/<order id>`). Default `http://localhost:3009`. |
| `EVENTS_SSO_CLIENT_SECRET` | Secret the Events web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters (`openssl rand -base64 32`). Set the same value for the API and the Events web app (which also needs `AUTH_APP_URL`); deployment reads the GitHub environment secret of this name. Empty disables single sign-on into Events and hides "Continue with your Barrels account". |
| `GMSDASH_APP_URL` | Public URL of the GMS Dashboard web app (app-scoped sign-in). Default `http://localhost:3013`. |
| `GMSDASH_SSO_CLIENT_SECRET` | Secret the GMS Dashboard web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters. Set the same value for the API and `apps/web/gmsdash`. |
| `BOOKINGS_APP_URL` | Public URL of the Barrels Bookings web app (app-scoped sign-in). Default `http://localhost:3015`. |
| `BOOKINGS_SSO_CLIENT_SECRET` | Secret the Bookings web server presents to redeem single sign-on codes (ADR-0017); at least 32 characters. Empty (the default) keeps sign-in off. Set the same value for the API and `apps/web/bookings`. |
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
| `EMAIL_HASH_PEPPER` | Secret key for the HMAC-SHA256 hash of suppressed and unsubscribed email addresses (`src/utils/email_hash.py`). Generate with `openssl rand -base64 32 | tr -d '\n'` and store it without a trailing newline (`gh secret set EMAIL_HASH_PEPPER --env <env> < pepper-file`); the deploy's render-config step rejects a multi-line value. Never reuse `SECRET_KEY`. Unset is allowed only when `ENVIRONMENT=local` (a fixed dev key is used); elsewhere hashing raises `EmailHashPepperMissingError` and the subscribe, suppression and email-dispatch paths fail, so set it in staging and production before this release. Rotating or losing it makes every stored hash unmatchable, so keep a copy with the other backed-up secrets. |
| `CAP_DELIVERY_FAILURE_RECIPIENTS` | Worker. Comma-separated GMS addresses emailed (through the notifications outbox) when a warning delivery job (email, push, webhooks, PDF and so on) has failed on every attempt. One email per failed job and address, deduplicated by job id; it names the warning headline, channel, attempts and error class only. Empty (default): no email; the worker still logs an error that Sentry captures. |
| `TRUSTED_WEB_SECRET` | Shared secret (at least 32 characters, `openssl rand -base64 32`) that Next.js web hosts send with `X-Visitor-IP` and `X-Visitor-Secret` so rate limits (`src/rate_limit.py`) key on the real visitor, not the web server. Empty or shorter than 32 characters (a startup warning is logged, never the value) ignores both headers and keys on the connecting address, as does a wrong or missing secret, a non-ASCII value, and every `/auth` route, so a spoofed header changes nothing. IPv6 visitors key on their /64; IPv4-mapped IPv6 maps to IPv4. Set the same value for the API, `apps/web/bookings`, `apps/web/babydoll`, `apps/web/events` and `apps/web/gms` (gms: the weather site's email and browser alert sign-ups; without it every visitor shares one bucket of 5 email and 10 push sign-ups a minute); a web-side value under 32 characters fails the bookings, Babydoll, Events and gms env validation. The owner sets it on web-gms. Deploys (`render-env.py`, `deploy.yml`, `docker-compose.deploy.yml`) require it for staging and production, at least 32 characters, different from `SECRET_KEY` and every `*_SSO_CLIENT_SECRET`, and pass it to `api`, `web-events`, `web-gms` and `web-bookings` only. Events forwards the pair on its server-side API calls (`apps/web/events/src/lib/api.ts`) but never on `/auth/email-code/*`, which the API ignores it on anyway. |
| `VISITOR_IP_PROXY_HOPS` | The API, `apps/web/bookings`, `apps/web/babydoll`, `apps/web/events` and `apps/web/gms` (whole number 1 to 5, anything else fails startup; default 1). Number of reverse proxies in front of the server that append to `x-forwarded-for` (1: the right-most entry, as written by a Traefik that does not trust its peer). Behind Cloudflare and a Traefik that trusts it (`trustedIPs`), 2. The visitor is counted from the right; leading entries are visitor-controlled and ignored, and `x-real-ip` is not used. On the API it sets the address that rate limits fall back to (`src/rate_limit.py` `connecting_address`; at 1 that is uvicorn's address, unchanged). Deploys set it from `CLOUDFLARE_PROXY_ENABLED` (`render-env.py`) for `api`, `web-events`, `web-gms` and `web-bookings`; Babydoll's is set on its Vercel project. |
| `FLIGHTS_OPENSKY_ENABLED` | Feature flag, default `false`. When `true` the worker polls OpenSky every 30 minutes and `GET /api/v1/flights/board` serves the Redis-cached rows. Research use only: commercial use needs a written OpenSky licence (owner decision pending). Needs `REDIS_URL` |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Optional OpenSky OAuth2 client credentials (free account). Unset: anonymous access with a very small daily quota. Set in the environment secret store, never in a committed file |
| `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` | Copernicus Marine free account (secrets). Both set enables the worker fetch (every 6 h) and `GET /api/v1/environment/marine`; unset: `available: false`, never sample data |
| `CDSAPI_URL`, `CDSAPI_KEY` | Copernicus Atmosphere Data Store (ADS) personal access token (`CDSAPI_KEY`, secret) and URL (default `https://ads.atmosphere.copernicus.eu/api`). Key set enables the CAMS UV and dust fetch (twice daily) and `GET /api/v1/environment/air`; unset: `available: false`. Accept the CAMS dataset licence on the ADS once |
| `COPERNICUS_WAVE_DATASET_ID`, `COPERNICUS_SST_DATASET_ID`, `CAMS_DATASET_ID`, `ENVIRONMENT_FORECAST_HOURS`, `ENVIRONMENT_STALE_AFTER_HOURS`, `ENVIRONMENT_REQUEST_TIMEOUT_SECONDS` | Optional overrides of the product ids (defaults in `src/environmental/AGENTS.md`), forecast horizon (120 h), stale limit (12 h) and ADS request timeout (600 s) |
| `OPENSKY_API_URL`, `OPENSKY_TOKEN_URL`, `OPENSKY_TIMEOUT_SECONDS` | Override OpenSky endpoints and the request timeout (defaults: public API, public token URL, 20 s) |
| `FLIGHTS_WINDOW_HOURS`, `FLIGHTS_CACHE_TTL_SECONDS` | History window requested from OpenSky (48, its maximum) and Redis cache lifetime (21600) |
| `TURNSTILE_ENABLED` | GitHub environment **variable** (staging and production); API container only |
| `TURNSTILE_SECRET_KEY` | GitHub environment **secret** (staging and production); API container only |
| `EMAIL_HASH_PEPPER` | GitHub environment **secret** (staging and production); API, worker and prestart containers. Must be set before deploying the release that hashes email addresses |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (mbia, signal, docs, gms) | GitHub environment **variable**; `build-web-images.yml` passes it as a Docker build arg because Next.js inlines `NEXT_PUBLIC_*` at build time. Public by design. Changing it needs an image rebuild |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (barrels.gd) | Vercel project environment variable; `apps/web/barrels/vercel.json` passes it to `build.mjs` as an argument, which writes `dist/turnstile-config.mjs` |
| `SUBSCRIPTIONS_SITE_URLS` | JSON object of mailing-list key to public site origin, e.g. `{"signal":"https://signal.barrels.gd","barrels":"https://barrels.gd"}` (local default `{"signal":"http://localhost:3004","barrels":"http://localhost:4173"}`; the Barrels entry is the static site's local preview origin). Confirm and unsubscribe links redirect only to these origins |
| `SUBSCRIPTIONS_SITE_URLS` | JSON object of mailing-list key to public site origin, e.g. `{"signal":"https://signal.barrels.gd","barrels":"https://barrels.gd","gms-alerts":"https://weather.barrels.gd"}` (local default `{"signal":"http://localhost:3004","barrels":"http://localhost:4173","gms-alerts":"http://localhost:3003"}`; the Barrels entry is the static site's local preview origin). Confirm and unsubscribe links redirect only to these origins |
| `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY`, `WEBPUSH_CONTACT` | Browser push for published CAP alerts (GMS Get alerts page). Generate the pair with `python -m src.push.cli generate-vapid` (prints only; never writes a file). `WEBPUSH_CONTACT` is a `mailto:` or `https:` URL sent to push services. Push is off, and `GET /api/v1/push/vapid-public-key` answers `enabled: false`, until all three are set. Also `WEBPUSH_MAX_FAILURES` (default 10): failures before a subscription is dropped |
| `SUBSCRIPTIONS_API_BASE_URL` | Public API origin used in confirmation-email links (falls back to `API_BASE_URL`, then `http://localhost:8000`) |
| `SUBSCRIPTIONS_CONFIRM_TTL_DAYS`, `SUBSCRIPTIONS_RESEND_MINUTES` | Confirmation link lifetime (7) and the window in which a pending address is not mailed again (10) |
| `BILLING_STRIPE_SECRET_KEY` | Stripe secret API key; use an `sk_test_...` key locally |
| `BILLING_STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret; locally use the `whsec_...` value printed by `stripe listen` |
| `BILLING_STRIPE_PRICE_ID` | Recurring Stripe Price used by subscription Checkout Sessions |
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
| `SENTRY_CRONS_ENABLED` | Worker: send Sentry Cron check-ins for key jobs (default: `false`; each monitor may be billable) |
| `CAP_SIGNING_CERT` | Optional CAP XML signing certificate, as PEM content or a path |
| `CAP_SIGNING_KEY` | Optional CAP XML signing key, as PEM content or a path |
| `CAP_SIGNING_KEY_REF` | Human-readable key reference stored with signed snapshots |
| `SENTRY_DSN` | Sentry error tracking DSN (leave empty to disable) |
| `DOCKER_IMAGE_BACKEND` | Image name used by container tooling (default: `backend`); not read by FastAPI settings |

`STACK_NAME` and `DOMAIN` are Compose/deployment metadata. They may live beside
FastAPI settings but are not application settings themselves.

### Auth app (`apps/web/auth/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | Public URL of the auth app (e.g. `http://localhost:3000`); used for OAuth callback redirects |
| `AUTH_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`). Server-side only; deployment sets the internal `http://api:8000` for every web service (see below) |
| `AUTH_API_V1_STR` | API version prefix (e.g. `/api/v1`) |
| `AUTH_SESSION_COOKIE_NAME` | Host-only account session cookie (default `auth_session`). Every app keeps its own cookie (ADR-0017); none sets a `Domain` |
| `AUTH_ALLOWED_RETURN_HOSTS` | See section below |
| `EMAIL_RENDER_SECRET` | Optional shared secret required on FastAPI email-render requests |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingest host |
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
AUTH_ALLOWED_RETURN_HOSTS=auth.barrels.gd,admin.barrels.gd,gms.barrels.gd,bookings.barrels.gd,cap.barrels.gd,cms.barrels.gd,events.barrels.gd,docs.barrels.gd,weather.barrels.gd,signal.barrels.gd,mbia.barrels.gd,gmsdash.barrels.gd,babydoll.barrels.gd
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
app, so it is not listed. Current production configuration does not add `.weather.gd`. Production CORS origins are the seven frontend hosts
listed in `infra/docker/production.env`; staging uses their staging equivalents.

The superseded
weather.gd go-live plan is historical context, not an active allowlist recipe.

### Public sites with "Sign in" (gms, docs, signal, mbia)

Each site signs in with the Barrels account through auth.barrels.gd (ADR-0017)
and keeps its own host-only session cookie. "Sign in" appears only when the
site's secret is set; the same value must be set for the API. Elections
(Vercel) has no sign-in and is not listed here.

| Site | Registry key | Secret | Cookie (default) |
|---|---|---|---|
| gms (weather) | `weather` | `WEATHER_SSO_CLIENT_SECRET` | `weather_session` |
| docs | `docs` | `DOCS_SSO_CLIENT_SECRET` | `docs_session` |
| signal | `signal` | `SIGNAL_SSO_CLIENT_SECRET` | `signal_session` |
| mbia | `mbia` | `MBIA_SSO_CLIENT_SECRET` | `mbia_session` |
| gmsdash | `gmsdash` | `GMSDASH_SSO_CLIENT_SECRET` | `gmsdash_session` |
| bookings | `bookings` | `BOOKINGS_SSO_CLIENT_SECRET` | `bookings_session` |

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
| `NEXT_PUBLIC_SITE_URL` | Canonical public address, used as `metadataBase` so share previews get absolute links. Set at **build** time: CI passes `https://<host>.barrels.gd` (gms uses `weather`, from `scripts/ci/release-scope.mjs`); Elections sets it in Vercel. Defaults to the local port. gms, docs, events, elections, signal and mbia read it. |

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
| `CAP_DESK_URL` | The new CAP warning desk, linked as "Try the new desk" on `/cap` during the parallel run (default `http://localhost:3010/desk`; `https://cap.${BASE_DOMAIN}/desk` in deployment) |
| `JANITOR_APP_URL` | Optional janitor PWA origin. Area QR labels encode `<origin>/a/<area code>`; unset, they encode the bare code |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |

**Local production builds.** `next build` validates this env schema, so without `RESEND_API_KEY` a local `turbo run build --filter=@barrelsgd/web-gaa-admin` fails with `Invalid environment variables`. Export a placeholder in the shell for that one build (for example `RESEND_API_KEY=re_placeholder pnpm turbo run build --filter=@barrelsgd/web-gaa-admin`). Do not write it to any `.env*` file.

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

### cap (`apps/web/cap/.env.local`)

The public CAP alert hub plus the staff warning desk under `/desk`. No database. Public pages read the unauthenticated `/api/cap/*` feeds on the server and never read cookies. The desk signs in through auth.barrels.gd (ADR-0017, ADR-0054) and its browser calls go through the allow-listed proxy `/desk/api/...`.

| Variable | Purpose |
|---|---|
| `CAP_API_URL` | FastAPI base URL for the public CAP feeds (default `http://localhost:8000`; `http://api:8000` in deployment) |
| `GMS_SITE_URL` | GMS website, for "official source" and "how to get alerts" links (default `https://weather.barrels.gd`) |
| `AUTH_APP_URL` / `AUTH_API_URL` / `AUTH_API_V1_STR` | Desk only: the auth app (default `http://localhost:3000`), FastAPI (default `http://localhost:8000`) and its prefix (default `/api/v1`) |
| `CAP_SESSION_COOKIE_NAME` | Desk only: host-only session cookie (default `cap_desk_session`) |
| `CAP_SSO_CLIENT_SECRET` | Desk only: same value as the API's; without it desk sign-in says it is switched off and `/auth/callback` returns 503 |
| `NEXT_PUBLIC_SITE_URL` | Canonical address for absolute links (build-time; default `http://localhost:3010`) |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional server-side error reporting. No client SDK and no analytics, to keep pages light |

### gmsdash (`apps/web/gmsdash/.env.local`)

GMS Dashboard (model meteograms for entitled organisations). No database; it calls the `/models/*` routes with the person's app-scoped token.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `GMSDASH_SESSION_COOKIE_NAME` | Host-only session cookie (default `gmsdash_session`) |
| `GMSDASH_SSO_CLIENT_SECRET` | Same value as the API's; without it `/auth/callback` returns 503 and nobody can sign in |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting |

### bookings (`apps/web/bookings/.env.local`)

Barrels Bookings. Only `/studio` needs sign-in; the public booking pages (`/[slug]`) need no sign-in. No database; the Bookings API is called from the server only, at `AUTH_API_URL`.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` / `AUTH_API_V1_STR` / `AUTH_APP_URL` | FastAPI base URL (`http://api:8000` in deployment), API prefix and the Barrels sign-in app |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile key for the booking form. Unset: no widget and no token. Inlined at build time |
| `BOOKINGS_SESSION_COOKIE_NAME` | Host-only session cookie (default `bookings_session`) |
| `BOOKINGS_SSO_CLIENT_SECRET` | Same value as the API's registration for `bookings`; without it `/auth/callback` returns 503 and nobody can sign in. Optional in deployment (empty keeps sign-in off) |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_RELEASE` | Optional error reporting |

### signal (`apps/web/signal/.env.local`)

Signal has no database; newsletter sign-up is proxied to FastAPI (`/api/v1/subscriptions`). All variables are optional with sensible defaults.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI origin the subscribe route proxies to (default `http://localhost:8000`) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default `http://localhost:3004`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (optional) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |

### MBIA (`apps/web/mbia/.env.local`, optional)

MBIA has no required server secrets and currently has no committed env example.
Its typed defaults allow it to run without an env file.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI origin the contact route proxies to (default `http://localhost:8000`). The recipient inbox is FastAPI's `MBIA_CONTACT_RECIPIENT` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default: `http://localhost:3005`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile site key for the contact form. Unset: no widget and no token (fine while FastAPI has `TURNSTILE_ENABLED` off) |

### Commit web (`apps/web/commit`, Cloudflare Pages)

Read through `src/env.ts` (hand-written, no schema library). The site is static and needs no variables in production.

| Variable | Purpose |
|---|---|
| `COMMIT_SITE_URL` | Public origin for metadata, the sitemap and RSS links (default `https://commit.barrels.gd`; only the origin of the value is kept) |

### Babydoll web (`apps/web/babydoll`, Vercel)

Read through `src/env.ts` (hand-written, no schema library). Every value has a default; the site is fully static until the switch is on.

| Variable | Purpose |
|---|---|
| `BABYDOLL_ONLINE_BOOKING` | `on` enables `/book` (live services, slots, booking). Anything else: `/book` redirects to the Acuity link. Stands in for the PF7 flag `babydoll-online-booking` until anonymous visitors can evaluate flags |
| `BABYDOLL_API_URL` | FastAPI origin, server only (default `http://localhost:8000`) |
| `BABYDOLL_BOOKING_SLUG` | The studio's `bookings.profile.public_slug` (default `babydoll-beauty-bar`; created by `python -m src.bookings.seed`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile key for the booking form. Unset: no widget and no token. The API uses the `babydoll` public site's Turnstile policy |

FastAPI: `BOOKINGS_BABYDOLL_SITE_URL` (default `https://babydoll.barrels.gd`) is read only by the on-demand Babydoll seed (`src/bookings/seed.py`) for the booking manage link and the public site row.

### Staging demo seed (`apps/api/fastapi/scripts/seed_staging_demo.py`)

An operator opt-in for the staging API container only; it is not in the deploy workflow, `render-env.py` or any compose file, and nothing is stored as a secret.

| Variable | Description |
| --- | --- |
| `DEMO_SEED_ENABLED` | Set to `true` on the command line (`docker compose -p grenmet-staging exec -e DEMO_SEED_ENABLED=true api python scripts/seed_staging_demo.py --apply`) to allow the synthetic Bookings and Events demo data. Anything else, or unset, refuses. The script also refuses unless the API's own `ENVIRONMENT` is `staging`, and the configured database name must end with `_staging`, so production and local runs exit with status 2 before touching the database. Demo bookings are found by their `[demo] <key>` notes; editing those in the studio makes a re-run recreate them (possibly failing on a slot conflict). Never set it in a GitHub environment or a `.env*` file. |

### Scrapy script (`scripts/scrapy-wxwatch/.env.local`)

| Variable | Purpose |
|---|---|
| `WXWATCH_API_URL` | Archive endpoint base; default `http://127.0.0.1:8000/api/v1/wxwatch` |
| `WXWATCH_ALERT_ORGANISATION_ID` | Organisation whose notification settings choose who is told about NHC job failures; default `gaa` |
| `WXWATCH_INGEST_TOKEN` | Random secret of at least 32 characters, also configured in FastAPI |

Collector `DB_*` variables are retired. Only FastAPI uses `WXWATCH_DATABASE_URL`.

---

## Staging and production

The active deployment uses three layers:

1. `infra/docker/staging.env` or `infra/docker/production.env` supplies committed,
   non-secret topology such as domains, database names, image coordinates,
   volume names, and router suffixes.
2. `.github/workflows/deploy.yml` writes a temporary `.env.secrets` from GitHub
   environment secrets and derives database URLs and image tags.
3. `infra/docker/docker-compose.deploy.yml` consumes both files. The workflow
   deletes `.env.secrets` in its cleanup step.

| Layer | Representative variables |
|---|---|
| Committed non-secret configuration | `ENVIRONMENT`, `BASE_DOMAIN`, `DOMAIN`, `ROUTER_SUFFIX`, `EXTRA_RETURN_HOSTS`, database names/users, `REGISTRY`, `IMAGE_NAME`, `GHCR_OWNER`, `PROJECT_NAME`, CORS origins, volume names |
| Required runtime inputs from GitHub environments | `SECRET_KEY`, Postgres and module database passwords, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, `RESEND_API_KEY`, `GAA_ADMIN_SSO_CLIENT_SECRET`, `CMS_SSO_CLIENT_SECRET` |
| Proxy and TLS inputs | `CLOUDFLARE_PROXY_ENABLED` (GitHub environment variable; `true` or `false`, unset is off; [Cloudflare proxy runbook](operations/cloudflare-proxy.md)), `CLOUDFLARE_ORIGIN_SECRET` (GitHub environment secret, required when the switch is on: 32 to 128 letters, digits, `-` or `_`, different from every other deployment secret; the header Cloudflare adds and Traefik's origin gate requires) and the optional `CLOUDFLARE_ORIGIN_SECRET_PREVIOUS` (also accepted during a rotation), `EMAIL`, `USERNAME`, `HASHED_PASSWORD` (Traefik dashboard, SSH tunnel only); staging only: `STAGING_BASIC_AUTH_USERS`, `ADMINER_BASIC_AUTH_USERS` (htpasswd bcrypt lines, validated by `render-env.py`), `STAGING_PROBE_CREDENTIALS` (`user:password` for the deploy smoke and probe) |
| Optional deployment integrations | `SENTRY_DSN` and `STORAGE_*` |
| Derived at deployment time | `TAG`, `WEB_TAG`, `WXWATCH_DB_URL`, `WXPRODUCTS_DB_URL`, `JANITORIAL_DB_URL`, `TRANSPORT_DB_URL`; from `CLOUDFLARE_PROXY_ENABLED`: `VISITOR_IP_PROXY_HOPS` (1 or 2), `TRAEFIK_FORWARDED_HEADERS` (`insecure=false` or `trustedIPs=` the ranges in `infra/cloudflare/ip-ranges.txt`), `TRAEFIK_CLIENT_IP_DEPTH` (0 or 1), `TRAEFIK_ACME_CHALLENGE` (TLS or HTTP challenge), `TRAEFIK_ORIGIN_GATE_RULE` (off: matches nothing; on: Cloudflare ranges without the origin secret header get 403) |

The older `infra/docker/.env.staging.example` and `.env.prod.example` files are
not inputs to the active deployment workflow. Do not use them as the deployment
source of truth; their cleanup is tracked separately from this documentation fix.

---

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

GitHub environment secrets are written only to the temporary `.env.secrets`
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

CMS needs `DATABASE_URL` pointing only to its dedicated database and a stable `PAYLOAD_SECRET` of at least 32 characters in `apps/web/cms/.env.local`. `CMS_DB_NAME` defaults to `gms_cms`; deployment passes the environment-specific name. Optional shared-auth settings are `AUTH_API_URL`, `AUTH_APP_URL`, `CMS_URL`, `CMS_DEPARTMENT_ID`, `CMS_SESSION_COOKIE_NAME` (default `cms_session`) and `CMS_SSO_CLIENT_SECRET` (same value as the API's; required to sign in). `CMS_BASELINE_REFERENCE_URL` is only for explicit adoption of a matching existing schema, never routine startup. `GMS_PREVIEW_URL` (optional) is the weather site's preview page (`<weather site>/preview`); setting it turns on the Preview button for drafts. `GMS_SITE_URL` is the weather site's public origin, used for post addresses in the public newsletter route and the social send; without it the newsletter route answers 503 and no social post is sent. The deployment sets it for the CMS to `https://weather.${BASE_DOMAIN}` (the same value the CAP app uses). Setting it turns on that route, which then serves posts ticked "Include in newsletter"; the daily digest reads that route only when the API's `NEWSLETTER_POSTS_FEED_URL` is set and `NEWSLETTER_DIGEST_ENABLED` is on, and deployment sets neither. `CMS_DISTRIBUTION_SECRET` (optional, at least 32 characters) is shared with FastAPI's content-distribution endpoint as `X-CMS-Secret`; without it nothing is sent to social platforms. The deployment passes the same GitHub environment secret to the API and to the CMS, and `render-env.py` refuses a value under 32 characters. Live posting also needs the feature flag `social-live-posting` and the `META_*` settings in the FastAPI table; without them every post stays a dry run.

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

`NEXT_PUBLIC_*` variables are compiled into browser bundles. Configure Sentry,
PostHog, public API origins and site origins in the build's GitHub environment,
then rebuild the image after changes. Runtime-only changes cannot repair an
already compiled browser value. Never put Stripe secret keys, webhook secrets,
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

- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, optionally `NEXT_PUBLIC_POSTHOG_HOST`.
- Stripe: `BILLING_STRIPE_SECRET_KEY`, `BILLING_STRIPE_WEBHOOK_SECRET`,
  `BILLING_STRIPE_PRICE_ID`, `BILLING_CHECKOUT_SUCCESS_URL`,
  `BILLING_CHECKOUT_CANCEL_URL`. Supply the complete bundle together.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Single sign-on (ADR-0017): `GAA_ADMIN_SSO_CLIENT_SECRET`, `CMS_SSO_CLIENT_SECRET`
  (required); `EVENTS_SSO_CLIENT_SECRET`, `WEATHER_SSO_CLIENT_SECRET`,
  `DOCS_SSO_CLIENT_SECRET`, `SIGNAL_SSO_CLIENT_SECRET`, `MBIA_SSO_CLIENT_SECRET`
  (optional; each switches on "Sign in" there). Elections has no sign-in.
- CAP signing: `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY` (PEM contents).
- Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_RENDER_SECRET`.
- Sentry: `SENTRY_DSN_STAGING` in staging, `SENTRY_DSN_PRODUCTION` in production,
  and environment-scoped `SENTRY_AUTH_TOKEN` for source-map upload.
- Storage: `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`,
  `STORAGE_BUCKET`, `STORAGE_ENDPOINT_URL`, optionally `STORAGE_REGION`
  and `STORAGE_PUBLIC_BASE_URL`.

The deploy workflow also accepts matching `DO_SPACES_ACCESS_KEY_ID`,
`DO_SPACES_SECRET_ACCESS_KEY`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, and
`DO_SPACES_REGION` secrets when the corresponding `STORAGE_*` secret is absent.
Keep the key ID and secret from the same Spaces key, and grant that key access
to the configured bucket. A configured value only proves presence: a worker
`head_bucket` response of HTTP 403 means storage access still needs correction.
After changing staging secrets, deploy again so the API and worker receive the
new values, then verify bucket access and a test object upload/download.
The optional staging weather deploy also reads `DO_SPACES_*` for its off-host
backup. Give that workflow separate backup credentials before enabling it;
the assets-only key cannot satisfy its retention check.

Stripe price/return URL and PostHog host inputs accept environment secrets first,
with environment variables retained as a compatibility fallback.


### Observability activation

Use separate staging and production projects for PostHog and Sentry. Browser
keys are embedded during the web image build: adding a GitHub secret requires
rebuilding the corresponding environment images, not just restarting containers.
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
- Google Analytics: `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
- Stripe billing: the complete `BILLING_STRIPE_*` and checkout URL bundle.
- Resend webhooks and email rendering: `RESEND_WEBHOOK_SECRET`,
  `EMAIL_RENDER_SECRET`, `EMAIL_RENDER_URL`.
- CAP XML signing: `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY`,
  `CAP_SIGNING_KEY_REF`.
- CAP MQTT, outbound webhooks, WIS2Box, static maps, and social-image
  publication consumers; these are currently dormant and have no required
  runtime credentials.
- Republic ePay for Events payments; the provider contract, webhook protocol,
  and environment variables have not yet been selected.
- External uptime and paging; no provider has yet been selected.

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
they change.


### WxWatch read migration

Configure `WXWATCH_DATABASE_URL` in the FastAPI environment with access to the separate wxwatch database. In local Docker use the database hostname reachable by the API (`grenmet-postgres`); the devcontainer uses `host.docker.internal`. FastAPI owns migrations and writes as well as reads, so its database role needs schema ownership. Missing configuration returns 503. Neither gaa-admin nor Scrapy needs database credentials for WxWatch. Set `WXWATCH_INGEST_TOKEN` in both API and collector environments; set `WXWATCH_LOCAL_IMAGES_DIR` only for local/shared filesystem storage. Local Compose mounts the collector images read-only automatically. No env files are changed automatically.

### eRegister database

`EREGISTER_DATABASE_URL` is the PostgreSQL URL for the dedicated manual observation register. `EREGISTER_DB_NAME` is the expected database name used by its Alembic guard (default `eregister`). Provision `EREGISTER_DB_USER`, `EREGISTER_DB_PASSWORD` and `EREGISTER_DB_NAME` alongside the other domain databases. The register stores manual SYNOP, METAR and SPECI entries, revisions, QC decisions and WIS2box publication state; it does not replace SURFACE's automated observation store.

### eRegister send actions

`EREGISTER_OBS_RECIPIENTS` is a comma-separated list of addresses that receive "Email observation" (one outbox email each, sent by the worker). Unset: the action answers 409 "No recipients configured". `EREGISTER_SEND_REQUIRE_ACCEPTED` (default `false`) requires QC state `accepted` for email too; by default email goes out for any validated, non-rejected observation (internal use, marked provisional). WIS2 publication always requires `accepted`, whatever this says.

"Send last obs" writes a csv2bufr CSV for wis2box and needs one drop target, read by the API (to validate) and the worker (to transfer):

| Variable | Meaning |
| --- | --- |
| `WIS2BOX_INCOMING_DIR` | Local directory that is (or mounts) the wis2box incoming data; takes precedence over S3 |
| `WIS2BOX_S3_ENDPOINT_URL`, `WIS2BOX_S3_ACCESS_KEY_ID`, `WIS2BOX_S3_SECRET_ACCESS_KEY` | wis2box MinIO endpoint and credentials; the bucket defaults to `WIS2BOX_S3_BUCKET=wis2box-incoming` |
| `WIS2BOX_TOPIC_HIERARCHY` | Object key prefix; must equal the wis2box dataset topic (default `origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop`) |
| `WIS2BOX_WIGOS_ID` | Station WIGOS identifier (default `0-20000-0-78958`); only this station can be published |
| `WIS2BOX_STATION_LATITUDE`, `_LONGITUDE`, `_STATION_HEIGHT_M`, `_BAROMETER_HEIGHT_M`, `_THERMOMETER_HEIGHT_M`, `_ANEMOMETER_HEIGHT_M` | Station metadata for the CSV (MBIA defaults) |
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

### Payments (PF4, test mode only)

The payments core (`src/payments`, ADR-0027) is built, and its Stripe adapter runs in **test mode only**. They are wired into the deployment (`deploy.yml` → `render-env.py` → the API and worker in `docker-compose.deploy.yml`), but leave them **unset** in staging and production until the owner approves a payment rail. `render-env.py` refuses a `PAYMENTS_STRIPE_SECRET_KEY` that does not start with `sk_test_`, so a live key cannot be deployed by accident. It also refuses a half-set Stripe configuration: `PAYMENTS_STRIPE_SECRET_KEY`, `_WEBHOOK_SECRET`, `_SUCCESS_URL` and `_CANCEL_URL` are set together or not at all, and both URLs must be `https://`.

| Variable | Purpose |
| --- | --- |
| `PAYMENTS_STRIPE_SECRET_KEY` | Stripe test secret. A key that does not start with `sk_test_` is refused at use, so a live key cannot enable a live rail. Unset: the Stripe adapter is disabled (the `manual` provider still works). |
| `PAYMENTS_STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/v1/payments/public/webhooks/stripe` (503 when unset). |
| `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` | Fallback return pages (HTTPS) for a purchase type with no registered address; Checkout answers 503 until both are set. A purchase type can register its own address (`src/payments/return_urls.py`): Events returns the buyer to `{EVENTS_APP_URL}/me/orders/<order id>?payment=success\|cancelled`. Return addresses come from settings, never from a request. Outside `ENVIRONMENT=local`, an `http` or localhost address (registered or global) is refused. |
| `PAYMENTS_STRIPE_API_BASE` | Defaults to `https://api.stripe.com`; override only in tests. |
| `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` | How old a signed webhook may be (default 300). |
| `PAYMENTS_REQUEST_TIMEOUT_SECONDS` | Provider request timeout (default 10). |

## Deploy wiring for the 2026-10-18 integrations

`deploy.yml` passes these to the API and worker containers. Unset values fall
back to each setting's default.

| Setting | Where to set it |
| --- | --- |
| `MBIA_CONTACT_RECIPIENT`, `BARRELS_CONTACT_RECIPIENT`, `GMS_DATA_REQUEST_RECIPIENT`, `EREGISTER_OBS_RECIPIENTS` | GitHub environment **variables** (staging and production) |
| `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_CONTACT` | GitHub environment **variables** |
| `EREGISTER_SEND_REQUIRE_ACCEPTED`, `WIS2BOX_S3_ENDPOINT_URL`, `WIS2BOX_S3_BUCKET`, `WIS2BOX_TOPIC_HIERARCHY`, `FLIGHTS_OPENSKY_ENABLED` | GitHub environment **variables** |
| `WIS2BOX_S3_ACCESS_KEY_ID`, `WIS2BOX_S3_SECRET_ACCESS_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD`, `CDSAPI_KEY` | GitHub environment **secrets** |
| `CDSAPI_URL` | GitHub environment **variable** (optional) |
| `WIS2BOX_S3_ACCESS_KEY_ID`, `WIS2BOX_S3_SECRET_ACCESS_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `WEBPUSH_VAPID_PRIVATE_KEY` | GitHub environment **secrets** |
| `SUBSCRIPTIONS_SITE_URLS` | Committed in `infra/docker/staging.env` and `production.env` (non-secret) |
| `ORG_SECRET_ENCRYPTION_KEYS`, `PAYMENTS_STRIPE_SECRET_KEY`, `PAYMENTS_STRIPE_WEBHOOK_SECRET` | GitHub environment **secrets** |
| `PAYMENTS_STRIPE_SUCCESS_URL`, `PAYMENTS_STRIPE_CANCEL_URL` | GitHub environment **variables** |
| `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID` | GitHub environment **variables** (staging and production); the worker only |
| `META_PAGE_ACCESS_TOKEN` | GitHub environment **secret**; the worker only |
| `SOCIAL_LINK_HOSTS`, `SOCIAL_IMAGE_HOSTS` | GitHub environment **variables** (staging and production); the API only |
| `CMS_DISTRIBUTION_SECRET` | GitHub environment **secret** (staging and production); the API and the CMS |
