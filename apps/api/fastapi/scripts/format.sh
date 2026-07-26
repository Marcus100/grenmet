#!/usr/bin/env bash
# Code formatting script

set -e

UV_RUN=(uv run --frozen --package fast-back)

echo "🎨 Formatting code with Ruff..."
echo ""

# Fix linting issues
echo "📝 Fixing auto-fixable issues..."
"${UV_RUN[@]}" ruff check src scripts --fix

# Format code
echo "✨ Formatting code..."
"${UV_RUN[@]}" ruff format src scripts

echo ""
echo "✅ Code formatting complete!"
