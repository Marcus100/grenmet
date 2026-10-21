# Barrels Bookings (`@barrelsgd/web-bookings`) — agent context

Port **3015**, host `bookings.${BASE_DOMAIN}` (`bookings.barrels.gd` in production). Design lane: `docs/design/bookings.md` (read before UI work). Product decision: `docs/exec-plans/product-and-hardening-handoff.md` (A1). Backend and domain: `apps/api/fastapi/src/bookings/AGENTS.md` and ADR-0024.

## Status: public booking flow live, studio still a stub

`/[slug]` is the public booking flow for any business: storefront (name, services with duration, price and deposit label, providers), then the shared `@barrelsgd/bookings-web` flow (service, time, details, confirm), then `/[slug]/booking/[token]` to view, reschedule or cancel (plus `/ics` for the calendar file). The studio (`/studio`) is still a sign-in-guarded stub.

Host wiring mirrors `apps/web/babydoll`: `src/lib/booking-api.ts` (server-only, generated client, every call takes the slug), `src/lib/booking-errors.ts` (`failureFrom`), Server Actions in `src/app/[slug]/actions.ts` and `booking/[token]/actions.ts`, `src/components/booking-link.tsx` (router-aware manage link). The page binds the slug into each action (`loadSlots.bind(null, slug)`) so the package's action shapes stay unchanged; actions re-check the slug. The package carries class names only: `src/app/booking.css` is the host's side, built from the shared semantic tokens (light mode, no `--gm-*`). Turnstile site key is `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (empty: no widget); the API enforces per-site policy and the honeypot. Unknown or switched-off slugs call `notFound()` (a real 404, so there is deliberately no `loading.tsx`).

## Boundary

- `/` is public: what Barrels Bookings is.
- `/[slug]` is the public booking page for one business (any tenant). It shows the business name from the API, never a name typed into this app. A business with no services says online booking is not open.
- `/studio` is staff only, behind a Barrels sign-in. Business settings (services, hours, providers) and the agenda go here later.
- Backend logic stays in FastAPI (`/bookings/public/*`, `/bookings/org/*`). Route handlers may only validate, proxy or render. Never add database access or booking rules here.
- Server Components by default. Client Components only for interaction. React Query only for client-side mutations and polling; generated clients and types come from `@barrelsgd/api-client`.

## Auth (ADR-0016/0017)

- Registry key `bookings`, not registered yet. `src/lib/auth-config.ts` (`APP_NAME`) names it. Until `apps/api/fastapi/src/auth/apps.py` registers it (with `BOOKINGS_APP_URL` and `BOOKINGS_SSO_CLIENT_SECRET` on the API), sign-in cannot complete. That API change belongs to `api-engineer`.
- Flow: `/signin` -> `/auth/start` -> auth.barrels.gd -> `/auth/callback` (redeems the code with `BOOKINGS_SSO_CLIENT_SECRET`; without it the callback returns 503). Session cookie `bookings_session`, host-only. `src/proxy.ts` checks only that the cookie exists for `/studio`; `src/lib/session.ts` (`requireSession`) exchanges it on the server.
- Never read `process.env` outside `src/env.ts` (plus the Sentry and `next.config` exceptions).

## Env, errors and tests

- Typed env: `src/env.ts` (`docs/env.md`, section bookings). The Sentry DSN comes from the shared catalogue (`SENTRY_DSN_<APP>` in render-env).
- Unexpected errors throw to `error.tsx` / `global-error.tsx`. A caught error that shows a fallback calls `reportError(error, "<area>")` from `src/lib/report-error.ts`.
- Tests: `pnpm --filter @barrelsgd/web-bookings test` (jsdom, fixed values in `vitest.config.ts`).
- CSP is Report-Only through `packages/ui` `APP_SOURCES.bookings` (Turnstile allowed for the booking form).

## Deployment

Compose service `web-bookings` with its own Traefik router and certificate (`bookings.${BASE_DOMAIN}`), release scope in `scripts/ci/release-scope.mjs`, service-catalogue entry in `packages/ui/src/lib/service-catalogue.json`, monitor in `scripts/monitoring/betterstack.json` (paused, deferred). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined at build time, so the Dockerfile/build workflow needs it as a build arg before the widget shows in production (not wired yet). Needs a DNS record for `bookings.*` and the GitHub secret `BOOKINGS_SSO_CLIENT_SECRET` (optional: empty keeps sign-in off).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
