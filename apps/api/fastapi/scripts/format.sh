#!/usr/bin/env bash
# Code formatting script

set -e

echo "🎨 Formatting code with Ruff..."
echo ""

# Fix linting issues
echo "📝 Fixing auto-fixable issues..."
ruff check src scripts --fix

# Format code
echo "✨ Formatting code..."
ruff format src scripts

echo ""
echo "✅ Code formatting complete!"
