# GrenMet Design System

GrenMet v1 is bridged between the `GrenMet v1` Figma file and this monorepo in small, verified passes. Figma owns design intent; `@grenmet/ui` owns repo enforcement. Token changes must be reconciled in both places before they are considered part of the v1 contract.

This guide stays implementation-focused. The broader GMS service framing, catalogue, draft warning model, and roadmap live in [GMS Digital Service Architecture](./architecture.md).

## Lanes

Keep the design system split clear while it grows:

- **Core UI** is the reusable `@grenmet/ui` component surface, such as `Button`, `Input`, and `Card`.
- **Product Weather** is the forecast, alert, product-shell, and weather-severity layer owned by weather product code.

Visual similarity is not enough to merge the lanes. A Figma component should map to the code component that owns its real API.

`GrenMet` remains the current implementation namespace in repo and Figma artifacts while the larger service strategy is documented as GMS.

## Token Flow

The v1 bridge is intentionally CSS-first:

1. Figma variables define the GrenMet foundation contract and their WEB code syntax.
2. `packages/ui/src/styles/globals.css` defines the repo-enforced `--gm-*` custom properties and shadcn-compatible semantic tokens.
3. Tailwind v4 `@theme` aliases expose GrenMet color, spacing, and radius utilities.
4. App stylesheets receive the generated `GrenMet Design System V1` block from `@grenmet/ui`.

Run the sync command after editing the canonical block:

```bash
pnpm design-system:sync
```

Run the check command before committing design-system work:

```bash
pnpm design-system:check
```

The check fails if an app has a stale generated block or declares `--gm-*` tokens outside the generated block. Apps may keep local compatibility variables during migration, but obvious values should map back to GrenMet tokens.

`spicewx` remains the first app mirror for the v1 GrenMet contract. All web apps now receive the same foundation block, while deeper component migration stays phased.

## Foundation Compliance

The next v1 milestone is foundation compliance, not component migration. Apps should converge first on shared colors, typography, spacing, radius, shadows, and light-mode behavior.

Inter is the provisional GrenMet web font while the brand direction is still being worked out. Apps may keep temporary compatibility aliases, but the aliases should resolve back to `--gm-*` tokens or shared semantic tokens. Product-specific visual choices should be treated as migration debt unless they still use the GrenMet foundation.

Use `spicewx` as the first cleanup app. It should become the reference for how a public GrenMet app uses shared foundations before the same rules are tightened across the other apps.

The v1 foundation now includes practical typography, spacing, radius, and shadow tokens for the `spicewx` pilot. Keep this layer intentionally small: add tokens when a value is repeated, shared, or likely to appear in Figma; keep one-off layout measurements local.

The v1 type scale as of the current expansion:

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-gm-micro` | 10px | 16px | Timestamps, fine labels |
| `text-gm-label` | 11px | 16px | Tag labels, pill text |
| `text-gm-caption` | 12px | 16px | Captions, metadata |
| `text-gm-body-sm` | 13px | 20px | Secondary body text |
| `text-gm-body` | 14px | 20px | Primary body text |
| `text-gm-body-base` | 16px | 24px | Card titles, prominent links |
| `text-gm-heading-sm` | 18px | 24px | Section headings |
| `text-gm-nav` | 20px | 28px | Navigation sub-links |
| `text-gm-heading-md` | 30px | 36px | Page titles, nav section labels |
| `text-gm-heading-lg` | 34px | 36px | Large display numbers (date, stats) |

Accepted pilot exceptions: fixed media dimensions (`h-[83px]`, `h-[254px]`, `h-[200px]`), the active-state border compensation in `WeatherDateNav` (`px-[1.5px] py-[7.5px]`), the month label tight leading (`leading-[14px]`), and the responsive container pattern (`max-w-7xl px-4 sm:px-6 lg:px-8`).

Run the warning-only audit command to find foundation drift:

```bash
pnpm design-system:audit
```

For a complete uncapped report, run:

```bash
pnpm design-system:audit:full
```

The audit reports hard-coded colors, non-canonical font usage, arbitrary spacing and radius values, app-local shadows, active dark/system theme hooks, and local theme tokens that do not map back to GrenMet. It does not fail CI yet; use it to plan cleanup before promoting selected rules into blocking checks.

## Foundation Audit

The Figma collection `GrenMet Foundations / Core + Product` is the current v1 contract: one Light mode, scoped variables, and WEB code syntax for every public token. The `12 Design System` page includes a `GrenMet v1 Foundation Contract` reference section for color, spacing, and radius review.

Audit Figma before changing token values in code. Every public Figma variable should have WEB code syntax that matches the repo contract, such as `var(--gm-blue)` or `var(--gm-weather-severity-take-action)`.

The current audit verified the collection includes the v1 color, spacing, radius, typography, line-height, and shadow code-contract variables with valid `var(--gm-...)` WEB code syntax.

The audit also surfaces two additional categories not present in the initial pilot:
- **darkMode** — detects freestanding `.dark {}` CSS rule blocks (V1 is light-mode only). Active in `admin-gms`; retained as migration debt because downstream third-party overrides depend on it.
- **typography** — detects `--font-sans` overrides inside `@theme inline` that bypass the GrenMet font bridge. Active in `auth` (Space Grotesk, intentional brand exception), `wxwatch`, and `wxproducts` (Geist, intentional app exception).

Surface tokens `--gm-surface-secondary` (`#eaf2fb`) and `--gm-surface-muted` (`#e4eef7`) are now first-class GrenMet tokens. The shadcn semantics `--secondary`, `--muted`, and `--sidebar-accent` resolve through them rather than declaring raw hex. The fixed header dimension is exposed as `--gm-height-header: 72px` with a `h-gm-header` Tailwind alias, distinct from the spacing scale token `--gm-spacing-72`.

## Light Mode V1

V1 is light-mode only. The shared foundation exposes a class-based `dark` variant so future work has a stable Tailwind hook, but the v1 contract does not define dark token modes.

Apps should not follow system dark mode during v1. Root layouts set `color-scheme: light`, and apps using `next-themes` should force the light theme until dark tokens are intentionally designed and bridged.

## Button Pilot

The first Core UI pilot connects the shared React `Button` to the Figma component set named `GrenMet / Core Button` on the `13 Components` page.

1. Keep the Figma `Variant` and `Size` options aligned with the React `Button` API.
2. Use the Button node URL in `packages/ui/src/components/ui/button.figma.tsx`.
3. Publish the Code Connect file from the repo root:

   ```bash
   npx figma connect publish --token=PERSONAL_ACCESS_TOKEN
   ```

   The `FIGMA_ACCESS_TOKEN` environment variable can replace the `--token` flag.
4. Inspect a Button instance in Figma Dev Mode and verify the shared React snippet shows `variant` and `size`.

The Button Code Connect artifacts are ready in the repo, but publish is currently deferred. The active Education account reached Figma upload and was rejected because the required Code Connect write access is not exposed for that account.

## Input Pilot

The next Core UI pilot is the shared React `Input` represented in Figma as `GrenMet / Core Input` on the `13 Components` page.

- Figma states are `Default`, `Disabled`, and `Invalid`.
- The editable `Text` property supports placeholder or example value content.
- These Figma states document the current React surface: disabled remains a native input prop, and invalid remains `aria-invalid`.
- This pass does not add an Input Code Connect mapping while publish remains blocked.

## Deferred

The v1 bridge does not yet include dark-mode token modes, a separate generated token source package, Code Connect coverage for every shared component, a broader reusable typography and effect-style system, full component-level cross-app migration, or runtime schema reconciliation for the larger GMS service and warning strategy.
