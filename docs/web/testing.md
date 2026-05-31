# Web App Testing

## Unit tests (Vitest)

Only `admin-gms` currently has a full unit test suite. Test coverage is
growing — every new feature must include tests as part of the task, not a
follow-up.

```bash
# Run tests for admin-gms
turbo run test --filter=@grenmet/web-admin

# Run a single file (from within the app directory)
pnpm vitest run src/path/to/test.test.ts

# Watch mode
pnpm vitest
```

Apps with Vitest configured: `admin-gms`, `auth`, `salesbus`.
See [`apps/web/admin-gms/CLAUDE.md`](../../apps/web/admin-gms/CLAUDE.md) for
the full unit test conventions.

## E2E tests (Playwright)

`auth` has Playwright e2e tests covering sign-in flows.

```bash
# From within apps/web/auth/
pnpm playwright test

# Run a specific spec
pnpm playwright test e2e/sign-in.spec.ts

# Open Playwright UI
pnpm playwright test --ui
```

`admin-gms` also has Playwright e2e tests. See
[`apps/web/admin-gms/CLAUDE.md`](../../apps/web/admin-gms/CLAUDE.md).

## Adding tests to a new app

1. Add `vitest` to `devDependencies` using `catalog:` reference
2. Create `vitest.config.ts` — copy from `apps/web/salesbus/vitest.config.ts`
3. Add `"test": "vitest run"` to the app's `package.json` scripts
4. Add `turbo run test` to the `test` task in `turbo.json` if not already present

## What to test

- Server actions and data-fetching utilities: unit tests
- Auth flows and critical user journeys: Playwright e2e
- UI components with logic: Vitest + React Testing Library
- Pure functions and transformations: Vitest unit tests

Do not test Next.js framework behavior, third-party library internals, or
generated API client types.
