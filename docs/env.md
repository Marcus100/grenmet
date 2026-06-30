# Environment Configuration

This document is the authoritative reference for all environment variables in the Grenmet monorepo — what each variable does, which file it lives in, and which service reads it.

---

## Local dev setup (one-time)

Two separate env files are required: one for shared infrastructure (Postgres, Adminer) and one for the FastAPI backend.

```bash
# 1. Shared infrastructure
cp infra/docker/.env.local.example   infra/docker/.env.local

# 2. FastAPI backend
cp apps/api/fastapi/.env.local.example  apps/api/fastapi/.env.local

# 3. Each Next.js app
cp apps/web/auth/.env.local.example         apps/web/auth/.env.local
cp apps/web/admin-gms/.env.local.example    apps/web/admin-gms/.env.local
cp apps/web/wxwatch/.env.local.example      apps/web/wxwatch/.env.local
cp apps/web/wxproducts/.env.local.example   apps/web/wxproducts/.env.local
cp apps/web/hr/.env.local.example           apps/web/hr/.env.local
cp apps/web/hurricaneplan/.env.local.example apps/web/hurricaneplan/.env.local
cp apps/web/spicewx/.env.local.example      apps/web/spicewx/.env.local
cp apps/web/salesbus/.env.local.example     apps/web/salesbus/.env.local

# 4. Scrapy script (optional — only if using the Scrapy pipeline)
cp scripts/scrapy-wxwatch/.env.local.example  scripts/scrapy-wxwatch/.env.local
```

Then fill in real secret values where the examples say `changethis` or `your_password_here`.

---

## Env file → service mapping

| Env file | Read by | Docker flag |
|---|---|---|
| `infra/docker/.env.local` | `infra/docker/docker-compose.yml` (Postgres, Adminer, tools) | `--env-file infra/docker/.env.local` |
| `apps/api/fastapi/.env.local` | `apps/api/fastapi/docker-compose.yml` (FastAPI container) | `--env-file apps/api/fastapi/.env.local` |
| `apps/web/<app>/.env.local` | Next.js dev server (`pnpm dev`) — never read by Docker | N/A |

> **Why two Docker files?** The infra compose needs database provisioning variables (`WXWATCH_DB_NAME`, `APP_DB_USER`, `ADMINER_DESIGN`) that don't belong in the FastAPI env. Sharing one file caused infra variables to be sourced from the wrong place.

---

## Variable reference

### Shared infrastructure (`infra/docker/.env.local`)

Read by `infra/docker/docker-compose.yml` only. FastAPI variables do **not** belong here.

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
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime in minutes (default: 11520 = 8 days) |
| `FIRST_SUPERUSER` | Bootstrap admin email |
| `FIRST_SUPERUSER_PASSWORD` | Bootstrap admin password |
| `POSTGRES_SERVER` | DB host — **must be `grenmet-postgres`** (the Docker container name) |
| `POSTGRES_PORT` | DB port (default: `5432`) |
| `POSTGRES_DB` | FastAPI database name (matches `APP_DB_NAME` in infra file) |
| `POSTGRES_USER` | FastAPI DB user (matches `APP_DB_USER` in infra file) |
| `POSTGRES_PASSWORD` | FastAPI DB password (matches `APP_DB_PASSWORD` in infra file) |
| `RESEND_API_KEY` | Email provider key — takes priority over SMTP when set |
| `SMTP_HOST` / `SMTP_PORT` / etc. | Fallback email via SMTP (MailCatcher in local dev) |
| `EMAILS_FROM_EMAIL` | Sender address for outgoing emails |
| `EMAIL_RENDER_URL` | Optional web-auth render endpoint for React Email templates |
| `EMAIL_RENDER_SECRET` | Optional shared secret sent to the email render endpoint |
| `EMAIL_RESET_TOKEN_EXPIRE_HOURS` | Password reset link lifetime |
| `RESEND_WEBHOOK_SECRET` | Optional Svix signing secret for Resend webhook verification |
| `SENTRY_DSN` | Sentry error tracking DSN (leave empty to disable) |
| `DOCKER_IMAGE_BACKEND` | Image name used by CI/CD (default: `backend`) |

### Auth app (`apps/web/auth/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`) |
| `AUTH_API_V1_STR` | API version prefix (e.g. `/api/v1`) |
| `SESSION_COOKIE_NAME` | Cookie name shared across all apps (e.g. `grenmet_session`) |
| `AUTH_ALLOWED_RETURN_HOSTS` | See section below |

### `AUTH_ALLOWED_RETURN_HOSTS` — how it works

After a successful sign-in, the auth app reads a `return_to` query parameter and redirects the user back to the originating app. `getSafeReturnTo()` in `apps/web/auth/src/lib/return-to.ts` validates that the redirect target's host is in this allowlist.

**If a host is missing from the allowlist, the redirect silently falls back to `/` with no error.** The user signs in successfully but lands on the auth app home page instead of where they came from.

Local dev value (all apps):

```
AUTH_ALLOWED_RETURN_HOSTS=localhost:3001,localhost:3002,localhost:3003,localhost:3004
```

Port map: 3001=admin-gms, 3002=hurricaneplan, 3003=spicewx, 3004=signal. See [`ports.md`](./ports.md) for the canonical allocation.

For staging/production, replace with the actual subdomain hosts (no port needed).

**Current active domain (`barrels.gd`):**
```
AUTH_ALLOWED_RETURN_HOSTS=admin.barrels.gd,wxwatch.barrels.gd,hurricane.barrels.gd,spice.barrels.gd,wxproducts.barrels.gd,hr.barrels.gd,sales.barrels.gd
```

**Planned production domain (`weather.gd`) — update when DNS cutover is complete:**
```
AUTH_ALLOWED_RETURN_HOSTS=admin.weather.gd,wxwatch.weather.gd,hurricane.weather.gd,spice.weather.gd,wxproducts.weather.gd,hr.weather.gd,sales.weather.gd
```

### Apps that delegate auth (hurricaneplan, spicewx)

These apps redirect to `web-auth` for sign-in. They do not manage sessions directly.

| Variable | Purpose |
|---|---|
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Must match the value in the auth app |

### hr (`apps/web/hr/.env.local`)

HR also delegates to `web-auth` but redirects back to itself after sign-in, so it needs `AUTH_APP_URL` and `AUTH_ALLOWED_RETURN_HOSTS` in addition to the standard auth variables.

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app (e.g. `http://localhost:3000`) |
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Shared session cookie name |
| `AUTH_ALLOWED_RETURN_HOSTS` | Allowlist for post-login redirects (e.g. `localhost:3002`) |

### admin-gms (`apps/web/admin-gms/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app (e.g. `http://localhost:3000`) |
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Session cookie name |
| `NEXT_PUBLIC_API_URL` | FastAPI public URL for client-side requests |
| `RESEND_API_KEY` | Email sending (server-side only) |

### wxwatch (`apps/web/wxwatch/.env.local`)

| Variable | Purpose |
|---|---|
| `AUTH_APP_URL` | URL of the auth app |
| `AUTH_API_URL` | FastAPI base URL |
| `AUTH_API_V1_STR` | API version prefix |
| `SESSION_COOKIE_NAME` | Session cookie name |
| `SESSION_COOKIE_DOMAIN` | Cookie domain for cross-app sharing |
| `DATABASE_URL` | wxwatch's own Postgres connection string |

### wxproducts (`apps/web/wxproducts/.env.local`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | wxproducts' own Postgres connection string |

### salesbus (`apps/web/salesbus/.env.local`)

Salesbus is not yet integrated with the shared auth system. It uses only client-side public variables.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL for client-side requests |
| `NEXT_PUBLIC_APP_NAME` | Application display name |
| `NEXT_PUBLIC_APP_VERSION` | Application version string |
| `NEXT_PUBLIC_ENABLE_DEBUG` | Enable debug output in development (`true` / `false`) |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Enable analytics (`true` / `false`; disabled by default in dev) |

### Scrapy script (`scripts/scrapy-wxwatch/.env.local`)

| Variable | Purpose |
|---|---|
| `DB_HOST` | Postgres host for Scrapy pipeline (default: `127.0.0.1`) |
| `DB_PORT` | Postgres port |
| `DB_NAME` | Target database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |

---

## Turbo cache and env vars

Turbo hashes env var **values** (not just names) when deciding whether to use a cached build. Only variables declared in `turbo.json` participate in this hash.

Current `turbo.json` declares only global env values:

```json
"globalEnv": ["NODE_ENV", "NEXT_PUBLIC_*"]
```

Server-side env vars such as `AUTH_API_URL`, `AUTH_APP_URL`, `SESSION_COOKIE_NAME`,
`SESSION_COOKIE_DOMAIN`, `AUTH_ALLOWED_RETURN_HOSTS`, `RESEND_API_KEY`, and
`DATABASE_URL` are validated by each app's typed env module, but they are not currently
listed as Turbo task env inputs. If a build-time server variable starts affecting a
Next.js build artifact, add it to `turbo.json` before relying on cached builds across
environments.

---

## CI/CD (GitHub Actions)

The deploy workflow generates `.env` inline from GitHub secrets scoped to the target environment (development / staging / production). Never commit a populated `.env.local` or `.env` file — only `.env.local.example` files are committed.

`.gitignore` entries that must be present in every app:

```
.env
.env.local
.env.*.local
```
