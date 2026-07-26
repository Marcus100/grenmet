# Hono API (`@barrelsgd/api-hono`)

Hono Node.js service in the Grenmet monorepo. Currently a small foundation for
a future weather-data proxy layer.

**Status:** health endpoint only (`GET /health`). It is not yet consumed by a
web app and is not started by the root `pnpm start` command.

The service defaults to `http://localhost:4000`, the Node API range reserved in
`docs/ports.md`. Configure it through environment variables; do not edit
`src/index.ts` to change the port.

## Run (from repo root)

```bash
pnpm install
cp apps/api/honoapi/.env.local.example apps/api/honoapi/.env.local
pnpm dev:honoapi
```

Check `http://localhost:4000/health` for
`{"status":"ok","service":"api-hono"}`.

## Run from app directory

```bash
cd apps/api/honoapi
cp .env.local.example .env.local
pnpm dev
```

## Environment variables

- `PORT` — HTTP port (default: `4000`)
- `HOST` — bind address (default: `0.0.0.0`)
- `NODE_ENV` and `ENVIRONMENT` — runtime environment labels
- `CORS_ORIGINS` — comma-separated browser-origin allowlist
- `API_PREFIX` — reserved for future versioned routes; the current health route
  remains `/health`

See [docs/env.md](../../../docs/env.md) for the central reference.

## Other commands

```bash
pnpm build
pnpm start
pnpm type-check
pnpm check:ci
pnpm test
```
