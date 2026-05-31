# Hono API (`@grenmet/api-hono`)

Hono Node.js service in the Grenmet monorepo. Currently a stub — planned as a weather data proxy layer.

**Status:** stub (`GET /` → "Hello Hono!"). Not yet consumed by any web app.

> **Port note:** The stub defaults to port 3000, which conflicts with the auth app when running
> the full monorepo. Update the `port` in `src/index.ts` before running alongside other apps.

## Run (from repo root)

```bash
pnpm install
pnpm dev:honoapi
```

## Run from app directory

```bash
cd apps/api/honoapi
pnpm dev
```

## Other commands

```bash
pnpm build
pnpm start
pnpm type-check
pnpm check:ci
```
