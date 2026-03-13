# API Development Guide

> Scope: FastAPI backend in `apps/api/fastapi`

This guide reflects the current monorepo scripts and Docker Compose layout.

## Run Modes

### Mode A: Repo root workflow (recommended)

Use this for daily development when you want shared infra and API together.

```bash
# from repo root
pnpm install
cp apps/api/fastapi/.env.example apps/api/fastapi/.env
pnpm start
```

Useful root commands:

- `pnpm start` - start shared infra + FastAPI
- `pnpm stop` - stop FastAPI and shared infra
- `pnpm status` - show container status
- `pnpm reset` - reset shared infra volume and start Postgres only

### Mode B: API directory workflow

Use this when iterating only on FastAPI.

```bash
# from repo root (one time per session)
docker compose -f infra/docker/docker-compose.yml --profile tools up -d

# then
cd apps/api/fastapi
cp .env.example .env
docker compose watch
```

Important: `apps/api/fastapi/docker-compose.yml` expects an external Docker network named `grenmet`, created by the shared infra compose file.

## Service Endpoints

- Swagger: `http://localhost:8000/swagger`
- ReDoc: `http://localhost:8000/redoc`
- Scalar docs: `http://localhost:8000/scalar`
- OpenAPI JSON: `http://localhost:8000/api/v1/openapi.json`
- Health: `http://localhost:8000/api/v1/utils/health-check/`
- Adminer: `http://localhost:8080`
- MailCatcher: `http://localhost:1080`

## FastAPI Compose Behavior

The API compose file currently defines:

- `prestart`
- `api`

It does not define `db`, `adminer`, or `mailcatcher`; those come from `infra/docker/docker-compose.yml`.

Live-reload details:

- Source, alembic, scripts, tests, and templates are bind-mounted into the API container.
- `develop.watch` is configured to rebuild when `pyproject.toml` changes.

## Development Commands (inside `apps/api/fastapi`)

```bash
# Logs
docker compose logs -f api

# Shell
docker compose exec api bash

# Migrations
docker compose exec api uv run alembic upgrade head
docker compose exec api uv run alembic revision --autogenerate -m "message"

# Tests
docker compose exec api uv run pytest

# Quick smoke script
docker compose exec api python scripts/quick_test.py
```

## Helper Scripts

```bash
./scripts/dev.sh start
./scripts/dev.sh logs-api
./scripts/dev.sh migrate
./scripts/dev.sh test-cov
./scripts/format.sh
./scripts/lint.sh
```

Notes:

- `./scripts/dev.sh logs-db` and `./scripts/dev.sh db-shell` expect a `db` service in the same compose file, so they are not reliable with the current API compose layout.
- Use the shared infra compose to inspect Postgres:

```bash
docker compose -f ../../infra/docker/docker-compose.yml --profile tools logs -f postgres
```

## Database Seeding

```bash
docker compose exec api python scripts/seed_data.py --reset
```

Related scripts:

- `scripts/seed_data.py`
- `scripts/clear_seed_data.py`
- `scripts/SEED_DATA.md`

## OpenAPI Export

Regenerate `openapi.json` from the app object:

```bash
cd apps/api/fastapi
uv run python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json', 'w'), indent=2)"
```

This is useful before regenerating `packages/api-client`.

## Troubleshooting

### `network grenmet not found`

Start shared infra first:

```bash
docker compose -f infra/docker/docker-compose.yml --profile tools up -d
```

### Docs not found at `/docs`

The app uses `/swagger` and `/redoc` (not `/docs`).

### Port 8000 already in use

Stop conflicting service or change the API host port in `apps/api/fastapi/docker-compose.yml`.

### Fresh restart

```bash
cd apps/api/fastapi
docker compose down
docker compose build --no-cache
docker compose watch
```
