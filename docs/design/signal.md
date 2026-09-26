---
version: alpha
name: Grenada Signal
description: Friendly civic newsletter — serif headlines, ink on white, island green with a gold underline.
colors:
  primary: "#1a7a3d"
  green-dark: "#136030"
  gold: "#f5c518"
  ink: "#0a0a0a"
  alert: "#c8102e"
  muted: "#6b7280"
  rule: "#e5e7eb"
  paper: "#ffffff"
  secondary: "#f3f4f6"
typography:
  lead-headline:
    fontFamily: Source Serif 4
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.025em
  section-title:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: 700
    lineHeight: 28px
    letterSpacing: -0.025em
  story-title:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
  small:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  eyebrow:
    fontFamily: Source Serif 4
    fontSize: 11.2px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.05em
  meta:
    fontFamily: Inter
    fontSize: 11.2px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.025em
rounded:
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-y: 32px
  band-y: 40px
  story-y: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  button-on-green:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  subscribe-band:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
  eyebrow:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
  eyebrow-underline:
    backgroundColor: "{colors.gold}"
  highlight:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
  story:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  meta:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.rule}"
  footer:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
  alert-banner:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
---

# Grenada Signal — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-24

Agent-readable spec for `apps/web/signal`, the mobile-first civic news reader for
Grenada Signal. [DESIGN.md format](https://github.com/google-labs-code/design.md);
restates `apps/web/signal/src/app/globals.css` and adds **no** tokens. Signal is its
own brand — never use `gm-*` or `gaa-*` here.

Other lanes: [gms](./gms.md) · [gaa-admin](./gaa-admin.md) · [mbia](./mbia.md).

## Overview

A daily briefing read in a few minutes on a phone, in the style of a friendly
morning newsletter. Editorial and warm, not corporate: serif headlines, generous line
height, ink on white, island green for identity and a gold underline as a
signature. The characteristic element is **today's lead story and the day's
sections**, not a product dashboard.

Principles:

1. **Reading first.** A single column, ≤ 65ch, with body text at 16px or larger and loose leading.
2. **Editorial hierarchy.** Serif carries the voice; sans carries information.
3. **Red means alert.** `--signal-alert` is reserved for genuine alerts only.
4. **Light and fast.** No shadows, no heavy imagery chrome; images earn their place.

## Colors

The aliases are `bg-signal-*` and `text-signal-*`. shadcn semantics are mapped to this palette.

| Name | Value | Token | Role |
|---|---|---|---|
| Green | `#1a7a3d` | `--signal-green` | `--primary`, links, eyebrows, subscribe band. 5.39:1 on white; white on it 5.39:1. |
| Green dark | `#136030` | `--signal-green-dark` | Hover and pressed. 7.65:1. |
| Gold | `#f5c518` | `--signal-gold` | `--accent`, eyebrow and heading underlines. **Fill or rule only**: 1.63:1 on white, 3.31:1 against green. Ink on gold is 12.14:1. |
| Ink | `#0a0a0a` | `--signal-ink` | Text, section rules, button on the green band. 19.80:1. |
| Alert | `#c8102e` | `--signal-alert` | `--destructive`, genuine alerts only. White on it 5.88:1. |
| Muted | `#6b7280` | `--signal-muted` | Metadata. 4.83:1 on white only: 4.39:1 on `#f3f4f6` **fails**. |
| Rule | `#e5e7eb` | `--signal-rule` | Hairlines between stories (decorative). |
| Paper | `#ffffff` | `--signal-paper` | Page. |

## Typography

Source Serif 4 (`font-serif`) for headlines and eyebrows, Inter (`font-sans`) for body
and UI.

| Role | Utilities |
|---|---|
| Lead headline | `font-serif font-bold text-2xl sm:text-3xl leading-tight tracking-tight` |
| Section title | `font-serif font-bold text-xl tracking-tight` over a `border-b-2 border-signal-ink` rule |
| Story title | `font-serif font-semibold text-lg leading-snug` |
| Body / article | `prose` (typography plugin), 16px |
| Eyebrow | `font-serif font-semibold text-[0.7rem] uppercase tracking-wider text-signal-green` with a gold `border-b-2` |
| Meta (date, author) | `text-[0.7rem] uppercase tracking-wide text-signal-muted` |

- The two families have distinct jobs. Don't use serif for UI controls, and don't use sans for headlines.
- `text-[0.7rem]` (11.2px) is the one arbitrary size, and it's allowed only for short uppercase eyebrows and meta. Don't use it anywhere else.
- Use curly quotes and a real ellipsis (`…`) in copy. Keep headlines in sentence case.

## Layout

- The reading column is `mx-auto max-w-2xl px-4`. The header and footer use `max-w-5xl`.
- Sections are spaced `py-8`. Story lists are separated by `border-b border-signal-rule` with `py-4`.
- The header is sticky at `h-14`, using `bg-background/95 backdrop-blur` and a bottom rule.
- The layout is mobile-first: design at 375px first. Card grids go from 1 column to 2.

## Elevation & Depth

Signal is flat. It uses no shadows at all and separates content with rules: hairline
`signal-rule` between stories and a 2px ink rule under section titles. The only
translucency is the sticky header's blur.

## Shapes

`--radius` is 8px. Images and cards use `rounded-lg`, buttons and inputs use `rounded-md`,
and avatars and tags use `rounded-full`. Rules are square.

## Components

**Role** · **Specs** · **Context**.

- **LeadStory** (`src/components/lead-story.tsx`) · The day's top story · 16:10 image `rounded-lg`, serif headline that turns green on hover, meta row · Top of each edition.
- **SectionBlock** (`src/components/section-block.tsx`) · A themed group of stories · serif title over an ink rule, with an uppercase green "More" link · Groups the day's sections.
- **StoryListItem** (`src/components/story-list-item.tsx`) · Headline and summary · serif `text-lg` title, separated by rules.
- **Eyebrow** (`src/components/eyebrow.tsx`) · Section kicker · green serif uppercase with a gold underline. This is the brand signature.
- **SubscribeBand** (`src/components/subscribe-band.tsx`) · Signup · `bg-signal-green text-white`, with a white input and an ink submit button · Used once per page at most.
- **Podcast / Watch blocks** · Media · Always shown with a transcript or text summary.

States to design: an edition with no stories yet ("Today's edition lands at 6am"),
missing images (fall back to a green-tint `bg-signal-green/10`, not an empty box), and
the subscribe success and error messages.

## Do's and Don'ts

**Do**

- Keep articles in a single column with `prose` and a readable measure.
- Use gold only as an underline, rule, or fill with ink text.
- Give every image `alt` text, and caption photos with a credit.
- Reserve red for genuine alerts.

**Don't**

- Use gold or muted grey as text on a tint, or green text on gold.
- Add shadows, gradients, or card chrome to stories.
- Mix in `gm-*` or `gaa-*` tokens or logos.
- Use serif for buttons, inputs, or navigation.
- Autoplay audio or video.

## Accessibility & interaction

Target WCAG 2.2 AA:

- Underline links in body copy. The global `a { text-decoration: none }` means prose links rely on `prose-a` styling, so keep them green **and** distinguishable by more than colour.
- The subscribe form needs a visible (or `sr-only`) label, `type="email"`, `autocomplete="email"`, and inline errors.
- Tap targets must be at least 44px.

The layout renders `SkipLink`. Known gap: `--input` is `--signal-rule` (below 3:1), so label inputs visibly.

## Agent prompt guide

Quick reference: ink on white · green `signal-green` for identity and links · gold
`signal-gold` underline only · Source Serif headlines + Inter body · flat, with rules
not shadows · `max-w-2xl` column.

1. "Add a 'Weather watch' section per `docs/design/signal.md`: `SectionBlock` with an ink rule, three `StoryListItem`s, and an eyebrow with a gold underline."
2. "Design an alert banner for a hurricane watch: `bg-signal-alert` with white text, a plain-language headline, and a link to GMS guidance. It's the only red on the page."
3. "Build a podcast episode block: serif title, meta row, native audio controls, and a transcript link. No autoplay."
