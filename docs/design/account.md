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
  question: who am I signed in as, what is missing from my profile, and what
  does my profile photo look like.
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

## Finish your profile

A bordered card above the photo block on the home page. It answers one
question: what is still missing from my profile. It is never hidden: with all
four rows done the heading reads "Profile complete" and the rows stay, so the
person can still change a value.

- **Heading and progress:** "Finish your profile" with "2 of 4 done" beneath it
  in `secondary`. When complete: "Profile complete" and "4 of 4 done. You can
  change any of these at any time."
- **Rows** (a list, in this order): Email, Your name, Phone number, Photo. Each
  row has a mark, a title, one line of value or guidance, and one action.
  - The mark is a filled navy circle with a tick when done and an empty ring
    when not. It is decoration; the row title carries "(done)" or "(to do)" for
    screen readers.
  - **Email** is always done and shows the address. It has no action: the
    sign-in address is changed on `auth.barrels.gd`.
  - **Your name** is not done while the first name is blank or is the one a
    quick sign-up made up (the part of the email before the @, with no last
    name); the API decides (`name_is_placeholder`). A one-word name counts:
    only the first name is required. A made-up name is never shown as the
    person's name: the row shows guidance and the page heading shows the email.
    Action: "Add your name", then "Edit name". It opens `/profile/name`.
  - **Phone number** is done when a number is stored and shows it in
    international form. Action: "Add a phone number", then "Change phone
    number". It opens `/profile/phone`. Nothing is said about verification.
  - **Photo** is done when a photo exists. Action: "Add a photo", then "Change
    photo". It moves to the photo block on the same page (`#profile-photo`). When the photo could not be checked the row says so and
    is not counted. The card refreshes after an upload or a removal.
- **Actions** are navy underlined links, at least 44 px tall, with the shared
  focus ring. On a phone the action sits under the value; from `sm` it sits on
  the right.
- **Editors** (`/profile/name`, `/profile/phone`): one small form each, at most
  `max-w-sm`, with a primary Save button and a Cancel link back to the profile.
  The name form has First name (required) and "Last name (optional)"; a
  made-up name is never offered back, so the fields start empty. The phone form has
  one field with the placeholder "+1 473 440 1234" and the hint "Start with the
  country code. Grenada numbers start with +1 473."; when a number is stored the
  hint adds "Leave this blank to remove your number."
- **Refused field:** the reason sits under its field as `role="alert"` in
  `negative`, the field is marked invalid and what was typed stays. The API
  writes the phone sentence ("Enter the phone number with its country code, for
  example +1 473 440 1234").
- **Failed save:** one sentence under the fields ("Your name could not be
  saved. Try again."), and the failure is reported without the typed value.
- **Saved:** the profile page opens with a polite status line: "Name saved.",
  "Phone number saved." or "Phone number removed."
- **Profile unavailable:** the card is replaced by its heading and "We could
  not load your profile just now. Refresh the page to try again."; the photo
  block still works.

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
