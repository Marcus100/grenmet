# Design audit: Babydoll Beauty Bar website (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed on the site; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8). Babydoll Beauty Bar owns the brand, photos and copy.  
**Last updated:** 2026-11-15

## Scope and method

Surfaces audited, all in `apps/web/babydoll`: the seven public pages (home, services, portfolio, about, training, contact and the not-found page), the shared header, footer and fixed phone booking bar, the service price tabs and the portfolio filter.

The rule for judging: Babydoll is a boutique client brand with its own look. A defect is a gap against its own lane spec ([`docs/design/babydoll.md`](../babydoll.md)) and `apps/web/babydoll/AGENTS.md`, or against a design skill rule, never a difference from the Barrels platform screens or from the bookings app. The site's own tokens in `src/app/globals.css` win over any generic skill advice; where a skill suggests a palette, typeface or copy style that differs, the lane spec was followed and the point was not reported.

Method:

1. Read the instructions (`AGENTS.md` at the root and in `apps/web/babydoll`), the lane spec, the design workflow notes and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. This matters here: the shared touch layer `packages/ui/src/styles/app-feel.css` is imported by every app except `babydoll`, `barrels` and `cms`, so Babydoll gets none of its defaults (tap flash, `touch-action: manipulation`, hover limited to mice, reduced motion). Those rules were therefore looked for in `src/app/globals.css` itself: reduced motion, a visible keyboard focus ring and a bottom safe-area allowance are there; the others are not and are reported below. The keyboard focus ring (`a:focus-visible, button:focus-visible`) and the skip link were confirmed in the stylesheet and on screen.
3. Read every page, component, data file and the whole stylesheet, then applied the rules of these skills: web-design-guidelines (pinned rules), fixing-accessibility, refactoring-ui (through the lane spec), mobile-native, emil-design-eng and break-ui (worst-case content argued from the code and the data file). The site has hero entrance motion (one 0.9 second rise, switched off for people who ask for less motion) and small colour changes, so the motion review found nothing to report.
4. Visited the live public site `https://babydoll.barrels.gd` once per page (there is no staging copy) with a scripted browser. Each page was loaded once at 1280 pixels and then resized to 390 pixels for the phone view. On each page the script measured the size of every link and button, text smaller than 12.5 pixels, images, headings and horizontal overflow; opened the phone menu and a service tab; and switched the browser to a dark colour preference to confirm the site stays light (the lane spec says it must). The screenshots were viewed during the audit and are not committed. No form was filled in and no link to Acuity, Instagram or Google was followed.
5. Compared with the saved reference flows, for ideas only ([Fresha booking](https://mobbin.com/flows/0ae100c9-f9bb-4a81-8837-772fd8ac330c) for how a booking button should lead into a chosen service, [Fresha staff calendar](https://mobbin.com/flows/3283639b-0cf8-4380-9c04-904ab3ef87e8) and [GoDaddy date and time](https://mobbin.com/flows/0b9b4aa5-d6c8-484d-917b-cc08f647d8cf) are for the booking app and had little to say about this site).

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs the client first.
- **INVISIBLE** means visitors would not see a difference in normal use (accessibility, focus, keyboard, bigger hidden hit areas, behaviour on touch screens). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first. A colour change that visibly alters the brand is treated as VISIBLE even when the reason is accessibility.

## What is already strong

- **A real brand, kept clean.** Own tokens, a thin high-contrast display serif over Montserrat, cream and black with a blush accent and a slate-teal hairline exactly as the lane spec describes. No Barrels or Met Office styling anywhere, apart from the agreed "Website by Barrels Grenada" credit.
- **Distinctive without noise.** Arched package cards, a printed "menu card" price list with dotted leaders, a numbered lash calendar (a true sequence), and a black "Visit the studio" band. The layout is calm and the hierarchy is clear on every page: one first-level heading per page, headings in order.
- **Contrast is healthy.** Ink on paper 17.35, soft ink on paper 6.69, accent ink on paper 6.75 and on blush 5.61, pale text on the black band 6.7 to 10.7 (the standard asks for 4.5 for small text).
- **Keyboard and screen reader basics are right.** Skip link, visible focus ring (2 pixels, accent ink, offset), a menu button with expanded state and labels, tabs with arrow-key movement and a panel for each (but see the first finding), an opening-hours table with row headers, labelled Book links ("Book Luxe Classic"), decorative arrows and stars hidden from screen readers, and every service panel kept in the page so prices are indexable.
- **Phone first, and it holds.** No horizontal scroll at 390 pixels on any of the seven pages, a fixed "Book me" bar that respects the phone's bottom safe area and keeps its own page padding, and the main call-to-action buttons are 44 pixels tall.
- **Light only is honoured.** With the browser asked for a dark scheme the page stays cream (checked on all seven pages), as the client decided.
- **The not-found page helps.** It says so in the brand's voice and offers "Book now" and "Home".
- **Clean build.** No scripted errors on any page, images have width and height, the logo has useful text, decorative images have empty text.

## Findings

### Blocking

None found. Nothing stops a visitor from reading the services and prices, finding the studio, or reaching the booking page.

### Should fix

#### 1. The service tabs do not hide anything: all three lists show at once

- **Where:** `/services`, `src/components/service-menu.tsx` and `.menu-cols` in `src/app/globals.css`. The component marks the two inactive panels `hidden`, but `.menu-cols { display: grid }` overrides the browser's rule for `hidden`, so every panel stays visible. On the live site, with "Brows" selected (the tab turns blush) the page still starts with "Lash full sets"; the list is about 3,000 pixels tall on a desktop and 5,100 on a phone, and the 14 per-service Book links are all on screen together.
- **Rule or reference:** `apps/web/babydoll/AGENTS.md`, UI rules: "inactive panels are `hidden`"; fixing-accessibility, tabs (the selected tab must match what is shown); lane spec, "Booking first".
- **Why it matters:** the control says one thing and the page does another. A visitor who taps "Brows" on a phone sees no change and may think the page is broken, and the one-screen "menu card" the design describes becomes a long scroll.
- **Suggested fix:** add `.menu-cols[hidden] { display: none; }` (every panel stays in the page, so prices stay indexable). Size S. VISIBLE (the list gets shorter, so it needs a before and after look), and the most worthwhile fix on this site.

#### 2. Pages promise photographs and show empty boxes

- **Where:** Portfolio (`/portfolio`): the heading says "Real dolls, real results" and the lead-in says "Unfiltered photos of finished sets, brows and skin, taken in the studio", but all nine tiles read "Photo coming soon". About (`/about`): a large empty box reads "Portrait coming soon". There is no photography of work, people or the studio anywhere on the site; the only picture is the monogram.
- **Rule or reference:** `apps/web/babydoll/AGENTS.md`, Content rules: photos go in only with the client's confirmation that the people shown consented; the data file already has the slots (`src/data/site.ts`, `PORTFOLIO`). Refactoring-ui, finishing touches: an empty state should say what is happening, not pretend.
- **Why it matters:** for a lash and brow studio the work is the sales pitch. A visitor reading "real results" and finding grey boxes may leave, and the placeholder wording looks unfinished next to a polished brand. The rule that protects the clients shown is right, so the fix is on the wording and on collecting consented photos, not on adding images.
- **Suggested fix:** until photos arrive, change the lead-in to say they are coming ("New photos are on the way; see our latest work on Instagram"), shrink or remove the empty tiles, and collect the first six consented photos. Size S for the wording, L for the photos (client). VISIBLE.

#### 3. The small Book links and the phone controls are too small to tap reliably

- **Where:** measured on the live pages at 390 pixels.
  - The per-service "Book →" links on the services page are 61 by 22 pixels with text 11.5 pixels high (14 in total, because of the first finding).
  - The portfolio filter buttons ("All", "Lashes", "Brows", "Skin") are 33 pixels tall, and "All" is 33 pixels wide.
  - The service category tabs are 36 pixels tall.
  - The studio credit link and the support email in the footer are 16 pixels tall; the footer menu links are 24 pixels.
  - The fixed "Book me" button is 42 pixels tall.
  - Already fine: the main call-to-action buttons (44 pixels), the menu button (44 pixels) and the menu items.
- **Rule or reference:** mobile-native (touch targets); the lane spec's "Booking first: ... every bookable service has its own Book link". Phones are where most bookings start.
- **Why it matters:** the one link that books a particular service is the hardest thing on the page to hit with a thumb, and a missed tap on a 22 pixel link opens nothing or the wrong item.
- **Suggested fix:** keep the look and enlarge the hit area to 44 pixels with padding or an invisible pseudo-element on `.book-link`, `.chips button`, `.type-filter button` and the footer links; raise "Book me" to 44. Size S. INVISIBLE (the look does not change; only where a tap lands).

#### 4. Touch screens get the mouse behaviour: stuck hover colours and no pressed state

- **Where:** `src/app/globals.css`. Every hover rule (`.btn-solid:hover`, `.btn-ghost:hover`, `.pkg:where(.feature) .btn:hover`, `.google .btn:hover`, `.visit .btn:hover`, `.book-link:hover`, `.channel:hover`, `.social a:hover`, `.type-filter button:hover`, `.primary a:hover`, `.footer-links a:hover`) applies on touch screens too. The black solid button turns outlined on hover, so after a phone visitor taps "Book me" (which opens the booking page in a new tab) the button is still inverted when they come back. There is also no `:active` pressed feedback anywhere, and the page does not switch off the grey tap flash or set `touch-action: manipulation` because `app-feel.css` is not imported here.
- **Rule or reference:** mobile-native ("Hover state stuck after tap", "Gray flash on tap", "Tap feels laggy"); web-design-guidelines, Touch & Interaction. `docs/agents/extended-rules.md` explains that the shared layer covers every other app, and this one is deliberately outside it.
- **Why it matters:** the booking buttons are the main thing on the page, and they look broken after the first tap on a phone.
- **Suggested fix:** wrap the hover rules in `@media (hover: hover) and (pointer: fine)`, add a short `:active` state to `.btn`, `.book-link` and the tabs, and add `touch-action: manipulation` on links and buttons (and, if wanted, the tap flash reset from the shared layer). Size S. INVISIBLE.

#### 5. The portfolio filter is almost invisible when not selected

- **Where:** `.type-filter button` is ink at 28 percent on cream, about 1.9 to 1 (`src/app/globals.css`). On the phone screen only "All" can be read.
- **Rule or reference:** web-design-guidelines and fixing-accessibility, contrast: even large text needs 3 to 1. The lane spec's own contrast values (ink-soft, 6.69) show the brand can do better.
- **Why it matters:** visitors do not see that "Lashes", "Brows" and "Skin" are choices they can make.
- **Suggested fix:** use the soft ink for unselected options and keep full ink plus an underline for the selected one. Size S. VISIBLE (a colour change to a brand detail).

#### 6. Text of 11 to 12 pixels in capital letters is hard to read on a phone

- **Where:** measured on the live pages. Smaller than 12.5 pixels: the per-service "Book →" links and the "Consultation required" notes (0.72 rem, 11.5 px), the "New clients", "Most complete reset" and "Dates to be announced" tags (11.2 to 11.5 px), the photo captions, the footer headings, the "By appointment only" label, the bar's small line (11.2 px) and the contact card headings. All are capitals with wide letter spacing.
- **Rule or reference:** lane spec: Montserrat is for "body, labels and buttons" and quotes and body copy stay in Montserrat "for legibility"; web-design-guidelines, Typography. Spaced capitals are harder to read than normal text at the same size.
- **Why it matters:** these labels carry real information (a consultation is needed; a price note), and a visitor who cannot read them may book the wrong thing.
- **Suggested fix:** set the floor for labels at 12 to 12.5 pixels (0.75 to 0.78 rem), with the same letter spacing. Size S. VISIBLE (slightly larger labels).

#### 7. Booking links open a new tab without saying so, and "Book Luxe Classic" does not open Luxe Classic

- **Where:** every Book link is built by `siteBookingLink()` (`src/lib/book-link.ts`) with `target="_blank"`; the home page alone has 15 links that open a new tab and the services page 20. The per-service links read "Book" and have the text "Book Luxe Classic" for screen readers, but all of them go to the same booking page, not to that service.
- **Rule or reference:** fixing-accessibility (links must say what they do; announce changes of context); Fresha's booking flow, where choosing a service in the list continues with that service already picked.
- **Why it matters:** on a phone a new tab is easy to lose, and a visitor who tapped a particular service expects to land with it chosen. Screen reader users are told something the link does not do.
- **Suggested fix:** add visually hidden text "(opens in a new tab)" to these links now (INVISIBLE, size S). Once the bookings page accepts a service in its address (for example `?service=luxe-classic`), pass it from each Book link (VISIBLE as behaviour, size M, needs the bookings app).

### Nice to have

#### 8. Prices say "$" on this site and "EC$" in the booking app

- **Where:** `formatPrice` in `src/data/site.ts` (`$210`), the package amounts and the consultation price. The booking app shows `EC$210` (change #1394, on `dev`, not yet released).
- **Why it matters:** in the Caribbean "$" can mean US or Eastern Caribbean dollars; a visitor from abroad may think the prices are in US dollars. The change from "$210" to "EC$210" when they click through can also look like a price change.
- **Suggested fix:** show "EC$" on the site or a single line "All prices in Eastern Caribbean dollars". Client decision. Size S. VISIBLE.

#### 9. Keyboard details in the menu and the tabs

- On a phone the menu stays open when Escape is pressed (checked on the live site: the button still reports "expanded"), and the service tabs move with the arrow keys but not with Home and End as tabs usually do. Add both. Size S. INVISIBLE.

#### 10. Curly punctuation in a typographic brand

- The copy uses straight apostrophes ("This page isn't here", "St. George's", "can't", "we'll"). On a thin high-contrast display serif the difference shows. Use the curly apostrophe in headings and display text. Rule: web-design-guidelines, Typography. Size S. VISIBLE.

#### 11. Six words for the same action

- The booking action is labelled "Book now" (header), "Book me" (phone bar), "Make an appointment" (hero and visit band), "Choose a time" (services), "Book" (packages and services) and "Book online" (contact). Choosing one or two phrases would make the site feel more settled. This is the brand's voice, so it is a question for the client, not a defect. Rule: web-design-guidelines, specific and consistent button labels. Size S. VISIBLE.

#### 12. Small things

- The hero logo is a 400 pixel image shown up to 380 pixels wide, so it is soft on high-density phones; ask the client for a vector or larger version. Size S (client). VISIBLE.
- The phone menu opens as a plain panel with no dimming of the page behind it. Optional. Size S. VISIBLE.
- `docs/design-system.md` lists the lane specs without `babydoll`, even though `docs/design/babydoll.md` exists. A documentation gap only.

## What could not be checked

- **A real phone.** Sticky hover, the grey tap flash, tap delay and the browser bar were argued from the stylesheet. The page was viewed in an emulated phone width only, as mobile-native's own rule says real hardware is needed.
- **Screen readers.** Reasoned from the markup, not run with a screen reader.
- **The photos and portrait.** They do not exist yet, so photo composition, alt text for real pictures and image weight could not be judged.
- **The Acuity booking page and the bookings app link.** Book links were not followed. The site's Book buttons still open the Acuity page (`ONLINE_BOOKING_URL` is empty); the bookings app is audited in [bookings-2026-11.md](bookings-2026-11.md).
- **The brand sheet.** The slate-teal hairline's exact colour is described in the lane spec as approximate until the client confirms it; this audit did not compare it with the client's own brand sheet or the licensed display typeface (Italiana stands in for it).
- **Search and share previews.** Outside this audit (not part of the visual design).
- **Dark mode and print.** Not applicable: light only by client decision (a dark colour preference was loaded only to confirm it is ignored).
