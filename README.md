# Grenmet

A monorepo containing Grenmet applications, shared packages, and deployment infrastructure.

## Workspace Layout

```
grenmet/
├── apps/                       # Application code
│   ├── api/
│   │   ├── fastapi/            # FastAPI backend (Python) — auth, HR, CAP, webhooks
│   │   └── honoapi/            # Hono API (stub — planned weather data proxy)
│   └── web/
│       ├── admin-gms/          # Internal GMS ops dashboard — also hosts the consolidated CAP/HR/wxwatch/wxproducts/salesbus modules
│       ├── auth/               # Shared sign-in/sign-up gateway for all apps
│       ├── hurricaneplan/      # Public hurricane preparedness content site (MDX)
│       ├── mbia/               # Maurice Bishop International Airport public site
│       ├── signal/             # Grenada Signal — civic-media reader (static MDX)
│       └── spicewx/            # Public GMS weather website (design system reference app)
├── packages/
│   ├── api-client/             # TypeScript API client (Kubb-generated from OpenAPI)
│   ├── auth/                   # Shared auth/session package (@grenmet/auth)
│   ├── email-templates/        # Shared React Email templates
│   ├── mdx/                    # Shared MDX processing plugins
│   ├── theme/                  # Shared theme and preference utilities
│   ├── tsconfig/               # Shared TypeScript config
│   └── ui/                     # Shared UI component library (@grenmet/ui) + GrenMet design system
├── docs/
│   ├── api/                    # API development, testing, and deployment guides
│   ├── architecture.md         # GMS service architecture and strategic product catalogue
│   ├── design-system.md        # GrenMet v1 design system — tokens, Figma bridge, compliance
│   ├── deployment.md           # Deployment entry points summary
│   └── env.md                  # Environment variable reference for all apps
├── infra/
│   └── docker/                 # Shared infrastructure (Postgres, Adminer, Mailcatcher)
├── scripts/
│   ├── scrapy-wxwatch/         # Weather images downloader (Scrapy, Python/uv)
│   └── sutron-collector/       # Sutron weather-station edge collector
├── geonetcast/                 # GNC-A satellite and NWP training resources
├── notebooks/                  # Data / exploration
├── pyproject.toml              # Root uv workspace definition
├── uv.lock                     # Shared Python dependency lock
└── README.md                   # This file
```

**notebooks/** contains data exploration assets (for example cartopy and ECMWF experiments). See [notebooks/README.md](notebooks/README.md).

## Quick Start

### Recommended (from repo root)

```bash
# Install JS dependencies
pnpm install

# Create the two env files required by pnpm start (first time)
cp infra/docker/.env.local.example infra/docker/.env.local
cp apps/api/fastapi/.env.local.example apps/api/fastapi/.env.local

# Start shared infra + FastAPI
pnpm start

# Optional: run all workspace dev tasks
pnpm dev
```

- **API Swagger**: http://localhost:8000/swagger
- **API ReDoc**: http://localhost:8000/redoc
- **API Scalar**: http://localhost:8000/scalar
- **OpenAPI JSON**: http://localhost:8000/api/v1/openapi.json
- **Health Check**: http://localhost:8000/api/v1/utils/health-check/
- **Adminer**: http://localhost:8080
- **MailCatcher**: http://localhost:1080

For all available scripts, see [Scripts](#scripts) below.

### API-only workflow (from app directory)

If you want to run FastAPI directly from its app directory, ensure shared infra is already up:

```bash
# from repo root
docker compose -p grenmet --env-file infra/docker/.env.local \
  -f infra/docker/docker-compose.yml --profile tools up -d

# then
cd apps/api/fastapi
cp .env.local.example .env.local
docker compose -p grenmet-api --env-file .env.local \
  -f docker-compose.yml watch
```

See [docs/api/development.md](docs/api/development.md) for details.

### Web apps

From repo root:

- [admin-gms](apps/web/admin-gms/README.md) – `pnpm dev:web:admin`
- [auth](apps/web/auth/README.md) – `pnpm dev:web:auth`
- [hurricaneplan](apps/web/hurricaneplan/README.md) – `pnpm dev:web:hurricane`
- [mbia](apps/web/mbia) – `pnpm dev:web:mbia`
- [signal](apps/web/signal/README.md) – `pnpm dev:web:signal`
- [spicewx](apps/web/spicewx/README.md) – `pnpm dev:web:spicewx`

### Python workspace

Python projects use one root uv workspace, lockfile, Python version, and virtual
environment. Each member keeps its dependencies in its own `pyproject.toml`;
select a member with `--package`, similar to pnpm's `--filter`:

```bash
uv sync --frozen --package fast-back
uv run --frozen --package fast-back pytest

uv sync --frozen --package wxwatch
uv run --frozen --package wxwatch python scripts/scrapy-wxwatch/run_crawlers.py goes19

uv sync --frozen --package sutron-collector
uv run --frozen --package sutron-collector pytest scripts/sutron-collector/tests

uv sync --frozen --package notebooks
uv run --frozen --package notebooks jupyter lab
```

Do not run a bare `uv sync` at the root. The root project is virtual, and
`geonetcast` must only be synced inside the devcontainer because it builds
against native GDAL and HDF4 libraries.

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
| `pnpm dev`                | All apps (Turbo dev in parallel)        |
| `pnpm dev:web:admin`      | [admin-gms](apps/web/admin-gms)         |
| `pnpm dev:web:auth`       | [auth](apps/web/auth)                   |
| `pnpm dev:web:hurricane`  | [hurricaneplan](apps/web/hurricaneplan) |
| `pnpm dev:web:mbia`       | [mbia](apps/web/mbia)                   |
| `pnpm dev:web:signal`     | [signal](apps/web/signal)               |
| `pnpm dev:web:spicewx`    | [spicewx](apps/web/spicewx)             |
| `pnpm dev:honoapi`        | [Hono API](apps/api/honoapi)            |

API (FastAPI): use `pnpm start` for infra + API, or follow the fully qualified
Compose commands in [docs/api/development.md](docs/api/development.md) for an
API-only workflow.

### Build and quality

| Script                                  | Description                                                        |
| --------------------------------------- | ------------------------------------------------------------------ |
| `pnpm build`                            | Build all (Turbo)                                                  |
| `pnpm lint`                             | Lint all                                                           |
| `pnpm check` / `check:fix` / `check:ci` | Check / fix / CI                                                   |
| `pnpm type-check`                       | Type-check all                                                     |
| `pnpm fix`                              | Run ultracite fix                                                  |
| `pnpm generate:api-client`              | Generate API client (uses current `apps/api/fastapi/openapi.json`) |
| `pnpm check:drift`                      | Verify generated API client is not older than `openapi.json`       |
| `pnpm clean`                            | Remove node_modules (git clean)                                    |

Tests: run per app (API: see [docs/api/testing.md](docs/api/testing.md); web: see each app's README).

### Scripts / tools (not in package.json)

- **scrapy-wxwatch** – [scripts/scrapy-wxwatch](scripts/scrapy-wxwatch): Weather images downloader (Scrapy). From repo root: `uv sync --frozen --package wxwatch && uv run --frozen --package wxwatch python scripts/scrapy-wxwatch/run_crawlers.py goes19`. Replace `goes19` with another source, or pass `all` explicitly for a manual full run. Requires Python 3.13+; see [scripts/scrapy-wxwatch/pyproject.toml](scripts/scrapy-wxwatch/pyproject.toml). Optional: [scripts/scrapy-wxwatch/README.md](scripts/scrapy-wxwatch/README.md).
- **sutron-collector** – [scripts/sutron-collector](scripts/sutron-collector): Edge collector for the Sutron automatic weather station at Maurice Bishop International Airport. Exercise fixture mode before connecting to station hardware; see [scripts/sutron-collector/README.md](scripts/sutron-collector/README.md).

## Documentation

### Reference guides

| Document | Description |
| --- | --- |
| [Technical Overview](docs/technical-overview.md) | How the codebase fits together — monorepo structure, auth flow, shared packages, databases |
| [Contributing](CONTRIBUTING.md) | Branching strategy, commit conventions, pre-commit checklist, PR process, code conventions |
| [Deployment guide](docs/deployment.md) | Full step-by-step: GitHub setup, server provisioning, DNS, runners, secrets, staging and production |
| [Infrastructure & Operations](docs/infrastructure.md) | Runtime topology, health checks, incident triage, backups, restore, access review |
| [Security Baseline](docs/security.md) | Implemented controls, security rules, authz model, and known gaps |
| [API Contracts](docs/api/contracts.md) | API conventions, generated client policy, errors, pagination, health, public CAP feeds |
| [Data Architecture](docs/data-architecture.md) | Database ownership, migrations, backups, and data-governance rules |
| [Environment variables](docs/env.md) | All env vars for every app — what they do, which file, which service |
| [Troubleshooting](docs/troubleshooting.md) | Common dev issues — auth loops, stale types, Turbo cache, port conflicts, DB migrations |
| [GMS Service Architecture](docs/architecture.md) | GMS service strategy, product catalogue, warning model, design system lanes |
| [Service and Product Catalogue](docs/internal/service-catalogue.md) | Full definitions for all 13 GMS services — purpose, products, risk frameworks, implementation notes |
| [Warning Operations](docs/internal/warning-operations.md) | Implemented CAP lifecycle, permissions, audit events, public feeds, and gaps |
| [Architecture Decisions](docs/adr/) | ADRs for monorepo, auth, database ownership, generated client, deployment, design system, CAP lifecycle |
| [Design System](docs/design-system.md) | GrenMet v1 tokens, current Figma file map, component handoff, compliance guide, audit commands |
| [API Development](docs/api/development.md) | FastAPI local development guide |
| [API Testing](docs/api/testing.md) | FastAPI test and validation commands |
| [API Deployment](docs/api/deployment.md) | FastAPI deployment steps |
| [Programme docs](docs/internal/) | Roadmap, DTO Terms of Reference, end-of-period report template |

### App READMEs

| App | README |
| --- | --- |
| admin-gms | [apps/web/admin-gms/README.md](apps/web/admin-gms/README.md) |
| auth | [apps/web/auth/README.md](apps/web/auth/README.md) |
| Hono API | [apps/api/honoapi/README.md](apps/api/honoapi/README.md) |
| hurricaneplan | [apps/web/hurricaneplan/README.md](apps/web/hurricaneplan/README.md) |
| mbia | [apps/web/mbia](apps/web/mbia) |
| signal | [apps/web/signal/README.md](apps/web/signal/README.md) |
| spicewx | [apps/web/spicewx/README.md](apps/web/spicewx/README.md) |
| FastAPI | [apps/api/fastapi/README.md](apps/api/fastapi/README.md) |

## Development

### Prerequisites

- Docker & Docker Compose
- Python 3.13+ (FastAPI and Python workspace tools)
- Node.js 24 (for Web)
- pnpm 10+ (for Web)

### Packages

- **@grenmet/api-client** - Shared API client; generate with `pnpm generate:api-client`.
- **@grenmet/auth** - Shared auth/session package for web apps.
- **@grenmet/email-templates** - Shared React Email templates.
- **@grenmet/mdx** - Shared remark, rehype, and recma plugins.
- **@grenmet/theme** - Shared theme, layout, and preference utilities.
- **@grenmet/tsconfig** - Shared TypeScript config.
- **@grenmet/ui** - Shared UI component library and design-system primitives.

### Code quality

Each app has its own code quality tools:

**API (Python)**

```bash
cd apps/api/fastapi
./scripts/format.sh    # Format code
./scripts/lint.sh      # Lint code
```

**Web (TypeScript)**

See each app's README (e.g. `apps/web/admin-gms`, `apps/web/spicewx`).

### Dependencies

- **Python**: member `pyproject.toml` files with the root `uv.lock` (uv workspace)
- **Web**: per-app `package.json` (pnpm)

## Infrastructure

- `pnpm start` starts shared services from [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml) (Postgres, Adminer, Mailcatcher) and the FastAPI app from `apps/api/fastapi`.
- Use `pnpm stop`, `pnpm status`, and `pnpm reset` from root to control services (see [Scripts](#scripts)).
- For API-only development, start shared infrastructure first and use the
  commands in [docs/api/development.md](docs/api/development.md).

### Environment files

- Shared infrastructure: copy `infra/docker/.env.local.example` to
  `infra/docker/.env.local`.
- FastAPI: copy `apps/api/fastapi/.env.local.example` to
  `apps/api/fastapi/.env.local`.
- Per-app variables and deployment layering: [docs/env.md](docs/env.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide: branching strategy, commit conventions, pre-commit checklist, PR process, and code conventions.

Quick reference:

1. Branch from `dev` → `feature/your-feature-name`
2. Make changes; run `pnpm fix && pnpm type-check` before committing
3. Open a PR against `dev` with a [Conventional Commits](https://www.conventionalcommits.org/) title

## License

Proprietary — Grenada Airports Authority (GAA) / Grenada Meteorological Service (GMS)

### Shared dependency versions

Shared dependency versions are defined in `pnpm-workspace.yaml` under the `catalog:` key. Workspace packages reference them with `"package-name": "catalog:"`. To add or change a shared version, edit the catalog and run `pnpm install`.
