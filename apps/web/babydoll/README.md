# Babydoll Beauty Bar website

Client website for Babydoll Beauty Bar (lashes, brows and skin, St. George's,
Grenada), built by Barrels Grenada. Next.js App Router, fully static, hosted on
Cloudflare Pages at `https://babydoll.barrels.gd` (since the cutover of 15 to 16 Nov 2026).

```bash
pnpm dev:web:babydoll                      # http://localhost:3014 (host only)
pnpm --filter @barrelsgd/web-babydoll test
pnpm --filter @barrelsgd/web-babydoll build
```

Content lives in `src/data/site.ts`. Book buttons open the studio's page on the
Barrels bookings site (`https://bookings.barrels.gd/babydoll-beauty-bar`); this
site has no backend.

## Hosting

- Cloudflare Pages: build command and output directory are in
  `docs/operations/vercel-exit-plan.md`; headers and redirects come from
  `public/_headers` and `public/_redirects`. Node 24.
- Domain: `babydoll.barrels.gd`, an explicit DNS record so it does not fall
  through the DigitalOcean wildcard.
- No environment variables are needed.
- The old Vercel project (`babydoll-beauty-bar`, settings in `vercel.json`) is
  kept as the rollback for about a week after the move, then deleted.
