# @barrelsgd/gms — agent context

GMS client presentation package: GMS logo, `--gm-*` foundation tokens, and GMS components. GMS is a client of Barrels; this is not a Barrels product package.

- Exports: `./components/*` (`logo.tsx`, `alert-card.tsx`, `product-content.tsx`), `./styles/*` (`foundation.css` — canonical `--gm-*` tokens), `./products`, `./nav-sections` (the site navigation, shared so the CMS can read it), `./linkable-pages` (every built page, for pickers and cards) and `./link-recognition` (what a pasted GMS address points at).
- Consumers: auth, docs, gaa-admin, gms.
- May depend on `@barrelsgd/ui` / `@barrelsgd/theme`; they must never depend on this package (ADR-0011).
- New or changed `--gm-*` tokens need user approval and land in `src/styles/foundation.css`. Run `pnpm design-system:check` afterwards.
- Logo: render `@barrelsgd/gms/components/logo`; never set `width`/`height`.
