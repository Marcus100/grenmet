---
version: alpha
name: Barrels Events
description: Modern Grenada event and community site — warm paper, near-black ink, hibiscus for action, sea for trust, Barrels lime for "happening now".
colors:
  ink: "#16131f"
  paper: "#fbfaf7"
  sand: "#f2eee6"
  rule: "#e4ded3"
  muted: "#5d586a"
  primary: "#c2185b"
  primary-deep: "#9c1149"
  primary-soft: "#fce7ef"
  sea: "#0b6e78"
  lime: "#b9ee63"
  sidebar-accent: "#2a2536"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontSize: clamp(36px, 6vw, 60px)
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.025em
  page-title:
    fontFamily: Bricolage Grotesque
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.2
  section-title:
    fontFamily: Bricolage Grotesque
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
  card-title:
    fontFamily: Bricolage Grotesque
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
rounded:
  md: 10px
  lg: 12px
  xl: 16px
  card: 16px
  hero: 24px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-y: 56px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  happening-chip:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
  nav-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
  organiser-sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  sidebar-active:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
---

# Barrels Events

Public discovery and community site at `/`, organiser console at `/dash`.
Source of truth: `apps/web/events/src/app/globals.css` (`--events-*` tokens remap
the shared shadcn semantics, the same pattern as Signal). Light mode only for v1.

## Principles

- **Lead with the event.** Big display type, category-toned flyer panels and a
  white date stamp. Real flyers replace the tone panels once uploads exist.
- **Colour has jobs.** Hibiscus = act (buttons, active links, today). Sea =
  trust and people (verified badge, intents, hosts). Lime with ink text =
  happening now (Tonight, Featured, subscribe). Ink = navigation and the
  organiser sidebar. Don't use lime for text on paper.
- **Phone first on the public site**: bottom tab bar under `md`, sticky header,
  44px+ targets. `/dash` stays desktop-first.
- **Social is safe by default**: messaging, report and block affordances sit
  next to every person, and copy says who can contact you.

## Category flyer tones

Defined in `src/components/discovery/category-style.ts`: fete hibiscus/white,
music ink/lime, food and family lime/ink, sport and tech sea/white, business
ink/white, culture primary-soft/primary-deep, faith and wellness sand/ink.

## Contrast (WCAG 2.1)

ink/paper 17.5, muted/paper 6.6, muted/sand 5.9, white/hibiscus 5.6,
white/sea 5.7, ink/lime 13.5, primary-deep/primary-soft 6.9 — all AA for small
text. Status colours stay shared and are not overridden.

## Type

Bricolage Grotesque (`font-display`) for headings and card titles; Inter
(`font-sans`) for UI and body. Use shared `text-*` sizes; `text-display` is the
only app-level size, for the home hero.
