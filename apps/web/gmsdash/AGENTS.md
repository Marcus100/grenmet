# gmsdash (`@barrelsgd/web-gmsdash`) — agent context

Port **3013**, host `gmsdash.${BASE_DOMAIN}`. The GMS Dashboard: a Grenada Meteorological Service client service, built and operated by Barrels, that gives entitled organisations point meteograms from raw ECMWF IFS, ECMWF AIFS and NOAA GFS runs. Plan: `docs/exec-plans/barrels-foundations-plan.md` (gmsdash). Backend: `apps/api/fastapi/src/models_guidance/AGENTS.md`.

## Boundary

- Every page carries "raw model guidance, not an official GMS forecast". Never imply an official forecast or warning. ECMWF attribution (CC-BY-4.0) comes from the API and is shown under each meteogram.
- Server Components only. Charts are server-rendered SVG (`src/components/meteogram-chart.tsx`, geometry in `src/lib/chart.ts`); no chart library and no client JS beyond Next itself. Selectors are a plain GET form.
- Backend logic stays in FastAPI. This app validates, proxies and renders. `src/lib/api.ts` calls `/models/*` itself (not `authApiFetch`) because those routes need the `X-Barrels-Organisation` header; responses are parsed with Zod schemas from `@barrelsgd/api-client`.
- Pages: `/` (public: what it is, how access works, your organisations), `/meteogram?org=&point=&model=`, `/access?org=` (entitlement status, request form for organisation owners/admins). `/signin`, `/auth/*` and `/api/health` are plumbing.

## Auth (ADR-0016/0017)

- Registry key `gmsdash` in `apps/api/fastapi/src/auth/apps.py`: a self-service `app`-scope app (token carries an `app` claim, role `gmsdash-member`, permission `app.gmsdash.access`, joined on first sign-in). Joining the app is not the gate: **access to data is the organisation's `gmsdash` entitlement**, requested by an organisation owner/admin and approved by GMS staff (`gmsdash.access.review`).
- Flow: `/signin` -> `/auth/start` -> auth.barrels.gd -> `/auth/callback` (redeems the code with `GMSDASH_SSO_CLIENT_SECRET`; without it the callback returns 503). Session cookie `gmsdash_session`, host-only. `src/proxy.ts` only checks the cookie exists; `src/lib/session.ts` exchanges it for the app token on every request.
- The organisation is chosen with `?org=` among the person's memberships (`src/lib/organisations.ts`); FastAPI re-checks membership and entitlement on every call.

## Env and tests

Typed env in `src/lib/env.ts` (`docs/env.md` -> gmsdash). Tests run in jsdom with fixed values from `vitest.config.ts`. `pnpm --filter @barrelsgd/web-gmsdash test | type-check | build`.

## Deployment

Compose service `web-gmsdash` with its own Traefik router and certificate (`gmsdash.${BASE_DOMAIN}`), release scope entry in `scripts/ci/release-scope.mjs`, API env `GMSDASH_APP_URL` / `GMSDASH_SSO_CLIENT_SECRET`. Needs a DNS record for `gmsdash.*` and the GitHub environment secret `GMSDASH_SSO_CLIENT_SECRET` (optional: empty keeps sign-in off). The worker fetch is off until `MODELS_GUIDANCE_ENABLED=true` on the worker.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
