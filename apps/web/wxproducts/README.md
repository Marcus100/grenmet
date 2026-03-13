# WxProducts (`@grenmet/web-wxproducts`)

Next.js app for weather product workflows.

## Development

From repo root:

```bash
pnpm install
pnpm dev:web:wxproducts
```

The app runs on `http://localhost:3005`.

## Run from app directory

```bash
cd apps/web/wxproducts
pnpm dev
```

## Database Utility Commands

If you use the Drizzle setup in this app:

```bash
pnpm db:generate
pnpm db:migrate
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
