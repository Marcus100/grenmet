# Extended agent rules

**Last updated:** 2026-10-11

Detail moved out of the root `AGENTS.md` to keep it under its 20 KB budget. The
rules are unchanged; `AGENTS.md` links here. Read the relevant section before
touching design tokens, branding, telemetry or monitoring.

## Design details

- Loop: `docs/design-workflow.md`. Token contract: `docs/design-system.md`. Before building UI, read the lane spec `docs/design/<gms|gaa-admin|mbia|signal|elections|events>.md` (DESIGN.md format; drift-tested by `pnpm test:docs`).
- **Figma is not linked to this repo.** Ignore Figma tools and node URLs; design intent arrives via Claude Design or a supplied screenshot. Never ask for a Figma frame URL.
- Style only with `--gm-*` tokens / Tailwind aliases / shadcn semantics — never hardcode color/spacing/radius or add design values to Tailwind config. New or changed `--gm-*` tokens need approval and land in `packages/gms/src/styles/foundation.css`, **not** `packages/ui`. Run `pnpm design-system:sync` after editing the canonical block in `packages/ui/src/styles/globals.css`.
- Brand: navy `#0b132b`, blue `#2878f5`, sky `#37a3ef`, lime `#b9ee63`. Kit hues fail AA as small text — use `--gm-*-ink` for text under 24px regular / 18.66px bold, icons under ~24px, and fills behind small white text.
- Logo: `@barrelsgd/gms/components/logo`; never hardcode a path or set `width`/`height` (use `className`). Retired: `--gm-sun`, the orange wordmark.
- Token commands: `pnpm design-system:check` (gate), `:audit` / `:audit:full`, `:contrast`, `:sync`. Dark mode is class-based; prefer semantic tokens over `dark:*` in shared primitives; printable "papers" stay light.

## Telemetry, Sentry and monitoring

- Sentry: owner-approved shared projects for this repo are `grenmet-staging` and `grenmet-production`; route only through the matching environment secret, never cross-environment fallback. Preserve existing reporting during migration.
- **Telemetry rollout:** verify dev → staging → production, with app/environment mappings in `packages/ui/src/lib/service-catalogue.json`; missing mappings disable collection, never fall back to another owner’s project.
- **Public browser analytics:** collect only on production `barrels.gd` and its public subdomains; staging and previews must stay disabled even if legacy provider IDs exist. See `docs/operations/analytics-monitoring.md`.
- **Monitoring ownership:** manage provider configuration, host probes and backup/restore jobs through reviewed CI/CD; activation and evidence gates are in `docs/operations/analytics-monitoring.md`.
