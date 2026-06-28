# Design Workflow

The end-to-end loop for designing and building web UI in this monorepo: Figma → code → verify → token guard. This is the *how*. For the token contract, governance, and per-app migration status, see [Design System](./design-system.md). For app-agnostic primitive rules, see [`packages/ui/CLAUDE.md`](../packages/ui/CLAUDE.md).

## Mental model

This is a **CSS-first, bidirectional bridge**. Figma owns design intent; `@grenmet/ui` owns repo enforcement. Tokens flow one direction; components map both.

```
Figma (GrenMet v1)  ──tokens──►  packages/ui/src/styles/globals.css  ──@theme──►  Tailwind v4 utils
   design intent                   --gm-* custom props + shadcn semantics         text-gm-blue, p-gm-4
        ▲                                    │
        │ Code Connect (deferred)            ▼
        └──────────────────────────  @grenmet/ui components  ──imported by──►  apps/web/<app>
```

Two non-negotiables, both backed by `CLAUDE.md` gates:

- **Never invent a color / spacing / radius / type value.** If it exists as a `--gm-*` token, use the token (or its Tailwind alias / shadcn semantic). Adding a `--gm-*` token or changing a value is a cross-app contract change and requires user approval, landed in Figma **and** `globals.css` together.
- **Never add design values to Tailwind config.** Tailwind v4 reads from `@theme` in `globals.css`, which reads from `--gm-*`. That single file is the source.

## The loop

### 1. Design in Figma — compose from existing components

Canonical source: **GrenMet v1** (`fileKey kfVRAcgxzhs4Sj6aCRyOz4`). The `30 Website` page is built entirely from `13 Components` instances. Design new screens by composing from that library so they map cleanly to `@grenmet/ui` later.

Query pages **by node ID** — the MCP page listing for this file is stale and returns only a subset. Node IDs are in the [File Map](./design-system.md#current-figma-file-map).

### 2. Bring the design into code (Figma skills — mandatory order)

- Run **`/figma-use` before any `use_figma` call** — required, not optional.
- **`/figma-generate-design`** — translate a Figma page or layout into code.
- `get_design_context`, `get_screenshot`, `get_variable_defs`, `get_metadata` — read tokens and structure from a node.
- **`/analyse-grenmet`** — audit the Figma file's structure and report drift against the repo.

Do **not** move pages between Figma files programmatically — instruct the user to do it in the Figma UI.

### 3. Build in the app

- **Server Components by default.** Add `"use client"` only for interactivity or browser hooks. Fetch server-fetchable data directly in Server Components — no React Query for it.
- Compose from `@grenmet/ui/components/ui/<name>` (per-file import, no barrel). Only write new markup when a primitive genuinely does not exist.
- Style with token utilities (`text-gm-blue`, `p-gm-4`, `text-gm-heading-md`, `bg-gm-warning-red-bg`) or shadcn semantics (`bg-background`, `border-border`).
- **Light mode only in v1.** Don't add `dark:` branches to shared primitives.
- One-off inline measurements are allowed but are treated as migration debt — keep them local, never promote them to tokens.
- Use the [Warning Pattern Checklist](./design-system.md#warning-pattern-checklist) for any warning, bulletin, or impact-based summary. Color must always be paired with visible text.

### 4. Verify design fidelity

- **`/ui-check`** — implement/refine a component against its Figma node: extracts tokens, lists discrepancies, proposes changes, iterates. This is the primary fidelity tool.
- Screenshot diffing uses the **Chrome MCP tool** (not Playwright) with the dev server running.
- Run the dev server for the specific app on its port (see the port table in [`technical-overview.md`](./technical-overview.md); e.g. `spicewx` = 3004, `admin-gms` = 3001, `cap` = 3008).

### 5. Guard the token contract

```bash
pnpm design-system:check      # fails if an app's generated foundation block is stale
                              # or declares --gm-* outside the generated block
pnpm design-system:audit      # warning-only: hard-coded colors, arbitrary spacing/radius,
                              # app-local shadows, dark hooks, non-canonical fonts
pnpm design-system:audit:full # uncapped report
pnpm design-system:contrast   # WCAG check for warning fg/bg pairs
```

If you changed the canonical token block in `packages/ui/src/styles/globals.css`, run `pnpm design-system:sync` **first** to regenerate every app's foundation block, then re-run `check`.

### 6. Close out

Always, no confirmation needed:

```bash
pnpm fix          # ultracite (Biome) autofix
pnpm type-check   # turbo run type-check
```

Include tests alongside any new component or significant logic — part of the task, not a follow-up.

## App roles for design work

Pick where to build based on the app's design-system lane (full table in [Design System → App Roles](./design-system.md#app-roles)):

- **`spicewx`** — public web **reference app**. Prototype and validate new public-facing patterns here first; it is the lowest-drift baseline.
- **`admin-gms`** — dense **internal dashboard** lane. Preserve operational density; map TailAdmin aliases back to GrenMet tokens. Charts use `var(--gm-*)` directly.
- **`wxproducts`, `hr`** — **document / print** lane. Use `font-gm-document` (Noto Sans) and keep fixed A4/PDF dimensions inside official templates. Never let those assumptions leak into shared `@grenmet/ui` primitives.
- Other apps follow the [migration order](./design-system.md#migration-order), guided by audit output.

## What requires approval first

Per `CLAUDE.md` gates, stop and ask before: adding/changing a `--gm-*` token, creating new files in `packages/`, modifying any `tsconfig*.json` / `biome.jsonc`, adding an npm package outside the catalog, or introducing a new pattern/abstraction.
