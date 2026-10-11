# ADR-0019: Workspace toolchain baseline

## Status

Accepted — 2026-10-10.

## Context

The pnpm/Turborepo/Next.js workspace was already current (pnpm 12 catalogs, TypeScript 7, Next 16, React 19 and Biome). An audit against current practice found four gaps: CI never reused Turborepo's task cache, the root tooling bypassed the catalog, TypeScript strictness stopped at `strict`, and React Compiler covered six of nine apps.

## Decision

- **CI cache.** The shared `setup-node` action restores and saves `.turbo/cache`, keyed per job. `type-check` and `tests` run `turbo --affected` on pull requests into `dev`; promotion PRs and pushes run everything. A GitHub Actions cache is enough: no remote-cache service, secrets or vendor.
- **Catalog.** `@biomejs/biome`, `turbo`, `ultracite` and `knip` live in the pnpm catalog and `catalogMode: strict` rejects hardcoded versions for catalogued packages.
- **TypeScript.** The base config enables `erasableSyntaxOnly` (no enums, namespaces or parameter properties) and `noUncheckedIndexedAccess` for every app and package. Narrow `array[i]` and `record[key]` reads with a guard or a fallback; do not use `!`. Tests that need the first element of a list use `nth()` from `apps/web/gaa-admin/src/test/nth.ts` or an explicit `if (!x) throw`.
- **React Compiler** is enabled in every web app that has a `next.config.ts`.
- **Knip** runs as `pnpm knip`, a report-only dependency audit (`--dependencies`). Its first run removed about 40 unreferenced dependencies and catalog entries. Its file and export reports are too noisy for the Next.js app-router and MDX layout, so it is not a CI gate.
- **Turborepo** no longer injects its agent-guidance block into `AGENTS.md` (`agentGuidance: false`).

## Evaluated and not adopted

- **`typedRoutes`**: about 140 dynamic `href` strings across the apps would need `as Route` casts, which defeat the check.
- **Cache Components** (`cacheComponents: true`): gms fails to build because its 13 `force-dynamic` and `dynamicParams` routes serve live CAP and weather data. Migrating them changes freshness for public alerts, so each route needs deliberate `"use cache"`/`cacheLife` choices verified against the running stack.
- **Vite+**: it wraps Vite, and every app here runs on Next.js. Vitest, Biome and Turborepo already cover its other parts.
- **`pnpm dedupe --check` in CI**: `pnpm dedupe` does not converge on this lockfile (it rewrites about 600 lines and asks again), so a gate would always fail.
- **Source exports for `@barrelsgd/api-client`**: the web Dockerfiles and `check-docker-workspaces.mjs` depend on its `dist/` build.

## Consequences

Unchanged packages type-check and test from cache in CI, and dev PRs only check what they affect. New index-access code must handle `undefined`. Open follow-ups: pilot Cache Components route by route (gms first), push `"use client"` boundaries down in `gaa-admin`, and review the packages Knip still flags (for example the `cms-migrations` sidecar, which Knip cannot see being used).
