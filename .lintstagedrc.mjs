export default {
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,json,jsonc,css}":
    "pnpm exec biome check --write --no-errors-on-unmatched",
  "apps/api/fastapi/**/*.py": [
    "uv run --project apps/api/fastapi ruff check --fix",
    "uv run --project apps/api/fastapi ruff format",
  ],
};
