# Leaving Vercel: plan for the three sites

**Status:** Done for serving: `barrels.gd`, `elections.barrels.gd` and `babydoll.barrels.gd` are on Cloudflare Pages since the cutover of 15 to 16 Nov 2026 (as `commit.barrels.gd` already was). Still to do: delete the Vercel projects after a week of clean traffic  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-16

> **State on 16 Nov 2026 (v1.3.0).** All three sites answer from Cloudflare
> (`curl -sI https://<host>` shows `server: cloudflare` and no `x-vercel-id`
> header). The Vercel projects are kept for about a week as the rollback, then
> deleted with their environment variables (see "Rollback"). The sections below
> are kept as the record of how each site moved; read "[owner]" steps as done
> unless a line says otherwise.

The owner does not plan to pay for Vercel and the free tier's build limit is
already reached (the Vercel checks on pull requests failed with "upgrade to Pro").
On 13 Nov 2026 the owner disconnected the Git integration of the three Vercel
projects (the Barrels homepage, Elections and Babydoll), so pull requests no
longer get Vercel checks. The three sites kept serving from Vercel until each
one moved.
ADR-0036 and its 2026-10-27 amendment already say where each site goes: static
sites to Cloudflare Pages, anything with a server to the droplets. This page turns
that into an order of work.

Marks: **[agent]** an agent can prepare it in the repo; **[owner]** needs a
Cloudflare or DNS dashboard, a secret or a go. A site keeps working on Vercel
until its new home is verified; only then does DNS change.

## Where each site is today

| Site | Host before | What it is | Host now |
| --- | --- | --- | --- |
| `barrels.gd` (`apps/web/barrels`) | Vercel; apex `A` record, `www` `CNAME` | Plain static HTML built by `build.mjs`, forms post to the API | Cloudflare Pages |
| `elections.barrels.gd` (`apps/web/elections`) | Vercel; `CNAME` | Next.js static export (`output: "export"`), no sign-in (#792), four prebuilt `*.json` files | Cloudflare Pages |
| `babydoll.barrels.gd` (`apps/web/babydoll`) | Vercel; explicit `CNAME` over the wildcard | Static Next.js export since 13 Nov 2026: the booking code was removed (owner), Book buttons open `https://bookings.barrels.gd/babydoll-beauty-bar` since v1.2.0 | Cloudflare Pages |

`commit.barrels.gd` was already on Cloudflare Pages and was the working example.

## Order

1. **Barrels homepage.** Easiest: no server code.
   - **Done in the repo (2026-11-13):** `build.mjs` writes `dist/_headers` from
     `vercel.json`'s headers, so Pages serves the same CSP; `site.test.mjs` checks
     it. `vercel.json` has no redirects; the `www` to apex redirect is a Cloudflare
     redirect rule the owner adds with the custom domain.
   - **[owner]** Create a Pages project (same pattern as `commit`: build command,
     output `apps/web/barrels/dist`, `NODE_VERSION=24`, and the Turnstile site key
     as a build variable), add the custom domain and the `www` redirect.
   - Check: forms still reach the API (the production CORS list must keep
     `https://barrels.gd` and `https://www.barrels.gd`), the CSP still allows
     Turnstile.
2. **Elections.**
   - **Done in the repo (15 Nov 2026, PR for `feat/elections-static-export`,
     superseding #1321):** `output: "export"` builds `apps/web/elections/out`.
     The four `*.json` handlers were already `force-static`; `api/health` is gone
     (Pages has no health route); no `revalidate`. "Today" (the masthead, the
     homepage headline, the 2026 headline and the timeline's today marker) is
     worked out in the browser (`src/lib/browser-today.ts`, owner decision), so
     the export never shows a stale date and no daily rebuild is needed.
     `public/_headers` and `public/_redirects` carry the headers and `/since-2022`;
     the build adds the Sentry report endpoint when a DSN is set.
   - **[owner]** Create the Pages project (no agent action without the owner):
     build command `pnpm install --frozen-lockfile --filter '@barrelsgd/web-elections...' && pnpm --filter '@barrelsgd/web-elections^...' run --if-present build && pnpm --filter @barrelsgd/web-elections build`,
     output `apps/web/elections/out`, `NODE_VERSION=24`, and the build variables
     from the Vercel project (`NEXT_PUBLIC_SITE_URL=https://elections.barrels.gd`,
     `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_PROJECT`).
     Then the custom domain and the DNS change, with the owner's go.
3. **Babydoll** (client site; static since 13 Nov 2026, owner decision).
   - **Done in the repo:** booking routes and server code removed,
     `output: "export"` builds `apps/web/babydoll/out`, `public/_headers` and
     `public/_redirects` carry the headers and the old `/book` addresses.
   - **[owner or agent with the API token]** Create a Pages project (build
     command `pnpm --filter '@barrelsgd/web-babydoll^...' run build && pnpm --filter @barrelsgd/web-babydoll build`,
     output `apps/web/babydoll/out`, `NODE_VERSION=24`), add the custom domain,
     then replace the explicit `babydoll` `CNAME` (ask the owner before the DNS
     change).
   - Done in v1.2.0: `ONLINE_BOOKING_URL` in `src/data/site.ts` and the two
     redirect files point at the studio's page on the bookings site.

## Before touching DNS

- Lower the record's TTL a day ahead. Write down the current records (they are
  public: the apex `A`, the `www`, `babydoll` and `elections` `CNAME`s).
- Preview deployments disappeared with Vercel (pull requests have had none
  since the Git integration was disconnected on 13 Nov 2026). Cloudflare Pages
  can give previews for all three sites.

## Rollback

Until the Vercel projects are deleted, rolling back is restoring the old DNS
record. Delete the Vercel projects and their environment variables only after a
week of clean traffic on the new host (so not before about 23 Nov 2026). After
that, the `vercel.json` files and the notes that depend on them (the Babydoll
and Barrels `AGENTS.md` files, `scripts/guardrails/vercel-build-dist.test.mjs`)
can be retired in one change. Pull requests have had no Vercel checks
since 13 Nov 2026, and `infra/github/rulesets.json` requires none, so there is
nothing to remove from the required list.

## Cost

Cloudflare Pages is free for these static sites. The droplet is already paid for;
a resize, if needed, is a decision for the owner with its monthly price stated
first.
