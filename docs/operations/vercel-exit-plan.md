# Leaving Vercel: plan for the three sites

**Status:** Plan only; nothing here has been run  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-05

The owner does not plan to pay for Vercel and the free tier's build limit is
already reached (the Vercel checks on pull requests fail with "upgrade to Pro").
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
| `babydoll.barrels.gd` (`apps/web/babydoll`) | Vercel; explicit `CNAME` over the wildcard | Next.js with server actions and an `ics` route for online booking | The droplet (ADR-0036 rule 3) |

`commit.barrels.gd` is already on Cloudflare Pages and is the working example.

## Order

1. **Barrels homepage.** Easiest: no server code.
   - **[agent]** Confirm `node apps/web/barrels/build.mjs <turnstile site key>`
     writes everything to `dist/` with no Vercel-only features (`vercel.json`
     redirects and headers need a Pages `_redirects` and `_headers` equivalent;
     `www` redirects to the apex).
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
3. **Babydoll** (client site, last, with a short agreed window).
   - **[agent]** Add `babydoll` to the deploy compose file as a droplet service
     with the host rule for `babydoll.${BASE_DOMAIN}`, its Dockerfile, health check
     and public settings through the run-time settings file (#1025); extend
     `docs/ports.md`. Test on a staging hostname first (staging has none today, so
     use a temporary one).
   - **[owner]** Remove the explicit `babydoll` `CNAME` so the droplet wildcard
     applies; keep the Vercel project until the booking flow (`BABYDOLL_ONLINE_BOOKING`,
     Turnstile, the `ics` download, a cancel link) has been tried end to end.

## Before touching DNS

- Lower the record's TTL a day ahead. Write down the current records (they are
  public: the apex `A`, the `www`, `babydoll` and `elections` `CNAME`s).
- **Droplet capacity.** The production droplet showed 71% memory and 92% swap on
  2026-11-05. Measure before adding Babydoll (`docker stats`, `free -m`) and decide
  on a resize first; do not resize on a guess.
- Preview deployments disappear with Vercel. Cloudflare Pages gives previews for
  the static sites; Babydoll relies on staging.

## Rollback

Until the Vercel projects are deleted, rolling back is restoring the old DNS
record. Delete the Vercel projects and their environment variables only after a
week of clean traffic on the new host, and remove the Vercel checks from the
pull-request required list when the last project is gone.

## Cost

Cloudflare Pages is free for these static sites. The droplet is already paid for;
a resize, if needed, is a decision for the owner with its monthly price stated
first.
