# Leaving Vercel: plan for the three sites

**Status:** Step 1 prepared in the repo; no Cloudflare project or DNS change has been made  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-13

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
   - **Done in the repo (2026-11-13, PR #1321):** `output: "export"` builds every
     page into `apps/web/elections/out`; `api/health` and the hourly revalidate
     are gone; `public/_redirects` keeps `/since-2022`; `pnpm build` runs
     `scripts/pages-headers.mjs`, which writes `out/_headers` (nosniff, referrer
     policy and the shared report-only CSP).
   - **Daily rebuild (owner, 13 Nov 2026):** the masthead follows today's date,
     so `.github/workflows/elections-daily-rebuild.yml` calls the Pages
     project's deploy hook at 00:05 Grenada time. It does nothing until the hook
     URL is stored as the repository secret `ELECTIONS_PAGES_DEPLOY_HOOK`. A
     workflow file, so the owner merges this PR.
   - **[agent with the API token]** Pages project: build command
     `pnpm --filter '@barrelsgd/web-elections^...' run build && pnpm --filter @barrelsgd/web-elections build`,
     output `apps/web/elections/out`, `NODE_VERSION=24`, plus the
     `NEXT_PUBLIC_*` build variables from the Vercel project. Ask the owner
     before the DNS change.

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
