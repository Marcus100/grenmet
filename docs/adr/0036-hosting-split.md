# ADR-0036: Hosting split between Vercel and the droplets

## Status

Accepted (owner decision, 2026-10-20).

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
