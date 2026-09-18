#!/bin/bash
# Prestart script - runs before the API starts

set -e

echo "🚀 Running prestart script..."
echo ""

# Ensure we're in the FastAPI workspace member.
if [ -d /app/apps/api/fastapi ]; then
    cd /app/apps/api/fastapi
elif [ -d /app ]; then
    cd /app
fi

# Dependencies are installed into /app/.venv at image build time and that venv is
# on PATH, so every command below runs directly out of it.
#
# Local dev bind-mounts pyproject.toml and uv.lock from the host, so it opts into
# a boot-time `uv sync` with PRESTART_SYNC=1. Staging and production deliberately
# do not: re-installing packages at container start would make a deploy depend on
# reaching the package index at the worst possible moment, and would fail the
# container (set -e) over an outage whose packages are already inside the image.
if [ "${PRESTART_SYNC:-0}" = "1" ]; then
    echo "📦 Syncing dependencies..."

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

    "${UV_CMD[@]}" sync --frozen --no-dev --package fast-back
fi

# Let the DB start
echo "🗄️  Checking database connection..."
if python scripts/backend_pre_start.py; then
    echo "✅ Database is ready"
else
    echo "❌ Database connection failed"
    exit 1
fi
echo ""

# Run database migrations
echo "🔄 Running database migrations..."
if alembic upgrade head; then
    echo "✅ Migrations applied"
else
    echo "❌ Migration failed"
    exit 1
fi
echo ""

# Weather schema has its own URL, migration history and metadata.
if [ -n "${WXPRODUCTS_DATABASE_URL:-}" ]; then
    echo "Migrating separate weather-products database..."
    alembic -c src/wxproducts/alembic.ini upgrade head
elif [ "${ENVIRONMENT:-local}" != "local" ]; then
    echo "WXPRODUCTS_DATABASE_URL is required for weather schema migration" >&2
    exit 1
else
    echo "Weather database is unconfigured; weather endpoints will be unavailable"
fi

# WxWatch retains a separate database and migration history.
if [ -n "${WXWATCH_DATABASE_URL:-}" ]; then
    alembic -c src/wxwatch/alembic.ini upgrade head
elif [ "${ENVIRONMENT:-local}" != "local" ]; then
    echo "WXWATCH_DATABASE_URL is required for archive migration" >&2
    exit 1
fi

# The staff eRegister has its own database and migration history.
if [ -n "${EREGISTER_DATABASE_URL:-}" ]; then
    alembic -c src/eregister/alembic.ini upgrade head
elif [ "${ENVIRONMENT:-local}" != "local" ]; then
    echo "EREGISTER_DATABASE_URL is required for observation-register migration" >&2
    exit 1
fi

if [ -n "${JANITORIAL_DATABASE_URL:-}" ]; then
    alembic -c src/janitorial/alembic.ini upgrade head
elif [ "${ENVIRONMENT:-local}" != "local" ]; then
    echo "JANITORIAL_DATABASE_URL is required for janitorial schema migration" >&2
    exit 1
fi

if [ -n "${TRANSPORT_DATABASE_URL:-}" ]; then
    alembic -c src/transport/alembic.ini upgrade head
elif [ "${ENVIRONMENT:-local}" != "local" ]; then
    echo "TRANSPORT_DATABASE_URL is required for transport schema migration" >&2
    exit 1
fi

if [ -n "${JANITORIAL_DATABASE_URL:-}" ] && [ -n "${TRANSPORT_DATABASE_URL:-}" ]; then
    python scripts/seed_catalogues.py --apply
fi

# Required bootstrap errors must fail deployment. Development users are opt-in.
if [ "${ENVIRONMENT:-local}" = "local" ]; then
    python scripts/initial_data.py
else
    echo "Account/staff baseline is an explicit operator action"
fi

# Report business setup separately from schema readiness; keep admin accessible
# so a superuser can preview and import missing catalogue data after fresh install.
python scripts/check_onboarding.py

echo "Prestart completed successfully"
