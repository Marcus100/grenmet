# AGENTS.md

This is the entry point for Codex. Commands first, then conventions,
then where to find deeper context.

## Commands

### Setup

```bash
pnpm install       # Install all dependencies
pnpm start         # Start Docker services (Postgres + FastAPI)
```

### Development

```bash
pnpm dev:web:admin      # admin-gms      :3001
pnpm dev:web:auth       # auth           :3000
pnpm dev:web:wxwatch    # wxwatch        :3002
pnpm dev:web:hurricane  # hurricaneplan  :3003
pnpm dev:web:spicewx    # spicewx        :3004
pnpm dev:web:wxproducts # wxproducts     :3005
pnpm dev:web:hr         # hr             :3006
pnpm dev:web:salesbus   # salesbus       :3007
```

### Quality — run both before finishing any task

```bash
pnpm fix                                          # Auto-fix lint + format
pnpm type-check                                   # TypeScript across all packages
turbo run check --filter=@grenmet/<package>       # Single package
turbo run type-check --filter=@grenmet/<package>  # Single package
```

### Test

```bash
turbo run test --filter=@grenmet/web-admin        # Unit tests (admin-gms)
pnpm vitest run src/path/to/test.test.ts          # Single file (from app dir)
```

### Build & Generate

```bash
pnpm build                  # Build all packages
pnpm generate:api-client    # Regenerate TS client from FastAPI OpenAPI
pnpm check:drift            # Verify API client is in sync with openapi.json
```

## Top 5 Conventions

1. Run `pnpm fix` then `pnpm type-check` before marking any task done — no exceptions.
2. Reference shared deps with `catalog:` in `package.json` — never hardcode a version for a dep in the catalog.
3. Import UI primitives from `@grenmet/ui/components/ui/<name>`, utils from `@grenmet/ui/lib/utils`.
4. Access env vars through the app's `src/env.ts` — never `process.env` directly.
5. Default to Server Components — only add `"use client"` when interactivity or browser hooks are required.

## Top 5 Anti-Patterns

1. Never manually edit `packages/api-client/src/gen/` — always regenerate via `pnpm generate:api-client`.
2. Never write to `.env.*` or `.env.local` files.
3. Never run `git commit`, `git push`, `gh pr merge`, or any deploy command.
4. Never touch a file not explicitly named in the request without stopping and asking first.
5. Never implement after analysis — stop and wait for explicit approval before writing code.

## Where to Look Next

| I need to understand…            | Read…                        |
|----------------------------------|------------------------------|
| Monorepo structure and auth flow | `docs/technical-overview.md` |
| Service architecture             | `docs/architecture.md`       |
| Auth package API                 | `packages/auth/README.md`    |
| Environment variables            | `docs/env.md`                |
| Deployment                       | `docs/deployment.md`         |
| A specific app                   | `apps/web/<app>/README.md`   |
| Design system tokens             | `docs/design-system.md`      |
| Troubleshooting                  | `docs/troubleshooting.md`    |
