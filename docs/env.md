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
cp apps/web/admin-gms/.env.local.example    apps/web/admin-gms/.env.local
cp apps/web/hurricaneplan/.env.local.example apps/web/hurricaneplan/.env.local
cp apps/web/spicewx/.env.local.example      apps/web/spicewx/.env.local
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
| Runtime `.env.secrets` | Deploy-only secrets and derived database URLs | Second `--env-file`; generated and deleted by CI |

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
| `RESEND_API_KEY` | Email provider key — takes priority over SMTP when set |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `SMTP_SSL` | Fallback email via SMTP (MailCatcher in local dev) |
| `EMAILS_FROM_EMAIL` | Sender address for outgoing emails |
| `EMAILS_FROM_NAME` | Optional display name for outgoing emails |
| `EMAIL_RENDER_URL` | Optional web-auth render endpoint for React Email templates |
| `EMAIL_RENDER_SECRET` | Optional shared secret sent to the email render endpoint |
| `EMAIL_RESET_TOKEN_EXPIRE_HOURS` | Password reset link lifetime |
| `EMAIL_TEST_USER` | Recipient used by email tests and diagnostics |
| `RESEND_WEBHOOK_SECRET` | Optional Svix signing secret for Resend webhook verification |
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

### `AUTH_ALLOWED_RETURN_HOSTS` — how it works

After a successful sign-in, the auth app reads a `return_to` query parameter and redirects the user back to the originating app. `getSafeReturnTo()` in `apps/web/auth/src/lib/return-to.ts` validates that the redirect target's host is in this allowlist.

**If a host is missing from the allowlist, the redirect silently falls back to `/` with no error.** The user signs in successfully but lands on the auth app home page instead of where they came from.

Local dev value (all apps):

```
AUTH_ALLOWED_RETURN_HOSTS=localhost:3001,localhost:3002,localhost:3003,localhost:3004
```

Port map: 3001=admin-gms, 3002=hurricaneplan, 3003=spicewx, 3004=signal. See [`ports.md`](./ports.md) for the canonical allocation.

For staging/production, replace with the actual subdomain hosts (no port needed).

**Production (both domains — `barrels.gd` + `weather.gd` coexist; see [`weather-gd-golive.md`](./weather-gd-golive.md)):**
```
AUTH_ALLOWED_RETURN_HOSTS=.barrels.gd,.weather.gd
```
A leading-dot entry matches the apex domain and every subdomain (cookie `Domain`
semantics), so no per-app maintenance is needed. Suffix matching is implemented in
`apps/web/auth/src/lib/return-to.ts` (`getSafeReturnTo`) and covered by
`apps/web/auth/src/test/return-to.test.ts`. In the new deploy stack this value is
assembled as `.${BASE_DOMAIN}${EXTRA_RETURN_HOSTS}` — see
`infra/docker/production.env`. Staging uses `.staging.barrels.gd` only.

### Apps that delegate auth (hurricaneplan, spicewx)

These apps redirect to `web-auth` for sign-in. They do not manage sessions directly.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Must match the value in the auth app |
| `SESSION_COOKIE_DOMAIN` | Must match the shared deployment cookie domain |
| `AUTH_ALLOWED_RETURN_HOSTS` | Safe redirect hosts used by shared auth helpers |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional browser error reporting |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional browser analytics |

### admin-gms (`apps/web/admin-gms/.env.local`)

admin-gms hosts the consolidated CAP/HR/wxwatch/wxproducts/salesbus modules (2026-06), so it owns their env vars — including the two Drizzle database URLs and the CAP API base.

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
| `WXWATCH_DATABASE_URL` | Postgres connection string for the wxwatch database (Drizzle) |
| `WXPRODUCTS_DATABASE_URL` | Postgres connection string for the wxproducts database (Drizzle) |
| `JANITORIAL_DATABASE_URL` | Postgres connection string for the janitorial database (Drizzle) |
| `TRANSPORT_DATABASE_URL` | Postgres connection string for the transport database (Drizzle) |
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
| `DB_HOST` | Postgres host for Scrapy pipeline (default: `127.0.0.1`) |
| `DB_PORT` | Postgres port |
| `DB_NAME` | Target database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |

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
