---
version: alpha
name: GAA Airports (mbia)
description: Welcoming island gateway — aviation navy, Caribbean sea, spice-gold runway accents.
colors:
  primary: "#0a1e5e"
  navy-deep: "#011963"
  navy-ink: "#071240"
  sea: "#0e7fa8"
  sea-bright: "#48a4d8"
  gold: "#f0b429"
  gold-deep: "#de911d"
  ink: "#101828"
  muted: "#52627d"
  mist: "#f4f7fb"
  rule: "#e2e9f3"
  paper: "#ffffff"
  status-ontime: "#15803d"
  status-delayed: "#b45309"
  status-cancelled: "#b91c1c"
typography:
  hero:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.25
  page-title:
    fontFamily: Manrope
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.25
  section-title:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.33
  card-title:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.375
  lead:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.625
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.2em
  flight-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    fontFeature: tnum
rounded:
  md: 10px
  lg: 12px
  xl: 16px
  2xl: 20px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  gutter-lg: 32px
  card: 24px
  hero-y: 56px
  hero-y-lg: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
  button-accent:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.lg}"
  section-hero:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.paper}"
  hero-eyebrow:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.gold}"
  hero-link:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.sea-bright}"
  runway-rule:
    backgroundColor: "{colors.gold}"
    rounded: "{rounded.full}"
  page-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.card}"
  card-kicker:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.sea}"
  card-summary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
  body-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  band:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.primary}"
  divider:
    backgroundColor: "{colors.rule}"
  footer:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.paper}"
  utility-bar:
    backgroundColor: "{colors.navy-deep}"
    textColor: "{colors.paper}"
  button-accent-hover:
    backgroundColor: "{colors.gold-deep}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.lg}"
  flight-board:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.2xl}"
  status-ontime:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.status-ontime}"
  status-delayed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.status-delayed}"
  status-cancelled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.status-cancelled}"
---

# GAA Airports (mbia) — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-24

Agent-readable spec for `apps/web/mbia`, the public site of the Grenada Airports
Authority (a client organisation) covering Maurice Bishop International (GND) and
Lauriston, Carriacou (CRU). [DESIGN.md format](https://github.com/google-labs-code/design.md);
restates `apps/web/mbia/src/app/globals.css` and adds **no** tokens. GAA is a separate
brand from GMS — never mix `gm-*` and `gaa-*`.

Other lanes: [gms](./gms.md) · [gaa-admin](./gaa-admin.md) · [signal](./signal.md).

## Overview

Travellers check flights, parking, and what to bring — often on a phone at the kerb.
The site is a gateway: confident navy, Caribbean sea, and a spice-gold "runway rule"
signature. Photography of the islands does the emotional work; the UI stays tidy and
factual. Light mode only — pages and documents must print.

Principles:

1. **Task first.** Flights, arrivals, departures, contacts — reachable in one tap from home.
2. **Place, not template.** Real airport photography and local vernacular; no stock SaaS kit.
3. **Signage clarity.** Flight data reads like an airport board: aligned, tabular, unambiguous.
4. **Honest data.** Sample flight data is labelled as sample until a live feed exists.

## Colors

Aliases are `bg-gaa-*` / `text-gaa-*`; shadcn semantics (`bg-primary`, `text-muted-foreground`,
`border`) are mapped to this palette, so `@barrelsgd/ui` primitives re-skin automatically.

| Name | Value | Token | Role |
|---|---|---|---|
| Navy | `#0a1e5e` | `--gaa-navy` | `--primary`, headings, buttons. 15.44:1 on white. |
| Navy deep | `#011963` | `--gaa-navy-deep` | Logo navy; header utility bar; navy button hover. |
| Navy ink | `#071240` | `--gaa-navy-ink` | Section heroes, flight board, text on gold. |
| Sea | `#0e7fa8` | `--gaa-sea` | Kickers, links, focus ring. 4.55:1 on white — **white only** (4.23:1 on mist fails). |
| Sea bright | `#48a4d8` | `--gaa-sea-bright` | Reserved (currently unused): links on navy only (6.48:1). Never text on white (2.77:1). |
| Gold | `#f0b429` | `--gaa-gold` | `--accent`, runway rule, eyebrows **on navy** (9.63:1). Fill only on white (1.86:1). |
| Gold deep | `#de911d` | `--gaa-gold-deep` | Gold button hover. |
| Ink | `#101828` | `--gaa-ink` | Body text. 17.75:1. |
| Muted | `#52627d` | `--gaa-muted` | Secondary text. 6.17:1 white, 5.74:1 mist. |
| Mist | `#f4f7fb` | `--gaa-mist` | Alternating bands, `--secondary`/`--muted`. |
| Rule | `#e2e9f3` | `--gaa-rule` | Borders and dividers (decorative). |
| Paper | `#ffffff` | `--gaa-paper` | Page. |

**Flight status** (`--gaa-status-*`, board only): on-time `#15803d`, delayed `#b45309`,
cancelled `#b91c1c` — all ≥5:1 on white. On the dark board they appear as tinted
pills with light text and always carry a word label ("Delayed"), never colour alone.

## Typography

Manrope for display (`font-display`), Inter for body (`font-sans`), both via
`next/font/google`. Marketing heroes use Tailwind's open scale — this lane is
expressive, unlike GMS.

| Role | Utilities |
|---|---|
| Hero (h1) | `font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight` |
| Section title | `font-display font-semibold text-2xl` |
| Card title | `font-display font-semibold text-lg leading-snug text-gaa-navy` |
| Lead | `text-base sm:text-lg leading-relaxed` |
| Body | `text-base` (16px); prose via `@tailwindcss/typography` |
| Small / meta | `text-sm text-gaa-muted` |
| Eyebrow | `font-semibold text-xs uppercase tracking-[0.2em]` — gold on navy, sea on white |
| Flight data | `.tabular` (tabular numerals), `text-sm` |

- Two families, clearly distinct roles: Manrope never for body, Inter never for heroes.
- Measure ≤ 75ch (`max-w-2xl`/`max-w-3xl` for leads and prose).
- Times in 24h local with zone where ambiguous; flight numbers never wrap (`whitespace-nowrap`).

## Layout

- Container `mx-auto max-w-7xl px-4 lg:px-8`; section rhythm `py-14 lg:py-20`.
- Interior pages open with `SectionHero`; home and airport pages use full-bleed photo heroes.
- Card grids `gap-6`, 1 → 2 → 3 columns. Quick tasks appear above the fold on mobile.
- IA lives in `src/lib/nav.ts`; hrefs must match MDX slugs.

## Elevation & Depth

Resting cards are flat with a `border-gaa-rule` hairline; hover lifts
(`hover:-translate-y-0.5 hover:shadow-lg`, border tints sea). The flight board is the
one permanently raised object (`shadow-xl`). No shadows on text or inside heroes.

## Shapes

`--radius` is 12px, so this lane is rounder than GMS. Controls `rounded-md` (10px);
panels `rounded-xl` (16px); cards and the flight board `rounded-2xl` (20px); runway
rule, segmented controls and pills `rounded-full`. Photos inherit their card's radius.

## Components

**Role** · **Specs** · **Context**.

- **SectionHero** (`src/components/section-hero.tsx`) · Interior page opener · `bg-gaa-navy-ink text-white`; gold uppercase eyebrow/breadcrumb; Manrope h1; `text-white/75` lead; `h-1 w-24 rounded-full bg-gaa-gold` runway rule · Every interior page — the signature move.
- **FlightBoard** (`src/components/flight-board.tsx`) · Departures/arrivals · `rounded-2xl bg-gaa-navy-ink text-white shadow-xl`; segmented arrivals/departures toggle; `.tabular` rows; status pills with words; sample-data notice · `/flights`, home.
- **PageCard** (`src/components/page-card.tsx`) · Content teaser · `rounded-2xl border border-gaa-rule bg-white p-6`; sea kicker; Manrope navy title; muted 3-line summary; "Read more →" · Section index pages.
- **Button** (`@barrelsgd/ui`, `asChild` for links) · Actions · primary navy; gold accent for the single hero CTA with navy-ink text.
- **Contact form** (`src/components/contact-form.tsx`) · Enquiries · Zod-validated, visible labels, errors inline.

States: flight board empty ("No departures scheduled for the rest of today"), stale
("Updated 14:05"), and feed-down messages; long airline names wrap, flight numbers don't.

## Do's and Don'ts

**Do**

- Use gold as a fill or as text on navy only.
- Label every flight status in words; keep numerals tabular.
- Use real GND/CRU photography, compressed, with `alt` text describing the place.
- Keep one gold CTA per hero.
- Keep everything printable (light mode, no background-only information).

**Don't**

- Use sea-bright or gold as text on white, or sea/muted text on tinted bands below AA.
- Use `gm-*` tokens or the GMS logo — different organisation.
- Add raw Tailwind palette colours; the board's `emerald/amber/red-300` status text is existing debt to replace with `gaa` tokens when touched.
- Autoplay video or carousels without pause; animate beyond hover lift.
- Present sample flight data without its label.

## Accessibility & interaction

WCAG 2.2 AA. Photo heroes need a navy overlay sufficient for white text ≥4.5:1; the
arrivals/departures toggle is a real radio group or tabs; tap targets ≥44px; honour
`prefers-reduced-motion` for the hover lift and image zooms. The layout renders `SkipLink`. Known gap: `--input` is `--gaa-rule` (below 3:1) — label inputs visibly.

## Agent prompt guide

Quick reference: navy `gaa-navy` · navy-ink heroes · sea `gaa-sea` kickers/links ·
gold `gaa-gold` fill/on-navy only · Manrope display + Inter body · radius 12px base ·
flight data `.tabular`.

1. "Build a 'Parking & transport' interior page per `docs/design/mbia.md`: `SectionHero` with gold eyebrow and runway rule, then a 3-column `PageCard` grid."
2. "Add an arrivals widget on home reusing `FlightBoard`: tabular times, status words, sample-data notice, empty state."
3. "Create a photo hero for Lauriston airport: full-bleed image, navy overlay meeting 4.5:1 for white text, Manrope h1, one gold CTA."
