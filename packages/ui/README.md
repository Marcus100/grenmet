# @grenmet/ui

Shared UI component library for all Grenmet web apps. Built on [Base UI](https://base-ui.com) primitives with shadcn-style component patterns and the [GrenMet v1 design system](../../docs/design-system.md).

---

## Import pattern

Every component is a named export from its own path:

```ts
import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardHeader, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
```

The `cn` utility (tailwind-merge + clsx) is available from:

```ts
import { cn } from "@grenmet/ui/lib/utils";
```

Use `cn` any time you need to merge Tailwind classes conditionally:

```tsx
<div className={cn("base-class", isActive && "active-class", className)} />
```

---

## Available components

| Component | Import path | Notes |
|---|---|---|
| `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | `.../accordion` | Collapsible sections |
| `Alert`, `AlertTitle`, `AlertDescription` | `.../alert` | Inline feedback messages |
| `Avatar`, `AvatarImage`, `AvatarFallback` | `.../avatar` | User avatar with fallback |
| `Badge` | `.../badge` | Small status label |
| `Button` | `.../button` | Primary interactive element — see variants below |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | `.../card` | Content container |
| `Checkbox` | `.../checkbox` | Boolean form input |
| `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | `.../dialog` | Modal overlay |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, ... | `.../dropdown-menu` | Contextual action menu |
| `Input` | `.../input` | Text input field |
| `Label` | `.../label` | Form label |
| `Popover`, `PopoverTrigger`, `PopoverContent` | `.../popover` | Floating content panel |
| `RadioGroup`, `RadioGroupItem` | `.../radio-group` | Radio button group |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, ... | `.../select` | Dropdown selection |
| `Separator` | `.../separator` | Horizontal or vertical divider |
| `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | `.../sheet` | Side panel / drawer |
| `Skeleton` | `.../skeleton` | Loading placeholder |
| `Switch` | `.../switch` | Toggle boolean input |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` | `.../table` | Data table |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `.../tabs` | Tabbed content |
| `Textarea` | `.../textarea` | Multi-line text input |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | `.../tooltip` | Hover hint |

---

## Button variants and sizes

`Button` is the most-used component. It has two prop axes:

```tsx
// variant: default | destructive | outline | secondary | ghost | link
// size:    default | sm | lg | icon | icon-sm | icon-lg

<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive" size="sm">Delete</Button>
<Button variant="ghost" size="icon"><TrashIcon /></Button>

// Render as a different element (e.g. an anchor or Link)
<Button asChild>
  <Link href="/dashboard">Go to dashboard</Link>
</Button>
```

---

## Design system tokens

All apps receive the GrenMet v1 foundation block when they import `@grenmet/ui`. It provides `--gm-*` CSS custom properties, Tailwind v4 utility aliases (`text-gm-heading-md`, `h-gm-header`, etc.), and shadcn-compatible semantic tokens (`--primary`, `--background`, etc.).

Use tokens instead of hardcoded values. Run `pnpm design-system:audit` to find drift in your app.

Full token reference, the three-layer explanation, and compliance guide: [docs/design-system.md](../../docs/design-system.md).

---

## When to use `@grenmet/ui` vs a local component

**Use `@grenmet/ui`** for general-purpose UI primitives: buttons, cards, inputs, dialogs, tables, etc. If the component would make sense in any app, it belongs in the shared library.

**Use a local component** for app-specific UI: a weather product card, a forecast strip, a roster table row. App-specific components can import and compose `@grenmet/ui` primitives but shouldn't live in the shared package until they're genuinely reusable.

If you find yourself reimplementing a button or input from scratch in an app, stop and use `@grenmet/ui`.

---

## Adding a new component to `@grenmet/ui`

1. Add the component file to `packages/ui/src/components/ui/<name>.tsx`
2. Follow the existing pattern: named exports, `cn` for className merging, `data-slot` attribute on the root element
3. No `forwardRef` — React 19 passes `ref` as a prop directly
4. Import it in the consuming app using the full path (`@grenmet/ui/components/ui/<name>`)
5. There is no barrel export — each component has its own path

---

## Slot

The `Slot` utility (used internally by `Button` via `asChild`) is available if you need it:

```ts
import { Slot } from "@grenmet/ui/lib/slot";
```

`Slot` merges its props onto its single child element. It's how `asChild` works — instead of rendering a `<button>`, it renders whatever you pass as the child with the button's props merged in.
