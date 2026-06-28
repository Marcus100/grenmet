# @grenmet/ui — Claude context

Agent rules for working with the shared UI package. For the full component list, Button variants, and import examples, read `packages/ui/README.md`.

## Import pattern — no barrel export

Every component is imported from its own path. There is no `@grenmet/ui` barrel export.

```ts
import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardHeader, CardContent } from "@grenmet/ui/components/ui/card";
import { cn } from "@grenmet/ui/lib/utils";
```

Never import from `@grenmet/ui` directly — only from `@grenmet/ui/components/ui/<name>` or `@grenmet/ui/lib/<name>`.

## Build requirement

`@grenmet/ui` must be built before apps can consume it. If you see `Cannot find module '@grenmet/ui/...'`, run:

```bash
turbo run build --filter=@grenmet/ui
```

## Adding a component

1. Add `packages/ui/src/components/ui/<name>.tsx`
2. Named exports only — no default export
3. Use `cn` for className merging, `data-slot` attribute on the root element
4. No `forwardRef` — React 19 passes `ref` as a prop directly
5. No `"use client"` unless the component truly requires browser interactivity — most primitives are server-renderable
6. Import via the full path in consuming apps — no barrel updates needed

Adding a component to `@grenmet/ui` requires stopping and asking first (see root `CLAUDE.md` — "Creating new files in `packages/` (shared — affects all apps)").

## When to use `@grenmet/ui` vs a local component

**Use `@grenmet/ui`** for general-purpose primitives: buttons, cards, inputs, dialogs, tables, badges, etc. If the component would make sense in any app, it belongs here.

**Keep it local** for app-specific UI: a weather product card, a forecast strip, a leave-request row. Local components can import and compose `@grenmet/ui` primitives.

If you find yourself re-implementing a button or input from scratch inside an app, stop and use `@grenmet/ui`.

## Token rules

All apps receive the GrenMet v1 foundation block when they import `@grenmet/ui`. Use tokens — not hardcoded values.

```ts
// Use token utilities
className="text-gm-body bg-background border-border"

// Not hardcoded values
className="text-[14px] bg-[#ffffff] border-[#e2e8f0]"
```

Run `pnpm design-system:audit` to find drift. For the full token reference — `--gm-*` properties, Tailwind aliases, semantic tokens, and font rules — see `docs/design-system.md`.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `import { Button } from "@grenmet/ui"` | `import { Button } from "@grenmet/ui/components/ui/button"` |
| `forwardRef` on a new component | Pass `ref` as a prop directly (React 19) |
| Hardcoded hex/px values that exist in the token set | Use `--gm-*` CSS variables or their Tailwind aliases |
| `"use client"` on a primitive that has no browser dependencies | Remove it — default to server-renderable |
| Promoting an app-specific component to `@grenmet/ui` without asking | Stop and ask — shared packages affect all apps |
| A4/PDF sizing or `font-gm-document` in a shared primitive | Keep document-lane typography in app-local document templates only |
