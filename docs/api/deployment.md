# API Deployment

Deployment guide for the FastAPI service at `apps/api/fastapi`.

## Prerequisites

- Docker and Docker Compose
- Configured environment file (`apps/api/fastapi/.env`)
- Reachable PostgreSQL instance

Create the local env file if needed:

```bash
cp apps/api/fastapi/.env.example apps/api/fastapi/.env
```

## Build Production Image

```bash
docker build -f apps/api/fastapi/Dockerfile.prod -t grenmet-api:prod apps/api/fastapi
```

## Run Database Migrations

If you are deploying into the local shared Docker network (`grenmet`):

```bash
docker run --rm \
	--network grenmet \
	--env-file apps/api/fastapi/.env \
	-e POSTGRES_SERVER=grenmet-postgres \
	grenmet-api:prod \
	uv run alembic upgrade head
```

## Start API Container

```bash
docker run --rm \
	--name grenmet-api \
	--network grenmet \
	--env-file apps/api/fastapi/.env \
	-e POSTGRES_SERVER=grenmet-postgres \
	-e SMTP_HOST=grenmet-mailcatcher \
	-e SMTP_PORT=1025 \
	-e SMTP_TLS=false \
	-p 8000:8000 \
	grenmet-api:prod
```

## Smoke Checks

```bash
curl http://localhost:8000/api/v1/utils/health-check/
curl http://localhost:8000/api/v1/openapi.json
```

In `local` and `staging` environments, docs are exposed at:

- `http://localhost:8000/swagger`
- `http://localhost:8000/redoc`
- `http://localhost:8000/scalar`

## Rollback

Rollback strategy is image-tag based:

1. Keep previous successful API image tags.
2. Stop the current API container.
3. Start the previous known-good image with the same env and network settings.

## Notes

- Shared infra compose files are in `infra/docker/`.
- CI validation for API, quality checks, and OpenAPI export runs in `.github/workflows/ci.yml`.
