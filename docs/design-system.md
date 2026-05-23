# GrenMet Design System

GrenMet v1 is bridged from the `GrenMet v1` Figma file into this monorepo in small, verified passes. The light-mode Figma foundation contract is the v1 source of truth for GrenMet token values and WEB code syntax.

This guide stays implementation-focused. The broader GMS service framing, catalogue, draft warning model, and roadmap live in [GMS Digital Service Architecture](./gms-digital-service-architecture.md).

## Lanes

Keep the design system split clear while it grows:

- **Core UI** is the reusable `@grenmet/ui` component surface, such as `Button`, `Input`, and `Card`.
- **Product Weather** is the forecast, alert, product-shell, and weather-severity layer owned by weather product code.

Visual similarity is not enough to merge the lanes. A Figma component should map to the code component that owns its real API.

`GrenMet` remains the current implementation namespace in repo and Figma artifacts while the larger service strategy is documented as GMS.

## Token Flow

The v1 bridge is intentionally CSS-first:

1. Figma variables define the GrenMet foundation contract and their WEB code syntax.
2. `packages/ui/src/styles/globals.css` mirrors the public `--gm-*` custom properties.
3. Tailwind v4 `@theme` aliases expose GrenMet color, spacing, and radius utilities.
4. Apps that need the contract copy the shared block into app CSS until a token generation or shared import path replaces the copy workflow.

`spicewx` is the first app mirror for the v1 GrenMet contract. This pass defines the token names without broadly restyling existing pages.

## Foundation Audit

The Figma collection `GrenMet Foundations / Core + Product` is the current v1 contract: one Light mode, 32 scoped variables, and WEB code syntax for every token. The `12 Design System` page includes a `GrenMet v1 Foundation Contract` reference section for color, spacing, and radius review.

Audit Figma before changing token values in code. This bridge aligned the shared CSS and `spicewx` mirrors back to the Figma values when brand and risk values had drifted.

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

The v1 bridge does not yet include dark-mode token modes, a generated token source package, Code Connect coverage for every shared component, a broader reusable typography and effect-style system, cross-app token migration, or runtime schema reconciliation for the larger GMS service and warning strategy.
