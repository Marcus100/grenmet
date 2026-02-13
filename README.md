# Barrels GD Monorepo

A monorepo containing all Barrels GD applications and infrastructure.

## 📁 Project Structure

```
barrelsgd/
├── .github/                    # GitHub configuration (workflows, dependabot, labeler)
│   ├── workflows/
│   │   ├── api/                # API-specific workflows (CI, deploy, backup)
│   │   ├── shared/             # Reusable workflows (future)
│   │   └── labeler.yml         # PR auto-labeling
│   ├── dependabot.yml          # Dependency updates
│   └── labeler.yml             # Label configuration
├── apps/                       # Application code
│   ├── api/
│   │   └── fastapi/            # FastAPI backend (Python)
│   ├── web/
│   │   └── salesbus/           # Next.js web app (TypeScript)
│   └── mobile/                 # Mobile app (future)
├── docs/                       # Documentation
│   ├── api/                    # API documentation
│   └── web/                    # Web documentation
├── infra/                      # Infrastructure configuration
│   └── docker/                 # Docker configurations
└── README.md                   # This file
```

## 🚀 Quick Start

### Option 1: Full Stack from Root (Recommended)

Start all services from the monorepo root:

```bash
# 1. Setup Docker networks (first time only)
chmod +x scripts/setup-docker.sh
./scripts/setup-docker.sh

# 2. Copy environment template (if not exists)
cp .env.example .env

# 3. Start all services
docker compose up -d

# 4. View logs
docker compose logs -f api

# 5. Access services
# - API Docs: http://localhost:8000/docs
# - Health Check: http://localhost:8000/api/v1/utils/health-check/
```

### Option 2: Individual App Development

#### API (FastAPI Backend)

```bash
cd apps/api/fastapi

# Copy environment template
cp .env.example .env

# Start development server with hot reload
docker compose watch
```

- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/v1/utils/health-check/

See [API Development Guide](docs/api/development.md) for full documentation.

### Web (Next.js Frontend)

```bash
cd apps/web/salesbus

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

- **Web App**: http://localhost:3000

## 📚 Documentation

| App | Development | Deployment | Testing |
|-----|-------------|------------|---------|
| API | [Development](docs/api/development.md) | [Deployment](docs/api/deployment.md) | [Testing](docs/api/testing.md) |
| Web | Coming soon | Coming soon | Coming soon |

## 🔄 CI/CD

All CI/CD workflows are centralized in `.github/workflows/`:

### API Workflows (`api/`)

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | Push/PR to `master`, `dev` | Linting, testing, security scans |
| `build-images.yml` | CI success, release | Build and push Docker images |
| `deploy-production.yml` | Release published | Deploy to production |
| `deploy-staging.yml` | Build success on master | Deploy to staging |
| `test-docker-compose.yml` | Push/PR | Test Docker Compose setup |
| `backup-database.yml` | Daily (2 AM UTC) | Automated database backup |
| `smokeshow.yml` | CI success | Coverage report upload |

## 🛠️ Development

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for API)
- Node.js 18+ (for Web)
- pnpm (for Web)

### Code Quality

Each app has its own code quality tools:

**API (Python)**
```bash
cd apps/api/fastapi
./scripts/format.sh    # Format code
./scripts/lint.sh      # Lint code
```

**Web (TypeScript)**
```bash
cd apps/web/salesbus
pnpm lint             # Lint code
pnpm format           # Format code (if configured)
```

## 📦 Dependencies

Dependencies are managed per-app:

- **API**: `apps/api/fastapi/pyproject.toml` (uv)
- **Web**: `apps/web/salesbus/package.json` (pnpm)

Dependabot is configured to auto-update all dependencies weekly.

## 🔐 Security

- Automated security scans in CI (Trivy)
- Dependabot for dependency updates
- Secret scanning enabled

## 🏗️ Infrastructure

### Docker Setup

The monorepo includes:

- **Root `docker-compose.yml`**: Orchestrates all services from root
- **App-specific compose files**: In each app directory for standalone development
- **Setup script**: `scripts/setup-docker.sh` creates required Docker networks

### Local Development

**From root** (full stack):
```bash
./scripts/setup-docker.sh    # One-time setup
docker compose up -d          # Start all services
```

**From app directory** (individual app):
```bash
cd apps/api/fastapi
docker compose watch          # Start with hot reload
```

### Environment Files

- Root: `.env.example` - Shared variables for root docker-compose
- API: `apps/api/fastapi/.env.example` - API-specific variables

Copy these to `.env` and update values as needed.

## 📝 Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Ensure all tests pass
4. Submit a PR to `dev`

PRs are automatically labeled based on changed files.

## 📜 License

Proprietary - Barrels GD

---

**URLs**

- 🌐 Production API: https://api.barrels.gd
- 🧪 Staging API: https://staging.api.barrels.gd
- 📚 API Docs: https://api.barrels.gd/docs
