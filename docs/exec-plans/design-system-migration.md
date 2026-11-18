# Design System Migration to gaa-admin

**Status:** In progress
**Started:** 2026-05-31
**Owner:** Eugine Whint  
**Last updated:** 2026-11-18

## Goal

Migrate the Barrels design system v1 from legacy per-app styles into
`@barrelsgd/ui` and apply it consistently across `gaa-admin` first, then
roll out to remaining apps.

## Why

Components were duplicated across apps with inconsistent tokens. Centralising
in `@barrelsgd/ui` means design changes propagate once, agents can reason about
one source of truth, and new apps start with the full system.

## Scope

- `packages/ui` — canonical home for all shared components and tokens
- `apps/web/gaa-admin` — first app to fully adopt `@barrelsgd/ui`
- Remaining apps — follow-on after gaa-admin is stable

## Decisions made

- Using Base UI primitives (not Radix) — already in place, no change
- shadcn-style component pattern — copy-owned, not a runtime dependency
- Design tooling is decoupled from Figma (ADR-0012); there is no Figma sync, and Figma is not linked

## Progress

- [x] `@barrelsgd/ui` package scaffolded with core primitives
- [x] Design tokens established in `docs/design-system.md`
- [ ] All gaa-admin pages using `@barrelsgd/ui` exclusively
- [ ] Remaining apps migrated

## Do not

- Add new per-app component implementations that duplicate `@barrelsgd/ui`
- Change token values without updating `docs/design-system.md`
- Look for a Figma file or sync step: none exists (ADR-0012)
