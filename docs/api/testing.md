# API Testing Guide

> Scope: FastAPI backend in `apps/api/fastapi`

This guide focuses on current test and validation commands.

## Quick Daily Validation

Run from `apps/api/fastapi`:

```bash
# Format (ruff check --fix + ruff format)
./scripts/format.sh

# Lint, format-check, and mypy
./scripts/lint.sh

# Full pytest suite
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest

# Fast smoke suite (HTTP-level)
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api python scripts/quick_test.py
```

## Targeted Test Commands

### Unit and integration tests

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest -v
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest tests/auth/routers/test_login.py
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest tests/hr/test_workflow.py
```

### Coverage

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest --cov=src --cov-report=term --cov-report=html
```

Coverage HTML output: `apps/api/fastapi/htmlcov/index.html`

### Type checks and linting (container)

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back mypy src
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back ruff check src scripts
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back ruff format src scripts --check
```

### Local (non-container) fallback

If you run tools locally instead of in the container:

```bash
uv sync --frozen --package fast-back
uv run --frozen --package fast-back pytest
uv run --frozen --package fast-back mypy src
uv run --frozen --package fast-back ruff check src scripts
```

## Migration Safety Checks

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back alembic current
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back alembic upgrade head
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back alembic downgrade -1
```

## API Smoke Checks

```bash
curl http://localhost:8000/api/v1/utils/health-check/
curl http://localhost:8000/api/v1/openapi.json
curl -X POST http://localhost:8000/api/v1/login/access-token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin@weather.gd&password=changethis"
```

## Suggested Pre-Deployment Gate

Before promoting an API build:

1. `./scripts/format.sh`
2. `./scripts/lint.sh`
3. `docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back pytest --cov=src --cov-report=term`
4. `docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api python scripts/quick_test.py`
5. `docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml exec api uv run --frozen --package fast-back alembic current`

## Current Test Layout

The suite currently includes domains such as:

- `tests/auth/`
- `tests/hr/`
- `tests/utils/`

Shared fixtures and setup live in `tests/conftest.py`.

## Troubleshooting

### `network grenmet not found`

Start shared infra first from repo root:

```bash
docker compose -p grenmet --env-file infra/docker/.env.local \
  -f infra/docker/docker-compose.yml --profile tools up -d
```

### Tests fail due DB state

```bash
docker compose down -v
docker compose up -d
docker compose exec api uv run alembic upgrade head
```

### Quick smoke script fails to connect

Confirm API is reachable:

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml ps
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml logs -f api
```
