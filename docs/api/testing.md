# API Testing Guide

> **Note**: This documentation is for the FastAPI backend located at `apps/api/fastapi/`

Comprehensive testing strategies, pre-deployment checks, and quality assurance for the FastAPI backend.

## 🚀 Quick Start

### Run All Pre-Deployment Checks

```bash
cd apps/api/fastapi

# Linux/Mac
chmod +x scripts/pre-deploy.sh
./scripts/pre-deploy.sh

# Windows (PowerShell)
.\scripts\pre-deploy.ps1

# Windows (Git Bash)
bash scripts/pre-deploy.sh
```

## 🧪 Individual Test Commands

### 1. Code Formatting

**Check formatting:**
```bash
docker compose exec api uv run ruff format src --check
```

**Auto-fix formatting:**
```bash
docker compose exec api uv run ruff format src
# Or use the script:
./scripts/format.sh
```

### 2. Linting

**Check for code issues:**
```bash
docker compose exec api uv run ruff check src
```

**Auto-fix linting issues:**
```bash
docker compose exec api uv run ruff check src --fix
```

### 3. Type Checking

**Run mypy:**
```bash
docker compose exec api uv run mypy src
```

### 4. Run Tests

**Run all tests:**
```bash
docker compose exec api uv run pytest
```

**Run with verbose output:**
```bash
docker compose exec api uv run pytest -v
```

**Run specific test file:**
```bash
docker compose exec api uv run pytest tests/api/test_items.py
```

**Run with coverage:**
```bash
docker compose exec api uv run pytest --cov=src --cov-report=html
```

**View coverage report:**
Open `htmlcov/index.html` in your browser after running coverage.

### 5. Database Migrations

**Check current migration:**
```bash
docker compose exec api uv run alembic current
```

**Create new migration:**
```bash
docker compose exec api uv run alembic revision --autogenerate -m "description"
```

**Apply migrations:**
```bash
docker compose exec api uv run alembic upgrade head
```

**Rollback migration:**
```bash
docker compose exec api uv run alembic downgrade -1
```

### 6. API Health Check

**Test API is running:**
```bash
curl http://localhost:8000/api/v1/utils/health-check/
```

**Test authentication:**
```bash
curl -X POST http://localhost:8000/api/v1/login/access-token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@barrels.gd&password=changethis"
```

## 📋 Pre-Deployment Checklist

Before deploying to production, ensure:

### ✅ Code Quality
- [ ] All tests pass
- [ ] Code is formatted (ruff format)
- [ ] No linting errors (ruff check)
- [ ] Type checking passes (mypy)
- [ ] Code coverage > 80%

### ✅ Security
- [ ] `SECRET_KEY` is changed from "changethis"
- [ ] `POSTGRES_PASSWORD` is changed from "changethis"
- [ ] `FIRST_SUPERUSER_PASSWORD` is changed from "changethis"
- [ ] No hardcoded secrets in code
- [ ] Debug mode is disabled
- [ ] CORS origins are properly configured
- [ ] HTTPS is enabled in production

### ✅ Database
- [ ] All migrations are applied
- [ ] Database backup is created
- [ ] Migration rollback plan exists

### ✅ Environment
- [ ] `.env` file is configured for production
- [ ] Environment variables are set correctly
- [ ] Sentry DSN is configured (if using)
- [ ] Email settings are configured (if using)

### ✅ Docker
- [ ] Docker build succeeds
- [ ] All containers start successfully
- [ ] Health check endpoint responds
- [ ] Logs show no errors

### ✅ API
- [ ] OpenAPI docs are accessible
- [ ] All endpoints return expected responses
- [ ] Authentication works correctly
- [ ] Rate limiting is configured (if needed)

## 🧪 Testing Best Practices

### Writing Tests

Follow these patterns when writing tests:

```python
# tests/api/test_items.py
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

def test_create_item(client: TestClient, superuser_token_headers: dict):
    """Test creating an item."""
    data = {"title": "Test Item", "content": "Test content"}
    response = client.post(
        "/api/v1/items/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert "id" in content
```

### Test Organization

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures
├── api/                     # API endpoint tests
│   ├── __init__.py
│   ├── test_items.py
│   ├── test_users.py
│   └── test_login.py
├── crud/                    # Service layer tests
│   ├── __init__.py
│   ├── test_item_service.py
│   └── test_user_service.py
└── utils/                   # Utility function tests
    ├── __init__.py
    └── test_security.py
```

## 🚀 Quick API Tests

### Quick Test Script

**Fast API validation tests:**

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

### Full Test Suite

```bash
./scripts/dev.sh test-cov
```

Generates coverage report in `htmlcov/index.html`

## 🛠️ Troubleshooting

### Tests Failing

1. **Check database is running:**
   ```bash
   docker compose ps
   ```

2. **Reset database:**
   ```bash
   docker compose down -v
   docker compose up -d
   ```

3. **Check logs:**
   ```bash
   docker compose logs api
   ```

### Linting Errors

**Auto-fix most issues:**
```bash
docker compose exec api uv run ruff check src --fix
docker compose exec api uv run ruff format src
```

### Type Errors

**Common fixes:**
- Add type hints to function parameters
- Use `Optional[Type]` for nullable values
- Import types from `typing` module

### Migration Errors

**Reset migrations (development only):**
```bash
# WARNING: This deletes all data
docker compose down -v
docker compose up -d
docker compose exec api uv run alembic upgrade head
```

## 📊 Test Coverage Goals

### Minimum Coverage Targets
- **Unit Tests**: > 80%
- **Integration Tests**: > 70%
- **API Endpoints**: 100%
- **Critical Paths**: 100%

### Coverage Reports
```bash
# Generate HTML coverage report
docker compose exec api uv run pytest --cov=src --cov-report=html

# View coverage report
open htmlcov/index.html
```

## 🔍 Test Categories

### 1. Unit Tests
- Test individual functions and methods
- Mock external dependencies
- Fast execution
- High coverage

### 2. Integration Tests
- Test component interactions
- Use real database (test instance)
- Test API endpoints
- Verify data flow

### 3. End-to-End Tests
- Test complete user workflows
- Test authentication flows
- Test error scenarios
- Verify business logic

### 4. Performance Tests
- Load testing
- Stress testing
- Memory usage
- Response times

## 🎯 Testing Checklist

### Before Committing
- [ ] All tests pass locally
- [ ] Code is formatted
- [ ] No linting errors
- [ ] Type checking passes
- [ ] New tests added for new features

### Before Deploying
- [ ] Full test suite passes
- [ ] Pre-deployment checks pass
- [ ] Database migrations tested
- [ ] Security checks pass
- [ ] Performance tests pass

### After Deploying
- [ ] Health checks pass
- [ ] Smoke tests pass
- [ ] Monitoring alerts configured
- [ ] Rollback plan ready

## 📋 Summary

**Quick commands for daily development:**

```bash
cd apps/api/fastapi

# Format code
./scripts/format.sh

# Run tests
./scripts/dev.sh test-cov

# Check code quality
./scripts/lint.sh

# Create migration
./scripts/dev.sh migration "description"

# Apply migrations
./scripts/dev.sh migrate
```

**Before every deployment:**
```bash
# Run all checks
./scripts/format.sh
./scripts/lint.sh
./scripts/dev.sh test-cov
docker compose exec api python scripts/quick_test.py
```

If all checks pass ✅, you're ready to deploy! 🚀
