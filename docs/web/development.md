# Web App Development

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

For infrastructure commands (Postgres, FastAPI, Docker): see the
[root README](../../README.md). This document covers the web apps only.

## Prerequisites

- Node.js 24+ (`engines` in `package.json`), pnpm 12.3.4 (`packageManager`)
- Docker on the **host** for `pnpm start` (Postgres, Redis, FastAPI, worker)
- A local env file in each app you run, copied from the app's
  `.env.local.example`. Agents must never write env files.

Run `pnpm start` and `pnpm dev:web:*` on the host, not in the devcontainer.

## Shared task cache

Turborepo results (type-check, lint, tests, builds) are shared between CI and local
runs through a signed remote cache (ADR-0053; CI uses short-lived tokens on trusted
branches, never on pull requests), so a check that already passed on `dev` is
replayed locally instead of rerun. To use it on a machine, once:

1. `pnpm exec turbo login`, then `pnpm exec turbo link` in the main checkout
   (choose the team that owns the repository's Vercel projects).
2. Export the team for worktrees, which have no link file:
   `export TURBO_TEAM=<team slug>` in your shell profile.
3. Export the signing key from a private file outside the repository:
   `export TURBO_REMOTE_CACHE_SIGNATURE_KEY="$(cat ~/.config/grenmet/turbo-signature-key)"`.
   Without the key, runs still work; they just cannot trust remote results.
4. Make local runs read-only: `export TURBO_CACHE=local:rw,remote:r`. Only CI
   publishes to the remote cache, so a result from unreviewed local code is never
   replayed in CI. The `turbo login` token is a user token; keep it to this machine.

The token and key are the owner's; never commit them or put them in an env file.

## Apps at a glance

| App | Command | Port | Needs FastAPI? | Notes |
| --- | --- | --- | --- | --- |
| auth | `pnpm dev:web:auth` | 3000 | Yes (`AUTH_API_URL`) | Shared sign-in; renders emails for FastAPI; Playwright e2e |
| gaa-admin | `pnpm dev:web:gaa-admin` | 3001 | Yes | Staff portal: CAP, HR, WxWatch, WxProducts, Salesbus, Janitorial, Transport |
| docs | `pnpm dev:web:docs` | 3002 | Sign-in only | MDX via content-collections |
| gms | `pnpm dev:web:gms` | 3003 | Yes (CAP, wxproducts, CMS feeds) | Public weather site |
| signal | `pnpm dev:web:signal` | 3004 | No | Static MDX |
| mbia | `pnpm dev:web:mbia` | 3005 | No | Airport public site |
| cms | `pnpm dev:web:cms` | 3006 | Yes (identity) | Payload; run `pnpm cms:setup-db` first (see its README) |
| events | `pnpm dev:web:events` | 3009 | No | Prototype |
| bookings | `pnpm dev:web:bookings` | 3015 | Sign-in only (`/studio`) | Skeleton; no booking UI yet |

Each app's rules are in `apps/web/<app>/AGENTS.md`. Port policy is in
[`docs/ports.md`](../ports.md).

## Environment variables

Copy `apps/web/<app>/.env.local.example` to the app's local env file. Read
variables only through the app's typed `src/env.ts`. The full reference is
[`docs/env.md`](../env.md). Never commit local env files.

## Conventions that apply to every app

- **Server Components by default.** Fetch server-side with the generated
  `@barrelsgd/api-client` functions and a request-scoped client (pattern:
  `apps/web/gaa-admin/src/components/hr/dashboard/load-dashboard.ts`). Use
  `"use client"` only for interaction or browser APIs.
- **Generated contracts only.** Never hand-write a FastAPI response type; use
  the generated types, fetch clients, hooks, and Zod schemas.
- **UI and styling:** primitives from `@barrelsgd/ui/components/ui/<name>`,
  `--gm-*` tokens and semantic classes only (see `docs/design-system.md`).
- **Lint and format:** Biome via Ultracite (`pnpm fix:changed`); rules in
  `.agents/rules/ultracite.mdc`.
- **React Compiler** is enabled in every app. Don't add `useMemo`/`useCallback`
  for performance.
- **Strict indexing.** `noUncheckedIndexedAccess` is on everywhere, so
  `array[i]` and `record[key]` can be `undefined`. Narrow with a guard or a
  fallback, never `!`. Tests that need the first item can use `nth()` from
  `apps/web/gaa-admin/src/test/nth.ts`. See `docs/adr/0019-workspace-toolchain-baseline.md`.
- **Sentry** is wired through `instrumentation.ts` / `instrumentation-client.ts`
  in auth, docs, gaa-admin, gms, mbia, and signal. Do not remove these files.

## End-to-end smoke tests

`gms` and `gaa-admin` have Playwright smoke tests in `apps/web/<app>/e2e/`:

- `gms`: the home, alerts and about pages return 200, show a `main` landmark and a
  level-1 heading, and raise no page errors.
- `gaa-admin`: an unauthenticated visit is redirected to `/signin` with the original
  path in `returnTo`, and sign-in hands off to `/auth/start`. The assertions stop at
  the first redirect hop, so they do not need the auth app.

Run them with the dev servers already listening (`pnpm dev:web:gms`,
`pnpm dev:web:gaa-admin`, on the host) and the API from `pnpm start`:

```bash
pnpm e2e              # each app whose server is up; the others are skipped with a message
pnpm e2e --require    # fail instead of skipping when a server is down
```

`pnpm verify:changed` runs `pnpm e2e` for changes under those two apps and prints a
clear SKIP when no server is up. Frontend tasks must run it when the servers are
available, and say in the run record when they were not. The first request to a cold
Next dev server compiles the page and can take about a minute, which the 120 s test
timeout allows for.

Playwright needs the browser build that matches its version. If a run says the
browser is missing, run `pnpm exec playwright install chromium` once from an app
directory; it downloads into `~/.cache/ms-playwright`, outside the repository. The
`auth` app's older suite needs real sign-in credentials and is not part of
`pnpm e2e`.

## Pinned lint and client-generator versions

The versions live in the `catalog:` block of `pnpm-workspace.yaml`; read them there
rather than from this page. At the time of writing:

| Tool | Catalog entry | Why it is pinned this way |
| --- | --- | --- |
| Biome | `"@biomejs/biome": "~2.6.4"` | `~` allows patch updates only; a minor release can add rules. |
| Ultracite | `ultracite: "8.1.0"` | Exact. `biome.jsonc` extends `ultracite/biome/core`, `/react` and `/next`, so a new Ultracite version changes the rule set. Ultracite 8.1 needs Biome 2.6.2 or newer. |
| Kubb (API client generator) | `kubb`, `@kubb/adapter-oas`, `@kubb/parser-ts` at 5.14.3; `@kubb/plugin-fetch` 5.9.2, `@kubb/plugin-react-query` 5.6.2, `@kubb/plugin-ts` 5.2.0, `@kubb/plugin-zod` 5.7.2 | Exact, so `packages/api-client/src/gen/` only changes when a version is bumped on purpose. The plugins version independently of Kubb core, so each keeps its own number. |

To upgrade Biome or Ultracite:

1. Change the catalog entry (catalog mode is strict, so no version goes in a package's
   own `package.json`) and run `pnpm install`. If the new version is younger than the
   release-age policy, `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` needs an
   entry for that exact version.
2. Run `pnpm exec ultracite fix` and read the diff. Apply only the safe fixes it
   makes; turn a new rule off in `biome.jsonc` (with a note) only when it needs a
   per-site judgement that does not belong in the upgrade commit.
3. Run `pnpm check:ci` and `pnpm type-check`.
4. Commit the lockfile, the catalog change and the fixes together, as `chore(lint): ...`.

To upgrade Kubb or one of its plugins:

1. Change the catalog entries together in `pnpm-workspace.yaml` and run `pnpm install`.
2. Run `pnpm generate:api-client`, then `pnpm check:drift`. A pure pin with no
   output change should leave `packages/api-client/src/gen/` unchanged; if the output
   does change, review the diff as a contract change (`pnpm check:api-breaking`).
3. Never hand-edit `packages/api-client/src/gen/`.

## Special app notes

- **docs**: content in `src/content/` via `@content-collections/next`; MDX
  plugins (`mdx-annotations`) run in a separate Node.js process.
- **gaa-admin**: five formerly separate apps folded in 2026-06. Run the
  `gaa-admin-change` skill before editing. FastAPI owns every module's database,
  Alembic history, and catalogue seeding; run `pnpm start` before first use.
- **cms**: identity comes from FastAPI; access rules use FastAPI permission keys.

End-to-end feature recipe:
[`docs/playbooks/full-stack-feature.md`](../playbooks/full-stack-feature.md).
