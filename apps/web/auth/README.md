# Auth Web App (`@grenmet/web-auth`)

Shared sign-in gateway for Grenmet web applications.

## Development

From repo root:

```bash
pnpm install
cp apps/web/auth/.env.local.example apps/web/auth/.env.local
pnpm dev:web:auth
```

The app runs on `http://localhost:3000`.

## Run from app directory

```bash
cd apps/web/auth
pnpm dev
```

## Environment Variables

Primary variables (see `.env.local.example`):

- `AUTH_API_URL`
- `AUTH_API_V1_STR`
- `SESSION_COOKIE_NAME`
- `AUTH_ALLOWED_RETURN_HOSTS`

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
