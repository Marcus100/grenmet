# Barrels Design System

`@barrelsgd/ui` owns the token contract and repo enforcement. `packages/ui/src/styles/globals.css` is the single source of `--gm-*`; every app receives a generated copy of it.

> **Figma is not linked to this repository** (see [ADR-0012](./adr/0012-decouple-design-tooling-from-figma.md)). Design intent arrives as a Claude Design canvas, a screenshot, or a brief — see [Design Workflow](./design-workflow.md). Sections below that describe the old Figma file map and the Code Connect pilots are retained as **history**, not current process.

This guide stays implementation-focused. The broader GMS service framing, catalogue, draft warning model, and roadmap live in [GMS Digital Service Architecture](./architecture.md).

---

## Confirmed v1 decisions

- Web UI uses Inter through `--brand-font-sans`.
- Official PDFs, bulletins, forms, and fixed-output documents use Noto Sans through `--brand-font-document` and `font-document`.
- V1 is light-mode only. Dark token modes and runtime dark-mode behavior are deferred.
- `gms` is the public web reference implementation.
- `gaa-admin` is a denser internal dashboard lane that uses the same foundations without copying public-site layout density.
- For v1, the user is the sole approver for public `--gm-*` token additions or value changes.

---

## Figma File Map (historical)

> Retained as a record of the v1 Figma bridge, which is no longer linked (see [ADR-0012](./adr/0012-decouple-design-tooling-from-figma.md)). Nothing here is a current instruction.

Former design source: [GrenMet v1](https://www.figma.com/design/kfVRAcgxzhs4Sj6aCRyOz4/GrenMet-v1?m=auto&t=86C75Bo0qLxDz03f-6).

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
| `02 Weather Domain` | Alert cards, compact alert cards, forecast headline, metrics, metric grid, and IBF matrix. | Weather warning and IBF components should graduate through `@barrelsgd/ui` only after APIs are stable. |
| `03 Product PDF` | A4 report shell/body/header/footer, product badges, alert grid, alert section, and forecast details with IBF. | Keep fixed A4 dimensions and Noto Sans in the Document Templates lane. |
| `04 Website / Shared` | Shared public website components: logo, accent line, social button, footer link, author row, section header, warning rows/accordion, summary/news cards, and 44px icon buttons. | Public website patterns should be validated in `gms` before broad reuse. |
| `05 Website / Desktop` | Desktop site header, desktop navigation menu, forecast date rail, and forecast date tab. | Desktop navigation should stay public-weather-specific unless reused outside the website lane. |
| `06 Website / Mobile` | Mobile header, mobile navigation row, warning shortcut, subnav link, nav drawer, and mobile footer. | Mobile shell work should preserve the light-only v1 contract and `--gm-height-header`. |
| `07 Website / Composition Patterns` | Latest updates and weather news sections, including mobile compositions. | Promote only repeated composition patterns; keep content-specific layout local. |
| `08 Icon Usage / Link to Icon Library` | Link/reference point for icon usage. | Prefer existing icon libraries in code; avoid creating one-off SVG systems unless a product requires them. |
| `10 PDS / Weather Severity` | Guidance for severity ladder and severity token usage. | Keep severity tokens aliased to risk tokens and pair color with text labels. |
| `11 PDS / Accessibility` | Contrast, focus, warning, and light-mode guidance. | Keep warning contrast checks passing and avoid active dark-mode behavior in v1. |
| `12 Documentation Components` | Internal documentation components, including cover hero, guide card, status chip, metadata row, accent bar, and architecture board. | These are Figma documentation components, not default web app primitives. |
| `98 Deprecated / Legacy Website Components` | Deprecated legacy website components. | Do not map new code to deprecated Figma components. |
| `99 Archive / Pre-restructure Backup - 2026-05-31` | Pre-restructure checkpoint. | Reference only for recovery or comparison. |


---

## How the design system works

The architecture is recorded in
[ADR-0011](adr/0011-brand-neutral-design-tokens.md). Shared UI carries no brand;
brands are packages.

Three layers, all in `packages/ui/src/styles/globals.css`:

**1. Brand primitives (`--brand-*`, `--status-*`)**

The active brand's raw palette, plus a status palette held separately because
status meaning must survive a rebrand — a brand may change its blue, but not what
danger looks like. Role-named rather than colour-named, so a brand with different
hues can override them without the names going stale. These are
`@barrelsgd/ui`'s own defaults.

```css
--brand-primary: #15006b;
--brand-accent: #39a9f5;
--brand-surface-page: #ffffff;
--status-negative: #cc0033;
```

**2. Semantic contract**

`--background`, `--primary`, `--success`, `--warning` and the rest. Resolves only
through layer 1, never through a brand-specific palette, so overriding the
primitives rebrands every shared primitive without touching this layer. Shared
components reference this layer and nothing below it.

```css
--primary: var(--brand-primary);
--destructive: var(--status-negative);
```

**3. Tailwind v4 utilities (`@theme inline`)**

Exposes layer 2 as classes — `bg-primary`, `text-muted-foreground`,
`bg-success`. The shared type scale lives here too: `text-body`, `text-caption`,
`leading-heading-md`, `shadow-card`, `h-header`.

Spacing and radius are **not** in the token set. Their values duplicated
Tailwind's own scale exactly, so the utilities use it directly (`px-6`,
`rounded-lg`). Do not add `--spacing-<n>` tokens: Tailwind derives `p-4` from a
single `--spacing` multiplier, and a literal `--spacing-4` shadows the computed
scale and silently resizes every spacing utility in the repository.

### Brand packages

A brand owns its palette and assets in its own package. `@barrelsgd/gms` holds
the GMS logo, the `--gm-*` palette in `styles/foundation.css`, and GMS-specific
components. Only GMS surfaces import it:

```css
@import "@barrelsgd/gms/styles/foundation";
```

`gm` expands to *Grenada Met*, so the prefix is correct for a GMS package. The
dependency direction is one-way: `@barrelsgd/ui` must never reference `--gm-*`,
and a component needing a brand colour belongs in that brand's package.

### GMS palette (Mini Brand Presentation 2026)

The official kit. `packages/gms/src/styles/foundation.css` carries these values
verbatim — do not round or re-derive them.

| Token | Value | Role |
|---|---|---|
| `--gm-navy` | `#0b132b` | Authority. Primary dark surface, ink on light. |
| `--gm-blue` | `#2878f5` | Primary brand blue. Fills, borders, large display type. |
| `--gm-sky` | `#37a3ef` | Atmosphere. Secondary fills and chart series. |
| `--gm-lime` | `#b9ee63` | Nutmeg accent. **Fill only** — never ink on light. |

**Lime follows the artwork, not the brand document.** The Mini Brand
Presentation specifies `#ccf5ab`, but every icon file in the 2026 logo delivery
paints the leaf `#b9ee63`, and the artwork is what a reader actually sees. The
token moved to match it on 11 Sep 2026. The change is contrast-neutral: dark
text on lime went 14.54:1 → 13.07:1, and lime on white 1.22:1 → 1.36:1, so it
remains a fill-only colour. `--gm-lime-ink` is unaffected — it is a separate
green, not a derivative. **Pending the designer's confirmation** that the deeper
green is deliberate rather than a stale export; revert here and in
`packages/gms/src/styles/foundation.css` if it is not.

**The ink rule.** The kit hues do not clear WCAG AA (4.5:1) against white as
small text — blue is 4.12:1, sky 2.75:1, lime 1.36:1. Each therefore carries a
darkened, hue-preserving ink at the ~5.2:1 headroom the shift ramp already uses:

| Token | Value | On white |
|---|---|---|
| `--gm-blue-ink` | `#0b63ee` | 5.21:1 |
| `--gm-sky-ink` | `#0f70b5` | 5.24:1 |
| `--gm-lime-ink` | `#3f7a0f` | 5.25:1 |

Contrast is symmetric, so an ink is also the fill to use when small **white**
text sits on it — a `bg-gm-blue` button with a 14px white label must be
`bg-gm-blue-ink`. `--gm-navy` needs no ink: it clears white at 18.38:1.

Pick by size, not by habit:

- Text under 24px regular / 18.66px bold, and icons under ~24px → **ink**.
- Larger display type, decorative fills, borders and focus rings → **brand hue**.
- `--gm-lime-ink` is a green in the lime hue, not the kit colour. Use it only
  where lime must read as ink; prefer lime as a fill on navy (13.55:1).

**Retired.** `--gm-sun` (`#ff981e`) is gone — the 2026 kit has no warm tone.
Former uses now take the lime accent.

### How a GMS surface picks up the brand

Two lines in the app stylesheet, in this order:

1. `@import "@barrelsgd/gms/styles/foundation";` with the other imports — this
   supplies the `--gm-*` palette and the `gm-*` Tailwind utilities.
2. A **GMS brand layer** block *after* the generated design-system block, which
   remaps the layer 1 primitives onto `--gm-*`.

Step 2 is what actually rebrands shared shadcn primitives. Because layer 2
resolves entirely through layer 1, remapping ~19 primitives rebrands every
Button, Input, Card, Badge, Sidebar and chart without restating the semantic
contract. It cannot be an `@import`: CSS requires imports to precede other
rules, so the generated block would win. `gms`, `gaa-admin`, `auth` and `docs`
all carry it.

One correction lives in that block because layer 1 cannot express it:
`--accent` is the kit sky, a light hue, so it carries `--gm-text-primary`
(6.46:1) rather than the inverse text layer 2 defaults to (2.75:1).

Theme presets in `gaa-admin` use `:root[data-theme-preset="…"]` (specificity
0,2,0) and still win over the brand layer's `:root`, so preset selection is
unaffected.

### Logo

`@barrelsgd/gms/components/logo` renders the 2026 artwork. Four variants, each
pairing an asset for light surfaces with one for dark:

| Variant | Ratio | Light surface | Dark surface |
|---|---|---|---|
| `primary` | 2.99:1 | `logo-primary-navy` | `logo-primary-white` |
| `wordmark` | 2.51:1 | `logo-wordmark-navy` | `logo-wordmark-white` |
| `submark` | 1.01:1 | `logo-submark-navy` | `logo-submark-blue` |
| `icon` | 0.61:1 | `logo-icon-color` | `logo-icon-white` |

`primary` and `wordmark` are one geometry in two inks, so a theme flip never
shifts layout. `submark` is the badge, which carries its own field — the navy
badge on light, the blue badge on dark, because the navy badge's outer ring
disappears against `--gm-navy`. `icon` is the bare mark; it goes white on dark
because the mark's navy interior vanishes there.

**Blocked: this package cannot import SVG.** `gaa-admin` runs `@svgr/webpack`
(its `next.config`), so a `.svg` imported from `packages/gms` resolves to a React
component there and to a URL in `gms` — the same import means two different
things in the two apps that render `Logo`. Every vector asset in the 2026
delivery is therefore unusable from here as a static import.

This blocks a wanted `monogram` variant (the mark plus "GMS", the step between
the full lockup and the bare mark: at `h-9` the lockup is ~122px wide, the
monogram ~87px, the icon ~22px). The artwork exists and is outlined, but ships
only as SVG. Two routes out, neither yet chosen: inline the artwork as a `.tsx`
component in this package, which is bundler-independent and would also allow
`currentColor` theming in place of paired light/dark files; or align the SVG
handling across app bundler configs. Note also that the supplied
`GMS navy.svg` is defective — its droplet path declares no fill, so it renders
`#000` beside `#0b132b` lettering.

The caller constrains the size — `className="h-9 w-auto"` for a lockup,
`className="size-7"` for the icon. Never set `width`/`height` on it: every
variant is a fixed ratio (see the table) and hardcoded dimensions distort them.

Three further lockups ship in `packages/gms/src/assets/logo` for design use and
are deliberately not exposed as variants: `logo-primary-color` (the kit's
full-colour white-background lockup), `logo-stacked-white` (the kit's stacked
hero lockup) and `logo-icon-navy`.

Favicons derive from the mark, not the badge: at 16-48px the badge's ring text
degrades into noise, so `favicon.ico` and `favicon-16/32` are a navy disc with
the white mark, which also holds contrast on light and dark browser tabs. The
real badge is used at 180px and above (`apple-touch-icon`, `android-chrome-*`),
where the ring text is legible.

**Open item.** `--gm-shift-day` (`#a35c00`) still derives from the retired
orange. The duty-roster ramp needs a replacement tone that stays
distinguishable from morning and evening.

**Known pre-existing gap**, not introduced by the 2026 kit:
`--muted-foreground` on `--muted` is 4.11:1. It predates this palette (the same
two values were already paired) and is only a failure in that specific
combination — `--muted-foreground` on `--background` is 5.0:1.

### When to use what

| Use | How |
|---|---|
| Standard UI elements | Import from `@barrelsgd/ui/components/ui/<name>` |
| Colour | Semantic tokens — `bg-primary`, `text-muted-foreground`, `bg-success` |
| Spacing and radius | Tailwind's own scale — `px-6`, `gap-4`, `rounded-lg` |
| Type scale | `text-body`, `text-caption`, `text-heading-md` and their `leading-*` pairs |
| Official document typography | `font-document`; keep fixed document sizes inside document templates |
| GMS hazard colours | `--gm-risk-*` and `--gm-warning-*`, on GMS surfaces only |
| One-off measurements | Keep inline and treat as migration debt |

Avoid hardcoding values that exist in the token set. Run the audit to find drift:

```bash
pnpm design-system:audit
```

---

## Lanes

Keep the design system split clear while it grows:

- **Core UI** is the reusable primitive surface in `@barrelsgd/ui`: `Button`, `Input`, `Badge`, `Card`, `Dialog`, `Select`, `Table`, `Tabs`, `Tooltip`, and similar app-agnostic building blocks.
- **Public Weather/Product UI** is the public product layer: forecast cards, warning cards, current conditions, navigation, weather news, mobile menus, alert summaries, and product badges.
- **Document Templates** are fixed-output A4/PDF/bulletin layouts, official forecast templates, HR forms, and official reports. This lane may use Noto Sans and fixed dimensions that normal web components should not inherit.

Visual similarity is not enough to merge the lanes. A design component should map to the code component that owns its real API.

`GrenMet` now survives only as the name of the Figma artifacts; the repository side is brand-neutral after transition boundaries 3-5. Renaming those Figma files retires the term entirely.

## Token Flow

The v1 bridge is intentionally CSS-first:

1. `packages/ui/src/styles/globals.css` defines the repo-enforced `--gm-*` custom properties and shadcn-compatible semantic tokens.
2. Tailwind v4 `@theme` aliases expose design-system color, spacing, and radius utilities.
3. App stylesheets receive the generated `BARRELS DESIGN SYSTEM V1` block from `@barrelsgd/ui`.

Run the sync command after editing the canonical block:

```bash
pnpm design-system:sync
```

Run the check command before committing design-system work:

```bash
pnpm design-system:check
```

The check fails if an app has a stale generated block or declares `--gm-*` tokens outside the generated block. Apps may keep local compatibility variables during migration, but obvious values should map back to design-system tokens.

`gms` remains the first app mirror for the v1 design-system contract. All web apps now receive the same foundation block, while deeper component migration stays phased.

## Governance

Public `--gm-*` tokens are a contract across `@barrelsgd/ui` and the web apps. During v1, new public tokens and token value changes require user approval before they become part of the contract.

Approved token changes land in `packages/ui/src/styles/globals.css`. After editing the canonical block, run `pnpm design-system:sync` so generated app blocks stay aligned, then verify with `pnpm design-system:check`.

App-local aliases are acceptable during migration only when they resolve back to `--gm-*` or semantic tokens. Do not promote app-specific document, dashboard, or product values into public tokens until they are repeated across apps or approved as a shared pattern.

## Foundation Compliance

The next v1 milestone is foundation compliance, not component migration. Apps should converge first on shared colors, typography, spacing, radius, shadows, and light-mode behavior.

Inter is the Barrels design-system web UI font and must flow through `--brand-font-sans`. Official bulletins, PDFs, and fixed-output documents use Noto Sans through `--gm-font-document` and the `font-gm-document` Tailwind alias. Public web surfaces should stay on Inter unless they are rendering an official document template.

Document-specific fixed sizes and official-output typography must stay inside the Document Templates lane. Shared `@barrelsgd/ui` primitives should remain token-clean and should not gain A4, PDF, bulletin, or HR form assumptions.

Apps may keep temporary compatibility aliases, but the aliases should resolve back to `--gm-*` tokens or shared semantic tokens. Product-specific visual choices should be treated as migration debt unless they still use the design-system foundation.

Use `gms` as the first cleanup app. It should become the reference for how a public GMS app uses shared foundations before the same rules are tightened across the other apps.

The v1 foundation now includes practical typography, spacing, radius, and shadow tokens for the `gms` pilot. Keep this layer intentionally small: add tokens when a value is repeated or shared across apps; keep one-off layout measurements local.

The v1 type scale as of the current expansion:

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-micro` | 10px | 16px | Timestamps, fine labels |
| `text-label` | 11px | 16px | Tag labels, pill text |
| `text-caption` | 12px | 16px | Captions, metadata |
| `text-body-sm` | 13px | 20px | Secondary body text |
| `text-body` | 14px | 20px | Primary body text |
| `text-body-base` | 16px | 24px | Card titles, prominent links |
| `text-heading-sm` | 18px | 24px | Section headings |
| `text-nav` | 20px | 28px | Navigation sub-links |
| `text-heading-md` | 30px | 36px | Page titles, nav section labels |
| `text-heading-lg` | 34px | 36px | Large display numbers (date, stats) |

Accepted pilot exceptions: fixed media dimensions (`h-[83px]`, `h-[254px]`, `h-[200px]`), the active-state border compensation in `WeatherDateNav` (`px-[1.5px] py-[7.5px]`), the month label tight leading (`leading-[14px]`), and the responsive container pattern (`max-w-7xl px-4 sm:px-6 lg:px-8`).

### App Roles

| App | Design-system role | Direction |
|---|---|---|
| `gms` | Public web reference app | Keep this as the lowest-drift public implementation and validate public patterns here first. |
| `gaa-admin` | Internal dashboard normalization target | Preserve operational density while mapping TailAdmin aliases back to design-system tokens. |
| `wxproducts` | Document-heavy weather product lane | Keep Noto Sans and fixed A4/PDF dimensions inside official product templates. |
| `hr` | Document-heavy HR operations lane | Keep official forms in the document lane; use Inter for normal web UI. |
| `auth` | Brand cleanup lane | Align sign-in/sign-up surfaces with Inter, design-system radii, shadows, and semantic colors. |
| `wxwatch` | Media/gallery cleanup lane | Keep media viewport behavior local while aligning labels, timestamps, and shell styling. |
| `salesbus` | App-specific operational UI lane | Share foundations without forcing weather-specific product patterns. |
| `docs` | Documentation-template cleanup lane | Keep content-template measurements local until the public shell is rebuilt. |
| `cap` | Public alert-viewer lane | Bridged 2026-06-13; map the initial hard-coded colors back to design-system tokens as the UI settles. |

### Migration Order

1. `gms`, because it is the public web reference.
2. `@barrelsgd/ui`, because shared primitives must stay token-clean.
3. `gaa-admin`, mapping TailAdmin aliases back to design-system tokens while preserving dashboard density.
4. `wxproducts` and `hr`, keeping Noto Sans and fixed A4 dimensions inside the document lane.
5. `auth`, `wxwatch`, `salesbus`, and `docs`, guided by audit output and app-specific risk.

### Migration Checklist

| App | Status | Accepted exceptions | Next action |
|---|---|---|---|
| `gms` | Reference app | Fixed media heights and `WeatherDateNav` active-state compensation | Keep as the visual baseline and avoid component rewrites until foundations settle. |
| `wxwatch` | Reference cleanup | Gallery and lightbox viewport dimensions are fixed-media behavior | Keep image sizing local; use shared type tokens for labels and timestamps. |
| `salesbus` | Foundation migration | Touch-target sizing remains product-specific | Remove app-local theme aliases first; keep local UI component APIs stable. |
| `wxproducts` | Product/print reference | A4 print/PDF dimensions are fixed-output requirements | Use `font-document` for official templates and warning token pairs for impact/response displays. |
| `hr` | Product/print migration | A4 form dimensions are fixed-output requirements | Resolve font bridge drift and document print dimensions as exceptions. |
| `auth` | Brand cleanup | None for v1 unless approved in roadmap notes | Use Inter through `--brand-font-sans`; replace repeated radii and shadows with design-system tokens. |
| `docs` | Template cleanup | Docs-template layout measurements remain local until the shell is rebuilt | Keep runtime light-only; remove visible theme-switch affordances. |
| `gaa-admin` | Dedicated template normalization | TailAdmin scale compatibility may remain while mapped back to design-system tokens | Map template aliases to design-system tokens before removing high-volume `dark:` classes. |
| `cap` | Foundation migration | None recorded yet | Receives the foundation block as of 2026-06-13; replace the initial hard-coded colors with design-system tokens. |

Run the warning-only audit command to find foundation drift:

```bash
pnpm design-system:audit
```

For a complete uncapped report, run:

```bash
pnpm design-system:audit:full
```

The audit reports hard-coded colors, non-canonical font usage, arbitrary spacing and radius values, app-local shadows, active dark/system theme hooks, and local theme tokens that do not map back to the design system. It does not fail CI yet; use it to plan cleanup before promoting selected rules into blocking checks.

## Foundation Audit

The canonical token set lives in `packages/ui/src/styles/globals.css` — 81 public `--gm-*` tokens covering color, spacing, radius, typography, line-height, and shadow. There is no external collection to reconcile against.

Before changing a token value, run `pnpm design-system:audit` to see where it is already used, and `pnpm design-system:contrast` if the change touches a warning fg/bg pair.

_Historically this contract was mirrored in a Figma collection named `GrenMet Foundations`; that mirror is retired._

Repo-side audit status as of 2026-06-13 (the `design-system:*` scripts were broken from 2026-05-31 until 2026-06-13 by a `rootDir` path bug after they moved under `scripts/design-system/`; fixed, and `cap` added to sync and audit coverage):

- `pnpm design-system:check` passes. Generated app foundation blocks match `@barrelsgd/ui` across all nine web apps, including `cap`.
- `pnpm design-system:contrast` passes for all five warning foreground/background pairs.
- `pnpm design-system:audit` remains warning-only. It reports expected migration debt, not CI failures.

Current audit summary:

| App/package | Audit status |
|---|---|
| `auth` | No findings. |
| `cap` | Small set of hard-coded colors (5) from the initial build. |
| `gms` | Reference app with only accepted pilot exceptions: fixed media heights, `WeatherDateNav` active-state compensation, and month label leading. |
| `wxwatch` | Small fixed-media/gallery viewport exceptions. |
| `salesbus` | Small product-specific sizing exceptions. |
| `wxproducts` | Fixed A4/PDF dimensions in the document lane. |
| `hr` | Fixed A4 form dimensions and document-specific type sizing in the document lane. |
| `@barrelsgd/ui` | `alert-card` has weather/product fixed sizing and sub-scale text that should stay intentional until the warning lane settles. |
| `gaa-admin` | Highest dashboard migration debt: TailAdmin local tokens, hard-coded chart colors, spacing, shadows, and one dark hook. |
| `docs` | Highest template migration debt: docs-template colors, local type tokens, dark utility branches (90 darkMode findings), and template spacing. |

The audit also surfaces two additional categories not present in the initial pilot:
- **darkMode** — detects freestanding `.dark {}` CSS rule blocks (V1 is light-mode only). Active in `gaa-admin`; retained as migration debt because downstream third-party overrides depend on it.
- **typography** — detects font imports and `--font-sans` overrides that bypass the shared font bridge. V1 apps should resolve web UI typography back to `--gm-font-sans`; official document templates may use `--gm-font-document`.

Surface tokens `--gm-surface-secondary` (`#eaf2fb`) and `--gm-surface-muted` (`#e4eef7`) are now first-class design-system tokens. The shadcn semantics `--secondary`, `--muted`, and `--sidebar-accent` resolve through them rather than declaring raw hex. The fixed header dimension is exposed as `--gm-height-header: 72px` with a `h-gm-header` Tailwind alias, distinct from the spacing scale token `--gm-spacing-72`.

Warning token pairs are first-class v1 tokens. Use `--gm-warning-{green|yellow|amber|red|grey}-{bg|fg|border}` or the matching Tailwind aliases (`bg-gm-warning-red-bg`, `text-gm-warning-red-fg`, `border-gm-warning-red-border`) when rendering warning, impact, response, or status labels. Raw risk colors remain available as primitives, but foreground/background use must go through verified pairs unless contrast is checked explicitly.

Run the contrast guard after changing warning color tokens:

```bash
pnpm design-system:contrast
```

## Dark Mode

Dark mode is supported via the class-based `dark` variant. The foundation defines `.dark` token overrides (background, foreground, card, popover, primary, secondary, muted, accent, border, ring, chart-1..5, sidebar-*), so semantic tokens (`bg-background`, `text-foreground`, `border-border`) adapt automatically and most primitives need no `dark:*` branches.

Apps may follow the user's theme preference (light / dark / system) via the `@barrelsgd/theme` preferences store, which sets `data-theme-mode`/the `dark` class on `<html>` (with SSR cookie persistence + a boot script to avoid flash). Printable document "papers" intentionally stay light (white) in both modes — only the surrounding chrome adapts.

`gaa-admin` ships the shared `.dark` palette in its `globals.css`; the multi-app rollout is to lift that `.dark` block into the shared foundation so every app inherits it. Prefer semantic tokens over parallel `dark:*` utility branches. When a token's dark value needs tuning, edit the `.dark` block alongside the light `:root` block, and keep warning-pattern contrast passing in both modes.

## Warning Pattern Checklist

Use this checklist for public warnings, official bulletins, and impact-based forecast summaries. It reflects WMO impact-based/CAP principles and Met Office-style impact + likelihood guidance without claiming GMS uses the UK warning system.

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

## Code Connect pilots (historical)

> Retained as a record. The Code Connect mapping (`packages/ui/src/components/ui/button.figma.tsx`) and the `@figma/code-connect` dependency were removed under [ADR-0012](./adr/0012-decouple-design-tooling-from-figma.md).

A single pilot mapped the shared React `Button` to a Figma component set covering the full React API (6 variants × 7 sizes = 42 variants; `size=touch`, min-height 48px, added 2026-06-13 for touch-target products such as `salesbus`). `Input` was documented in Figma with `default` / `disabled` / `invalid` states but never received a mapping.

Publishing never happened: the active Education account reached Figma upload and was rejected because Code Connect write access is not exposed for that account tier. That blocker, plus unlinking Figma, is why the pilot was retired rather than finished.

The React API those pilots documented is unchanged — `Button` still ships 6 variants × 7 sizes, and `Input` still uses a native `disabled` prop and `aria-invalid`.

## Deferred

The v1 bridge does not yet include dark-mode token modes, a separate generated token source package, a broader reusable typography and effect-style system, full component-level cross-app migration, or runtime schema reconciliation for the larger GMS service and warning strategy.
