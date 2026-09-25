---
version: alpha
name: GAA Admin
description: Dense, calm operations console — semantic tokens only, so presets and dark mode re-skin everything.
colors:
  primary: "#0b132b"
  primary-accent: "#0b63ee"
  accent: "#37a3ef"
  highlight: "#b9ee63"
  background: "#ffffff"
  surface: "#f3f8fc"
  primary-soft: "#eaf3fb"
  secondary: "#eaf2fb"
  muted: "#e4eef7"
  foreground: "#111827"
  foreground-secondary: "#4b5563"
  muted-foreground: "#6b7280"
  inverse: "#ffffff"
  border: "#d0d5dd"
  success: "#00843d"
  warning: "#ff9900"
  warning-soft: "#ffe923"
  destructive: "#cc0033"
  dark-background: "#0b1020"
  dark-card: "#11182b"
  dark-foreground: "#e6eaf2"
  dark-muted-foreground: "#9aa4b8"
  dark-primary: "#39a9f5"
  dark-primary-foreground: "#07111f"
typography:
  page-title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  document:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  unit: 4px
  content: 16px
  content-md: 24px
  card: 16px
  stack: 16px
  stack-tight: 12px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.lg}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
  link:
    textColor: "{colors.primary-accent}"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  table-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground-secondary}"
  nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  metadata:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
  skeleton:
    backgroundColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.border}"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.full}"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
  badge-caution:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
  badge-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.full}"
  chart-series:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  highlight-chip:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
  dark-card:
    backgroundColor: "{colors.dark-card}"
    textColor: "{colors.dark-foreground}"
    rounded: "{rounded.xl}"
  dark-metadata:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-muted-foreground}"
  dark-button-primary:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-primary-foreground}"
    rounded: "{rounded.lg}"
---

# GAA Admin — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-24

Agent-readable spec for `apps/web/gaa-admin` — the GAA staff portal that folds in cap,
hr, wxwatch, wxproducts and salesbus. [DESIGN.md format](https://github.com/google-labs-code/design.md);
restates the contract, adds **no** tokens. YAML colours are the *resolved default
light theme* (GMS brand layer) plus the `.dark` palette. Sources:
`apps/web/gaa-admin/src/app/globals.css`, `packages/ui/src/styles/globals.css`,
`packages/theme`. Read `apps/web/gaa-admin/AGENTS.md` and run the `gaa-admin-change`
skill before editing the app.

Other lanes: [gms](./gms.md) · [mbia](./mbia.md) · [signal](./signal.md).

## Overview

Forecasters, HR officers and sales staff use this all shift, on desktop, often in a
darkened ops room. Optimise for scanning and repeated action, not first impressions:
dense but calm, predictable positions, keyboard-friendly, and zero decoration. Users
choose their theme preset (default, brutalist, soft-pop, tangerine), light/dark, and
UI font — so **the design is the semantic contract, not a palette**. Hardcode a
colour and it breaks for every user who picked a different preset.

Principles:

1. **Semantic tokens only.** `bg-card`, `text-muted-foreground`, `bg-success` — never `gm-*` hues or raw Tailwind colours in UI chrome.
2. **Density with rhythm.** Tight is fine; inconsistent is not.
3. **State is always visible.** Draft/issued/expired, saving/saved, who changed what.
4. **Documents are a separate lane.** Printable output follows paper rules, not app rules.

## Colors

Use shadcn semantics. They resolve through the GMS brand layer in the default preset
and are re-mapped by presets and `.dark`.

| Role | Utility | Default light | Dark | Notes |
|---|---|---|---|---|
| Page | `bg-background` | `#ffffff` | `#0b1020` | |
| Card / popover | `bg-card` | `#ffffff` | `#11182b` | |
| Text | `text-foreground` | `#111827` | `#e6eaf2` | 15.70:1 dark |
| Secondary text | `text-muted-foreground` | `#6b7280` | `#9aa4b8` | 4.83:1 light — on `bg-background`/`bg-card` only |
| Primary action | `bg-primary text-primary-foreground` | navy / white | `#39a9f5` / `#07111f` | 7.36:1 dark |
| Links, info | `text-info`, `bg-info` | `#0b63ee` | — | GMS blue ink |
| Soft selection | `bg-primary-soft text-primary-soft-foreground` | panel / navy | — | active nav, selected rows |
| Secondary / muted fill | `bg-secondary`, `bg-muted` | `#eaf2fb`, `#e4eef7` | `#1b2336` | |
| Success | `bg-success text-success-foreground` | `#00843d` / white | — | 4.81:1 |
| Warning | `bg-warning text-warning-foreground` | `#ff9900` / dark | — | 8.29:1 |
| Caution | `bg-warning-soft text-warning-soft-foreground` | `#ffe923` / dark | — | |
| Destructive | `bg-destructive` | `#cc0033` | `#ff5a5f` | 6.20:1 dark on page |
| Borders | `border` (default) | `#d0d5dd` | 10% white | decorative only |
| Input outline | `border-input` | `#85888d` (`--gm-border-input`) | 15% white | light passes 3:1; dark still below |
| Charts | `var(--chart-1…5)` | blue-ink, sky, navy, lime, green | own set | |

**Hazard exception.** CAP/wxwatch surfaces that render public severity use the
`gm-warning-*` pairs exactly as the [GMS spec](./gms.md#colors) defines — those
colours are regulated, so they stay fixed across presets and dark mode.

**Migration debt:** ~95 raw Tailwind palette classes (`text-red-600`, `bg-green-100`…)
remain in the app. Don't add more; replace with the semantic status utilities when
touching a file.

## Typography

UI font is user-selectable (Inter default; Geist, Schibsted Grotesk, Noto Sans, Geist
Mono, JetBrains Mono), so never design around one face's metrics. Coded data
(SYNOP/METAR, IDs, amounts in tables) is `font-mono`; printable documents are always
`font-document` (Noto Sans).

| Role | Utilities | Size / line |
|---|---|---|
| Page title | `font-semibold text-2xl` | 24 / 32 |
| Section / card title | `font-semibold text-lg` | 18 / 28 |
| Body, table cells | `text-body leading-body` (≡ `text-sm`) | 14 / 20 |
| Small body | `text-body-sm leading-body-sm` | 13 / 20 |
| Caption, metadata | `text-caption leading-caption` (≡ `text-xs`) | 12 / 16 |
| Label, column head | `font-medium text-caption` | 12 / 16 |

- New code prefers the named steps; existing `text-sm`/`text-xs` are equivalent and needn't be churned.
- Weights: `font-medium` for labels and UI, `font-semibold` for titles, `font-bold` rarely. No light weights at 12–14px.
- Figures in tables and KPIs: `tabular-nums`, right-aligned.
- `tracking-tight` only on titles ≥18px; `tracking-wide` only on short uppercase labels.

## Layout

- **Shell:** sidebar (`inset` variant by default, collapsible) + header + content; content padding `p-4 md:p-6`. Don't reimplement the shell per module.
- **Density:** stacks `gap-3`/`gap-4`; card padding `p-4`; form fields `gap-2` label→control, `gap-4` field→field.
- **Width:** content layout is user-selectable (centered or full). Forms and settings cap at `max-w-3xl`/`max-w-4xl`; tables use the full width.
- **Tables first** for lists of records; cards only for heterogeneous summaries.
- **URL is state:** filters, tabs, pagination and selected record live in search params so a view can be shared and survives refresh.

## Elevation & Depth

Borders separate; shadows are rare. Page → `bg-card` + `border` (`rounded-xl`) →
`shadow-card` only for draggable/floating items → overlays (dialog, sheet, popover,
command) use the primitive's shadow. In dark mode, raise by *lightening the surface*
(`bg-card`, `bg-secondary`), not by adding shadow.

## Shapes

`--radius` is 8px. Keep to: controls `rounded-md` (6px), panels/sections `rounded-lg`
(8px), `Card` `rounded-xl` (12px, the primitive's default), pills/avatars
`rounded-full`. Child radius ≤ parent. Presets may change `--radius` — use the scale,
never arbitrary values.

## Components

**Role** · **Specs** · **Context**.

- **Card** (`@barrelsgd/ui/components/ui/card`) · Grouped summary · `rounded-xl border bg-card p-4`, title `font-semibold` · Dashboards; not for record lists.
- **Table** (`…/ui/table`) · Records · head `text-muted-foreground font-medium text-caption`; cells `text-body`; numbers right-aligned `tabular-nums`; row actions in a trailing `DropdownMenu` · Always with an empty state and a loading skeleton that matches the column layout.
- **Badge** (`…/ui/badge`) · Status · semantic variants only; always a text label (never colour-only) · Workflow states: draft, submitted, approved, issued, expired.
- **Dialog / AlertDialog / Sheet** · Focused tasks · confirm destructive actions with `AlertDialog` naming the object ("Delete leave request for J. Doe?") or offer Undo · Sheets for edit-in-context.
- **Form fields** (`…/ui/field`, `input`, `select`) · Data entry · visible label, helper text below, error below in `text-destructive`, submit stays enabled until pressed · Warn before leaving with unsaved changes.
- **Toasts** (`…/ui/sonner`) · Async outcome · short past-tense result + next step ("Forecast issued · View") · Never the only record of an error.
- **Paper** (`src/components/document/paper.tsx`) · Printable documents (wxproducts, hr) · A4, always light, `font-document`, fixed dimensions · Print rules outrank app density and dark mode.

### States

Every data view designs empty (with the action that fills it), loading (skeleton after
~150ms, no layout shift), error (what failed + retry), partial/stale, permission-denied,
and very long values (names, station lists).

## Do's and Don'ts

**Do**

- Use semantic utilities so all four presets and dark mode work — check both themes.
- Keep hazard severity on the `gm-warning-*` pairs; everything else semantic.
- Put record lists in tables with keyboard-reachable row actions.
- Persist filters/tabs/pagination in the URL.
- Show who/when on every audited change.
- Use `font-mono` for coded meteorological data and `tabular-nums` for figures.

**Don't**

- Use `gm-*` brand hues or raw Tailwind colours (`bg-blue-500`) in app chrome.
- Critique or style it like a marketing page — no hero sections, big imagery, or decorative gradients.
- Use `transition-all` or animate layout; motion is for state change only (`MotionProvider` honours reduced motion).
- Put muted text on tinted fills (`text-muted-foreground` on `bg-muted` fails AA).
- Apply app dark mode or the user's UI font to `Paper` documents.
- Reintroduce the retired orange — note `.dark` `--chart-4` is still `#ff981e`; pending a replacement.

## Accessibility & interaction

WCAG 2.2 AA in both themes. Full keyboard operation (sidebar, tables, menus, command
palette `⌘K`); visible `:focus-visible` ring; focus trapped in and returned from
dialogs; icon-only buttons have `aria-label`; hit targets ≥24px; inline validation
announced politely; errors say how to fix. The shell renders `SkipLink` to the content region. Known gap: dark-mode `--input` (15% white) is below 3:1 — always label inputs visibly.

## Agent prompt guide

Quick reference: semantic tokens only · Inter (user-switchable) · 14px body · borders
not shadows · `Card` 12px radius, controls 6px · tables for records · hazard =
`gm-warning-*`.

1. "Add a leave-requests table to hr per `docs/design/gaa-admin.md`: semantic tokens, status `Badge` with text, right-aligned `tabular-nums` dates, trailing row menu, empty and loading states, filters in the URL."
2. "Build a wxwatch dashboard card row: `Card` with `font-semibold text-lg` title, `text-muted-foreground` caption, KPI in `tabular-nums`; verify in dark mode and the brutalist preset."
3. "Add a destructive 'Revoke role' action: `AlertDialog` naming the user and role; toast on success with Undo."
4. "Create an edit form in a `Sheet`: visible labels, errors under fields, focus first error on submit, warn on unsaved close."
