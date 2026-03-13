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
docker compose exec api uv run pytest

# Fast smoke suite (HTTP-level)
docker compose exec api python scripts/quick_test.py
```

## Targeted Test Commands

### Unit and integration tests

```bash
docker compose exec api uv run pytest -v
docker compose exec api uv run pytest tests/auth/routers/test_login.py
docker compose exec api uv run pytest tests/hr/test_workflow.py
```

### Coverage

```bash
docker compose exec api uv run pytest --cov=src --cov-report=term --cov-report=html
```

Coverage HTML output: `apps/api/fastapi/htmlcov/index.html`

### Type checks and linting (container)

```bash
docker compose exec api uv run mypy src
docker compose exec api uv run ruff check src scripts
docker compose exec api uv run ruff format src scripts --check
```

### Local (non-container) fallback

If you run tools locally instead of in the container:

```bash
uv sync
uv run pytest
uv run mypy src
uv run ruff check src scripts
```

## Migration Safety Checks

```bash
docker compose exec api uv run alembic current
docker compose exec api uv run alembic upgrade head
docker compose exec api uv run alembic downgrade -1
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
3. `docker compose exec api uv run pytest --cov=src --cov-report=term`
4. `docker compose exec api python scripts/quick_test.py`
5. `docker compose exec api uv run alembic current`

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
docker compose -f infra/docker/docker-compose.yml --profile tools up -d
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
docker compose ps
docker compose logs -f api
```
