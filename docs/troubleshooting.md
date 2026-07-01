# Troubleshooting

Common development issues and how to fix them.

---

## Table of Contents

- [Docker / infrastructure](#docker--infrastructure)
- [Auth and sessions](#auth-and-sessions)
- [TypeScript and types](#typescript-and-types)
- [Turbo cache](#turbo-cache)
- [Database](#database)
- [Port conflicts](#port-conflicts)
- [pnpm / dependencies](#pnpm--dependencies)

---

## Docker / infrastructure

### Postgres won't start or keeps restarting

```bash
pnpm status    # check which containers are unhealthy
pnpm reset     # wipe volumes and restart fresh (destroys all local data)
```

If `pnpm reset` doesn't help, try removing the volume manually:

```bash
docker compose -f infra/docker/docker-compose.yml down -v
pnpm start
```

### FastAPI container exits immediately

1. Check `.env.local` in `apps/api/fastapi/` exists and has `POSTGRES_*` values filled in.
2. Run `pnpm status` and look at the FastAPI container logs: `docker logs grenmet-fastapi-1`.
3. Common cause: Postgres isn't ready yet — wait 5–10 seconds and try `pnpm start` again.

### Can't reach `http://localhost:8000`

- FastAPI runs in Docker. Make sure `pnpm start` is running (not just the web app).
- Check `pnpm status` to confirm the `fastapi` container is healthy.
- Check firewall or VPN isn't blocking port 8000.

---

## Auth and sessions

### Infinite redirect loop on sign-in

Symptom: browser bounces between the app and `web-auth` indefinitely.

Causes and fixes:

1. **Cookie domain mismatch** — `SESSION_COOKIE_DOMAIN` in `.env.local` must be blank (or match the actual domain). For local dev, leave it unset.
2. **`AUTH_APP_URL` wrong** — must point to where `web-auth` is running, e.g. `http://localhost:3000`.
3. **`AUTH_ALLOWED_RETURN_HOSTS` missing or wrong** — in `web-auth`'s `.env.local`, this must include the host of the app you're redirecting back to, e.g. `localhost:3002`.
4. **Session cookie not set** — open browser DevTools → Application → Cookies and check `grenmet_session` is present after sign-in.

### `exchangeSessionForAccessToken` throws 401

The session token is invalid or expired. Fix:
1. Clear the cookie in DevTools and sign in again.
2. Check FastAPI is running and the session wasn't deleted from the DB.

### Sign-out doesn't redirect

The `signOut()` client call posts to `/auth/logout` on the current app. Make sure the Route Handler exists at `src/app/api/auth/logout/route.ts` in the app. Check the network tab for a 404.

---

## TypeScript and types

### `Type '...' is not assignable to type '...'` after pulling

Often caused by a stale API client. If FastAPI routes changed and `packages/api-client/src/gen/` was updated, rebuild:

```bash
pnpm build
```

Or regenerate the client if `openapi.json` also changed:

```bash
pnpm generate:api-client
pnpm build
```

### `Cannot find module '@grenmet/ui/...'` or `'@grenmet/auth/...'`

The shared package needs to be built first:

```bash
pnpm build
```

For a faster rebuild of just the affected packages:

```bash
turbo run build --filter=@grenmet/ui
turbo run build --filter=@grenmet/auth
```

### Type errors only on CI, not locally

1. CI runs on Linux — file casing matters. Check that import paths match the actual filename casing exactly.
2. Biome formatting rules can differ between macOS and Linux. Run `pnpm fix` before pushing.

---

## Turbo cache

### Build output looks stale after code changes

Turbo aggressively caches. Force a clean run:

```bash
turbo run build --force   # ignore cache for this run
pnpm clean                # nuclear option: removes all node_modules (destructive)
```

### `pnpm type-check` passes locally but CI fails

Check that all env vars used in `turbo.json` `env` arrays are declared. If you added a new env var to an app's `env.ts`, add it to the `turbo.json` `build.env` (or `check.env`) for that package.

---

## Database

### Drizzle migration fails (`wxwatch` or `wxproducts`)

1. Make sure `DATABASE_URL` in `.env.local` points to the correct database (wxwatch and wxproducts use different DBs — check `infra/docker/docker-compose.yml` for the database names).
2. Run migrations from inside the app directory:

```bash
cd apps/web/wxwatch    # or wxproducts
pnpm db:migrate
```

3. If the migration is conflicting with an existing schema, inspect `src/db/migrations/` — do not delete migration files; fix forward.

### Schema change isn't reflected after editing a schema file

You must run `pnpm db:generate` after every schema change. Skipping this step means the migration file is not created and the change will not apply.

```bash
cd apps/web/wxproducts    # or wxwatch
pnpm db:generate
pnpm db:migrate
```

Commit both the schema file and the generated migration.

### Adminer shows empty tables after `pnpm reset`

`pnpm reset` wipes volumes. You need to re-run seed scripts if you need test data:

- FastAPI: `cd apps/api/fastapi && uv run python -m scripts.seed_data`
- wxproducts: `cd apps/web/wxproducts && pnpm db:migrate` (seeds are in `src/db/seed.ts`)

---

## Port conflicts

### Port already in use

Find and kill the conflicting process:

```bash
# macOS/Linux
lsof -i :3001 | grep LISTEN

# Windows
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

App ports are listed in [`docs/ports.md`](./ports.md) (canonical) and the [Technical Overview — web apps at a glance](./technical-overview.md#the-web-apps-at-a-glance). Infrastructure ports: FastAPI `:8000`, Adminer `:8080`, MailCatcher `:1080`.

---

## pnpm / dependencies

### `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` or missing workspace package

```bash
pnpm install
```

If that doesn't resolve it, the package may not be in `pnpm-workspace.yaml`. Check that the app or package path is listed there.

### `catalog:` version not resolving

If you added a new dep with `"package-name": "catalog:"` but didn't add the version to `pnpm-workspace.yaml` under `catalog:`, you'll get a resolution error. Add the version to the catalog, then run `pnpm install`.

### `node_modules` corruption after switching branches

```bash
pnpm clean    # removes all node_modules via git clean -xdf
pnpm install
```

> Warning: `pnpm clean` is destructive — it removes all untracked files, not just `node_modules`.

---

If your issue isn't covered here, check the [Technical Overview](./technical-overview.md) for how the system fits together, or inspect the relevant app's `CLAUDE.md` for app-specific context.
