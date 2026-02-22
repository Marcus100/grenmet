# Grenmet

A monorepo containing Grenmet applications and infrastructure.

## Project Structure

```
grenmet/
├── apps/                       # Application code
│   ├── api/
│   │   ├── fastapi/            # FastAPI backend (Python)
│   │   └── honoapi/            # Hono API
│   └── web/
│       ├── admin-gms/          # Admin dashboard
│       ├── wxwatch/            # WxWatch app
│       └── templates-draft/    # Templates draft
├── packages/
│   ├── api-client/             # Shared API client
│   └── tsconfig/               # Shared TypeScript config
├── docs/
│   └── api/                    # API documentation
├── infra/
│   └── docker/                 # Shared infrastructure (Postgres, Adminer, Mailcatcher)
├── scripts/
│   └── scrapy-wxwatch/         # Weather images downloader (Scrapy, Python/uv)
├── notebooks/                  # Data / exploration
└── README.md                   # This file
```

**notebooks/** – Data and exploration (e.g. cartopy, ECMWF). See [notebooks/README.md](notebooks/README.md).

## Quick Start

### From monorepo root

```bash
# Install dependencies
pnpm install

# Start shared infra + FastAPI
pnpm start

# Or run Turbo dev (all apps)
pnpm dev
```

- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/v1/utils/health-check/
- **Hono API**: `pnpm dev:honoapi`

For all available scripts, see [Scripts](#scripts) below.

### API only (from app directory)

```bash
cd apps/api/fastapi
cp .env.example .env
docker compose watch
```

See [API Development Guide](docs/api/development.md) for full documentation.

### Web apps

Each web app has its own README. From root you can run:

- [admin-gms](apps/web/admin-gms/README.md) – `pnpm dev:web:admin`
- [wxwatch](apps/web/wxwatch/README.md) – `pnpm dev:web:wxwatch`
- [templates-draft](apps/web/templates-draft/README.md) – `pnpm dev:web:templates-draft`

See each app's README for setup and run instructions.

## Scripts

All commands are run from the monorepo root.

### Run / infrastructure

| Script        | Description                                                       |
| ------------- | ----------------------------------------------------------------- |
| `pnpm start`  | Start shared infra (Postgres, Adminer, Mailcatcher) + FastAPI app |
| `pnpm stop`   | Stop FastAPI stack and shared infra                               |
| `pnpm status` | Show status of infra and FastAPI containers                       |
| `pnpm reset`  | Wipe infra volumes and start Postgres only (fresh DB)             |

### Development – run one or all apps

| Script                         | App / scope                                 |
| ------------------------------ | ------------------------------------------- |
| `pnpm dev`                     | All apps (Turbo dev in parallel)            |
| `pnpm dev:web`                 | All web apps                                |
| `pnpm dev:web:admin`           | [admin-gms](apps/web/admin-gms)             |
| `pnpm dev:web:wxwatch`         | [wxwatch](apps/web/wxwatch)                 |
| `pnpm dev:web:templates-draft` | [templates-draft](apps/web/templates-draft) |
| `pnpm dev:honoapi`             | [Hono API](apps/api/honoapi)                |

API (FastAPI): use `pnpm start` for infra + API, or `cd apps/api/fastapi && docker compose watch` for API-only.

### Build and quality

| Script                                  | Description                                                         |
| --------------------------------------- | ------------------------------------------------------------------- |
| `pnpm build`                            | Build all (Turbo)                                                   |
| `pnpm build:web`                        | Build web apps only                                                 |
| `pnpm build:packages`                   | Build packages only                                                 |
| `pnpm lint`                             | Lint all                                                            |
| `pnpm check` / `check:fix` / `check:ci` | Check / fix / CI                                                    |
| `pnpm type-check`                       | Type-check all                                                      |
| `pnpm test`                             | Test all                                                            |
| `pnpm fix`                              | Run ultracite fix                                                   |
| `pnpm generate:api-client`              | Generate API client from [packages/api-client](packages/api-client) |
| `pnpm clean`                            | Remove node_modules (git clean)                                     |

### Scripts / tools (not in package.json)

- **scrapy-wxwatch** – [scripts/scrapy-wxwatch](scripts/scrapy-wxwatch): Weather images downloader (Scrapy). From repo root: `cd scripts/scrapy-wxwatch && uv sync && uv run python run_crawlers.py` (or `uv run scrapy crawl <spider>`). Requires Python 3.13+; see [scripts/scrapy-wxwatch/pyproject.toml](scripts/scrapy-wxwatch/pyproject.toml). Optional: [scripts/scrapy-wxwatch/README.md](scripts/scrapy-wxwatch/README.md).

## Documentation

| App | Development                                                                                                                             | Testing                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| API | [Development](docs/api/development.md)                                                                                                  | [Testing](docs/api/testing.md) |
| Web | [admin-gms](apps/web/admin-gms/README.md), [wxwatch](apps/web/wxwatch/README.md), [templates-draft](apps/web/templates-draft/README.md) | See app README                 |

## Development

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for API)
- Node.js 22+ (for Web)
- pnpm 10+ (for Web)

### Packages

- **api-client** – Shared API client; generate with `pnpm generate:api-client`.
- **tsconfig** – Shared TypeScript config for the monorepo.

### Code quality

Each app has its own code quality tools:

**API (Python)**

```bash
cd apps/api/fastapi
./scripts/format.sh    # Format code
./scripts/lint.sh      # Lint code
```

**Web (TypeScript)**

See each app's README (e.g. `apps/web/admin-gms`, `apps/web/wxwatch`).

### Dependencies

- **API**: `apps/api/fastapi/pyproject.toml` (uv)
- **Web**: per-app `package.json` (pnpm)

## Infrastructure

- `pnpm start` starts shared services from [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml) (Postgres, Adminer, Mailcatcher) and the FastAPI app from `apps/api/fastapi`.
- Use `pnpm stop`, `pnpm status`, and `pnpm reset` from root to control services (see [Scripts](#scripts)).
- For API-only development: `cd apps/api/fastapi` and run `docker compose watch`.

### Environment files

- API: `apps/api/fastapi/.env.example` — copy to `.env` and set values as needed.

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Ensure all tests pass
4. Submit a PR to `dev`

## License

Proprietary - Grenmet

Production URLs (when deployed) — to be documented.

### Shared dependency versions

Shared dependency versions are defined in `pnpm-workspace.yaml` under the `catalog:` key. Workspace packages reference them with `"package-name": "catalog:"`. To add or change a shared version, edit the catalog and run `pnpm install`.
