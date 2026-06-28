# GrenMet Design System

GrenMet v1 is bridged between the `GrenMet v1` Figma file and this monorepo in small, verified passes. Figma owns design intent; `@grenmet/ui` owns repo enforcement. Token changes must be reconciled in both places before they are considered part of the v1 contract.

This guide stays implementation-focused. The broader GMS service framing, catalogue, draft warning model, and roadmap live in [GMS Digital Service Architecture](./architecture.md).

---

## Confirmed v1 decisions

- Web UI uses Inter through `--gm-font-sans`.
- Official PDFs, bulletins, forms, and fixed-output documents use Noto Sans through `--gm-font-document` and `font-gm-document`.
- V1 is light-mode only. Dark token modes and runtime dark-mode behavior are deferred.
- `spicewx` is the public web reference implementation.
- `admin-gms` is a denser internal dashboard lane that uses the same foundations without copying public-site layout density.
- Code Connect files may live locally in the repo, but publishing is deferred until the Figma account has the required Developer, Organization, or Enterprise capability.
- For v1, the user is the sole approver for public `--gm-*` token additions or value changes.

---

## Current Figma File Map

Canonical design source: [GrenMet v1](https://www.figma.com/design/kfVRAcgxzhs4Sj6aCRyOz4/GrenMet-v1?m=auto&t=86C75Bo0qLxDz03f-6).

As of 2026-06-13, the file has ten top-level pages. Query pages by node ID — the MCP page listing for this file is stale and returns only a subset.

| Page | Node ID | Role |
|---|---|---|
| `00 Overview` | `92:2` | File cover, file guide, changelog, and GMS Digital Service Architecture board. |
| `01 Process` | `61:615` | Working page: decision log, roadmap, open questions, collected and superseded references. |
| `10 Brand` | `167:13414` | Logo artwork and variants, logo usage rules, brand color source notes. |
| `11 Foundations` | `815:98` | Canonical v1 token reference: color, typography, spacing, radius, shadow, height, token registry, and `--gm-*` code contract. |
| `12 Design System` | `92:3` | Usage guidance: workflow, applying foundations, pattern guidance, accessibility/QA, handoff, governance, drift snapshot. |
| `13 Components` | `92:4` | Active component library, component rules, drift snapshot, production sections, deprecated components, and archive. |
| `14 Icon Library` | `785:72` | Meteocons, Lucide, and weather/astronomy icon sets (2,213 components). |
| `20 Products` | `274:21783` | Report production workflow: current report, review, final, export specs, handoff, archive. |
| `30 Website` | `275:21785` | Desktop and mobile homepage screens, built entirely from `13 Components` instances. |
| `99 Archive` | `92:7` | Superseded documentation (archived PDS handoff/code contract). Reference only. |

The Figma changelog records `v1.3` on 2026-06-13: Input `invalid` promoted to a component-set state, Button `size=touch` added, the `font-sans` variable added (81 variables), the repo bridge repaired (scripts, cap app, docs), and Process/Brand cleanup.

The `13 Components` page is the repo handoff map for v1:

| Section | Handoff role | Repo direction |
|---|---|---|
| `00 Guide / Component Rules` | Component operating rules and 2026-05-31 drift snapshot. | Keep this aligned with the audit summary below. |
| `01 Core UI` | Production core primitives. Figma documents `Button` (42 variants, including `size=touch`) and `Input` (3 states, including `invalid`) — 45 variants across 2 component sets. | `Button` has local Code Connect. `Input` exists in Figma and code; local Code Connect remains next. |
| `02 Weather Domain` | Alert cards, compact alert cards, forecast headline, metrics, metric grid, and IBF matrix. | Weather warning and IBF components should graduate through `@grenmet/ui` only after APIs are stable. |
| `03 Product PDF` | A4 report shell/body/header/footer, product badges, alert grid, alert section, and forecast details with IBF. | Keep fixed A4 dimensions and Noto Sans in the Document Templates lane. |
| `04 Website / Shared` | Shared public website components: logo, accent line, social button, footer link, author row, section header, warning rows/accordion, summary/news cards, and 44px icon buttons. | Public website patterns should be validated in `spicewx` before broad reuse. |
| `05 Website / Desktop` | Desktop site header, desktop navigation menu, forecast date rail, and forecast date tab. | Desktop navigation should stay public-weather-specific unless reused outside the website lane. |
| `06 Website / Mobile` | Mobile header, mobile navigation row, warning shortcut, subnav link, nav drawer, and mobile footer. | Mobile shell work should preserve the light-only v1 contract and `--gm-height-header`. |
| `07 Website / Composition Patterns` | Latest updates and weather news sections, including mobile compositions. | Promote only repeated composition patterns; keep content-specific layout local. |
| `08 Icon Usage / Link to Icon Library` | Link/reference point for icon usage. | Prefer existing icon libraries in code; avoid creating one-off SVG systems unless a product requires them. |
| `10 PDS / Weather Severity` | Guidance for severity ladder and severity token usage. | Keep severity tokens aliased to risk tokens and pair color with text labels. |
| `11 PDS / Accessibility` | Contrast, focus, warning, and light-mode guidance. | Keep warning contrast checks passing and avoid active dark-mode behavior in v1. |
| `12 Documentation Components` | Internal documentation components, including cover hero, guide card, status chip, metadata row, accent bar, and architecture board. | These are Figma documentation components, not default web app primitives. |
| `98 Deprecated / Legacy Website Components` | Deprecated legacy website components. | Do not map new code to deprecated Figma components. |
| `99 Archive / Pre-restructure Backup - 2026-05-31` | Pre-restructure checkpoint. | Reference only for recovery or comparison. |

This section is the v1 handoff document for now. Create a separate `docs/figma-design-handoff.md` only when individual Figma components need implementation owners, acceptance criteria, node-by-node mapping, or release tracking that would make this guide too noisy.

---

## How the design system works

The design system has three layers:

**1. CSS custom properties (`--gm-*`)**

Defined in `packages/ui/src/styles/globals.css`. These are the canonical values — colors, spacing steps, radius values, type sizes. Every app receives this block automatically when it imports `@grenmet/ui`.

```css
--gm-blue: #2478f2;
--gm-spacing-4: 4px;
--gm-radius-8: 8px;
--gm-weather-severity-take-action: var(--gm-risk-red);
```

**2. Tailwind v4 utility aliases (`@theme`)**

Declared in the same file using `@theme`. These expose the CSS custom properties as Tailwind utility classes.

```css
/* @theme declares these */
--color-gm-blue: var(--gm-blue);
--spacing-gm-4: var(--gm-spacing-4);
```

This means you can write `text-gm-blue`, `p-gm-4`, `text-gm-heading-md` etc. as Tailwind classes.

**3. shadcn-compatible semantic tokens**

`--primary`, `--secondary`, `--muted`, `--background`, etc. are also defined and resolve through `--gm-*` tokens. This makes it possible to use shadcn-style components that reference semantic token names rather than specific colors.

### When to use what

| Use | How |
|---|---|
| Standard UI elements | Import from `@grenmet/ui/components/ui/<name>` |
| Color, spacing, type scale | Use `--gm-*` CSS variables or their Tailwind aliases |
| Semantic colors (backgrounds, borders) | Use `--background`, `--border`, etc. |
| Official document typography | Use `font-gm-document`; keep fixed document sizes inside document templates |
| One-off measurements | Keep inline and treat as migration debt |

Avoid hardcoding values that exist in the token set. Run the audit to find drift:

```bash
pnpm design-system:audit
```

---

## Lanes

Keep the design system split clear while it grows:

- **Core UI** is the reusable primitive surface in `@grenmet/ui`: `Button`, `Input`, `Badge`, `Card`, `Dialog`, `Select`, `Table`, `Tabs`, `Tooltip`, and similar app-agnostic building blocks.
- **Public Weather/Product UI** is the public product layer: forecast cards, warning cards, current conditions, navigation, weather news, mobile menus, alert summaries, and product badges.
- **Document Templates** are fixed-output A4/PDF/bulletin layouts, official forecast templates, HR forms, and official reports. This lane may use Noto Sans and fixed dimensions that normal web components should not inherit.

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

## Governance

Public `--gm-*` tokens are a contract across Figma, `@grenmet/ui`, and the web apps. During v1, new public tokens and token value changes require user approval before they become part of the contract.

Approved token changes must land in Figma and `packages/ui/src/styles/globals.css` together. After editing the canonical block, run `pnpm design-system:sync` so generated app blocks stay aligned, then verify with `pnpm design-system:check`.

App-local aliases are acceptable during migration only when they resolve back to `--gm-*` or semantic tokens. Do not promote app-specific document, dashboard, or product values into public tokens until they are repeated across apps or approved as a shared pattern.

## Foundation Compliance

The next v1 milestone is foundation compliance, not component migration. Apps should converge first on shared colors, typography, spacing, radius, shadows, and light-mode behavior.

Inter is the GrenMet v1 web UI font and must flow through `--gm-font-sans`. Official bulletins, PDFs, and fixed-output documents use Noto Sans through `--gm-font-document` and the `font-gm-document` Tailwind alias. Public web surfaces should stay on Inter unless they are rendering an official document template.

Document-specific fixed sizes and official-output typography must stay inside the Document Templates lane. Shared `@grenmet/ui` primitives should remain token-clean and should not gain A4, PDF, bulletin, or HR form assumptions.

Apps may keep temporary compatibility aliases, but the aliases should resolve back to `--gm-*` tokens or shared semantic tokens. Product-specific visual choices should be treated as migration debt unless they still use the GrenMet foundation.

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

### App Roles

| App | Design-system role | Direction |
|---|---|---|
| `spicewx` | Public web reference app | Keep this as the lowest-drift public implementation and validate public patterns here first. |
| `admin-gms` | Internal dashboard normalization target | Preserve operational density while mapping TailAdmin aliases back to GrenMet tokens. |
| `wxproducts` | Document-heavy weather product lane | Keep Noto Sans and fixed A4/PDF dimensions inside official product templates. |
| `hr` | Document-heavy HR operations lane | Keep official forms in the document lane; use Inter for normal web UI. |
| `auth` | Brand cleanup lane | Align sign-in/sign-up surfaces with Inter, GrenMet radii, shadows, and semantic colors. |
| `wxwatch` | Media/gallery cleanup lane | Keep media viewport behavior local while aligning labels, timestamps, and shell styling. |
| `salesbus` | App-specific operational UI lane | Share foundations without forcing weather-specific product patterns. |
| `hurricaneplan` | Documentation-template cleanup lane | Keep content-template measurements local until the public shell is rebuilt. |
| `cap` | Public alert-viewer lane | Bridged 2026-06-13; map the initial hard-coded colors back to GrenMet tokens as the UI settles. |

### Migration Order

1. `spicewx`, because it is the public web reference.
2. `@grenmet/ui`, because shared primitives must stay token-clean.
3. `admin-gms`, mapping TailAdmin aliases back to GrenMet tokens while preserving dashboard density.
4. `wxproducts` and `hr`, keeping Noto Sans and fixed A4 dimensions inside the document lane.
5. `auth`, `wxwatch`, `salesbus`, and `hurricaneplan`, guided by audit output and app-specific risk.

### Migration Checklist

| App | Status | Accepted exceptions | Next action |
|---|---|---|---|
| `spicewx` | Reference app | Fixed media heights and `WeatherDateNav` active-state compensation | Keep as the visual baseline and avoid component rewrites until foundations settle. |
| `wxwatch` | Reference cleanup | Gallery and lightbox viewport dimensions are fixed-media behavior | Keep image sizing local; use GrenMet type tokens for labels and timestamps. |
| `salesbus` | Foundation migration | Touch-target sizing remains product-specific | Remove app-local theme aliases first; keep local UI component APIs stable. |
| `wxproducts` | Product/print reference | A4 print/PDF dimensions are fixed-output requirements | Use `font-gm-document` for official templates and warning token pairs for impact/response displays. |
| `hr` | Product/print migration | A4 form dimensions are fixed-output requirements | Resolve font bridge drift and document print dimensions as exceptions. |
| `auth` | Brand cleanup | None for v1 unless approved in Figma/roadmap notes | Use Inter through `--gm-font-sans`; replace repeated radii and shadows with GrenMet tokens. |
| `hurricaneplan` | Template cleanup | Docs-template layout measurements remain local until the shell is rebuilt | Keep runtime light-only; remove visible theme-switch affordances. |
| `admin-gms` | Dedicated template normalization | TailAdmin scale compatibility may remain while mapped back to GrenMet tokens | Map template aliases to GrenMet tokens before removing high-volume `dark:` classes. |
| `cap` | Foundation migration | None recorded yet | Receives the foundation block as of 2026-06-13; replace the initial hard-coded colors with GrenMet tokens. |

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

The Figma collection `GrenMet Foundations` is the current v1 contract: one Light mode, 81 variables, and WEB code syntax for every public token. The collection matches the repo's `--gm-*` set 1:1 (the `typography/font-family/sans` variable was added 2026-06-13 to close the last gap). The Figma guidance should mirror this repo: Inter for web UI, Noto Sans for official documents, `spicewx` as the public reference, `admin-gms` as the dashboard lane, and Code Connect publishing deferred.

Audit Figma before changing token values in code. Every public Figma variable should have WEB code syntax that matches the repo contract, such as `var(--gm-blue)` or `var(--gm-weather-severity-take-action)`.

The current audit verified the collection includes the v1 color, spacing, radius, typography, line-height, and shadow code-contract variables with valid `var(--gm-...)` WEB code syntax.

Repo-side audit status as of 2026-06-13 (the `design-system:*` scripts were broken from 2026-05-31 until 2026-06-13 by a `rootDir` path bug after they moved under `scripts/design-system/`; fixed, and `cap` added to sync and audit coverage):

- `pnpm design-system:check` passes. Generated app foundation blocks match `@grenmet/ui` across all nine web apps, including `cap`.
- `pnpm design-system:contrast` passes for all five warning foreground/background pairs.
- `pnpm design-system:audit` remains warning-only. It reports expected migration debt, not CI failures.

Current audit summary:

| App/package | Audit status |
|---|---|
| `auth` | No findings. |
| `cap` | Small set of hard-coded colors (5) from the initial build. |
| `spicewx` | Reference app with only accepted pilot exceptions: fixed media heights, `WeatherDateNav` active-state compensation, and month label leading. |
| `wxwatch` | Small fixed-media/gallery viewport exceptions. |
| `salesbus` | Small product-specific sizing exceptions. |
| `wxproducts` | Fixed A4/PDF dimensions in the document lane. |
| `hr` | Fixed A4 form dimensions and document-specific type sizing in the document lane. |
| `@grenmet/ui` | `alert-card` has weather/product fixed sizing and sub-scale text that should stay intentional until the warning lane settles. |
| `admin-gms` | Highest dashboard migration debt: TailAdmin local tokens, hard-coded chart colors, spacing, shadows, and one dark hook. |
| `hurricaneplan` | Highest template migration debt: docs-template colors, local type tokens, dark utility branches (90 darkMode findings), and template spacing. |

The audit also surfaces two additional categories not present in the initial pilot:
- **darkMode** — detects freestanding `.dark {}` CSS rule blocks (V1 is light-mode only). Active in `admin-gms`; retained as migration debt because downstream third-party overrides depend on it.
- **typography** — detects font imports and `--font-sans` overrides that bypass the GrenMet font bridge. V1 apps should resolve web UI typography back to `--gm-font-sans`; official document templates may use `--gm-font-document`.

Surface tokens `--gm-surface-secondary` (`#eaf2fb`) and `--gm-surface-muted` (`#e4eef7`) are now first-class GrenMet tokens. The shadcn semantics `--secondary`, `--muted`, and `--sidebar-accent` resolve through them rather than declaring raw hex. The fixed header dimension is exposed as `--gm-height-header: 72px` with a `h-gm-header` Tailwind alias, distinct from the spacing scale token `--gm-spacing-72`.

Warning token pairs are first-class v1 tokens. Use `--gm-warning-{green|yellow|amber|red|grey}-{bg|fg|border}` or the matching Tailwind aliases (`bg-gm-warning-red-bg`, `text-gm-warning-red-fg`, `border-gm-warning-red-border`) when rendering warning, impact, response, or status labels. Raw risk colors remain available as primitives, but foreground/background use must go through verified pairs unless contrast is checked explicitly.

Run the contrast guard after changing warning color tokens:

```bash
pnpm design-system:contrast
```

## Light Mode V1

V1 is light-mode only. The shared foundation exposes a class-based `dark` variant so future work has a stable Tailwind hook, but the v1 contract does not define dark token modes.

Apps should not follow system dark mode during v1. Root layouts set `color-scheme: light`, and apps using `next-themes` should force the light theme until dark tokens are intentionally designed and bridged.

Shared `@grenmet/ui` primitives should not ship active `dark:*` branches in v1. Dark mode readiness comes from semantic tokens, not from parallel component styling. V2 can add `.dark` token overrides after the dark palette is designed, audited, and synced with Figma.

## Warning Pattern Checklist

Use this checklist for public warnings, official bulletins, and impact-based forecast summaries. It reflects WMO impact-based/CAP principles and Met Office-style impact + likelihood guidance without claiming GrenMet uses the UK warning system.

- Headline
- Hazard
- Warning or response level text
- Impact
- Likelihood
- Validity, including issue time and expiry where applicable
- Source or issuing office
- What to expect
- What to do
- Next update

Warning color must always be paired with visible text. A yellow, amber, red, green, or grey marker is supporting information only; the level label, hazard, status, and action language must remain visible without color.

## Button Pilot

The first Core UI pilot connects the shared React `Button` to the Figma component set named `GrenMet / Core / Button` on the `13 Components` page. The set covers the full React API: 6 variants × 7 sizes (`default`, `sm`, `lg`, `touch`, `icon`, `icon-sm`, `icon-lg`) — 42 variants. `size=touch` (min-height 48px) was added 2026-06-13 for touch-target products such as `salesbus`.

1. Keep the Figma `Variant` and `Size` options aligned with the React `Button` API.
2. Use the Button node URL in `packages/ui/src/components/ui/button.figma.tsx`.
3. Keep the local Code Connect file ready in the repo, but do not publish it during v1 until the Figma account is upgraded.
4. After the account has the required capability, publish from the repo root:

   ```bash
   npx figma connect publish --token=PERSONAL_ACCESS_TOKEN
   ```

   The `FIGMA_ACCESS_TOKEN` environment variable can replace the `--token` flag.
5. Inspect a Button instance in Figma Dev Mode and verify the shared React snippet shows `variant` and `size`.

The Button Code Connect artifacts are ready in the repo, but publish is currently deferred. The active Education account reached Figma upload and was rejected because the required Code Connect write access is not exposed for that account.

## Input Pilot

The next Core UI pilot is the shared React `Input` represented in Figma as `GrenMet / Core / Input` on the `13 Components` page.

- Figma states are `default`, `disabled`, and `invalid` — all three are proper states in the component set (`invalid` was promoted from a loose component into the set on 2026-06-13).
- The editable `Text` property supports placeholder or example value content.
- These Figma states document the current React surface: disabled remains a native input prop, and invalid remains `aria-invalid`.
- Input is present in Figma and code, but it does not yet have a local `.figma.tsx` Code Connect mapping. It remains the next mapping after Button. Do not publish Input or any broader component mappings while publish remains blocked.

## Deferred

The v1 bridge does not yet include dark-mode token modes, a separate generated token source package, published Code Connect coverage, a broader reusable typography and effect-style system, full component-level cross-app migration, or runtime schema reconciliation for the larger GMS service and warning strategy.
