# FastAPI Backend (`grenmet-api`)

FastAPI backend for the GMS platform. Runs in Docker only — not managed by pnpm.

Domains: **Auth** (`/api/v1/auth/`, `/api/v1/login/`), **HR** (`/api/v1/hr/`), **CAP** (`/api/v1/cap/`, `/api/cap/`), **Webhooks** (`/api/v1/webhooks/`).

## Quick start

```bash
# From repo root (starts shared infra + API)
pnpm start

# From this directory (API-only — shared infra must already be running)
docker compose watch
```

Service endpoints: Swagger `http://localhost:8000/swagger` · ReDoc `http://localhost:8000/redoc` · Adminer `http://localhost:8080` · MailCatcher `http://localhost:1080`

See [CLAUDE.md](./CLAUDE.md) for code conventions, two-layer model pattern, dependencies, and testing.
See [docs/api/development.md](../../../docs/api/development.md) for Docker workflows, seeding, and troubleshooting.
See [docs/api/testing.md](../../../docs/api/testing.md) for test commands and coverage.
