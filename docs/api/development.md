# API Development Guide

> **Note**: This documentation is for the FastAPI backend located at `apps/api/fastapi/`

Complete guide for developing with the FastAPI backend, including Docker setup, scripts, and best practices.

## Running from monorepo root vs app directory

- **From root:** `pnpm start` starts shared infra (Postgres, Adminer, Mailcatcher) and the FastAPI app. Use `pnpm stop`, `pnpm status`, and `pnpm reset` to control services.
- **From app directory:** `cd apps/api/fastapi`, then `docker compose watch` for API-only with hot reload (brings up its own stack: DB, API, Adminer, MailCatcher, Traefik).

## Quick Start

### First Time Setup

```bash
cd apps/api/fastapi

# 1. Copy environment file
cp .env.example .env

# 2. Edit .env with your settings
nano .env

# 3. Start services (with hot reload)
docker compose watch

# 4. Verify everything works
docker compose exec api python scripts/quick_test.py
```

### Access Your Application

- **API Documentation**: http://localhost:8000/docs
- **API (Alternative Docs)**: http://localhost:8000/redoc
- **Database UI (Adminer)**: http://localhost:8080
- **Email Testing (MailCatcher)**: http://localhost:1080
- **Traefik Dashboard**: http://localhost:8090

## 🐳 Docker Development

### Docker Compose Watch

Start the local stack with hot-reload enabled:

```bash
cd apps/api/fastapi
docker compose watch
```

This command will:

- Build and start all services (database, API, adminer, mailcatcher, traefik)
- Enable automatic file synchronization for instant updates
- Restart the API server when you change Python files
- Rebuild the container when `pyproject.toml` changes

### Docker Compose Watch Configuration

The watch mode is configured with:

#### Sync Actions (Instant Updates)

- `./src` → `/app/src` - Python source code
- `./alembic` → `/app/alembic` - Database migrations
- `./templates` → `/app/templates` - Email templates
- `./scripts` → `/app/scripts` - Utility scripts

#### Rebuild Actions (Container Restart)

- `./pyproject.toml` - When dependencies change

#### Ignored Files

The watch ignores:

- `__pycache__/`
- `*.pyc`, `*.pyo`, `*.pyd`
- `.pytest_cache/`

## 🛠️ Development Workflow

### Making Code Changes

1. Edit any file in `src/`, `alembic/`, `templates/`, or `scripts/`
2. Changes are automatically synced to the container
3. FastAPI dev server auto-reloads
4. See changes immediately at http://localhost:8000

### Adding Dependencies

1. Edit `pyproject.toml`
2. The container will automatically rebuild
3. Wait for the rebuild to complete

### Viewing Logs

Check all logs:

```bash
docker compose logs
```

Check specific service logs:

```bash
docker compose logs api
docker compose logs db
docker compose logs mailcatcher
```

Follow logs in real-time:

```bash
docker compose logs -f api
```

## 📜 Development Scripts

### Main Development Tool (`dev.sh`)

**Your primary development command center.**

```bash
./scripts/dev.sh [command]
```

**Commands:**

- `start` - Start all services with watch mode
- `stop` - Stop all services
- `restart` - Restart all services
- `logs` - Show logs from all services
- `logs-api` - Show API logs only
- `logs-db` - Show database logs only
- `shell` - Open shell in API container
- `db-shell` - Open PostgreSQL shell
- `migrate` - Run database migrations
- `migration "message"` - Create new migration
- `test` - Run tests
- `test-cov` - Run tests with coverage
- `clean` - Stop and remove all containers and volumes
- `rebuild` - Rebuild containers from scratch
- `status` - Show status of all services

**Examples:**

```bash
./scripts/dev.sh start          # Start development
./scripts/dev.sh logs-api       # Watch API logs
./scripts/dev.sh shell          # Open shell in container
./scripts/dev.sh migration "add user roles"  # Create migration
./scripts/dev.sh test-cov       # Run tests with coverage
```

### Code Quality Scripts

#### Format Code

```bash
./scripts/format.sh
```

- Fixes auto-fixable linting issues
- Formats all code in `src/` and `scripts/`
- Uses Ruff for fast, modern formatting

#### Check Code Quality

```bash
./scripts/lint.sh
```

**Checks:**

- ✅ Type checking with `mypy`
- ✅ Linting with `ruff check`
- ✅ Format checking with `ruff format --check`

### Testing Scripts

#### Quick API Test

```bash
docker compose exec api python scripts/quick_test.py
```

**7 Tests:**

1. ✅ API Health Check
2. ✅ Router Structure (6 tag groups)
3. ✅ Enhanced Documentation
4. ✅ User Registration
5. ✅ Login Flow
6. ✅ Authenticated Endpoints
7. ✅ Constants Usage

**Perfect for:**

- Quick validation after changes
- CI/CD pipelines
- Deployment verification

#### Database Seeding

```bash
python scripts/seed_data.py
```

**What it creates:**

- 5 test users (testuser0@weather.gd to testuser4@weather.gd)
- 3 test items per user
- Password for all: `testpass123`

**Perfect for:**

- Development testing
- Demo environments
- Frontend development

## 🗄️ Database Management

### Access Database via Adminer

- URL: http://localhost:8080
- System: PostgreSQL
- Server: db
- Username: From `POSTGRES_USER` in `.env`
- Password: From `POSTGRES_PASSWORD` in `.env`
- Database: From `POSTGRES_DB` in `.env`

### Database Migrations

Run migrations:

```bash
docker compose exec api uv run alembic upgrade head
```

Create new migration:

```bash
docker compose exec api uv run alembic revision --autogenerate -m "description"
```

### Database Operations

**Create migration:**

```bash
docker compose exec api uv run alembic revision --autogenerate -m "add users table"
```

**Apply migrations:**

```bash
docker compose exec api uv run alembic upgrade head
```

**Access database:**

- UI: http://localhost:8080
- CLI: `docker compose exec db psql -U app -d app`

## 📧 Email Testing

All emails sent by the API are caught by MailCatcher:

- View emails at: http://localhost:1080
- SMTP configured automatically in `docker-compose.override.yml`

## 🌐 Local Development Without Docker

You can also run services locally while keeping others in Docker.

### Stop the API container:

```bash
docker compose stop api
```

### Run API locally:

```bash
# Ensure database is still running in Docker
fastapi dev src/main.py
```

The API will still connect to the Docker database on `localhost:5432`.

### Stop the database container:

```bash
docker compose stop db
```

Then configure your local PostgreSQL connection in `.env`.

## 🔧 Environment Variables

Key variables in `.env`:

- `ENVIRONMENT`: local | staging | production
- `DOMAIN`: localhost (or localhost.tiangolo.com)
- `POSTGRES_*`: Database credentials
- `SECRET_KEY`: JWT secret (generate with `openssl rand -base64 32`)
- `FIRST_SUPERUSER`: Admin email
- `FIRST_SUPERUSER_PASSWORD`: Admin password

## 🧪 Testing

Run tests in container:

```bash
docker compose exec api uv run pytest
```

Run tests with coverage:

```bash
docker compose exec api uv run pytest --cov=src --cov-report=html
```

## 🏗️ Project Structure (FastAPI Best Practices)

```
apps/api/fastapi/
├── src/                          # Main application code
│   ├── auth/                     # Authentication module
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
│   ├── items/                    # Items module
│   │   └── ...                  # Same structure
│   ├── config.py                # Global configuration
│   ├── database.py              # Database connection
│   ├── models.py                # Global models
│   ├── exceptions.py            # Global exceptions
│   ├── pagination.py            # Pagination utilities
│   └── main.py                  # FastAPI app entry
├── alembic/                      # Database migrations
├── templates/                    # Email templates
├── scripts/                      # Utility scripts
├── tests/                        # Test suite
├── docker-compose.yml           # Production config
├── docker-compose.override.yml  # Development overrides
├── Dockerfile                   # Container definition
├── pyproject.toml              # Dependencies
└── .env                        # Environment variables
```

## 🎯 Common Workflows

### Starting a New Feature

```bash
# 1. Update code
git checkout -b feature/new-feature

# 2. Format code
./scripts/format.sh

# 3. Check quality
./scripts/lint.sh

# 4. Run tests
./scripts/dev.sh test-cov

# 5. Quick API test
docker compose exec api python scripts/quick_test.py
```

### Creating Database Changes

```bash
# 1. Modify models in src/*/models.py

# 2. Create migration
./scripts/dev.sh migration "describe your changes"

# 3. Review generated migration in alembic/versions/

# 4. Apply migration
./scripts/dev.sh migrate

# 5. Verify
docker compose exec api uv run alembic current
```

### Preparing for Deployment

```bash
# 1. Run pre-deployment checks
./scripts/lint.sh
./scripts/dev.sh test-cov

# 2. Create database backup (if needed)
docker compose exec db pg_dump -U app app > backup.sql

# 3. Deploy!
```

## 🛠️ Troubleshooting

### Container won't start

```bash
docker compose down
docker compose build --no-cache
docker compose watch
```

### Database connection issues

Check if database is healthy:

```bash
docker compose ps
```

View database logs:

```bash
docker compose logs db
```

### Port already in use

Stop conflicting services or change ports in `docker-compose.override.yml`:

```yaml
api:
  ports:
    - "8001:80" # Change 8000 to 8001
```

### Changes not reflecting

1. Check if watch is running: `docker compose ps`
2. Check logs: `docker compose logs -f api`
3. Restart watch: `docker compose down && docker compose watch`

### Clear everything and start fresh

```bash
docker compose down -v
docker compose build --no-cache
docker compose watch
```

## 🎓 Best Practices Followed

1. **Modular Structure**: Each domain has its own directory with router, schemas, models, service
2. **Separation of Concerns**: Business logic in service.py, routes in router.py
3. **Type Safety**: Pydantic models for validation
4. **Hot Reload**: Instant feedback during development
5. **Container Isolation**: Consistent environment across team
6. **Database Migrations**: Alembic for version control
7. **Email Testing**: MailCatcher for local email debugging

## 🎯 Next Steps

1. Start the stack: `cd apps/api/fastapi && docker compose watch`
2. Create your first module in `src/your_module/`
3. Add routes, schemas, models following the pattern in `src/auth/` or `src/items/`
4. Test your endpoints at http://localhost:8000/docs
5. Check emails at http://localhost:1080

Happy coding! 🚀
