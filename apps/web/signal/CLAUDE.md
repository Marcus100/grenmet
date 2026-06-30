# signal (`@grenmet/web-signal`) — Claude context

Port **3004**. Mobile-first, Morning Brew-style civic-media reader for **Grenada
Signal**. Domain `signal.barrels.gd`. MVP: static MDX, light mode, no auth, no DB.

## MDX pipeline — Content Collections

Same pattern as `hurricaneplan`, trimmed (no Shiki/search). MDX is compiled via
`@content-collections/next` (wired in `next.config.ts` with `withContentCollections`).

| File | Purpose |
|---|---|
| `content-collections.ts` | Zod schemas for `articles` + `briefs`; compiles MDX with `remark-gfm` |
| `content/briefs/<date>.mdx` | Daily Morning Signal brief — frontmatter `date,title,presenter,dek` |
| `content/<section>/<slug>.mdx` | Section article — frontmatter incl. `section`, `sources[]` |
| `src/components/mdx-content.tsx` | Renders compiled body via `MDXContent` |

- Generated output lands in `.content-collections/` (gitignored — regenerated on
  `dev`/`build`). The `content-collections` import alias is set in `tsconfig.json`.
- **`type-check` and `test` require a `build` first** (or `dev`) so the generated
  module exists. Run `pnpm --filter @grenmet/web-signal build` before type-check.

## Content model

- Sections live in `src/lib/nav.ts` (`SECTIONS`, `NAV_LINKS`). Three for MVP:
  `weather-ready`, `check-d-ting`, `opportunity`.
- `src/lib/content.ts` wraps the generated arrays; pure query helpers are in
  `src/lib/content-utils.ts` (kept separate so they're unit-testable without the
  generated module).

## Design system

- `src/app/globals.css` imports `@grenmet/ui/styles/globals` then **overrides** the
  shadcn semantic tokens to the Signal palette (`--signal-green`/`--signal-gold`/
  ink). Red (`--signal-alert`) is for alerts only.
- Fonts: Source Serif 4 (headlines, `--font-serif`) + Inter (body, `--font-sans`),
  wired in `src/app/layout.tsx` via `next/font/google`.
- Use `@grenmet/ui` primitives (`button`, `input`, `sheet`, …) — imported per-file
  (`@grenmet/ui/components/ui/<name>`), `cn` from `@grenmet/ui/lib/utils`.

## Subscribe

`subscribe-band.tsx` → `POST /api/subscribe`. Validation in `src/lib/subscribe.ts`
(Zod). **Storage deferred** — the route validates and logs only. When wiring a real
store, keep the schema and add persistence in the route; the form contract stays.

## Testing

Vitest + Testing Library + jsdom (`vitest.config.ts`, setup `src/test/setup.ts`).
Tests cover `lib/*` pure logic and key component renders. Component tests must not
import `src/lib/content.ts` (it pulls the generated module) — use `content-utils.ts`.

```bash
pnpm --filter @grenmet/web-signal test
```
