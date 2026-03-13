# Deployment Overview

This document summarizes deployment entry points for the Grenmet monorepo.

## Scope

- Shared infrastructure compose files: `infra/docker/`
- FastAPI app compose file: `apps/api/fastapi/docker-compose.yml`
- FastAPI production image definition: `apps/api/fastapi/Dockerfile.prod`

## Local Validation Stack

Use the root scripts for local deployment-like validation:

```bash
pnpm start
pnpm status
pnpm stop
```

`pnpm start` launches:

- Shared infra from `infra/docker/docker-compose.yml` (Postgres, Adminer, MailCatcher)
- FastAPI stack from `apps/api/fastapi/docker-compose.yml`

### Local service endpoints

- FastAPI Swagger: `http://localhost:8000/swagger`
- FastAPI ReDoc: `http://localhost:8000/redoc`
- Health endpoint: `http://localhost:8000/api/v1/utils/health-check/`
- Adminer: `http://localhost:8080`
- MailCatcher: `http://localhost:1080`

## Staging and Production Infra Baselines

The repository includes baseline compose files:

- `infra/docker/docker-compose.staging.yml`
- `infra/docker/docker-compose.prod.yml`

Bring up shared infra from either file:

```bash
docker compose -f infra/docker/docker-compose.staging.yml --profile tools up -d
docker compose -f infra/docker/docker-compose.prod.yml --profile tools up -d
```

## FastAPI Production Image

Build the production API image:

```bash
docker build -f apps/api/fastapi/Dockerfile.prod -t grenmet-api:prod apps/api/fastapi
```

For API-specific rollout steps (migrations, runtime command, smoke checks), see `docs/api/deployment.md`.
