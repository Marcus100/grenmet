# ADR-0011: Separate Brand Palettes From Shared UI Primitives

## Status

Accepted. Supersedes [ADR-0006](0006-design-system-governance.md).

Its Figma-linked governance is superseded by [ADR-0012](0012-decouple-design-tooling-from-figma.md); the brand-neutrality
decision below stands.

## Context

ADR-0006 established `@barrelsgd/ui` as the shared UI package, but it did not say
whose brand that package carries. In practice it carried the Grenada
Meteorological Service's: the `--gm-*` palette was defined in
`packages/ui/src/styles/globals.css`, every semantic token resolved through it,
and shared primitives referenced GMS colours directly.

That was invisible while GMS was the only consumer. It stopped being acceptable
once the repository hosted Barrels products alongside client work: Signal, MBIA
and Events all inherited a client's weather-service palette by default, and there
was no way to give a second brand its own look without forking the primitives.

The wider transition (`docs/exec-plans/barrelsgd-transition.md`) separates
Barrels the company from GAA the client and GMS its meteorological department.
Shared UI had to stop expressing one of those as the default.

## Decision

**Shared UI carries no brand. Brands are packages.**

Three layers, in `packages/ui/src/styles/globals.css`:

1. **Brand primitives** — `--brand-*` and `--status-*`. Role-named, not
   colour-named, so a brand with different hues can override them without the
   names going stale. These are `@barrelsgd/ui`'s own defaults.
2. **Semantic contract** — `--background`, `--primary`, `--success` and the rest.
   Resolves only through layer 1. Overriding the primitives rebrands every shared
   primitive without touching this layer.
3. **Tailwind utilities** — `@theme inline`, exposing layer 2 as classes.

The **status palette is separate from the brand palette** because status meaning
must survive a rebrand: a brand may change its blue, but not what danger looks
like.

A **brand package** owns its own palette and assets. `@barrelsgd/gms` holds the
GMS logo, the `--gm-*` palette in `styles/foundation.css`, and GMS-specific
components. Only GMS surfaces import it.

**Generic scales are not brand assets.** Typography, spacing, radius and
elevation stay in `@barrelsgd/ui` under neutral names, so an application can use
the type scale without importing a client's palette.

Shared components reference the semantic layer only. A component that needs a
brand colour belongs in that brand's package.

## Consequences

- A new brand is a new package plus a palette override, not a fork of the
  primitives.
- `@barrelsgd/ui` may not reference `--gm-*`, and `@barrelsgd/gms` may not be a
  dependency of shared UI. The dependency direction is one-way.
- Every app must resolve a brand. Apps that do not import a brand package get
  `@barrelsgd/ui`'s defaults, which become Barrels' own when its brand values are
  supplied. Until then those defaults are deliberately unclaimed rather than
  invented.
- Adding a component that needs a brand colour is a signal it is in the wrong
  package.
- Spacing and radius were folded onto Tailwind's own scale rather than renamed,
  because their values duplicated it exactly. Do not reintroduce `--spacing-<n>`
  tokens: Tailwind v4 derives `p-4` from a single `--spacing` multiplier, and a
  literal `--spacing-4` shadows the computed scale and silently resizes every
  spacing utility in the repository.
- The generated-block sync, audit and contrast scripts split along the same
  seam. Contrast reads the GMS palette from `@barrelsgd/gms`; the audit accepts
  `--brand-*`, `--status-*` and `--gm-*` as legitimate token sources.
- `--gm-*` is retained. `gm` expands to *Grenada Met*, so the name is correct for
  a GMS brand package and was not renamed.
- The Figma artifacts still carry the retired `GrenMet` name. Renaming them is a
  Figma-side action and is the last step in retiring that term.
