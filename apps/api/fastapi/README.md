# Grenmet – FastAPI backend

A modern FastAPI backend following [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices) with comprehensive development workflow.

## 🚀 Quick Start

### Prerequisites

- Docker Desktop (with Docker Compose v2.22+)
- Git

### Setup

1. **Navigate to this app** (from monorepo root):

```bash
cd apps/api/fastapi
```

2. **Copy environment file**:

```bash
cp .env.example .env
```

3. **Edit `.env` and set secure values**:

```env
SECRET_KEY=your-secret-key-here  # Generate with: openssl rand -base64 32
FIRST_SUPERUSER=admin@weather.gd
FIRST_SUPERUSER_PASSWORD=your-secure-password
POSTGRES_PASSWORD=your-db-password
```

4. **Start development environment**:

```bash
docker compose watch
```

5. **Access your services**:

- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Adminer: http://localhost:8080
- MailCatcher: http://localhost:1080
- Traefik: http://localhost:8090

## Documentation

- **[Development](../../../docs/api/development.md)** – Complete development guide with Docker, scripts, and workflows
- **[Testing](../../../docs/api/testing.md)** – Testing strategies, pre-deployment checks, and quality assurance

## 🏗️ Architecture

This project follows **FastAPI Best Practices**:

1. **Netflix Dispatch Pattern**: Features organized by domain (`auth/`, `items/`, `utils/`)
2. **Router Organization**: Single Responsibility Principle
   - Auth split into: `login.py`, `users.py`, `roles.py`, `permissions.py`
   - Clear separation of concerns
3. **Constants Management**: No magic strings
   - `src/auth/constants.py` - Auth messages
   - `src/items/constants.py` - Item messages
4. **Enhanced API Documentation**: Detailed OpenAPI specs with response codes
5. **Database Naming**: PostgreSQL conventions for indexes and constraints
6. **Dependency Injection**: Type-annotated with `Annotated`, injectable settings
7. **Type Safety**: Pydantic models everywhere
8. **Async/Await**: Non-blocking I/O operations

## 🛠️ Key Features

- ✅ **FastAPI Best Practices Structure**: Modular architecture with `src/` directory
- ✅ **Docker Compose Watch**: Hot-reload for instant development feedback
- ✅ **Type Safety**: Full Pydantic validation and type hints
- ✅ **Database Migrations**: Alembic for version control
- ✅ **Authentication**: JWT-based auth with secure password hashing
- ✅ **Email Testing**: MailCatcher for local email debugging
- ✅ **API Documentation**: Auto-generated Swagger UI and ReDoc
- ✅ **Database UI**: Adminer for easy database management
- ✅ **Traefik Proxy**: Production-like routing in development

## 🧪 Testing

### Quick API Test

```bash
docker compose exec api python scripts/quick_test.py
```

### Full Test Suite

```bash
docker compose exec api uv run pytest --cov=src --cov-report=html
```

## 🔧 Development Workflow

### Making Changes

Edit any file in `src/`, `alembic/`, `templates/`, or `scripts/` - changes sync automatically and the server reloads instantly.

### Helper Scripts

```bash
# Start development
./scripts/dev.sh start

# View logs
./scripts/dev.sh logs-api

# Open shell in container
./scripts/dev.sh shell

# Run migrations
./scripts/dev.sh migrate

# Run tests
./scripts/dev.sh test

# Format code
./scripts/format.sh

# Check code quality
./scripts/lint.sh
```

### Database Migrations

```bash
# Create a new migration
docker compose exec api uv run alembic revision --autogenerate -m "add users table"

# Apply migrations
docker compose exec api uv run alembic upgrade head
```

## Deployment

### Pre-Deployment Checklist

```bash
./scripts/pre-deploy.sh
```

Deployment (to be documented in docs/api when needed).

## Project Structure

```
apps/api/fastapi/
├── src/                          # Application code
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
│   │   ├── constants.py          # Item messages
│   │   ├── models.py             # Item model
│   │   ├── schemas.py            # Item schemas
│   │   ├── service.py            # Item business logic
│   │   └── router.py             # Item endpoints
│   ├── utils/                    # Utilities
│   │   └── router.py             # Health check, test email
│   ├── config.py                 # Settings (Pydantic)
│   ├── database.py               # DB connection, naming conventions
│   ├── dependencies.py           # Global dependencies
│   ├── email.py                  # Email functionality
│   ├── main.py                   # FastAPI app
│   └── pagination.py             # Pagination helpers
├── tests/                        # Test suite
├── scripts/                      # Development scripts
├── email-templates/              # Email templates
├── alembic/                      # Database migrations
├── docker-compose.yml            # Main Docker config
├── docker-compose.override.yml   # Local dev overrides
├── docker-compose.prod.yml       # Production config
├── Dockerfile                    # Development container
├── Dockerfile.prod               # Production container
├── pyproject.toml                # Python dependencies (uv)
└── .env                          # Environment variables
```

## 🔑 Environment Variables

Key variables in `.env`:

| Variable                   | Description          | Example                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `ENVIRONMENT`              | Environment name     | `local`, `staging`, `production`        |
| `DOMAIN`                   | Base domain          | `localhost` or `localhost.tiangolo.com` |
| `SECRET_KEY`               | JWT secret           | Generate with `openssl rand -base64 32` |
| `POSTGRES_*`               | Database credentials | See `.env.example`                      |
| `FIRST_SUPERUSER`          | Admin email          | `admin@weather.gd`                      |
| `FIRST_SUPERUSER_PASSWORD` | Admin password       | Strong password                         |

## 🛠️ Troubleshooting

### Port conflicts

Change ports in `docker-compose.override.yml`:

```yaml
api:
  ports:
    - "8001:80" # Change 8000 to 8001
```

### Container won't start

```bash
docker compose down
docker compose build --no-cache
docker compose watch
```

### Changes not reflecting

```bash
docker compose logs -f api  # Check for errors
docker compose restart api   # Restart API service
```

### Clear everything

```bash
docker compose down -v
docker compose build --no-cache
docker compose watch
```

## 🎓 Learning Resources

### Your Project

1. **Start with**: [Development guide](../../../docs/api/development.md)
2. **Understand structure**: Explore `src/` directory
3. **Try scripts**: Use `./scripts/dev.sh` commands
4. **Read docs**: [Testing guide](../../../docs/api/testing.md) for quality assurance

### External Resources

- **FastAPI Best Practices**: https://github.com/zhanymkanov/fastapi-best-practices
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **SQLModel Docs**: https://sqlmodel.tiangolo.com
- **Pydantic Docs**: https://docs.pydantic.dev

## 🎯 Tech Stack

- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Database
- **SQLAlchemy**: ORM
- **Alembic**: Database migrations
- **Pydantic**: Data validation
- **uv**: Fast Python package manager
- **Docker**: Containerization
- **Traefik**: Reverse proxy
- **pytest**: Testing framework

## 📄 License

[Your License Here]

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `docker compose exec api uv run pytest`
4. Submit a pull request

---

**Happy coding!** 🚀

For detailed development instructions, see [docs/api/development.md](../../../docs/api/development.md).
