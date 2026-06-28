---
description: Analyze all pages of the GrenMet v1 Figma design system file and report structure, status, and drift against the repo
argument-hint: [page name or focus area, e.g. "13 Components" or "tokens"]
allowed-tools: mcp__figma__get_metadata, mcp__figma__get_screenshot, mcp__figma__get_design_context, mcp__figma__get_variable_defs, Bash, Read, Grep, Glob
---

## Analyse GrenMet v1

Analyze the GrenMet v1 design system Figma file and produce a structured report.

**File:** https://www.figma.com/design/kfVRAcgxzhs4Sj6aCRyOz4/GrenMet-v1
**fileKey:** `kfVRAcgxzhs4Sj6aCRyOz4`

### Page map — query by node ID only

Do NOT call `get_metadata` without a nodeId: the page listing for this file is stale and returns only 2 of the 10 pages. Always query each page directly:

| Page | nodeId |
|---|---|
| 00 Overview | 92:2 |
| 01 Process | 61:615 |
| 10 Brand | 167:13414 |
| 11 Foundations | 815:98 |
| 12 Design System | 92:3 |
| 13 Components | 92:4 |
| 14 Icon Library | 785:72 |
| 20 Products | 274:21783 |
| 30 Website | 275:21785 |
| 99 Archive | 92:7 |

### Scope

If `$ARGUMENTS` names a page or focus area, restrict the analysis to it. Otherwise analyze all 10 pages.

### Step 1 — Read every page

Call `get_metadata` for each page nodeId (batch independent calls in parallel).

Large pages (11 Foundations ~77KB, 14 Icon Library ~265KB, 30 Website ~155KB) exceed the inline limit — the result is saved to a tool-results file. Parse those with python (the file is a JSON array `[{type, text}]`; join the `text` fields, then regex out `<section>`, `<symbol>`, and `<frame>` names) instead of reading the raw dump.

### Step 2 — Per-page analysis

For each page record:
- Section inventory (numbered sections, status chips: Production / Pattern / Guidance / Internal / Deprecated)
- Component sets and variant counts (`<symbol>` nodes; naming should follow `GrenMet / <Domain> / <Component>`)
- Changelog entries and dated snapshots (Overview changelog, Component Rules drift snapshot, Design System drift snapshot) — note the dates and whether they look current
- Naming violations, stray non-componentized frames, anything still in 98 Deprecated / 99 Archive that active pages reference

### Step 3 — Cross-check against the repo

Compare Figma claims against the codebase (read-only):
- `docs/design-system.md` — does it match the file's current structure (the file itself flags "local docs still describe the old two-page MCP map")?
- `packages/ui` — do `GrenMet / Core / *` component sets (Button variants/sizes, Input states) match the code API?
- `--gm-*` token contract — Foundations claims 80 Light variables with WEB syntax; spot-check against the shared CSS foundation (`grep` for `--gm-` in packages/apps)
- `pnpm design-system:sync` / `:check` / `:audit` scripts — confirm they exist and note the known rootDir path bug flagged in the 2026-05-31 drift snapshot

### Step 4 — Report

Output a single report with:
1. **TL;DR** — file health in 3–4 sentences
2. **Page-by-page summary** — one short paragraph per page
3. **Drift findings** — Figma↔repo mismatches, each with evidence (node name + file path)
4. **Stale content** — outdated changelog/snapshot dates, deprecated items still referenced
5. **Recommended actions** — prioritized, but do NOT implement anything; this command is analysis-only

Analysis only: do not edit files, do not write to Figma. If asked to fix a finding, that is a separate task requiring explicit approval.
