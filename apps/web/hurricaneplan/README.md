# hurricaneplan (`@grenmet/web-hurricaneplan`)

Hurricane planning and documentation site for GMS. Port **3003**.

MDX-based content site with Algolia search, Shiki syntax highlighting, Zustand, and framer-motion animations.

## Development

From repo root:

```bash
pnpm install
cp apps/web/hurricaneplan/.env.local.example apps/web/hurricaneplan/.env.local
pnpm dev:web:hurricane
```

The app runs on `http://localhost:3003`.

## Run from app directory

```bash
cd apps/web/hurricaneplan
pnpm dev
```

## Environment Variables

See `.env.local.example`. Required:

```
AUTH_API_URL
AUTH_API_V1_STR
SESSION_COOKIE_NAME
AUTH_ALLOWED_RETURN_HOSTS
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```

## Notes

- Uses `--webpack` (not Turbopack) for both dev and build — required for MDX compatibility.
- Config is `next.config.mjs` (not `.ts`).
- Auth-delegating: redirects to `web-auth` for sign-in.
- Based on the [Protocol](https://tailwindcss.com/plus) Tailwind Plus template.
