# Design System Migration to admin-gms

**Status:** In progress
**Started:** 2026-05-31
**Owner:** Eugine Whint

## Goal

Migrate the GrenMet v1 design system from legacy per-app styles into
`@grenmet/ui` and apply it consistently across `admin-gms` first, then
roll out to remaining apps.

## Why

Components were duplicated across apps with inconsistent tokens. Centralising
in `@grenmet/ui` means design changes propagate once, agents can reason about
one source of truth, and new apps start with the full system.

## Scope

- `packages/ui` — canonical home for all shared components and tokens
- `apps/web/admin-gms` — first app to fully adopt `@grenmet/ui`
- Remaining apps — follow-on after admin-gms is stable

## Decisions made

- Using Base UI primitives (not Radix) — already in place, no change
- shadcn-style component pattern — copy-owned, not a runtime dependency
- Figma MCP used for design-to-code sync — do not bypass for manual edits

## Progress

- [x] `@grenmet/ui` package scaffolded with core primitives
- [x] Design tokens established in `docs/design-system.md`
- [ ] All admin-gms pages using `@grenmet/ui` exclusively
- [ ] Remaining apps migrated

## Do not

- Add new per-app component implementations that duplicate `@grenmet/ui`
- Change token values without updating `docs/design-system.md`
- Skip the Figma sync step when adding new components
