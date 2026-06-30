# Grenada Signal (`@grenmet/web-signal`)

Mobile-first civic-media front door for **Grenada Signal** — a Morning Brew-style
single-column reader. Port **3004**, domain `signal.barrels.gd`.

MVP scope: static MDX content, light mode, no auth, no database.

```bash
pnpm --filter @grenmet/web-signal dev     # http://localhost:3004
pnpm --filter @grenmet/web-signal build
pnpm --filter @grenmet/web-signal test
```

## Content

All content is in-repo MDX, typed via **content-collections** (`content-collections.ts`):

- `content/briefs/<date>.mdx` — the daily **Morning Signal** brief (`/today/<date>`).
- `content/<section>/<slug>.mdx` — section articles (`/<section>/<slug>`).

Sections: `weather-ready`, `check-d-ting`, `opportunity` (see `src/lib/nav.ts`).

To add a story, drop an MDX file in the right folder with the frontmatter the Zod
schema in `content-collections.ts` requires (`title`, `dek`, `section`, `author`,
`publishedAt`, `heroImage`, `heroAlt`, `sources`). Hero images live in
`public/images/`.

## Design

Tailwind v4 on the `@grenmet/ui` foundation, reskinned to the Signal palette in
`src/app/globals.css` (Grenada green + gold, ink text; red reserved for alerts).
Source Serif 4 headlines + Inter body. UI primitives come from `@grenmet/ui`.

## Subscribe

`src/components/subscribe-band.tsx` posts to `src/app/api/subscribe/route.ts`,
which validates (`src/lib/subscribe.ts`) and logs only — **storage is deferred**.
