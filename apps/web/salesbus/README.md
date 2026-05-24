# salesbus (`@grenmet/web-salesbus`)

Sales and inventory management app for GMS. Port **3007**.

Routes: `/sales`, `/inventory`, `/settlements`, `/offline`.

## Development

From repo root:

```bash
pnpm install
pnpm dev:web:salesbus
```

The app runs on `http://localhost:3007`.

## Run from app directory

```bash
cd apps/web/salesbus
pnpm dev
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
