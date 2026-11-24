---
version: alpha
name: Barrels Bookings
description: Appointment booking for Grenada businesses — plain white paper, near-black ink, Barrels navy for primary actions, the business name carries the page and Barrels stays a quiet credit.
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
    fontSize: clamp(28px, 5vw, 40px)
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  page-title:
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
  lg: 12px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-y: 40px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  slot-free:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  slot-taken:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
  status-confirmed:
    textColor: "{colors.positive}"
  status-cancelled:
    textColor: "{colors.negative}"
---

# Barrels Bookings

Public booking pages at `/{business}` and the staff studio at `/studio`. Both
use the shared Barrels foundation tokens from `@barrelsgd/ui/styles/globals`
(the same layer as `barrels.md`). The shared semantic classes (`bg-background`,
`text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`,
`ring-ring`) are the only colour route in components; the values above restate
them for agents. Source of truth: `packages/ui/src/styles/globals.css`.
Light mode only for v1.

Do not use the GMS `--gm-*` palette from `@barrelsgd/gms`. That palette is the
Grenada Meteorological Service brand, and a Barrels product must not inherit it.
This spec names the palette `colors` above only because the CSS-drift test
checks each value against the shared globals.

## Principles

- **The business leads.** On a public booking page the tenant's business name is
  the page title and the first thing read. Barrels appears as a small
  "Booking by Barrels" credit in the footer, never in the header or as the
  heading. The tenant's logo, when one exists, sits beside the name.
- **Booking is one task.** Each step has one question: pick a service, pick a
  time, give your details, confirm. Show the chosen service and time in a summary
  on every later step, and keep the primary action in the same place.
- **Say what is open, not only what is closed.** A business with no online
  booking shows "Online booking is not open for this business yet." A slot that
  was just taken says so and offers the next free time. Never show a bare
  "unavailable".
- **Colour has jobs.** Navy (`primary`) = the one primary action on a page.
  `focus` = keyboard focus rings and large links only (its contrast on white is
  4.16, below AA for small text). `positive` and `negative` only with a word
  next to them ("Confirmed", "Cancelled"), never colour alone.
- **Phone first on public pages.** 375 px is the reference width. Targets are
  44 px or more. `/studio` is desktop-first with a usable phone layout for the
  day's agenda.

## Layout

- Public pages: one column up to `max-w-2xl`, the business header on top, the
  step content, then the footer with the credit and a link to the business's
  own contact details.
- Studio: a left navigation (Agenda, New booking, Settings) on desktop; a top
  tab row on phones. Services and weekly hours live inside Settings, not in
  the navigation. The signed-in name sits in the header with Sign out.
- Spacing follows the shared scale (`spacing.unit` 4 px). Section gaps are
  `section-y` (40 px) on public pages.

## Home page (`/`), version 2 (shop.app feel)

Calm, large and rounded, in the manner of shop.app (structure and feel only,
never its name, marks, purple or images). The page sits on a near-white ground
(token `--color-ground`, `#fbfbfc`, class `bg-ground`, declared in the app's
`globals.css`). Content is big rounded cards: radius 36 px on phones and 44 px
(hero) or 40 px (rail cards) from md up; 26 to 28 px for tiles and inner
panels; pills for search, buttons and navigation. Ink is `foreground`
(`#111827`). Only new token: `--color-ground`; the per-type fills are a
documented map (below).

- Search: one floating pill (60 px phones, 64 px md up, `shadow-lg`), sticky at
  the top (`top-4`; `scroll-padding-top` keeps focused content clear), full
  width on phones, about 512 px centred from md up. A plain GET form (`q`,
  hidden `category` and `type`) with a real submit button (arrow, named
  "Search"). Placeholder "What do you want to book today?".
- Compact type row (md up only, nav "Business types"): a 30 px colour dot and a
  word per type, "All" first; the chosen one is bold and underlined.
- Hero: one navy (`bg-primary`) card, content bottom-left: h1 "Book any
  appointment in Grenada" (38 px phones, 64 px md up, weight 800), a line, and
  a white "Find a business" pill to `#businesses`. Two soft blurred shapes drift
  inside it (aria-hidden). The sentence "Pick a business below, or open the
  booking page the business sent you." sits under the card. Exactly one h1,
  first.
- "Businesses to book" (h2): a horizontal scroll-snap rail of tall cards
  (316 x 470 px phones, 330 x 500 md up), one link each. The fill is the
  business's brand colour when `pageAccent` accepts it (4.5:1 against white, so
  white text is safe), else neutral ink. Inside: logo in a small white circle
  if there is one, the name (30 to 32 px, 800, white), "category or type, city"
  in plain white; at the bottom a 26 px photo panel (150 px) when `cover_url` is
  a safe https address (no username or password), else a white panel with the
  short description and a "Book" pill (decoration). The bottom area's priority is
  the business's featured services (`featured_services`, up to three from the
  API; the first two show as white 26 px tiles with a dark price pill, the name
  in two lines at most, and "N min" in muted text; one service fills the width),
  then the cover photo, then the description panel. The tiles are plain text
  inside the card's one link. Pagination links sit under the rail.
  The storefront page header is unchanged.
- "Types of business" (h2, nav "Browse by type"): solid tiles, a white label
  top-left (19 px bold) and the type's white stroke icon bottom-right, 2 columns
  phones (118 px, radius 26) and 6 columns md up (140 px, radius 28). Only
  types from the API's `types_available`, "All" first (ink). The chosen tile has
  a white inner ring and `aria-current="page"`. A tile keeps `q` and clears
  category and page. No types says "No business types yet." The free-text
  category chips are gone from the page; `category` still works in the address,
  the search form and the page links.
- Type fills (white text; contrast against white): beauty `#c2185b` 5.87, hair
  `#5e35b1` 8.02, health `#0d4a8f` 8.77, fitness `#b23c00` 5.93, auto `#37474f`
  9.65, home services `#00695c` 6.61, lessons `#1b5e20` 7.87, professional
  `#283593` 10.39, tours `#006064` 7.35, events `#8d6e00` 4.81, other `#4e342e`
  11.32, All / ink `#111827` 17.74. One source: `lib/business-type-colours.ts`,
  checked by its test.
- "Run a business?": ink card, radius 36, white "Open the studio" pill.
- Navigation: phones get a floating bottom pill with icons only (Home, Types of
  business, For businesses; 48 px targets, the current one on a grey pill, each
  with an `aria-label`) and a text "Sign in" at its end. From md up a fixed
  left rail (vertically centred pill of the same icons) with a navy "B" home
  mark above and a small "Sign in" pill below; the page keeps left padding for
  it. "Sign in" links to `/signin?returnTo=/` (the page does not read the
  session, so it always shows Sign in). "My bookings" and "Account" are added
  once the account app's address is a typed setting here.
- Motion (CSS only, transform and opacity only, all inside
  `prefers-reduced-motion: no-preference`): the hero fades and rises 12 px over
  400 ms, then rail cards and type tiles follow 50 ms apart (first six); two
  blurred shapes drift 26 to 30 s inside the hero; the rail scrolls smooth;
  press feedback scales to 0.97 over 120 ms on cards, tiles and pills; a 2 px
  hover lift only under `(hover: hover)`; pages cross-fade with
  `@view-transition { navigation: auto }` (no named elements). Focus rings use a
  2 px offset so they show on white and on saturated fills.
- Studio, Settings > Profile > Home page: "Type of business" (a select with
  Not set) and "Cover photo" (upload, preview, remove; JPEG, PNG or WebP, up
  to 5 MB), saved with the profile.

## Contrast (WCAG 2.1)

ink/paper 17.74, secondary/paper 7.56, muted/paper 4.83, muted/surface 4.52,
primary/paper 16.88, paper/primary 16.88, negative/paper 5.81, positive/paper
4.81. On the home page ground (`#fbfbfc`): ink 17.2, primary 17.9; muted
is 4.7 there, so muted text never sits directly on the ground (use ink, or a
white card). Small text uses ink, secondary or muted only. `focus` (4.16 on paper) is
for rings and text of 18 px or more. `sky` is decorative and never carries
text on paper.

## States

- **Loading:** a polite `role="status"` line, never a spinner alone.
- **Error:** a short sentence with the next step ("Try a different time"),
  linked to the field with `aria-describedby`. The live region is `role="alert"`.
- **Not open:** the public copy above. No payment wording until deposits exist.
- **Empty studio:** say what to set up first, with a link. Never hide the
  section.

## Type

Inter for everything (`font-sans`, loaded in `src/app/layout.tsx`). Headings use
`font-semibold` or `font-bold`; body is 16 px on public pages so it reads well
on a phone, 14 px is allowed in dense studio tables. `display` is the
business-name heading only.
