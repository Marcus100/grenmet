# ADR-0036: Hosting split between Vercel and the droplets

## Status

Accepted (owner decision, 2026-10-20).

## Amendment (owner decision, 2026-10-27)

- **Static sites move to Cloudflare Pages.** Cloudflare's free tier allows
  commercial use (Vercel's Hobby tier does not) and the DNS is already on
  Cloudflare. A site keeps working on its current host until its Pages
  deployment is verified; then its DNS is cut over. DigitalOcean stays for
  everything that needs a server (rule 2 below is unchanged).
- New static sites start on Pages: `apps/web/commit` (`commit.barrels.gd`) is
  the first. The homepage and Elections follow; Babydoll needs an adapter for
  its server actions, so it stays on Vercel until that is decided.
- **Elections dropped Barrels sign-in** (#792), so it now meets rule 2.
- Read "Vercel" in rules 1, 3 and 4 as "static hosting (Cloudflare Pages, or
  Vercel for sites not yet moved)".

## Context

Most apps run on Barrels droplets with Docker Compose and Traefik (ADR-0005). Three sites deploy to Vercel instead: the Barrels homepage, Elections and Babydoll (`docs/deployment.md`; Babydoll is "hosted on Vercel at `babydoll.barrels.gd`" per `apps/web/babydoll/AGENTS.md`). The owner prefers free and open-source tools. Vercel is a hosted vendor.

## Decision

1. Static client marketing sites with no server-side data may run on Vercel's free tier. Babydoll's site is the example.
2. Anything that signs users in, calls the API with credentials, or stores data runs on the Barrels droplets (ADR-0005).
3. If Vercel starts charging or limits a site, move it to the droplets.
4. Vercel is a vendor exception for static sites only. It does not set a precedent for other apps.

## Consequences

- Elections is already on Vercel and uses single sign-on (`docs/env.md`), so it does not meet rule 2. Decide separately whether to move it; this ADR does not do that.
- Secrets for Vercel-hosted sites stay in Vercel (ADR-0035).
- Static sites keep their build self-contained so a move to a droplet is a packaging change, not a rewrite.
- Babydoll's online booking switch (`BABYDOLL_ONLINE_BOOKING`) is a build-time Vercel variable. If online booking ever sends data through the API with credentials, Babydoll must move first.
