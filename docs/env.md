# Environment Configuration

This document is the human-readable reference for supported environment variables
in the Grenmet monorepo: what each variable does, where it is supplied, and which
service reads it. Typed settings modules, Compose files, and deployment workflows
remain the executable source of truth and must be updated together with this guide.

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

# 4. Hono API (optional)
cp apps/api/honoapi/.env.local.example      apps/api/honoapi/.env.local

# 5. Scrapy script (optional — only if using the Scrapy pipeline)
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
| `apps/api/honoapi/.env.local` | Hono development server | N/A |
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
| `BACKEND_CORS_ORIGINS` | Comma-separated or JSON array of allowed origins |
| `SECRET_KEY` | JWT signing secret — generate with `openssl rand -base64 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Legacy bearer-token lifetime in minutes (default: `60`) |
| `SESSION_ACCESS_TOKEN_EXPIRE_MINUTES` | Cookie-session access-token lifetime (default: `15`) |
| `SESSION_EXPIRE_DAYS` | Rotating session lifetime (default: `30`) |
| `SESSION_COOKIE_NAME` | Cookie name shared by FastAPI and authenticated web apps |
| `SESSION_COOKIE_DOMAIN` | Optional shared parent domain; empty for localhost |
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
| `NOTIFICATIONS_WEB_BASE_URL` | Staff portal base URL used for links in notification emails (local default `http://localhost:3001`). Deployment sets `https://admin.${BASE_DOMAIN}` for both API and worker. |
| `NOTIFICATIONS_BATCH_SIZE`, `NOTIFICATIONS_MAX_ATTEMPTS` | Worker email outbox batch size (50) and retry limit (5) |
| `BILLING_STRIPE_SECRET_KEY` | Stripe secret API key; use an `sk_test_...` key locally |
| `BILLING_STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret; locally use the `whsec_...` value printed by `stripe listen` |
| `BILLING_STRIPE_PRICE_ID` | Recurring Stripe Price used by subscription Checkout Sessions |
| `BILLING_CHECKOUT_SUCCESS_URL` | Stripe-hosted Checkout success redirect; may contain the literal `{CHECKOUT_SESSION_ID}` placeholder |
| `BILLING_CHECKOUT_CANCEL_URL` | Stripe-hosted Checkout cancellation redirect |
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
| `CAP_SIGNING_CERT` | Optional CAP XML signing certificate, as PEM content or a path |
| `CAP_SIGNING_KEY` | Optional CAP XML signing key, as PEM content or a path |
| `CAP_SIGNING_KEY_REF` | Human-readable key reference stored with signed snapshots |
| `SENTRY_DSN` | Sentry error tracking DSN (leave empty to disable) |
| `DOCKER_IMAGE_BACKEND` | Image name used by container tooling (default: `backend`); not read by FastAPI settings |

`STACK_NAME` and `DOMAIN` are Compose/deployment metadata. They may live beside
FastAPI settings but are not application settings themselves.

### Hono API (`apps/api/honoapi/.env.local`)

The Hono API is an optional service and is not started by the root `pnpm start`.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default: `4000`) |
| `HOST` | Bind address (default: `0.0.0.0`) |
| `NODE_ENV` | Node runtime mode: `development`, `production`, or `test` |
| `ENVIRONMENT` | Deployment environment: `local`, `staging`, `production`, or `test` |
| `API_PREFIX` | Reserved prefix for future versioned routes (default: `/api/v1`); the current health route is `/health` |
| `CORS_ORIGINS` | Comma-separated allowlist of browser origins |

### Auth app (`apps/web/auth/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | Public URL of the auth app (e.g. `http://localhost:3000`); used for OAuth callback redirects |
| `AUTH_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`) |
| `AUTH_API_V1_STR` | API version prefix (e.g. `/api/v1`) |
| `SESSION_COOKIE_NAME` | Cookie name shared across all apps (e.g. `grenmet_session`) |
| `SESSION_COOKIE_DOMAIN` | Optional shared parent domain; empty for localhost |
| `AUTH_ALLOWED_RETURN_HOSTS` | See section below |
| `EMAIL_RENDER_SECRET` | Optional shared secret required on FastAPI email-render requests |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingest host |
| `ADMIN_APP_URL` | Optional GAA Admin URL for the account-page app links and the "Edit in GAA Admin" profile button |
| `MBIA_APP_URL` | Optional airport website URL for the account-page app links |
| `GMS_APP_URL` | Optional GMS weather site URL for the account-page app links |
| `DOCS_APP_URL` | Optional docs site URL for the account-page app links |
| `SIGNAL_APP_URL` | Optional Signal URL for the account-page app links |
| `EVENTS_APP_URL` | Optional Events URL for the account-page app links |

The `*_APP_URL` links fall back to the local ports in `docs/ports.md` in development. In staging and production an unset URL leaves that app listed but not clickable.

### `AUTH_ALLOWED_RETURN_HOSTS` — how it works

After a successful sign-in, the auth app reads a `return_to` query parameter and redirects the user back to the originating app. `getSafeReturnTo()` in `apps/web/auth/src/lib/return-to.ts` validates that the redirect target's host is in this allowlist.

**If a host is missing from the allowlist, the redirect silently falls back to `/` with no error.** The user signs in successfully but lands on the auth app home page instead of where they came from.

Local dev value (all apps):

```
AUTH_ALLOWED_RETURN_HOSTS=localhost:3001,localhost:3002,localhost:3003,localhost:3004
```

Port map: 3001=gaa-admin, 3002=docs, 3003=gms, 3004=signal. See [`ports.md`](./ports.md) for the canonical allocation.

For staging/production, replace with the actual subdomain hosts (no port needed).

**Production:**

```text
AUTH_ALLOWED_RETURN_HOSTS=.barrels.gd
```

Staging uses `.staging.barrels.gd`. The shared Compose file assembles this as
`.${BASE_DOMAIN}${EXTRA_RETURN_HOSTS:-}`; current production configuration does
not add `.weather.gd`. Production CORS origins are the seven frontend hosts
listed in `infra/docker/production.env`; staging uses their staging equivalents.

A leading-dot entry accepts the apex and its subdomains. The superseded
weather.gd go-live plan is historical context, not an active allowlist recipe.

### Apps that delegate auth (docs, gms)

These apps redirect to `web-auth` for sign-in. They do not manage sessions directly.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Must match the value in the auth app |
| `SESSION_COOKIE_DOMAIN` | Must match the shared deployment cookie domain |
| `AUTH_ALLOWED_RETURN_HOSTS` | Safe redirect hosts used by shared auth helpers |
| `CAP_API_URL` | **gms only.** FastAPI base URL for the unauthenticated public CAP endpoints (`/api/cap/*`) that render the current-warnings panel. Separate from `AUTH_API_URL` because these endpoints need no session |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |

### gaa-admin (`apps/web/gaa-admin/.env.local`)

gaa-admin hosts the consolidated CAP/HR/wxwatch/wxproducts/eRegister/janitorial/transport/salesbus modules (2026-06), but FastAPI owns their database connections. The web app only needs API and auth settings.

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app (e.g. `http://localhost:3000`) |
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Session cookie name |
| `SESSION_COOKIE_DOMAIN` | Optional shared parent domain; empty for localhost |
| `NEXT_PUBLIC_API_URL` | FastAPI public URL for client-side requests |
| `RESEND_API_KEY` | Email sending (server-side only) |
| `CAP_API_URL` | FastAPI base URL for the consolidated CAP module |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |

### signal (`apps/web/signal/.env.local`)

Signal has no auth or database. All variables are optional client-side publics with sensible defaults.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default `http://localhost:3004`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (optional) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |

### MBIA (`apps/web/mbia/.env.local`, optional)

MBIA has no required server secrets and currently has no committed env example.
Its typed defaults allow it to run without an env file.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public site URL (default: `http://localhost:3005`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment label (default: `development`) |

### Scrapy script (`scripts/scrapy-wxwatch/.env.local`)

| Variable | Purpose |
|---|---|
| `WXWATCH_API_URL` | Archive endpoint base; default `http://127.0.0.1:8000/api/v1/wxwatch` |
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
| Required runtime inputs from GitHub environments | `SECRET_KEY`, Postgres and module database passwords, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, `SESSION_COOKIE_NAME`, `RESEND_API_KEY` |
| Proxy and TLS inputs | `EMAIL`, `USERNAME`, `HASHED_PASSWORD` |
| Optional deployment integrations | `SENTRY_DSN` and `STORAGE_*` |
| Derived at deployment time | `TAG`, `WEB_TAG`, `WXWATCH_DB_URL`, `WXPRODUCTS_DB_URL`, `JANITORIAL_DB_URL`, `TRANSPORT_DB_URL` |

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
`SESSION_COOKIE_NAME`, `SESSION_COOKIE_DOMAIN`, `AUTH_ALLOWED_RETURN_HOSTS`,
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

```
.env
.env.local
.env.*.local
```

## Storage alignment and CMS

Local migration commands explicitly load `.env.local` and use the same migration runners as deployment. Generic `DB_URL` fallbacks are unsupported. `python3 scripts/production/check-local-env.py` reports missing variable names and ignore coverage without displaying values.

CMS needs `DATABASE_URL` pointing only to its dedicated database and a stable `PAYLOAD_SECRET` of at least 32 characters in `apps/web/cms/.env.local`. `CMS_DB_NAME` defaults to `gms_cms`; deployment passes the environment-specific name. Optional shared-auth settings are `AUTH_API_URL`, `AUTH_APP_URL`, `CMS_URL`, `CMS_DEPARTMENT_ID`, `SESSION_COOKIE_NAME` and `SESSION_COOKIE_DOMAIN`. `CMS_BASELINE_REFERENCE_URL` is only for explicit adoption of a matching existing schema, never routine startup.

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
GMS authored products use `http://web-admin:3001`, and email rendering uses
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
are connected. Datadog logging hooks alone do not establish an APM connection;
a collector/agent is not configured by this release.

GMS local authored-product rendering requires `WXPRODUCTS_API_URL` in its typed
server environment. Publication authorization is configured through the
superuser-only grade policy API, not environment user-ID allowlists. Defaults
permit active staff in ingested GMS senior technician, assistant manager and
manager grades; each product can override its permitted grade IDs.

GMS's news pages read published editorial content from the CMS via
`CMS_API_URL` (optional; pointed at the `apps/web/cms` deployment's base URL).
With it unset, GMS falls back to its static reference articles. The CMS itself
exposes this feed unauthenticated at `/api/public/content`, filtered to
`status: published` content by the `content` collection's own access control.

### GitHub environment secret names

Add credentials independently to **Settings → Environments → staging / production
→ Secrets**. Missing optional integrations stay disabled; do not copy production
credentials into staging.

- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, optionally `NEXT_PUBLIC_POSTHOG_HOST`.
- Stripe: `BILLING_STRIPE_SECRET_KEY`, `BILLING_STRIPE_WEBHOOK_SECRET`,
  `BILLING_STRIPE_PRICE_ID`, `BILLING_CHECKOUT_SUCCESS_URL`,
  `BILLING_CHECKOUT_CANCEL_URL`. Supply the complete bundle together.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- CAP signing: `CAP_SIGNING_CERT`, `CAP_SIGNING_KEY` (PEM contents).
- Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_RENDER_SECRET`.
- Sentry: `SENTRY_DSN_STAGING` in staging, `SENTRY_DSN_PRODUCTION` in production,
  and environment-scoped `SENTRY_AUTH_TOKEN` for source-map upload.
- Storage: `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`,
  `STORAGE_BUCKET`, `STORAGE_ENDPOINT_URL`, optionally `STORAGE_REGION`
  and `STORAGE_PUBLIC_BASE_URL`.

Stripe price/return URL and PostHog host inputs accept environment secrets first,
with environment variables retained as a compatibility fallback.


### Observability activation

Use separate staging and production projects for PostHog and Sentry. Browser
keys are embedded during the web image build: adding a GitHub secret requires
rebuilding the corresponding environment images, not just restarting containers.
PostHog remains disabled without its project key. Its shared provider disables
session recording, autocapture and person profiles and sends only allowlisted
page-section counts; preserve these controls when activating it.

The API image ships with `DD_TRACE_ENABLED=false`,
`DD_INSTRUMENTATION_TELEMETRY_ENABLED=false` and
`DD_REMOTE_CONFIGURATION_ENABLED=false`. There is no Datadog Agent in the core
Compose stack. Do not enable exports until an agent is provisioned with a
container-reachable `DD_TRACE_AGENT_URL`, separate environment configuration,
and `DD_SERVICE`, `DD_ENV`, `DD_VERSION` tags. A Datadog cloud API key belongs on
the agent, not in browser configuration. The current deployment renderer does
not forward Datadog enablement settings; wiring the agent and these settings is
a separate deployment change, not an existing activated integration.

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
- Datadog: `DD_*` values, only after an agent or collector is provisioned.
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
