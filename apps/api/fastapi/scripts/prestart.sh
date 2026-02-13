#!/bin/bash
# Prestart script - runs before the API starts

set -e

echo "🚀 Running prestart script..."
echo ""

# Ensure we're in the right directory
if [ -d /app ]; then
    cd /app
fi

# Ensure uv is available
UV_CMD=(uv)
if ! command -v uv >/dev/null 2>&1; then
    echo "📥 Installing uv runtime..."
    python -m pip install --no-cache-dir uv
    # Ensure user base bin (where uv is installed) is on PATH
    export PATH="$(python -m site --user-base)/bin:$PATH"
    if ! command -v uv >/dev/null 2>&1; then
        UV_CMD=(python -m uv)
    fi
fi
if ! command -v uv >/dev/null 2>&1; then
    UV_CMD=(python -m uv)
fi

# Sync dependencies (install package + all dependencies)
echo "📦 Syncing dependencies..."
"${UV_CMD[@]}" sync --frozen

# Let the DB start
echo "🗄️  Checking database connection..."
if "${UV_CMD[@]}" run python scripts/backend_pre_start.py; then
    echo "✅ Database is ready"
else
    echo "❌ Database connection failed"
    exit 1
fi
echo ""

# Run database migrations
echo "🔄 Running database migrations..."
if "${UV_CMD[@]}" run alembic upgrade head; then
    echo "✅ Migrations applied"
else
    echo "❌ Migration failed"
    exit 1
fi
echo ""

# Initialize database with first superuser
echo "👤 Initializing database..."
if "${UV_CMD[@]}" run python scripts/initial_data.py; then
    echo "✅ Initial data created"
else
    echo "⚠️  Initial data creation failed (may already exist)"
fi
echo ""

echo "✅ Prestart script completed successfully!"
exit 0
