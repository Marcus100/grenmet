#!/usr/bin/env bash
# Code quality checks

set -e

UV_RUN=(uv run --frozen --package fast-back)

echo "🔍 Running code quality checks..."
echo ""

# Fail before mypy/Ruff if uv is using an interpreter that cannot parse the
# project's configured Python syntax. In particular, this project targets
# Python 3.14, where PEP 758 permits unparenthesized multiple exceptions.
echo "🐍 Checking Python runtime..."
REQUIRED_PYTHON_MINOR="$(sed -n 's/^requires-python = ">=\([0-9][0-9]*\.[0-9][0-9]*\),<.*/\1/p' pyproject.toml | head -n 1)"
if [[ -z "${REQUIRED_PYTHON_MINOR}" ]]; then
    echo "❌ Could not determine the required Python version from pyproject.toml"
    exit 1
fi

if ! PYTHON_VERSION="$("${UV_RUN[@]}" python -c 'import platform; print(platform.python_version())')"; then
    echo "❌ Could not start the configured FastAPI Python environment"
    exit 1
fi

if [[ "${PYTHON_VERSION%.*}" != "${REQUIRED_PYTHON_MINOR}" ]]; then
    echo "❌ FastAPI requires Python ${REQUIRED_PYTHON_MINOR}.x, but uv is using Python ${PYTHON_VERSION}"
    echo "   Rebuild the environment with: uv sync --frozen --package fast-back"
    exit 1
fi
echo "✅ Using Python ${PYTHON_VERSION}"
echo ""

# Type checking
echo "📋 Type checking with mypy..."
if "${UV_RUN[@]}" mypy src; then
    echo "✅ Type checking passed"
else
    echo "❌ Type checking failed"
    exit 1
fi
echo ""

# Linting
echo "🔎 Linting with ruff..."
if "${UV_RUN[@]}" ruff check src scripts; then
    echo "✅ Linting passed"
else
    echo "❌ Linting failed"
    exit 1
fi
echo ""

# Format checking
echo "🎨 Checking code formatting..."
if "${UV_RUN[@]}" ruff format src scripts --check; then
    echo "✅ Format checking passed"
else
    echo "❌ Format checking failed - run ./scripts/format.sh"
    exit 1
fi
echo ""

echo "✅ All quality checks passed!"
