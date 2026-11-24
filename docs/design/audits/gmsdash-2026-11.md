# Design audit: GMS Dashboard (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453)  
**Last updated:** 2026-11-23

## Scope and method

Surfaces audited, all in `apps/web/gmsdash`:

- the home page (`/`), the meteogram page (`/meteogram`: organisation, point and model pickers, five charts, the values table, the attribution line), the access page (`/access`: status, request form), the sign-in hand-off and failure page, and the error and not-found pages;
- the states a technical user meets: signed out, no organisation, organisation without access, access requested, no model run stored yet, model fetching switched off, and a normal run.

The rule for judging: a defect is a gap against a rule from a design skill or the shared layers this app imports, never a difference from another app. **This app has no lane spec of its own** (`docs/design/` has no `gmsdash.md`; the editor `cms` has none either, see [cms-2026-11.md](cms-2026-11.md)). It borrows the GMS palette and brand layer (`@barrelsgd/gms/styles/foundation` and `brand`, imported in `src/app/globals.css`) and is judged here against [`docs/design/gms.md`](../gms.md) where that applies. That the app has no spec of its own is itself a finding (finding 12).

Method:

1. Read the instructions (`AGENTS.md` at the root and in `apps/web/gmsdash`), the GMS lane spec, and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. The shared layer `packages/ui/src/styles/app-feel.css` is imported by `src/app/globals.css`: it already removes the tap flash, sets `touch-action: manipulation` on controls, stops long-press selecting button text and cancels animation for people who ask for less motion. Colours come from the GMS `--gm-*` tokens through the brand layer; the chart uses semantic classes (`stroke-primary`, `fill-muted-foreground`) only, so there are no stray hex values in the app.
3. Read every page, the chart component (`src/components/meteogram-chart.tsx`), the chart geometry (`src/lib/chart.ts`), the layout and the copy, then applied the rules of these skills: web-design-guidelines (pinned rules), fixing-accessibility, mobile-native, ui-polish-pass (state walk), break-ui (worst-case data, argued from the code), emil-design-eng, review-animations and the repo's refactoring-ui. There is no motion in this app, so the animation review found nothing to report.
4. Looked at the running staging app (`gmsdash.staging.barrels.gd`) with a scripted browser at 390 pixels (touch emulation) and 1280 pixels: the home page, and what each other address does when signed out. Sign-in was tried with the staging test account and did not complete (see "What could not be checked"), so **the meteogram page, the access page and every signed-in state were judged from code only**. Screenshots are kept locally and are not committed.
5. Compared the ideas with Mobbin references (section "Inspiration"), for ideas only.

How to read a finding:

- **Rule or reference** is the skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means people would not see a difference in normal use (accessibility, focus, keyboard, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.

## What is already strong

- **The disclaimer is on every screen.** "Raw model guidance, not an official GMS forecast" appears on the home page, as a note above the pickers, and in the footer of every page (`AGENTS.md` boundary). Nothing implies an official forecast.
- **The chart is honest.** Time runs in Grenada local time, and the day lines start at Grenada midnight (`localMidnights` in `src/lib/chart.ts`); the time zone is written next to every time ("(Grenada)"). The y axis picks round ticks, bars start at zero, a missing value lifts the pen instead of drawing a false line, and a parameter the model does not supply says so in words ("This model has no values for this parameter").
- **Colour is used with restraint.** One navy, one grey, hairline grid lines. Nothing red or green is used as decoration, which matches the lane spec's "colour reserved for meaning" and keeps model guidance from looking like a warning level.
- **It works without scripts.** Server-rendered SVG, a plain GET form and a real table mean the page loads fast and the picker works before anything hydrates. The values table gives the same numbers as text.
- **Access states are explained in words.** No organisation, no entitlement, request pending, request refused with the GMS note, and "only an owner or admin can ask" each get their own sentence and a link to the next step. The "no run yet" and "fetching is switched off" cases are told apart.
- **Failure plumbing is careful.** The sign-in failure page says what happened and offers "Try again" without looping; the route error page offers a retry that fetches again and shows a reference; attribution from the data provider is printed under the charts.
- **Landmarks and headings.** Skip link, one first-level heading per page, a main landmark that takes focus, a named navigation, a note role on the disclaimer and a status role on the "no run" message.

## Findings

### Blocking

#### 1. On a phone the chart numbers are about five pixels tall

- **Where:** `src/components/meteogram-chart.tsx` lines 10 to 12 and 105 to 133. The chart is a 720 by 170 drawing scaled to the page width, with the axis and day labels set at 10 units (`fontSize={10}`).
- **What happens:** at 390 pixels the page is 358 pixels wide, so the drawing is scaled by about 0.5. The y axis numbers and the day names then print at roughly 5 pixels, and a 1.75 unit line becomes a line under one pixel wide. At 1280 pixels the scale is about 1.4 and the text is about 14 pixels, which is fine. This was worked out from the code, not seen (sign-in did not complete).
- **Rule or reference:** web-design-guidelines (minimum legible text), mobile-native (phone first for anything people read in the field). The Plausible and Databricks references keep axis text at normal body size and let the chart area change shape instead.
- **Why it matters:** the whole point of the page is to read a number off an axis. A forecaster checking wind or rain on a phone cannot.
- **Suggested fix:** keep the server-rendered SVG, but draw it at the real width. Give the drawing a narrower design width on phones (for example 360 by 200, with fewer day labels and four ticks), either by two drawings switched with CSS, or by setting the labels in HTML beside a stretched drawing. Never let text scale below about 11 pixels. Size M. VISIBLE.

#### 2. The chart cannot be read for exact values, and the numbers are not in the accessible text

- **Where:** `meteogram-chart.tsx` line 89 to 94 (`role="img"` with a label of only the title and unit) and the table in `src/app/(site)/meteogram/page.tsx` lines 245 to 286.
- **What happens:** there is no hover value, no marker for the peak or lowest point and no summary. The table under the charts shows only temperature, wind and rain (not pressure or cloud), only the first 12 rows (about three days at one row every six hours), while the charts show ten days. A screen reader hears "Temperature (°C) over the forecast period" and nothing else.
- **Rule or reference:** fixing-accessibility (a drawing that carries data needs a text equivalent); refactoring-ui, data: label the numbers that matter. Plausible and Braintrust show the value under the pointer. The project boundary is "no client JavaScript" (`AGENTS.md`), so this needs an idea that fits it.
- **Why it matters:** "how hot will it be on Thursday" cannot be answered exactly, and a technical user who is blind or on a touch screen cannot read the data at all.
- **Suggested fix, three small steps that need no script:** (a) put a native tooltip (`<title>`) on every point and bar, which gives hover values on a desktop for free; (b) label the highest and lowest value of each chart on the drawing; (c) give each figure a short text summary ("Temperature: 24 to 31 °C, highest 31 °C on Thursday 15:00") in `<desc>` or a visually hidden line, and give the table all five parameters with a "Show every 3 hours / 6 hours / 12 hours" choice instead of cutting it at 12 rows. An interactive cursor would be a decision for the owner because it breaks the "no client JavaScript" rule. Size M. (a) and (c) are INVISIBLE, (b) and the table are VISIBLE.

#### 3. The home page says "Compare" but the page can show only one model at a time

- **Where:** `src/app/(site)/page.tsx` line 29 to 30 ("Compare ECMWF IFS, ECMWF AIFS and NOAA GFS out to ten days"), and the meteogram page, which has one model select.
- **What happens:** a person must choose a model, press "Show", read, change the model, press "Show" again and remember the first chart. There is no overlay, no side by side and no spread.
- **Rule or reference:** the page promises what the product does (web-design-guidelines, content and copy; refactoring-ui, hierarchy: the main task is to compare). Databricks and Braintrust offer series on one chart.
- **Why it matters:** comparing raw models is the reason a forecaster opens this tool: where do the models agree or disagree. Without it the product is three separate pages that look alike.
- **Suggested fix:** either reword to what exists today ("Look at ECMWF IFS, ECMWF AIFS or NOAA GFS runs for one point") or add a "Compare models" option that draws the chosen models as lines of different shape on the same chart with a visible legend (see finding 4). Size L, needs a product decision. VISIBLE.

### Should fix

#### 4. A second series is told apart by colour only, and the legend is a line of grey text

- **Where:** `meteogram-chart.tsx` lines 80 to 88 and the wind panel in `meteogram/page.tsx` lines 199 to 217.
- **What happens:** wind is navy and gust is mid grey (`tone: "muted"`), both solid lines of the same width. The only legend is the figure caption, "m/s | 10 m wind, gust", which does not say which line is which. Cloud cover and precipitation use different tones for the same kind of mark (navy bars for rain, grey bars for cloud).
- **Rule or reference:** fixing-accessibility (colour is never the only carrier of meaning); refactoring-ui, colour.
- **Suggested fix:** draw the gust as a dashed line, put a small coloured line sample beside each name in the caption, and label the line ends. Size S to M. VISIBLE.

#### 5. Units and the time frame do not match how people use the numbers

- **Where:** `meteogram/page.tsx` (units come from the API; wind is in m/s), `src/lib/chart.ts` (`formatLocal`), line 167 to 171 of the page (the run time).
- **What happens:** wind is only in metres per second, while marine and aviation users in Grenada work in knots and everyday people in kilometres per hour. The run time is shown as "Mon 24 Nov, 14:00 (Grenada)", but a model run is named by its UTC cycle ("12 UTC run", about 5 hours later arrives). There is no "now" line on the charts, no statement of how old the run is and no sign of when the next one is due.
- **Rule or reference:** the GMS project note that metric is the default with a header switch; web-design-guidelines, content (say the thing a user looks for). Braintrust's date picker offers "Use UTC time" as one choice.
- **Suggested fix:** add a units choice (m/s, knots, km/h) as a plain option in the picker form, show the cycle as "12 UTC run (08:00 Grenada)", add the run's age ("issued 3 hours ago, next about 18 UTC"), and draw a thin "now" line. Size M. VISIBLE.

#### 6. The pickers are small, faint and need a button press

- **Where:** `meteogram/page.tsx` line 25 (`selectClass`) and lines 67 to 116.
- **What happens:** selects and the "Show" button use 14 pixel text (`text-sm`) and about 6 pixels of vertical padding, so they are about 32 pixels tall. The border is the hairline `border` colour, which the GMS spec lists as 1.47 to one against white, while form edges need 3 to one; the spec's own `border-input` token (`#85888d`) exists for this and is used by the shared `Input`. Fourteen pixel text in a select makes iPhones zoom the page when it is focused. Changing the point or model changes nothing until "Show" is pressed.
- **Rule or reference:** gms.md (inputs use `border-input`), mobile-native (16 pixel inputs, 44 pixel targets), web-design-guidelines (forms). Most time-series tools apply the choice at once.
- **Suggested fix:** use the shared select styling (or `border-input`, 16 pixels, 44 pixels high), and keep "Show" but also submit when a select changes with a few lines of script, or leave the button and keep it the same height as the selects. Size S. VISIBLE (border and size); the zoom fix is INVISIBLE.

#### 7. Header and form buttons are below the touch size and not the shared button

- **Where:** `src/app/(site)/layout.tsx` lines 30 to 61 (nav links are plain text about 20 pixels tall, "Sign out" and "Sign in" are about 28 pixels), `page.tsx` lines 104 to 109, `access/page.tsx` lines 135 to 140, `signin/page.tsx` lines 43 to 48. These are hand-styled `rounded-md border` buttons, while `error.tsx` and `not-found.tsx` use the shared `Button`.
- **Rule or reference:** mobile-native and gms.md (44 pixel targets); refactoring-ui (one button style per app). A press state is missing too, since the tap flash is switched off in `app-feel.css`.
- **Suggested fix:** use `Button` or `buttonVariants` everywhere and give nav links a 44 pixel hit area. Size S. VISIBLE (a little).

#### 8. The signed-out experience hides the product and sends mistyped addresses to sign-in

- **Where:** `src/proxy.ts` (any address without the session cookie goes to sign-in), the layout nav label "Meteogram (sign in first)" (`layout.tsx` line 35).
- **What happens (seen on staging):** open `/nope` signed out and you are sent to the Barrels sign-in page, not a "page not found". The nav link tells people to sign in first, as part of the link's name. The home page shows no example chart at all, so someone who is deciding whether to ask for access sees only words.
- **Rule or reference:** web-design-guidelines (links say where they go; a not-found is a real answer); the Plausible and Stitch references show a preview of the real product on the first screen.
- **Suggested fix:** let the public pages (`/`, not-found) answer without the cookie, rename the link "Meteogram" and put the sign-in prompt on the page, and add one example chart image (a stored sample, clearly marked as an example) to the home page. Size M. VISIBLE.

#### 9. The "no access" screens are plain text and stop the person

- **Where:** `Message` in `meteogram/page.tsx` lines 293 to 303; `no-access-notice.tsx`.
- **What happens:** "Access is not enabled yet" is a heading and a grey sentence with a link in the middle. A member who cannot request it (only owners and admins can) is not told who in their organisation that is. A person who belongs to no organisation is told to "ask an owner" without a way to find one. The page does not show what the product looks like, and the 404 for the first point of a run reads the same as no access.
- **Rule or reference:** ui-polish-pass (every state has a next step); refactoring-ui (a primary action beats a link inside text).
- **Suggested fix:** one panel pattern for the three no-access states with a heading, one sentence, the status ("Request pending since 21 Nov"), and a button ("Request access" for owners and admins, "Copy a message for your admin" for members). Size M. VISIBLE.

#### 10. A model failure loses the pickers

- **Where:** `meteogram/page.tsx` lines 132 to 144: only a 404 is handled; any other error is thrown to `error.tsx`.
- **What happens:** when the API is slow or fails, the person gets "This page could not be loaded" and has to find their way back; they cannot switch to another model that might have a run. The page also does not show that it is waiting (no loading state: the page is server rendered and blocks, with no `loading.tsx`).
- **Rule or reference:** ui-polish-pass (slow and failed network for each request); web-design-guidelines (loading states).
- **Suggested fix:** keep the heading and pickers and show the error beside them with a retry; add a `loading.tsx` skeleton that keeps the pickers. Size S to M. VISIBLE on failure only.

#### 11. The page title and heading never say which point and model are shown

- **Where:** `meteogram/page.tsx` line 14 to 17 and 120 ("Meteogram").
- **What happens:** the tab says "Meteogram | GMS Dashboard" for every point; the sentence naming the run sits below the pickers. Someone with several tabs open (one per point) cannot tell them apart, and a printed or saved page has no title.
- **Suggested fix:** `generateMetadata` and the heading "Meteogram: Maurice Bishop International Airport, ECMWF IFS". Size S. VISIBLE.

### Nice to have

#### 12. There is no lane spec for this app

- **Where:** `docs/design/` has files for every other app (`gms.md`, `bookings.md`, `events.md` and others) but not for `gmsdash`; `docs/design-system.md` does not list it.
- **Why it matters:** the rules above (chart colours, units, time zones, minimum text size, how a no-access state looks) have nowhere to live, so each change is judged by taste. This audit had to use `gms.md` as the nearest spec.
- **Suggested fix:** a short `docs/design/gmsdash.md` that says: GMS tokens, a chart section (series styles, minimum text size, tooltip rule, legend rule), a time section (Grenada time plus UTC cycle), units, and the no-access pattern. Size S. Documentation only.

#### 13. Smaller points

- **Copy:** "Values every few hours" (table caption) should say how many hours. "Temp" is an unexplained short form in the table header. The coordinates are shown with three decimals and no hemisphere ("12.004, -61.786"); say "12.004 N, 61.786 W". "nearest model grid cell" does not say how far the cell is from the point (a number in kilometres would help a technical reader decide how far to trust it). VISIBLE, size S.
- **Day labels:** the label sits three units right of each midnight line (`meteogram-chart.tsx` line 130), so a midnight within about 30 units of the right edge draws its label outside the drawing and it is clipped. Put the label inside the line's left side when it would overflow. INVISIBLE (a detail at the edge), size S.
- **Bars:** `barWidth` is based on the number of times, so a model with 1 hour steps for the first days and 3 hour steps later (the usual ECMWF output) draws bars of one width at uneven spacing. Compute the width from the gap to the neighbouring time. INVISIBLE, size S.
- **Access page:** the request status prints the raw word ("pending") and the date in the browser's own format (`toLocaleDateString("en-GB")` on the server). Say "Waiting for GMS, sent 21 Nov 2026". VISIBLE, size S.
- **Footer:** "Model guidance is not an official forecast" repeats the note directly above it on the home page. Keep one. VISIBLE, size S.
- **Error and not-found pages** use `div` instead of `main`, and the sign-in failure page uses a hand-styled button. INVISIBLE for the landmark, size S.

## Documents that no longer match the app

- The home page copy promises comparing three models (finding 3), but `apps/web/gmsdash/AGENTS.md` describes a one-model meteogram page; the two should agree.
- `docs/design-system.md` does not list a lane for this app (finding 12).

## Inspiration

Ideas only; none of these is a rule for this app.

- [Plausible Analytics, dashboard with a date picker](https://mobbin.com/screens/73226645-6e90-40db-b24e-34d51bccf703?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp): one large time-series chart with a comparison against the previous period, a single control row and big, readable axis text. Borrow the calm layout and the readable axis; do not borrow the traffic-light percent badges, which would read as warnings on model guidance.
- [Braintrust, dashboard with a time range picker](https://mobbin.com/screens/54ef3f32-12ed-42e5-83c2-cbd335f85bdb?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp): the picker offers quick ranges and a "Use UTC time" switch beside the custom range. Borrow the time zone switch (Grenada time or UTC) for the run and the axis; do not borrow the locked paid options.
- [Databricks, a weather dashboard with a line chart and a settings side panel](https://mobbin.com/screens/ad2e1c24-c2fc-4276-b4e0-6aa1f6ae05bc?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp): the chart settings (series, colour, axis) live in a side panel, and the chart title carries a plain-language description. Borrow the one-line "what this chart shows" caption; do not borrow the heavy editor panel, because this audience reads, not builds.
- [Stitch, a phone weather screen with an hourly strip](https://mobbin.com/screens/a89f2bca-ca46-4334-8dfd-b33f0ede6627?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp): the hourly outlook as a row of cards with "Now" first. Borrow the "Now" anchor for a phone view; do not borrow the decorative gradient, which is not in the GMS spec.

## What could not be checked

- **Every signed-in screen.** The staging test account's password sign-in did not finish from the scripted browser (the sign-in page stayed on the password form after the button was pressed, probably because of the human check on the Barrels sign-in app, and the dashboard's own sign-in secret may also be off on staging). The meteogram page, the access page, the no-access states and all five charts were therefore judged from code, not seen. The 5 pixel text size in finding 1 is a calculation from the drawing's size and the page width, not a measurement.
- **A real phone.** Zoom on focus, sticky hover and browser bars were argued from the stylesheets.
- **Real data.** Whether a staging organisation has a stored run, how the 3 hour and 1 hour steps look, and the real point names were not seen.
- **Dark mode.** Not loaded; the chart's semantic colour classes should follow the theme, but this was not tested.
- **Screen readers and the keyboard route** through the pickers: reasoned from the markup only.
- **Production.** Only staging was visited, and only signed out.
- **Motion.** There is none.
