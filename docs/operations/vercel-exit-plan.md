# Leaving Vercel: plan for the three sites

**Status:** Step 1 prepared in the repo; no Cloudflare project or DNS change has been made. Vercel's Git integration is disconnected for all three projects since 2026-11-13  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-14

The owner does not plan to pay for Vercel and the free tier's build limit is
already reached (the Vercel checks on pull requests failed with "upgrade to Pro").
On 13 Nov 2026 the owner disconnected the Git integration of the three Vercel
projects (the Barrels homepage, Elections and Babydoll), so pull requests no
longer get Vercel checks. The three sites keep serving from Vercel until each
one moves.
ADR-0036 and its 2026-10-27 amendment already say where each site goes: static
sites to Cloudflare Pages, anything with a server to the droplets. This page turns
that into an order of work.

Marks: **[agent]** an agent can prepare it in the repo; **[owner]** needs a
Cloudflare or DNS dashboard, a secret or a go. A site keeps working on Vercel
until its new home is verified; only then does DNS change.

## Where each site is today

| Site | Host now | What it is | Target |
| --- | --- | --- | --- |
| `barrels.gd` (`apps/web/barrels`) | Vercel; apex `A` record, `www` `CNAME` | Plain static HTML built by `build.mjs`, forms post to the API | Cloudflare Pages |
| `elections.barrels.gd` (`apps/web/elections`) | Vercel; `CNAME` | Next.js, no sign-in (#792), a few `GET` JSON route handlers, `output: "standalone"` | Cloudflare Pages if it exports statically, else the droplet |
| `babydoll.barrels.gd` (`apps/web/babydoll`) | Vercel; explicit `CNAME` over the wildcard | Static Next.js export since 13 Nov 2026: the booking code was removed (owner), Book buttons open the studio's booking page elsewhere | Cloudflare Pages |

`commit.barrels.gd` is already on Cloudflare Pages and is the working example.

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
   - **[agent]** Try `output: "export"` in a branch: the four `*.json` handlers
     need `export const dynamic = "force-static"`; `api/health` goes (Pages has no
     health route). If the build passes and the pages render the same, ship it as
     static; if not, package it like the other droplet apps (compose service,
     Traefik host rule, `docs/ports.md`).
   - **[owner]** Same Pages steps as step 1, or the droplet deploy.
3. **Babydoll** (client site; static since 13 Nov 2026, owner decision).
   - **Done in the repo:** booking routes and server code removed,
     `output: "export"` builds `apps/web/babydoll/out`, `public/_headers` and
     `public/_redirects` carry the headers and the old `/book` addresses.
   - **[owner or agent with the API token]** Create a Pages project (build
     command `pnpm --filter '@barrelsgd/web-babydoll^...' run build && pnpm --filter @barrelsgd/web-babydoll build`,
     output `apps/web/babydoll/out`, `NODE_VERSION=24`), add the custom domain,
     then replace the explicit `babydoll` `CNAME` (ask the owner before the DNS
     change).
   - When the studio's page on the bookings site is live, set
     `ONLINE_BOOKING_URL` in `src/data/site.ts` and the two redirect files.

## Before touching DNS

- Lower the record's TTL a day ahead. Write down the current records (they are
  public: the apex `A`, the `www`, `babydoll` and `elections` `CNAME`s).
- Preview deployments disappear with Vercel (pull requests already get none
  since the Git integration was disconnected on 13 Nov 2026). Cloudflare Pages
  gives previews for all three sites.

## Rollback

Until the Vercel projects are deleted, rolling back is restoring the old DNS
record. Delete the Vercel projects and their environment variables only after a
week of clean traffic on the new host. Pull requests have had no Vercel checks
since 13 Nov 2026, and `infra/github/rulesets.json` requires none, so there is
nothing to remove from the required list.

## Cost

Cloudflare Pages is free for these static sites. The droplet is already paid for;
a resize, if needed, is a decision for the owner with its monthly price stated
first.
