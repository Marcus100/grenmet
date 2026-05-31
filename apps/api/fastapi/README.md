# FastAPI Backend (`grenmet-api`)

FastAPI backend for the GMS platform. Covers the Auth and HR domains.

- **Auth** (`/api/v1/auth/`, `/api/v1/login/`) — users, roles, permissions, sessions, password recovery
- **HR** (`/api/v1/hr/`) — timesheets, rosters, shifts, leave requests, shift swaps, employment profiles, workflows

Runs in Docker only — not managed by pnpm. Part of the Grenmet monorepo.

## Quick Start

From the repo root (recommended — starts shared infra + API together):

```bash
pnpm install
cp apps/api/fastapi/.env.local.example apps/api/fastapi/.env.local
pnpm start
```

Or from this directory (API-only — requires shared infra already running):

```bash
cp .env.local.example .env.local
docker compose watch
```

### Service endpoints

- Swagger UI: `http://localhost:8000/swagger`
- ReDoc: `http://localhost:8000/redoc`
- Scalar: `http://localhost:8000/scalar`
- OpenAPI JSON: `http://localhost:8000/api/v1/openapi.json`
- Health check: `http://localhost:8000/api/v1/utils/health-check/`
- Adminer: `http://localhost:8080`
- MailCatcher: `http://localhost:1080`

## Documentation

- [Development guide](../../../docs/api/development.md) — Docker workflows, scripts, seeding, troubleshooting
- [Testing guide](../../../docs/api/testing.md) — test commands, coverage, pre-deployment checks
- [Deployment guide](../../../docs/api/deployment.md) — production image, migrations, smoke checks

## Project Structure

```
apps/api/fastapi/
├── src/                          # Application code
│   ├── auth/                     # Auth domain
│   │   ├── routers/              # Split auth routers
│   │   │   ├── login.py          # Login endpoints
│   │   │   ├── users.py          # User management
│   │   │   ├── roles.py          # Role management
│   │   │   └── permissions.py    # Permission management
│   │   ├── constants.py          # Auth messages
│   │   ├── models.py             # User, Role, Permission models
│   │   ├── schemas.py            # Pydantic schemas
│   │   ├── service.py            # Business logic
│   │   └── dependencies.py       # Auth dependencies
│   ├── hr/                       # HR domain
│   │   ├── routers/              # HR routers
│   │   ├── models.py             # HR models
│   │   ├── schemas.py            # Pydantic schemas
│   │   └── service.py            # Business logic
│   ├── utils/                    # Utilities
│   │   └── router.py             # Health check, test email
│   ├── config.py                 # Settings (Pydantic)
│   ├── database.py               # DB connection, naming conventions
│   ├── dependencies.py           # Global dependencies
│   ├── email.py                  # Email functionality
│   ├── main.py                   # FastAPI app
│   └── pagination.py             # Pagination helpers
├── tests/                        # Test suite
├── scripts/                      # Development and seed scripts
├── email-templates/              # MJML email templates
├── alembic/                      # Database migrations
├── docker-compose.yml            # Docker Compose config
├── Dockerfile                    # Development container
├── Dockerfile.prod               # Production container
├── pyproject.toml                # Python dependencies (uv)
└── .env.local                    # Local environment (gitignored)
```

## Key Environment Variables

| Variable | Description | Example |
|---|---|---|
| `ENVIRONMENT` | Runtime environment | `local`, `staging`, `production` |
| `DOMAIN` | Base domain | `localhost` |
| `SECRET_KEY` | JWT signing secret | `openssl rand -base64 32` |
| `POSTGRES_*` | Database credentials | See `.env.local.example` |
| `FIRST_SUPERUSER` | Bootstrap admin email | `admin@weather.gd` |
| `FIRST_SUPERUSER_PASSWORD` | Bootstrap admin password | Strong password |

Full variable reference: [docs/env.md](../../../docs/env.md)

## Tech Stack

- **FastAPI** — Python web framework
- **PostgreSQL** — Database
- **SQLModel** (built on SQLAlchemy) — ORM
- **Alembic** — Database migrations
- **Pydantic** — Data validation
- **uv** — Python package manager
- **Docker** — Containerisation

## License

Proprietary — Grenada Airports Authority (GAA) / Grenada Meteorological Service (GMS)
