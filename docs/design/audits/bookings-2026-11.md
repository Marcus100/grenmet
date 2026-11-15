# Design audit: Barrels Bookings (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8)  
**Last updated:** 2026-11-15

## Scope and method

Surfaces audited, all in `apps/web/bookings` and the shared package `packages/bookings-web`:

- the public booking page for one business (`/<business>`): business header, service list, the booking form (service, day and time, details), the confirmation, and the manage-a-booking page (code only, see "What could not be checked");
- the error and not-found pages, the home page and the Studio sign-in hand-off;
- the Studio: business picker, agenda (day and week), booking detail, New booking and Settings.

The rule for judging: a defect is a gap against this app's own lane spec ([`docs/design/bookings.md`](../bookings.md)) or a rule from a design skill, never a difference from another app. Babydoll Beauty Bar has its own look and is audited separately ([babydoll-2026-11.md](babydoll-2026-11.md)).

Method:

1. Read the instructions (`AGENTS.md` at the root, in `apps/web/bookings` and in `packages/bookings-web`), the lane spec, the design system and design workflow notes, and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. The shared layer `packages/ui/src/styles/app-feel.css` is imported by the bookings stylesheet (`src/app/globals.css`) and already switches off the tap flash, sets `touch-action: manipulation` on controls, contains scrolling inside dialogs and cancels animation for people who ask for less motion. The package `@barrelsgd/bookings-web` carries class names only, so a missing focus ring or hover style is a finding against `src/app/booking.css`, not the component; focus rings, pressed states and mouse-only hover rules exist there. Nothing in this audit repeats a gap those files already cover.
3. Read every component, stylesheet and piece of copy listed above, then applied the rules of these skills: web-design-guidelines (pinned rules), fixing-accessibility, refactoring-ui (through the lane spec), mobile-native, emil-design-eng, break-ui (worst-case data, argued from the code and the limits in the form) and, for motion, review-animations. There is almost no motion in this app (120 millisecond colour changes only), so the motion review found nothing to report.
4. Looked at the running staging app (`bookings.staging.barrels.gd`) with a scripted browser at 390 pixels (phone) and 1280 pixels (desktop): the Babydoll Beauty Bar booking page through the form (an empty submit, a bad email, a service and a time chosen), a bad manage link, an unknown business address, the home page, and the signed-in Studio (agenda for a day and a week, New booking and Settings; the business had no bookings that week, so a booking detail page could not be opened). Dark mode was loaded too, only to confirm the lane spec's "light mode only" rule holds (it does). The screenshots were viewed during the audit and are not committed. No booking was submitted, so no customer or studio email was triggered.
5. Compared the flow with three saved reference flows, for ideas only: Fresha booking ([booking an appointment](https://mobbin.com/flows/0ae100c9-f9bb-4a81-8837-772fd8ac330c)), Fresha staff calendar ([adding an appointment](https://mobbin.com/flows/3283639b-0cf8-4380-9c04-904ab3ef87e8)) and GoDaddy ([adding a date and time](https://mobbin.com/flows/0b9b4aa5-d6c8-484d-917b-cc08f647d8cf)).

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means customers and staff would not see a difference in normal use (accessibility, focus, keyboard, hidden hit areas, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.

## What is already strong

- **The business leads.** The page title is the business name, Barrels is a small credit in the footer, and there is a skip link, a language and one first-level heading per page (lane spec, Principles).
- **Forms are careful.** Every field has a label, correct input types and autocomplete (`name`, `email`, `tel`), text size is 16 pixels so phones do not zoom, errors are listed in a summary that takes focus and links to each field, each error is tied to its field and marks it invalid, and "(optional)" is written where it applies.
- **Failure is handled in words.** Slow or failed loads say what happened and offer "Try again"; a taken slot clears the choice and reloads times; a double press cannot double-book (one key per submission); a spam trap is in place and the human check is switched on where a key is set; the manage page explains why changes are closed and when.
- **Touch feel is right.** Targets are 44 pixels or more, hover styles are limited to mouse pointers (`hover: hover and pointer: fine`), chips, rows and buttons all have a pressed state, labels of controls cannot be selected by a long press, and keyboard focus draws a ring on the radio rows and chips through `:has(input:focus-visible)`.
- **Colour has jobs.** Status is always a word ("Confirmed", "Cancelled", "Waiting for the studio to confirm"), and the error colour always comes with text.
- **The page is stable.** No horizontal scroll at 390 pixels, and the long-text guard (`overflow-wrap: anywhere`) is on steps, notices and summaries.
- **The Studio is deliberate.** Final steps use alert dialogs with a required reason and a deposit choice, results take focus and are announced, every empty state says what to do next, money actions carry an idempotency key, and targets are 44 pixels.

## Findings

### Blocking

#### 1. Customers have no way to reach the business, and the messages that promise one loop back

- **Where:** the manage page when changes are closed (`packages/bookings-web/src/components/manage-booking.tsx` lines 136 to 144), the "booking is unavailable" failure message (`packages/bookings-web/src/lib/booking-errors.ts` line 214), the public page footer (`apps/web/bookings/src/app/[slug]/layout.tsx`), and where the hosts pass the contact (`src/app/[slug]/page.tsx` line 135 and `src/app/[slug]/booking/[token]/page.tsx`).
- **What happens:** the text reads "please message us on the business directly", and the link points to `/<business>`, the booking page the person is already on. The business's name, phone or social channel is not shown anywhere: the storefront data (`BookingStorefront`) has no contact fields, and the footer carries only Barrels support.
- **Rule or reference:** lane spec, Layout: "the footer with the credit and a link to the business's own contact details". Fresha's confirmation page shows "Manage appointment" and "Venue details" together.
- **Why it matters:** inside the 24 hour cut-off a customer cannot cancel online and the only instruction leads back to the same page. A studio then gets a no-show instead of a message. For Babydoll the channel is Instagram (already in `apps/web/babydoll/src/data/site.ts` as `BOOKING_CONTACT`), so the information exists but never reaches this app.
- **Suggested fix:** add an optional contact channel (label and link) to the business profile, show it in the footer and use it in these messages; until it exists, reword the messages so they do not promise a link ("Contact the business directly") and stop linking to the same page. Size M (profile field, one Settings input, three places of display); the wording-only interim fix is S. VISIBLE.

### Should fix

#### 2. All three steps sit on one long page and the action is far from the decision

- **Where:** the booking form (`packages/bookings-web/src/components/booking-flow.tsx`). On a 390 pixel phone the form is about six screens tall; "Request my booking" is at the very bottom, and choosing a service does not move the person to the times.
- **Rule or reference:** lane spec, Principles: "Show the chosen service and time in a summary on every later step, and keep the primary action in the same place." Today the chosen service and time appear once, as a line under the time chips (`.chosen`), and not beside the details or the button. Fresha keeps a summary panel (business, date, time, service, price, total) and one "Continue" button in view the whole time.
- **Why it matters:** on a phone people lose their place, forget what they picked by the time they reach the button, and cannot confirm the price before sending the request.
- **Suggested fix:** keep the single page (it is simple and everything stays in reach) but add a sticky bottom bar on phones showing service, day and time, price and the main button, and scroll to the times when a service is chosen. Size M to L. VISIBLE.

#### 3. The services are listed twice

- **Where:** the page shows a read-only "Services" list (`src/app/[slug]/page.tsx`), then "1. Choose a service" repeats all 14 services as radio rows (`booking-flow.tsx`). On the staging page that is about two and a half phone screens of the same content before the form starts.
- **Rule or reference:** lane spec, "Booking is one task. Each step has one question." Refactoring-ui, hierarchy: one place for each fact. Fresha uses a single list that is also the picker.
- **Why it matters:** the first list looks like the thing to tap (it has prices and a border) but does nothing; the deposit wording appears only there, not in the picker, so a customer who chooses a service with a deposit first learns about it when the button turns into "Email me a verification code".
- **Suggested fix:** let the top list be the picker (or collapse it) and show the deposit text in the picker rows. Size M. VISIBLE.

#### 4. The day and time picker is a wall of chips

- **Where:** `packages/bookings-web/src/components/slot-picker.tsx` with `.chips` in `booking.css`. Twelve day chips wrap into six rows at 390 pixels, 24 time chips follow, and "Earlier dates", the date range and "Later dates" wrap awkwardly, with "Later dates" dropping alone onto a second line.
- **Rule or reference:** the GoDaddy flow groups times as Morning and Afternoon and marks open days; Fresha shows one week as a strip of day buttons with closed days struck through, and one time per row. Mobile-native: put the choice in reach of a thumb.
- **Why it matters:** picking a time is the heart of the flow, and on a phone it takes a long scroll with no sense of how many days are open.
- **Suggested fix:** one row of seven days that scrolls sideways with arrows on each side, closed days shown but disabled, and the times in an even grid grouped as morning and afternoon. Size M. VISIBLE.

#### 5. A fixed error stays on screen

- **Where:** `booking-flow.tsx`, `errors` state. Errors are recalculated only when the form is submitted. On staging, after a bad email was corrected, the red border and "Enter a valid email address" stayed; after a service and time were chosen, "Choose a day and time." stayed above the picker.
- **Rule or reference:** web-design-guidelines, Forms: errors inline next to fields; fixing-accessibility, forms and errors (an error must match the field's state, and `aria-invalid` must clear). Screen readers are told the field is still invalid.
- **Why it matters:** the person sees a red message after doing what it asked and cannot tell if the form is ready.
- **Suggested fix:** clear a field's error when its value changes and validate again on submit. Size S. VISIBLE (it only changes what shows in the error state).

#### 6. "Try again" on the business error page does not fetch again

- **Where:** `apps/web/bookings/src/app/[slug]/error.tsx` calls `reset`. In this Next.js version the documentation says `retry()` re-fetches and re-renders, and `reset()` re-renders without fetching (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`). The other error pages in this app (`error.tsx`, `global-error.tsx`) already use `retry`.
- **Why it matters:** this page appears when the booking service is down; pressing the button should try again for real.
- **Suggested fix:** use the `retry` prop, as the other two error pages do. Size S. INVISIBLE.

#### 7. Grey helper text on a selected service row is below the contrast limit

- **Where:** `.service-option:has(input:checked)` in `booking.css` uses `--secondary` (`#eaf2fb`) while the duration line uses `--muted-foreground` (`#6b7280`).
- **Rule or reference:** the lane spec's contrast list ("muted/surface 4.52") was worked out against `#f3f8fc`, but the app uses `#eaf2fb`, where the ratio is 4.28 (the standard needs 4.5 for small text). The 14 pixel duration and description text on the picked row therefore falls just under the limit.
- **Why it matters:** the chosen row is the one people re-read to confirm their choice.
- **Suggested fix:** use `--secondary-foreground` or the body ink for the helper text on the selected row only. Size S. INVISIBLE (a very slightly darker grey).

#### 8. In the Studio, navy does four jobs on one screen

- **Where:** the agenda (`app/studio/[orgSlug]/agenda/page.tsx` `pill()` and `components/studio/studio-nav.tsx`). The active "Agenda" tab, "New booking", the selected "Day" and the selected "All providers" are all solid navy.
- **Rule or reference:** lane spec, Principles: "Navy (`primary`) = the one primary action on a page." Refactoring-ui, hierarchy: de-emphasise the competition instead of amplifying the target.
- **Why it matters:** the eye has no place to start, and "New booking" does not stand out as the action that matters.
- **Suggested fix:** show the active tab and the selected pills with the soft surface colour and a navy outline or underline, and keep solid navy for "New booking". Size M. VISIBLE.

#### 9. The empty agenda points to the marketing page, and the Studio never links to the business's own booking page

- **Where:** agenda empty state (`EmptyContent` link to `/`, "See how online booking works"); Settings "Business profile" text says "your page" but offers no link.
- **Rule or reference:** lane spec, States: "Empty studio: say what to set up first, with a link." Fresha's staff view keeps the day's tasks in front.
- **Why it matters:** a studio owner on a quiet day wants to open or copy the public link and share it, and instead lands on the Barrels home page.
- **Suggested fix:** show "Your booking page" with an open link and a copy button in the agenda empty state and at the top of Settings. Size S. VISIBLE.

#### 10. The Studio sign-in screen carries the Met Office brand and lists other clients' apps

- **Where:** `/studio` hands off to the Barrels sign-in app (`auth.staging.barrels.gd`). At desktop width the page shows the Grenada Meteorological Service logo, "Hello again, sign in to continue", and a side list of GAA Admin, Airport website, GMS Weather, Docs, Barrels admin, Signal and Events. On a phone the side panel is hidden.
- **Rule or reference:** lane spec, intro: "Do not use the GMS palette ... a Barrels product must not inherit it". The sign-in app is outside this audit's code scope (it has its own app and notes), so this is raised here only because it is the first screen a studio owner sees.
- **Why it matters:** a salon owner signing in to run bookings is shown a weather service's logo and the names of other clients' internal tools. It reads as the wrong place, and it tells a business about other businesses' systems.
- **Suggested fix:** when the person arrives from the bookings app (`app=bookings`), show the Barrels Bookings name and a neutral panel instead. Needs the auth app's own audit and an owner decision. Size M. VISIBLE.

### Nice to have

#### 11. The confirmation could do more

- **Where:** `BookingDone` in `booking-flow.tsx`. It says thank you, gives the service, time and price, and says the link is shown once. "Add to calendar" exists only on the manage page.
- **Reference:** Fresha's confirmation shows the overview, any deposit, the cancellation policy, a booking reference and links to manage and to venue details.
- **Suggested fix:** add "Add to calendar", the change-or-cancel cut-off, and the business contact (see finding 1) to the confirmation. Size M. VISIBLE.

#### 12. Wording that reads wrongly

- "message us on the business directly" (`CONTACT_LABEL` in `apps/web/bookings/src/lib/booking-errors.ts`) is not a sentence. Say "contact the business directly".
- The network failure message tells people to "press Book again" but the button says "Request my booking" (`NETWORK_MESSAGE` in `booking-flow.tsx`).
- A wrong manage link answers "Booking page not found. There is no online booking at this address." It should say the booking link could not be found, and what to do (use the link in your email, or contact the business).
- In the Studio, working states end in three dots ("Saving...", "Confirming...", "Loading the agenda...") while the public flow uses the single ellipsis character ("Booking…", "Loading times…").
- Rule: web-design-guidelines, Typography and Content & Copy. Size S in total. VISIBLE.

#### 13. The three not-found and error pages look like they belong to different apps

- The root not-found uses the shared Button, 24 pixel side padding and no footer; the business not-found uses `.btn` and 16 pixel padding. The root not-found has a `div` named `main-content` instead of a main landmark, and the Studio sign-in failure button (`app/signin/page.tsx`) is about 32 pixels tall with its own styling.
- Suggested fix: one shell, one button style, a `main` landmark, 44 pixel targets. Size S. The landmark and target size are INVISIBLE; the shared look is VISIBLE.

#### 14. The cancel confirmation makes the destructive choice the primary button

- **Where:** `manage-booking.tsx` `confirm-cancel`: "Yes, cancel it" is solid navy; "Keep my booking" is plain.
- **Rule or reference:** refactoring-ui: a destructive choice is not automatically the loud one; the safe choice should not look weaker. Size S. VISIBLE.

#### 15. Small hardening and unused class names

- `btn-ghost` is used by the package (Earlier dates, Add to calendar, Cancel booking) but `booking.css` has no rule for it, so it looks the same as the default button. Either style it or drop the class (size S, INVISIBLE if dropped).
- The email field has no `spellCheck={false}`, and agenda rows and the storefront service names rely on spaces to wrap (break-ui: a very long unbroken name pushes the status badge). Add `overflow-wrap: anywhere` to those. Size S. INVISIBLE.
- Time chips have ragged widths; an even grid looks tidier (part of finding 4).
- The keyboard focus ring on a day or time chip is a square outline drawn on the label (`.chip:has(input:focus-visible)` in `booking.css`), so its corners do not follow the chip's rounded shape. Give the label the same radius. Size S. INVISIBLE (shows only for keyboard users).

#### 16. Studio screens could show more

- Settings shows the raw zone name ("Timezone: America/Grenada") and ends with a "Not available yet" section that lists unbuilt features to the people who run the business. Say "Grenada time" and move the roadmap note out of the product. Size S. VISIBLE.
- On a phone Settings is one page about seven screens tall with no way to jump between profile, services, providers and hours, and the "Add a service" and "Add a provider" forms sit at the bottom. Add jump links, or give each part its own tab as the lane spec's navigation describes. Size M. VISIBLE.
- The week view shows an empty-state card and then seven "No bookings." cards for the same fact, and "New booking" appears twice (the tab and the header button). Show one or the other. Size S. VISIBLE.
- The Studio header names Barrels Bookings but not the business, and on a phone the signed-in name and "Sign out" wrap onto a second line. Size S. VISIBLE.
- The agenda is a list with no marker for the current time, and New booking asks for a typed start time with no preview of open times. Fresha's staff calendar shows a current-time line and booking by clicking an open slot. Size L, needs a product decision first. VISIBLE.

## Documents that no longer match the app

These are small drifts noticed while auditing. Nothing was edited.

- `apps/web/bookings/AGENTS.md` and the form-patterns rule in `docs/agents/extended-rules.md` say the Studio Settings forms do not yet wait for `useHydrated()`. Every Settings form (profile, service, provider, hours, time off) already does.
- `docs/design/bookings.md` describes a left navigation of "agenda, services, hours, settings"; the app has Agenda, New booking and Settings (services and hours live inside Settings). Its contrast list also names `surface` (`#f3f8fc`) for slots, while the app's chips and selected rows use `--secondary` (`#eaf2fb`).
- `docs/design-system.md` lists the lane specs in its overview without `babydoll`, `barrels`, `commit`, `admin` and `events`, although the files exist.

## What could not be checked

- **A real phone.** Sticky hover, tap delay, the on-screen keyboard and the browser bar were argued from the stylesheets and tested only in an emulated phone viewport. Mobile-native's rule is that these need a real device.
- **The confirmation page and the manage page with a real booking.** Making a booking on staging would email the studio and the customer, so none was made. Those two screens were audited from code only; only the bad-link page was seen.
- **Screen readers and the full keyboard route** through the form and the Studio dialogs: reasoned from the markup, not run with a screen reader.
- **Deposits and the verification-code step.** The Babydoll business has no deposit services, so the "4. Check your email" step and the deposit wording were read from code only.
- **Studio roles.** Only the test account's role was seen; the member (read-only) views of Settings and the booking detail were read from code.
- **Production.** Only staging was visited. The project notes say production was seeded with the Babydoll business on 15 November 2026, but no production page was opened.
- **A booking in the Studio.** The staging business had no bookings in the week looked at, so the booking detail page (actions, deposit box, timeline) was audited from code only.
- **The sign-in app.** Seen only as the first screen of the Studio route; the auth app is not part of this audit.
- **Motion.** There is next to no motion, so the animation skills had little to review.
