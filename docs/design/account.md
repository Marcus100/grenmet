---
version: alpha
name: Barrels account
description: A person's Barrels account: plain white paper, near-black ink, Barrels navy for the one primary action, the person's own name carries the page. Shared Barrels foundation tokens only.
colors:
  ink: "#111827"
  secondary: "#4b5563"
  muted: "#6b7280"
  paper: "#ffffff"
  surface: "#f3f8fc"
  rule: "#d0d5dd"
  primary: "#15006b"
  focus: "#2478f2"
  sky: "#39a9f5"
  positive: "#00843d"
  negative: "#cc0033"
typography:
  display:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.33
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  md: 8px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-y: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  avatar-initials:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
  status-saved:
    textColor: "{colors.positive}"
  status-refused:
    textColor: "{colors.negative}"
---

# Barrels account

The person's own account at `apps/web/account` (`account.barrels.gd`, ADR-0057).
It uses the shared Barrels foundation tokens from `@barrelsgd/ui/styles/globals`
(the same layer as `barrels.md` and `bookings.md`). No new tokens: the values
above restate the shared globals for agents, and the CSS-drift test checks them.
Source of truth: `packages/ui/src/styles/globals.css`. Light mode only for now.

Do not use the GMS `--gm-*` palette. A Barrels product must not inherit the
Grenada Meteorological Service brand.

## Principles

- **The person leads.** The page heading is the signed-in name (or the email
  when no name is set), with the email beneath it. Barrels appears as the small
  "Barrels account" label above the heading.
- **One task per block.** The home page is the profile. Each block answers one
  question: who am I signed in as, and what does my profile photo look like.
- **Say what happened.** A refused photo shows the API's reason in words
  ("The photo must be 5 MB or smaller."). Success says who can now see the
  change ("People who share an organisation with you can see it now."). Never
  a bare error code.
- **Colour has jobs.** Navy (`primary`) is the one primary action on a block.
  `positive` and `negative` only sit beside a word, never alone.
- **Phone first.** 375 px is the reference width; targets are 44 px or more.

## Layout

- One column up to `max-w-3xl`. Header: label, name, email, and a secondary
  "Sign out of this app" button on the right (wraps under the name on phones).
- The profile photo block: the avatar on the left at 96 px (stacks above the
  controls on phones), then the file field, Remove, and the status line.
- Spacing follows the shared scale (`spacing.unit` 4 px); blocks are separated
  by `section-y` (32 px).

## Contrast (WCAG 2.1)

Same paper and ink values as `bookings.md`: ink/paper 17.74, secondary/paper
7.56, muted/paper 4.83, primary/paper 16.88, negative/paper 5.81, positive/paper
4.81. Small text uses ink, secondary or muted only.

## States

- **Saving:** a polite `role="status"` line reading "Saving…", and the controls
  are disabled while a request is in flight.
- **Refused or failed:** `role="alert"` with the sentence the API gave, or the
  plain fallback "The photo could not be saved. Try again."
- **No photo:** the initials avatar (first letters of the first two words of
  the name, else the email). The file field reads "Upload photo"; with a photo it
  reads "Replace photo" and "Remove photo" appears.
- **Photo unavailable:** a polite alert says the photo could not be checked and
  the rest of the page still works.

## Type

Inter (`font-sans`, loaded in `src/app/layout.tsx`). Headings use
`font-semibold`; body is 16 px.
