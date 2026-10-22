# Extended agent rules

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-14

Detail moved out of the root `AGENTS.md` to keep it short. The rules are
unchanged; `AGENTS.md` links here. Read the relevant section before touching
design tokens, branding, telemetry, monitoring or CI workflows.

## Design details

- Loop: `docs/design-workflow.md`. Token contract: `docs/design-system.md`. Before building UI, read the lane spec `docs/design/<gms|gaa-admin|mbia|signal|elections|events>.md` (DESIGN.md format; drift-tested by `pnpm test:docs`).
- **Figma is not linked to this repo.** Ignore Figma tools and node URLs; design intent arrives via Claude Design or a supplied screenshot. Never ask for a Figma frame URL.
- Style only with `--gm-*` tokens / Tailwind aliases / shadcn semantics — never hardcode color/spacing/radius or add design values to Tailwind config. New or changed `--gm-*` tokens need approval and land in `packages/gms/src/styles/foundation.css`, **not** `packages/ui`. Run `pnpm design-system:sync` after editing the canonical block in `packages/ui/src/styles/globals.css`.
- Brand: navy `#0b132b`, blue `#2878f5`, sky `#37a3ef`, lime `#b9ee63`. Kit hues fail AA as small text — use `--gm-*-ink` for text under 24px regular / 18.66px bold, icons under ~24px, and fills behind small white text.
- Logo: `@barrelsgd/gms/components/logo`; never hardcode a path or set `width`/`height` (use `className`). Retired: `--gm-sun`, the orange wordmark.
- Token commands: `pnpm design-system:check` (gate), `:audit` / `:audit:full`, `:contrast`, `:sync`. Dark mode is class-based; prefer semantic tokens over `dark:*` in shared primitives; printable "papers" stay light.

## Form patterns (React 19)

- An uncontrolled `<form action={fn}>` is reset by React 19 after the action settles, even on a refusal, which wipes what the user typed. For `useActionState` forms whose success redirects or unmounts, submit through `onSubmit` + `startTransition` (`keepValuesOnSubmit`, `apps/web/bookings/src/lib/keep-values.ts`); otherwise return the submitted values from the action and use them as `defaultValue`.
- A page-level form that only has `onSubmit` falls back to a native GET before hydration, which puts passwords and personal data in the URL. Disable its submit until hydrated (`useHydrated()`, `use-hydrated.ts` in the auth and bookings apps). Never rely on a handler that has not attached yet.

## Telemetry, Sentry and monitoring

- Only the `area`, `digest` and `request_id` tags survive the privacy scrubber; `reportError` skips expected 4xx responses through the shared `shouldReportError` rule.

- Sentry: owner-approved shared projects for this repo are `grenmet-staging` and `grenmet-production`; route only through the matching environment secret, never cross-environment fallback. Preserve existing reporting during migration.
- **Telemetry rollout:** verify dev → staging → production, with app/environment mappings in `packages/ui/src/lib/service-catalogue.json`; missing mappings disable collection, never fall back to another owner’s project.
- **Public browser analytics:** collect only on production `barrels.gd` and its public subdomains; staging and previews must stay disabled even if legacy provider IDs exist. See `docs/operations/analytics-monitoring.md`.
- **Monitoring ownership:** manage provider configuration, host probes and backup/restore jobs through reviewed CI/CD; activation and evidence gates are in `docs/operations/analytics-monitoring.md`.

## Code style details

- Use `cn` for conditional utilities and caller `className`, but keep custom `text-*` size and colour pairs intact where `cn` would merge them.
- Repo-wide `pnpm fix` reformats unrelated in-progress files; use it only deliberately (for example after a dependency bump).
- Other gates: `pnpm docs:check-links && pnpm docs:check-portfolio && pnpm test:docs` (docs), `pnpm design-system:check` (tokens), `./scripts/format.sh` (Ruff fix and format, from `apps/api/fastapi`).

## CI/CD details

- Docker image names in GitHub workflows must be lowercase.
- Pin all GitHub Actions to SHAs, not tags.
- After modifying Biome config, verify both `assist` and `formatter` override keys; Linux CI formatting can differ from macOS.
- `outputFileTracingRoot` in Next.js config must be top-level, not inside `experimental`.
- `packages/api-client/src/gen/` must stay in sync with `apps/api/fastapi/openapi.json`; drift fails CI.
