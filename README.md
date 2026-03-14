# Grenmet

A monorepo containing Grenmet applications, shared packages, and deployment infrastructure.

## Workspace Layout

```
grenmet/
├── apps/                       # Application code
│   ├── api/
│   │   ├── fastapi/            # FastAPI backend (Python)
│   │   └── honoapi/            # Hono API
│   ├── mobile/                 # Mobile app(s)
│   └── web/
│       ├── admin-gms/          # Admin dashboard
│       ├── auth/               # Shared auth gateway
│       ├── hurricaneplan/      # Hurricane planning site
│       ├── spicewx/            # SpiceWx app
│       ├── templates-draft/    # Templates prototype app
│       ├── wxproducts/         # WxProducts app
│       ├── wxwatch/            # WxWatch app
├── packages/
│   ├── api-client/             # Shared API client (generated from OpenAPI)
│   ├── auth/                   # Shared auth package
│   ├── tsconfig/               # Shared TypeScript config
│   └── ui/                     # Shared UI package(s)
├── docs/
│   ├── api/                    # API-specific docs
│   └── deployment.md           # Monorepo deployment overview
├── infra/
│   └── docker/                 # Shared infrastructure (Postgres, Adminer, Mailcatcher)
├── scripts/
│   └── scrapy-wxwatch/         # Weather images downloader (Scrapy, Python/uv)
├── notebooks/                  # Data / exploration
└── README.md                   # This file
```

**notebooks/** contains data exploration assets (for example cartopy and ECMWF experiments). See [notebooks/README.md](notebooks/README.md).

## Quick Start

### Recommended (from repo root)

```bash
# Install JS dependencies
pnpm install

# Create API env file (first time)
cp apps/api/fastapi/.env.example apps/api/fastapi/.env

# Start shared infra + FastAPI
pnpm start

# Optional: run all workspace dev tasks
pnpm dev
```

- **API Swagger**: http://localhost:8000/swagger
- **API ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/api/v1/openapi.json
- **Health Check**: http://localhost:8000/api/v1/utils/health-check/
- **Adminer**: http://localhost:8080
- **MailCatcher**: http://localhost:1080

For all available scripts, see [Scripts](#scripts) below.

### API-only workflow (from app directory)

If you want to run FastAPI directly from its app directory, ensure shared infra is already up:

```bash
# from repo root
docker compose -f infra/docker/docker-compose.yml --profile tools up -d

# then
cd apps/api/fastapi
cp .env.example .env
docker compose watch
```

See [docs/api/development.md](docs/api/development.md) for details.

### Web apps

From repo root:

- [admin-gms](apps/web/admin-gms/README.md) – `pnpm dev:web:admin`
- [auth](apps/web/auth/README.md) – `pnpm dev:web:auth`
- [hurricaneplan](apps/web/hurricaneplan/README.md) – `pnpm dev:web:hurricane`
- [spicewx](apps/web/spicewx/README.md) – `pnpm dev:web:spicewx`
- [wxwatch](apps/web/wxwatch/README.md) – `pnpm dev:web:wxwatch`
- [templates-draft](apps/web/templates-draft/README.md) – `pnpm dev:web:templates-draft`
- [wxproducts](apps/web/wxproducts/README.md) – `pnpm dev:web:wxproducts`
- [hr](apps/web/hr) – `pnpm dev:web:hr`

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
| `pnpm dev:web:admin`           | [admin-gms](apps/web/admin-gms)             |
| `pnpm dev:web:auth`            | [auth](apps/web/auth)                       |
| `pnpm dev:web:hurricane`       | [hurricaneplan](apps/web/hurricaneplan)     |
| `pnpm dev:web:spicewx`         | [spicewx](apps/web/spicewx)                 |
| `pnpm dev:web:wxwatch`         | [wxwatch](apps/web/wxwatch)                 |
| `pnpm dev:web:templates-draft` | [templates-draft](apps/web/templates-draft) |
| `pnpm dev:web:wxproducts`      | [wxproducts](apps/web/wxproducts)           |
| `pnpm dev:web:hr`              | [hr](apps/web/hr)                           |
| `pnpm dev:honoapi`             | [Hono API](apps/api/honoapi)                |

API (FastAPI): use `pnpm start` for infra + API, or `cd apps/api/fastapi && docker compose watch` for API-only.

### Build and quality

| Script                                  | Description                                                        |
| --------------------------------------- | ------------------------------------------------------------------ |
| `pnpm build`                            | Build all (Turbo)                                                  |
| `pnpm lint`                             | Lint all                                                           |
| `pnpm check` / `check:fix` / `check:ci` | Check / fix / CI                                                   |
| `pnpm type-check`                       | Type-check all                                                     |
| `pnpm fix`                              | Run ultracite fix                                                  |
| `pnpm generate:api-client`              | Generate API client (uses current `apps/api/fastapi/openapi.json`) |
| `pnpm clean`                            | Remove node_modules (git clean)                                    |

Tests: run per app (API: see [docs/api/testing.md](docs/api/testing.md); web: see each app's README).

### Scripts / tools (not in package.json)

- **scrapy-wxwatch** – [scripts/scrapy-wxwatch](scripts/scrapy-wxwatch): Weather images downloader (Scrapy). From repo root: `cd scripts/scrapy-wxwatch && uv sync && uv run python run_crawlers.py` (or `uv run scrapy crawl <spider>`). Requires Python 3.13+; see [scripts/scrapy-wxwatch/pyproject.toml](scripts/scrapy-wxwatch/pyproject.toml). Optional: [scripts/scrapy-wxwatch/README.md](scripts/scrapy-wxwatch/README.md).

## Documentation

| App | Development                                                                                                                                                                                                                                    | Testing                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| API | [Development](docs/api/development.md)                                                                                                                                                                                                         | [Testing](docs/api/testing.md) |
| Web | [admin-gms](apps/web/admin-gms/README.md), [wxwatch](apps/web/wxwatch/README.md), [templates-draft](apps/web/templates-draft/README.md), [wxproducts](apps/web/wxproducts/README.md), [spicewx](apps/web/spicewx/README.md), [hr](apps/web/hr) | See app README                 |

## Development

### Prerequisites

- Docker & Docker Compose
- Python 3.10+ (FastAPI) and Python 3.13+ (notebooks and scrapy-wxwatch)
- Node.js 22+ (for Web)
- pnpm 10+ (for Web)

### Packages

- **@grenmet/api-client** - Shared API client; generate with `pnpm generate:api-client`.
- **@grenmet/auth** - Shared auth/session package for web apps.
- **@grenmet/tsconfig** - Shared TypeScript config.
- **packages/ui** - Shared UI package(s).

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

### Shared dependency versions

Shared dependency versions are defined in `pnpm-workspace.yaml` under the `catalog:` key. Workspace packages reference them with `"package-name": "catalog:"`. To add or change a shared version, edit the catalog and run `pnpm install`.
