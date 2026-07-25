export default {
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,json,jsonc,css}":
    "pnpm exec biome check --write --no-errors-on-unmatched",
  "apps/api/fastapi/**/*.py": [
    "uv run --frozen --package fast-back ruff check --fix",
    "uv run --frozen --package fast-back ruff format",
  ],
};
