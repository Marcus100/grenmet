---
version: alpha
name: GMS Institutional
description: Calm public-safety authority — navy-anchored, legible first, colour reserved for meaning.
colors:
  primary: "#0b132b"
  blue: "#2878f5"
  blue-ink: "#0b63ee"
  sky: "#37a3ef"
  sky-ink: "#0f70b5"
  lime: "#b9ee63"
  lime-ink: "#3f7a0f"
  surface-page: "#ffffff"
  surface: "#f3f8fc"
  surface-panel: "#eaf3fb"
  surface-secondary: "#eaf2fb"
  surface-muted: "#e4eef7"
  text-primary: "#111827"
  text-secondary: "#4b5563"
  text-muted: "#6b7280"
  text-inverse: "#ffffff"
  border: "#d0d5dd"
  border-input: "#85888d"
  risk-green: "#00843d"
  risk-yellow: "#ffe923"
  risk-amber: "#ff9900"
  risk-red: "#cc0033"
  risk-grey: "#dcdcdc"
typography:
  display:
    fontFamily: Noto Sans
    fontSize: 34px
    fontWeight: 700
    lineHeight: 36px
  heading-md:
    fontFamily: Noto Sans
    fontSize: 30px
    fontWeight: 700
    lineHeight: 36px
  heading-base:
    fontFamily: Noto Sans
    fontSize: 26px
    fontWeight: 700
    lineHeight: 32px
  heading-sm:
    fontFamily: Noto Sans
    fontSize: 22px
    fontWeight: 700
    lineHeight: 28px
  nav:
    fontFamily: Noto Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  body-base:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label:
    fontFamily: Noto Sans
    fontSize: 11px
    fontWeight: 700
    lineHeight: 16px
  data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  unit: 4px
  cell-x: 16px
  cell-y: 10px
  card: 16px
  card-lg: 20px
  section: 32px
  section-lg: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.lg}"
  button-brand:
    backgroundColor: "{colors.blue-ink}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
  stat-tile:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.card}"
  table-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
  warning-red:
    backgroundColor: "{colors.risk-red}"
    textColor: "{colors.text-inverse}"
  warning-amber:
    backgroundColor: "{colors.risk-amber}"
    textColor: "{colors.text-primary}"
  warning-yellow:
    backgroundColor: "{colors.risk-yellow}"
    textColor: "{colors.text-primary}"
  warning-green:
    backgroundColor: "{colors.risk-green}"
    textColor: "{colors.text-inverse}"
  link:
    textColor: "{colors.blue-ink}"
  chart-series:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.primary}"
  tag-sky:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.full}"
  tag-lime:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.full}"
  focus-ring:
    backgroundColor: "{colors.blue}"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
  button-secondary:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  skeleton:
    backgroundColor: "{colors.surface-muted}"
  metadata:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-muted}"
  divider:
    backgroundColor: "{colors.border}"
  input:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  input-outline:
    backgroundColor: "{colors.border-input}"
  warning-expired:
    backgroundColor: "{colors.risk-grey}"
    textColor: "{colors.text-primary}"
  highlight-chip:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
---

# GMS Institutional — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-24

Agent-readable spec for the GMS institutional lane (`gms`, `auth`, `docs`, `events`),
in the [DESIGN.md format](https://github.com/google-labs-code/design.md): YAML tokens
above, prose rationale below, canonical section order. It restates the contract and
adds **no** tokens. Sources of truth: `packages/gms/src/styles/foundation.css`
(palette), `packages/ui/src/styles/globals.css` (type scale, radius, shadow),
[Design System](../design-system.md) (governance). If this file and a source
disagree, the source wins — fix this file. `scripts/docs/design-md.test.mjs` fails
when a colour here drifts from the CSS.

Other lanes: [gaa-admin](./gaa-admin.md) · [mbia](./mbia.md) · [signal](./signal.md).

## Overview

The Grenada Meteorological Service is the meteorological department of the Grenada
Airports Authority (a client organisation — not a Barrels product). Its public
surfaces are read on phones, under stress, during weather warnings. So: white page,
hairline borders, navy ink, and hue only where it carries brand identity or hazard
meaning. The subject's own vernacular is the official bulletin — issue time,
validity, area, severity — so the characteristic element on any page is a dated,
attributed product, not a decorative hero.

Principles, in priority order:

1. **Legible before beautiful.** AA contrast, 16px body, plain language.
2. **Colour is meaning.** Hazard hues are regulated (CAP risk scale); brand hues never signal danger.
3. **Quiet chrome.** Borders over shadows, few radii, one primary action per view.
4. **State the facts.** Every product shows who issued it, when, for where, and until when.

**Voice** (Mini Brand Presentation 2026): *clear and accessible* — plain language
first, technical terms where needed; *credible and informed* — precise, evidence-based,
never sensational; *calm and reassuring* — urgency without panic: what is happening,
what it means, what to do next; *helpful and public-focused* — explain how the
weather affects people's lives, not just the reading.

**Imagery** (same kit): real meteorological subject matter — satellite and radar
loops, instruments, stations, clouds over Grenada. No generic stock weather or
illustration-kit art.

## Colors

Use the Tailwind alias (`bg-gm-navy`, `text-gm-blue-ink`), never the hex. `primary` in
the YAML is `--gm-navy`; every other key is `--gm-<key>`.

| Name | Value | Token | Role |
|---|---|---|---|
| Navy | `#0b132b` | `--gm-navy` | Headings, primary buttons (`--primary`), dark surfaces. 18.38:1 on white. |
| Blue | `#2878f5` | `--gm-blue` | Fills, borders, focus rings, display type ≥24px. 4.12:1 — never small text. |
| Blue ink | `#0b63ee` | `--gm-blue-ink` | Links, small blue text, fill behind small white text. 5.21:1. |
| Sky | `#37a3ef` | `--gm-sky` | Secondary fills, chart series, `--accent`. Dark text on top (6.46:1). |
| Sky ink | `#0f70b5` | `--gm-sky-ink` | Small sky-hued text and icons. 5.24:1. |
| Lime | `#b9ee63` | `--gm-lime` | Nutmeg accent. **Fill only**; best on navy (13.55:1). |
| Lime ink | `#3f7a0f` | `--gm-lime-ink` | Only where lime must read as text. 5.25:1. |
| Page | `#ffffff` | `--gm-surface-page` | Page background (`bg-background`). |
| Surface | `#f3f8fc` | `--gm-surface` | Table heads, captions, quiet bands. |
| Panel | `#eaf3fb` | `--gm-surface-panel` | Grouped panels, compact footers. |
| Secondary | `#eaf2fb` | `--gm-surface-secondary` | Secondary buttons and chips. |
| Muted | `#e4eef7` | `--gm-surface-muted` | Muted fills, skeletons. |
| Text primary | `#111827` | `--gm-text-primary` | Body text; dark text on light fills. 17.74:1. |
| Text secondary | `#4b5563` | `--gm-text-secondary` | Supporting copy, table cells. 7.07:1 on `surface`. |
| Text muted | `#6b7280` | `--gm-text-muted` | Labels, metadata — **on white only** (4.83:1; 4.31:1 on `surface-panel` fails AA). |
| Border | `#d0d5dd` | `--gm-border` | Dividers and container edges. Decorative only (1.47:1). |
| Input border | `#85888d` | `--gm-border-input` | Outlines of inputs, selects, checkboxes (`--input` in the brand layer). 3.56:1 on white, ≥3.17:1 on every surface tint. |

**Hazard colours** follow the CAP risk scale, not the brand. Severity only, and only as
matched pairs:

| Level | Value | Utilities (bg / fg) | Text contrast |
|---|---|---|---|
| Green | `#00843d` | `bg-gm-warning-green-bg` / `text-gm-warning-green-fg` | white 4.81:1 |
| Yellow | `#ffe923` | `…-yellow-bg` / `…-yellow-fg` | dark 14.30:1 |
| Amber | `#ff9900` | `…-amber-bg` / `…-amber-fg` | dark 8.29:1 |
| Red | `#cc0033` | `…-red-bg` / `…-red-fg` | white 5.81:1 |
| Grey | `#dcdcdc` | `…-grey-bg` / `…-grey-fg` | expired |

Public-guidance aliases: `gm-weather-severity-{low,be-aware,be-prepared,take-action,expired}`.

## Typography

One family, Noto Sans (`font-sans`; `font-document` for printable output). Coded data —
METAR/TAF/SYNOP, station IDs — uses `font-mono` (JetBrains Mono where loaded, else
system mono).

| Role | Weight | Size / line height | Utilities |
|---|---|---|---|
| Display (rare) | bold | 34 / 36 | `text-heading-lg leading-heading-lg` |
| Page title (h1) | bold | 30 / 36 | `text-heading-md leading-heading-md` |
| Sub-heading | bold | 26 / 32 | `text-heading-base leading-heading-base` |
| Section title (h2) | bold | 22 / 28 | `text-heading-sm leading-heading-sm` |
| Nav | semibold | 20 / 28 | `text-nav leading-nav` |
| Body, lead | regular | 16 / 24 | `text-body-base leading-body-base` |
| Dense body, cells | regular | 14 / 20 | `text-body leading-body` |
| Small body | regular | 13 / 20 | `text-body-sm leading-body-sm` |
| Caption | regular | 12 / 16 | `text-caption leading-caption` |
| Label, table head | bold | 11 / 16 | `text-label leading-label` |
| Micro | regular | 10 / 16 | `text-micro leading-micro` — metadata only |

- Always pair `text-<step>` with `leading-<step>`. Never raw `text-xl`/`text-3xl`.
- Headings bold, UI emphasis semibold, body regular. No light weights.
- Reading measure ≤ 75 characters: `max-w-prose` or `max-w-3xl` for running text.
- Numbers that are compared (temperatures, times, tables) use `tabular-nums`.
- Default tracking. `tracking-wide` only on short uppercase labels; avoid ALL-CAPS for anything longer than a label.

## Layout

- **Spacing:** Tailwind's scale on a 4px unit. Never define `--spacing-*` (it shadows
  Tailwind's computed scale — see [Design System](../design-system.md#how-the-design-system-works)).
- **Rhythm:** card padding `p-4 lg:p-5`; cell padding `px-4 py-2.5 lg:px-5 lg:py-3`;
  section gap `mb-8 lg:mb-12`; tile grid `gap-3`; stacked prose `space-y-6`.
- **Width:** page `max-w-6xl`; reading `max-w-3xl` / `max-w-prose`.
- **Header:** `h-header` (72px), sticky, `border-b border-gm-border`.
- **Mobile first:** design at 375px, then `sm`/`lg`. Touch targets ≥44px on mobile
  (the header CTA is `h-11`).
- **Page skeleton:** breadcrumbs (automatic, from the pages layout) → `PageHeader` →
  one or more `PageSection` → optional link list. Use these instead of hand-rolled
  `h1`/`h2`. New pages get breadcrumbs by being in `NAV_SECTIONS` (or under a page that is).

## Elevation & Depth

Separation comes from **hairline borders, not shadows**: `border border-gm-border` on a
`bg-background` or `bg-gm-surface*` fill. Depth ladder:

1. Flat — page and sections (no border).
2. Bordered — tiles, tables, panels (`border-gm-border`).
3. Raised — cards that genuinely float: `shadow-card` (1–3px, 10% black).
4. Overlay — dialogs, sheets, menus: the primitive's own shadow.

Focus is always visible: `focus-visible:ring-*`, or `shadow-gm-focus` on custom controls.

## Shapes

Four radii only; nest concentrically (child radius ≤ parent).

| Element | Utility | Value |
|---|---|---|
| Bordered containers (tables, tiles) | `rounded` | 4px |
| Buttons, inputs, nav CTAs | `rounded-md` | 6px |
| Cards, alert strips | `rounded-lg` | 8px |
| Pills, avatars, status dots | `rounded-full` | 9999px |

## Components

Each: **Role** · **Specs** · **Context**.

- **Button** (`@barrelsgd/ui/components/ui/button`) · Primary action · `default` = navy fill, white text, `font-medium`, `rounded-lg`; header CTA `h-11 rounded-md px-4 font-semibold text-body-base` · One primary per view; others `outline`/`secondary`. Loading keeps the label and adds a spinner.
- **Stat tile** (`apps/web/gms/src/components/pages/stat-tiles.tsx`) · Headline figures · `rounded border border-gm-border bg-background p-4 lg:p-5`; muted `text-label` label, navy bold `text-heading-sm` value · 1/2/4-col grid, `gap-3`.
- **Info table** (`…/pages/info-table.tsx`) · Reference data · `rounded border`; head `bg-gm-surface` navy bold `text-label`; cells `text-body` secondary; `monoColumns` for coded data · Wrapped in `overflow-x-auto`; always has a caption.
- **Page header / section** (`page-header.tsx`, `pages/page-section.tsx`) · Titles · h1 navy `text-heading-md`, subtitle secondary `text-body-base`; h2 navy `text-heading-sm`, `mb-3 lg:mb-4` · Every page.
- **Alert status line** (`alertsSummary` in `apps/web/gms/src/lib/cap.ts`) · The live warning state · exactly one wording everywhere: "No active warnings", "<level> · <n> active" (e.g. "Be prepared · 1 active", level from the most severe alert), or "Warnings unavailable"; surface coloured by `WARNING_LEVEL_SURFACE` · Desktop header pill, mobile menu top row, mobile accordion title, desktop panel header, Warnings menu card — all link to `/warnings`.
- **Alert card** (`@barrelsgd/gms/components/alert-card`) · A CAP warning · severity strip `gm-warning-*-bg/-fg`, `rounded-t-lg`, `font-document`; strip title states severity in words · The only place hazard colours are large fills.
- **Breadcrumbs** (`apps/web/gms/src/components/site-breadcrumbs.tsx`) · Where am I · Home › section (sitemap anchor or section page) › URL ancestors; current page omitted (the `h1` names it); `text-body-sm` secondary, blue-ink hover · Automatic on every standing page; logic in `src/lib/breadcrumbs.ts`.
- **Logo** (`@barrelsgd/gms/components/logo`) · Brand mark · variants `primary | submark | wordmark` (raster pairs) and `monogram | icon` (inline vector, `currentColor`); size via `className` only (`h-9 w-auto` header, `size-7` icon); dark mode handled automatically.
- **Badge / Alert / Dialog / Tabs** (`@barrelsgd/ui`) · Already branded by the GMS brand layer — don't restyle per app.

### States every surface must design

Empty ("No warnings in force" is a *good* state — say so plainly), loading (skeleton
matching final layout, no shift), error (what failed + what to do), stale ("Latest
observation 06:00 — older than usual"), and long content (wrapping station names,
multi-day validity).

## Do's and Don'ts

**Do**

- Use the `-ink` variant for text under 24px regular / 18.66px bold and icons under ~24px.
- Put small white text on `bg-gm-blue-ink`, never on `bg-gm-blue`.
- State severity in words *and* colour ("Amber warning — be prepared").
- Show issue time, validity, and area on every product.
- Use `PageHeader`/`PageSection` and the named type scale.
- Set coded weather data in `font-mono`, compared numbers in `tabular-nums`.
- Keep printable documents ("papers") light in dark mode.

**Don't**

- Hardcode a hex, `px` size or radius, or add values to Tailwind config.
- Put lime text on white (1.36:1), sky as small text (2.75:1), or muted text on a tinted panel.
- Use a hazard colour for decoration, or a brand hue to signal danger.
- Stack shadows on in-page cards, or use radii beyond the four above.
- Set `width`/`height` on the logo or hardcode an asset path.
- Use the retired sun orange or any warm brand tone.
- Reach for generic "AI" styling: gradient hero numbers, glassmorphism, emoji icons, card-kit grids with no hierarchy.
- Add or change a `--gm-*` token without approval.

## Accessibility & interaction

Target WCAG 2.2 AA. Adapted from the GOV.UK Design System and Vercel's Web Interface
Guidelines to this lane:

- **Semantics first:** real `<a>`/`<Link>` for navigation, `<button>` for actions, one `h1`, no skipped heading levels; the root layout renders `SkipLink` (`@barrelsgd/ui/components/ui/skip-link`) targeting `<main id="main-content">`.
- **Keyboard:** everything operable by keyboard; visible `:focus-visible` ring; focus moves into and returns from dialogs.
- **Targets:** ≥24px everywhere, ≥44px for primary touch targets.
- **Non-text contrast:** controls whose boundary identifies them (inputs, checkboxes) need ≥3:1. `--input` resolves to `--gm-border-input` (3.56:1) in every GMS brand layer — never draw a control's outline with `--gm-border`.
- **Colour is never the only signal:** pair with text or an icon (see Warning Pattern Checklist in `docs/design-system.md`).
- **Motion:** only to show cause and effect; honour `prefers-reduced-motion` (the app's `MotionProvider` does); animate `opacity`/`transform` only; never `transition-all`.
- **Forms:** visible labels, errors beside the field, focus the first error on submit, correct `type`/`inputmode`/`autocomplete`, never block paste, 16px inputs on mobile.
- **Content:** plain language, sentence case, active voice, numerals for counts, `…` not `...`, times with a zone ("06:00 AST"), locale-aware dates.

## Agent prompt guide

Quick reference: navy `gm-navy` ink/primary · blue ink `gm-blue-ink` links · sky
`gm-sky` accent fill · lime `gm-lime` fill on navy · borders `gm-border` · body
`gm-text-primary`/`gm-text-secondary` · white page · Noto Sans · 4 radii.

Before coding, write a two-line plan — the page's single most important element, and its one primary action — then check it against *Overview* principles.

1. "Build a stat-tile row for today's rainfall, wind and pressure per `docs/design/gms.md`: bordered `rounded` tiles, muted label, navy bold value, `tabular-nums`, 4 columns on `lg`."
2. "Add a station observations table with `InfoTable`; METAR in `monoColumns`; caption states the observation time; no custom colours."
3. "Create a warnings section with `AlertCard` per active warning, plus an explicit empty state 'No warnings in force' when there are none."
4. "Design a navy hero band with a lime chip and white `text-heading-lg` heading. No blue text on navy; one CTA."
5. "Add a secondary action beside the primary Button: `outline` variant, `rounded-md`, no new colours."
