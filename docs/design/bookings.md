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
  44 px or more. `/studio` is built for the phone first (a salon owner runs her
  day from it) with a persistent navigation on laptops.

## Layout

- Public pages: one column up to `max-w-2xl`, the business header on top, the
  step content, then the footer with the credit and a link to the business's
  own contact details.
- Studio: laid out like the staff portal (`apps/web/gaa-admin`) but in the
  Bookings lane colours (navy primary, white cards, the grey `bg-ground`).
  See "Studio" below.
- Spacing follows the shared scale (`spacing.unit` 4 px). Section gaps are
  `section-y` (40 px) on public pages.

## Home page (`/`)

A shop.app feel for every kind of business, not only beauty. The page sits on a
soft grey ground (new token `--color-ground`, `#f4f5f8`, class `bg-ground`,
declared in the app's `globals.css`); content is white cards on it with large
radii (`rounded-3xl`, 20 px, for cards and the "Run a business?" panel;
`rounded-2xl` for the logo tile; `rounded-full` for the search box, chips,
buttons and navigation). No other new token: ink, `primary` and `background`
are the shared ones.

- Header: "Barrels Bookings" wordmark; on laptops (md and up) a pill navigation
  (Home, For businesses). On phones a floating pill bar at the bottom (Home,
  Search, For businesses), 48 px targets, padded for the safe area; the page
  keeps bottom padding so it never covers the last line. Home carries
  `aria-current="page"`. "My bookings" and "Account" are added once the account
  app's address is a typed setting of this app.
- Search is a pill GET form (`q`, hidden `category`) and works without script.
- Categories come from the API, not a fixed list: white pill chips, the chosen
  one navy; one scrolling row on phones, wrapped on laptops. Empty says "No
  categories yet."
- Businesses: the first as a large card with a "Book" pill (decoration inside
  the one card link), the rest two across on phones and an auto-fill grid
  (min 240 px) on laptops. The tile is a light tint of the brand colour with
  ink text (so contrast holds for any colour), the logo when there is one, else
  the first letter.

## Studio (`/studio`)

The business side, run from a phone as much as a laptop. The layout pattern
follows the Met Service admin portal: persistent navigation, a page header
with the title and the page's primary action, content in cards. The colours do
not: the Studio uses the Bookings tokens only, never `--gm-*`.

- **Shell** (`components/studio/studio-shell.tsx`, drawn by
  `studio/[orgSlug]/layout.tsx`). Laptops (md and up): a fixed 240 px left
  navigation on white with the business name and its public page link at the
  top, items with icons (Agenda, New booking, Services, People, Plan & billing,
  Settings), then the signed-in name, "View my page" and "Sign out" at the
  bottom. Phones: a sticky top bar (business name, "New booking") and a bottom
  tab bar of four items: Agenda, Services, People and More. More lists New
  booking, Plan & billing and Settings, then "View my page" and "Sign out".
  Targets are 44 px or more, the current item carries `aria-current="page"`,
  the bar pads for the safe area and the page keeps bottom padding so nothing
  hides under it. New booking and Plan & billing are for owners and admins
  only. The organisation picker (`/studio`) uses a plain frame (name, Sign
  out).
- **Page pattern** (`studio-ui.tsx`). Each page: one h1, a one-line
  description where there is one, the primary action on the right (a full-width
  button on phones), then white cards (radius 20 px) on the ground. Lists are
  rows with a 56 px tap area inside a card. Muted text never sits on the
  ground: use ink or put it on white. Press feedback is a 120 ms colour change
  and nothing else; no animation.
- **Agenda** opens with "Needs confirming (n)": bookings with status `pending`
  (the business has to answer) from two weeks back to 47 days ahead, each row
  customer, service, day and time, linking to the booking where Confirm,
  Change time and Decline are. With none it reads "Nothing waiting." The same
  count sits on the Agenda navigation item. "Awaiting deposit" is not listed:
  that waits for the customer.
- **Booking detail** has Call (`tel:`) and WhatsApp (`https://wa.me/<digits>`,
  new tab). WhatsApp appears only when the number normalises
  (`lib/phone.ts`): a leading `+` is kept, a 7-digit number is taken as Grenada
  (`1473`), a 10-digit number starting 473 gets `1`; anything else gets no
  WhatsApp button.
- **Install.** A web app manifest (`/studio-manifest.webmanifest`, linked from
  the studio layout) names the app "Barrels Bookings Studio" ("Studio"), opens
  `/studio` standalone, theme `#15006b`, background `#f4f5f8`, with navy
  rounded-square "B" icons in `public/studio-icons/`. No service worker.

## Contrast (WCAG 2.1)

ink/paper 17.74, secondary/paper 7.56, muted/paper 4.83, muted/surface 4.52,
primary/paper 16.88, paper/primary 16.88, negative/paper 5.81, positive/paper
4.81. On the home page ground (`#f4f5f8`): ink 16.4, primary 15.7; muted
is 4.43 there, so muted text never sits directly on the ground (use ink, or a
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
