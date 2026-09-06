# ADR-0012: Decouple Design Tooling From Figma

## Status

Accepted. Supersedes the Figma-linked governance in
[ADR-0006](0006-design-system-governance.md) and
[ADR-0011](0011-brand-neutral-design-tokens.md). Those ADRs otherwise stand:
`@barrelsgd/ui` remains the shared UI package, and brand palettes remain separate
from shared primitives.

## Context

ADR-0006 made `docs/design-system.md` the implementation guide for "tokens,
component lanes, Figma alignment, and drift checks", and the workflow that grew
around it treated a specific Figma file (`GrenMet v1`,
`kfVRAcgxzhs4Sj6aCRyOz4`) as the canonical design source. That produced a set of
hard couplings:

- Token governance required an approved change to land **in Figma and in
  `globals.css` together** before it counted as part of the contract.
- Agent instructions mandated the Figma MCP bridge — `/figma-use` before any
  `use_figma` call, `/figma-generate-design` to translate a layout,
  `/analyse-grenmet` to audit file structure, and `/ui-check` against a Figma node.
- `packages/ui` carried `@figma/code-connect` and one Code Connect mapping,
  `button.figma.tsx`, pinned to a Figma node ID.
- Code Connect publishing was permanently blocked: the Figma account in use is an
  Education account, which does not expose the required write access.

The Figma file is no longer linked to this repository. Figma may still be used as
a private design tool, but it is not a source this repo reads from, and no
automated bridge remains. Keeping the couplings meant agents would ask for Figma
frame URLs that do not exist, and a token change could never satisfy a governance
rule requiring it to "land in Figma".

## Decision

Treat design intent as an input to the repository, not a linked system of record.

- **`packages/ui/src/styles/globals.css` is the sole source of the token
  contract.** Approved `--gm-*` changes land there and propagate via
  `pnpm design-system:sync`; no external design tool has to be reconciled first.
- **Design intent arrives as a Claude Design canvas, a user-supplied screenshot,
  or a written brief.** The `/design` skill produces a canvas when none exists.
- **`/ui-check` verifies a built component against that reference** rather than
  against a Figma node.
- **Remove the dead Figma coupling**: `@figma/code-connect`,
  `button.figma.tsx`, the `mcp__figma__*` permissions in `.claude/settings.json`,
  and the `/analyse-grenmet` command, which audited Figma file structure and has
  no meaning unlinked.

Token approval itself is unchanged: adding or changing a `--gm-*` token is still
a cross-app contract change requiring user approval.

## Consequences

- Agents must ignore Figma MCP tools and never ask for a Figma frame URL. This is
  stated in `CLAUDE.md` and `docs/design-workflow.md`.
- Token changes are cheaper: one approval, one file, one sync — no design-tool
  reconciliation step that could not be completed anyway.
- Design fidelity is verified against a screenshot or canvas rather than extracted
  node metadata, so it depends more on explicit review and less on automation.
- `docs/design-system.md` retains historical detail about the Figma file map and
  the Button/Input Code Connect pilots. That is recorded history, not current
  process; this ADR governs.
- Should a design tool ever be re-linked, it would need a new ADR superseding this
  one, and the Education-account limitation on Code Connect would have to be
  resolved first.
