# Babydoll Beauty Bar website

Client website for Babydoll Beauty Bar (lashes, brows and skin, St. George's,
Grenada), built by Barrels Grenada. Next.js App Router, fully static, hosted on
Vercel at `https://babydoll.barrels.gd`.

```bash
pnpm dev:web:babydoll                      # http://localhost:3014 (host only)
pnpm --filter @barrelsgd/web-babydoll test
pnpm --filter @barrelsgd/web-babydoll build
```

Content lives in `src/data/site.ts`. Booking goes to the client's Acuity page;
there is no backend.

## Vercel

- Project: `babydoll-beauty-bar`. Root directory: `apps/web/babydoll`. Include
  files outside the root directory (workspace install). Node 24.
- Install and build commands come from `vercel.json`.
- Domain: `babydoll.barrels.gd`, with an explicit Cloudflare CNAME to Vercel
  (DNS only) so it does not fall through the DigitalOcean wildcard.
- No environment variables are needed.
