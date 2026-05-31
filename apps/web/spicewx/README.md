# SpiceWx (`@grenmet/web-spicewx`)

Public weather website for the Grenada Meteorological Service. Port **3004**.

Displays current weather conditions, date-based forecast navigation, marine and tropical outlook summaries, and public warning banners. This is the primary GMS public-facing platform and the reference implementation for the GrenMet v1 design system.

Part of the Grenmet monorepo — run from the repo root.

## Development

```bash
pnpm install
cp apps/web/spicewx/.env.local.example apps/web/spicewx/.env.local
pnpm dev:web:spicewx
```

The app runs on `http://localhost:3004`.

## Run from app directory

```bash
cd apps/web/spicewx
pnpm dev
```

## Environment Variables

See `.env.local.example` for required values:

- `AUTH_API_URL` — FastAPI base URL
- `AUTH_API_V1_STR` — API version prefix
- `SESSION_COOKIE_NAME` — shared session cookie name

## Design System

`spicewx` is the v1 reference app for the GrenMet design system. Changes to `packages/ui/src/styles/globals.css` are validated here first. See [`docs/design-system.md`](../../../docs/design-system.md) for the compliance guide.

## Quality Commands

```bash
pnpm check          # Biome lint + format check
pnpm check:ci       # CI-mode check (no auto-fix)
pnpm type-check     # TypeScript type checking
```
