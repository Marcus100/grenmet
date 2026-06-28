# ADR-0006: Govern Shared UI Through GrenMet Tokens And Packages

## Status

Accepted

## Context

The repo has several apps with overlapping public weather, internal dashboard, document, and product UI needs.

## Decision

Use `@grenmet/ui` as the shared UI package and `docs/design-system.md` as the implementation guide for tokens, component lanes, Figma alignment, and drift checks.

## Consequences

- Apps should import shared primitives from `@grenmet/ui/components/ui/<name>`.
- Token changes must be synchronized between `packages/ui/src/styles/globals.css` and generated app blocks.
- App-specific fixed document dimensions stay local until approved as shared patterns.
- Design-system audits are allowed to identify migration debt before rules become CI blockers.

