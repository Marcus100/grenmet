#!/usr/bin/env bash
# Code quality checks

set -e

echo "🔍 Running code quality checks..."
echo ""

# Type checking
echo "📋 Type checking with mypy..."
if mypy src; then
    echo "✅ Type checking passed"
else
    echo "❌ Type checking failed"
    exit 1
fi
echo ""

# Linting
echo "🔎 Linting with ruff..."
if ruff check src scripts; then
    echo "✅ Linting passed"
else
    echo "❌ Linting failed"
    exit 1
fi
echo ""

# Format checking
echo "🎨 Checking code formatting..."
if ruff format src scripts --check; then
    echo "✅ Format checking passed"
else
    echo "❌ Format checking failed - run ./scripts/format.sh"
    exit 1
fi
echo ""

echo "✅ All quality checks passed!"
