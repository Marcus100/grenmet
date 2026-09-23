# Web App Development

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-23

For infrastructure commands (Postgres, FastAPI, Docker): see the
[root README](../../README.md). This document covers the web apps only.

## Prerequisites

- Node.js 24+ (`engines` in `package.json`), pnpm 12.3.4 (`packageManager`)
- Docker on the **host** for `pnpm start` (Postgres, Redis, FastAPI, worker)
- A local env file in each app you run, copied from the app's
  `.env.local.example`. Agents must never write env files.

Run `pnpm start` and `pnpm dev:web:*` on the host, not in the devcontainer.

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
- **React Compiler** is enabled in auth, docs, events, gaa-admin, and gms. There,
  don't add `useMemo`/`useCallback` for performance. It is not enabled in cms,
  mbia, or signal.
- **Sentry** is wired through `instrumentation.ts` / `instrumentation-client.ts`
  in auth, docs, gaa-admin, gms, mbia, and signal. Do not remove these files.

## Special app notes

- **docs**: content in `src/content/` via `@content-collections/next`; MDX
  plugins (`mdx-annotations`) run in a separate Node.js process.
- **gaa-admin**: five formerly separate apps folded in 2026-06. Run the
  `gaa-admin-change` skill before editing. FastAPI owns every module's database,
  Alembic history, and catalogue seeding; run `pnpm start` before first use.
- **cms**: identity comes from FastAPI; access rules use FastAPI permission keys.

End-to-end feature recipe:
[`docs/playbooks/full-stack-feature.md`](../playbooks/full-stack-feature.md).
