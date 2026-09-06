# Design Workflow

The end-to-end loop for designing and building web UI in this monorepo: design → code → verify → token guard. This is the *how*. For the token contract, governance, and per-app migration status, see [Design System](./design-system.md). For app-agnostic primitive rules, see [`packages/ui/CLAUDE.md`](../packages/ui/CLAUDE.md).

## Mental model

This is **CSS-first**. `packages/ui/src/styles/globals.css` owns the token contract; every app reads it. Design intent arrives as a Claude Design canvas, a screenshot, or a description — it is never fetched from a linked design tool.

```
design intent  ──►  packages/ui/src/styles/globals.css  ──@theme──►  Tailwind v4 utils
 (Claude Design,      --gm-* + semantic contract                     bg-primary, px-6
  screenshot, brief)              │
                                  ▼
                    @barrelsgd/ui components  ──imported by──►  apps/web/<app>
```

> **Figma is not linked to this repository.** Figma may still be used privately for
> design work, but there is no MCP bridge, no Code Connect, and no node-ID contract.
> Ignore any instruction to call `use_figma` / `/figma-use` or to fetch a Figma node,
> and never ask the user for a Figma frame URL. Historical ADRs that describe the old
> Figma-linked governance are records of past decisions — see ADR 0012.

Two non-negotiables, both backed by `CLAUDE.md` gates:

- **Never invent a color / spacing / radius / type value.** If it exists as a `--gm-*` token, use the token (or its Tailwind alias / shadcn semantic). Adding a `--gm-*` token or changing a value is a cross-app contract change and requires user approval; approved changes land in `globals.css` and are propagated with `pnpm design-system:sync`.
- **Never add design values to Tailwind config.** Tailwind v4 reads from `@theme` in `globals.css`, which reads from `--gm-*`. That single file is the source.

## The loop

### 1. Establish the design intent

Use the **`/design`** skill to produce a design canvas when there is nothing to work from — it publishes an Artifact with multiple artboards the user can refine visually. Otherwise the reference is a screenshot the user supplies, or a written description.

Before building, resolve every intended value onto the token contract. If an intended color or measurement has no token, say so explicitly: that is a token request needing approval, not a licence to hardcode.

### 2. Build in the app

- **Server Components by default.** Add `"use client"` only for interactivity or browser hooks. Fetch server-fetchable data directly in Server Components — no React Query for it.
- Compose from `@barrelsgd/ui/components/ui/<name>` (per-file import, no barrel). Only write new markup when a primitive genuinely does not exist.
- Style with semantic utilities (`bg-primary`, `text-heading-md`, `px-6`, `bg-background`, `border-border`) or, on GMS surfaces only, GMS hazard colours (`bg-gm-warning-red-bg`).
- **Dark mode is supported** via the class-based `dark` variant + `.dark` token overrides. Prefer semantic tokens so primitives adapt automatically; avoid one-off `dark:*` branches. Printable document papers stay light in both modes.
- One-off inline measurements are allowed but are treated as migration debt — keep them local, never promote them to tokens.
- Use the [Warning Pattern Checklist](./design-system.md#warning-pattern-checklist) for any warning, bulletin, or impact-based summary. Color must always be paired with visible text.

### 3. Verify design fidelity

- **`/ui-check`** — implement or refine a component against the design reference: establishes intent, lists discrepancies, proposes changes, iterates. This is the primary fidelity tool.
- Run the dev server for the specific app on its port (see [`ports.md`](./ports.md); e.g. `gms` = 3003, `gaa-admin` = 3001) **on the host, never inside the devcontainer**, and have the user screenshot the result.

### 4. Guard the token contract

```bash
pnpm design-system:check      # fails if an app's generated foundation block is stale
                              # or declares --gm-* outside the generated block
pnpm design-system:audit      # warning-only: hard-coded colors, arbitrary spacing/radius,
                              # app-local shadows, dark hooks, non-canonical fonts
pnpm design-system:audit:full # uncapped report
pnpm design-system:contrast   # WCAG check for warning fg/bg pairs
```

If you changed the canonical token block in `packages/ui/src/styles/globals.css`, run `pnpm design-system:sync` **first** to regenerate every app's foundation block, then re-run `check`.

### 5. Close out

Always, no confirmation needed:

```bash
pnpm fix          # ultracite (Biome) autofix
pnpm type-check   # turbo run type-check
```

Include tests alongside any new component or significant logic — part of the task, not a follow-up.

## App roles for design work

Pick where to build based on the app's design-system lane (full table in [Design System → App Roles](./design-system.md#app-roles)):

- **`gms`** — public web **reference app**. Prototype and validate new public-facing patterns here first; it is the lowest-drift baseline.
- **`gaa-admin`** — dense **internal dashboard** lane. Preserve operational density; map TailAdmin aliases back to design-system tokens. Charts use `var(--gm-*)` directly.
- **`wxproducts`, `hr`** — **document / print** lane. Use `font-document` (Noto Sans) and keep fixed A4/PDF dimensions inside official templates. Never let those assumptions leak into shared `@barrelsgd/ui` primitives.
- Other apps follow the [migration order](./design-system.md#migration-order), guided by audit output.

## What requires approval first

Per `CLAUDE.md` gates, stop and ask before: adding/changing a `--gm-*` token, creating new files in `packages/`, modifying any `tsconfig*.json` / `biome.jsonc`, adding an npm package outside the catalog, or introducing a new pattern/abstraction.
