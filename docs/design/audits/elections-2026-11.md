# Design audit: Elections Grenada (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8)  
**Last updated:** 2026-11-23

## Scope and method

Surfaces audited, all in `apps/web/elections` (a static site on Cloudflare Pages, `elections.barrels.gd`):

- the front page and the 2026 election page;
- Constituencies and one constituency's page, with Find your constituency;
- the results atlas (`/results`), Every election and one election's page, Referendums;
- Candidates and one candidate's record, Parties and one party's page;
- the learning and tool pages (Learn, Trends, How close was it?, Forecast, Make your map), Voter register, Updates, Sources, Search;
- the masthead, phone menu, footer, the not-found, error and loading pages.

The rule for judging: a defect is a gap against this app's own lane spec ([`docs/design/elections.md`](../elections.md)), its `AGENTS.md`, or a rule from a design skill, never a difference from another app. The main journey judged: a voter finds their constituency and sees who won and by how much, before, during and after polling day.

Method:

1. Read the instructions (`AGENTS.md` at the root and in `apps/web/elections`), the lane spec, and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. The app's stylesheet (`src/app/globals.css`) imports the shared touch layer `packages/ui/src/styles/app-feel.css`, so the tap flash is already off, controls already have `touch-action: manipulation`, and CSS animation already stops for people who ask for less motion. Hover styles use Tailwind's `hover:` prefix, which in this version only applies on devices that can hover, so there is no "stuck hover" on phones. The global `:focus-visible` rule in `globals.css` draws a focus ring on every control, including the map shapes that carry an `outline-none` class (checked in the browser). Nothing below repeats a gap those files cover.
3. Read the pages and shared components on `origin/dev` (commit `e7d2b4f6b`), then applied the rules of these skills: ui-polish-pass, web-design-guidelines, fixing-accessibility, mobile-native, emil-design-eng, break-ui (worst-case data argued from the code and the real data), review-animations, find-animation-opportunities and the repository's refactoring-ui. The data-visualisation skill named in the brief is not installed, so charts and maps were judged against the lane spec's own rules ("Never colour alone", "A table for every map") and general chart practice.
4. Looked at the live production site with a scripted browser at 390 pixels (phone, touch) and 1280 pixels (desktop): 26 addresses at each width, plus the phone menu, Find your constituency with a match and with no match, the results map after choosing a constituency, and keyboard focus on the Constituencies page. Dark mode was requested from the browser only to confirm the lane spec's "light only" rule (it holds: the page stays white). There is no usable staging copy (the staging address answers with a certificate error, already recorded in issue #1688), so production was used; it is public and nothing was submitted. Screenshots were viewed during the audit and are not committed.
5. Searched Mobbin for reference screens (sports scores, standings, maps with a detail sheet, data pages), for ideas only. See "Inspiration".

Not repeated here: issue #1688 already records that the 2026 results are missing after polling day, that staging has a certificate error, and the earlier tap-target pass on the footer link.

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means visitors would not see a difference in normal use (accessibility, focus, keyboard, hidden hit areas, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.

## What is already strong

- **The newspaper look is consistent and calm.** Ink on paper, serif headlines, hairline rules and the three-colour stripe appear the same way on every page. Party colour is only ever data, and almost everywhere it sits next to the party's name.
- **Every figure has a source line**, and uncertain figures are marked rather than left out.
- **Find your constituency works well.** Typing "gouy" on a phone at once offers "Gouyave Estate, Place, St. John, polling division M02". The field is 16 pixels so phones do not zoom, arrows and Enter work, and no match says so in words.
- **The page is stable.** No sideways page scroll at 390 pixels on any of the 26 addresses, one first-level heading per page, no text under 14 pixels, no browser console errors, and pages load in one to three seconds.
- **Keyboard and screen-reader basics are in place:** a skip link, a visible focus ring on every control tried (map shapes included), a text list under every map, live announcements on the calculators, and a phone menu that closes on Escape and returns focus.
- **Dates are honest.** The status line is worked out in the visitor's browser, with wording that is true on any day when JavaScript is off.
- **The results atlas keeps its place in the address bar,** so a chosen election and constituency can be shared as a link.
- **Motion is restrained:** a 150 millisecond menu fade and little else, all switched off for people who ask for less motion.

## Findings

### Blocking

#### 1. After polling day the site still speaks as if the vote is ahead, and no page changes with the stage of the election

- **Where:** `src/data/election-2026.ts` lines 180 to 190 (`electionHeadline` returns "Grenada votes on 5 November 2026" whenever a polling day is set, whatever today is) and lines 57 to 66 (the last stage, "counting", never ends); the front page hero (`src/app/page.tsx` lines 161 to 179); the 2026 page (`src/app/2026/page.tsx` lines 38 to 52 and 96 to 100).
- **What happens:** on 23 November, eighteen days after the vote, the front page is headed "Counting and results" above "Follow the campaign, explore your constituency", and its main button is "Make your own map". The 2026 page reads "General election 2026 · Counting and results" directly above "Grenada votes on 5 November 2026", with "Who is standing" and "Polls" below. The stage only changes one line of text: the same layout, buttons and sections show before, during and after polling day.
- **Rule or reference:** app `AGENTS.md`, Product boundary: "Election state (awaiting date → campaign → polling day → counting) comes from `src/data/election-2026.ts`". ui-polish-pass, step 1: list every state before building. The Apple News sports card in "Inspiration" shows a finished game with a "Final" badge and the score first.
- **Why it matters:** the first thing a voter wants after polling day is who won. The missing figures are already tracked in issue #1688; this finding is about the design. Even once the figures are loaded there is no place on the front page, the 2026 page or a constituency page built to show them, and no "result declared" stage to end "Counting".
- **Suggested fix:** design the three stages on purpose. Before: the present layout. Polling day: voting hours, where to vote, and "Results will appear here from (time)". After: past tense everywhere ("Grenada voted on 5 November 2026"), a result block at the top of the front page, the 2026 page and each constituency page (seats per party, winner and margin), with an honest waiting line until verified figures exist ("Results are being verified. Last checked: (date)"), and a final "Result declared" stage. Size L (needs the owner's wording and a decision on the result block). The past-tense wording alone is S. VISIBLE.

#### 2. On a phone, choosing a constituency on the results map puts the answer off the screen

- **Where:** `src/components/atlas/atlas.tsx` lines 1142 to 1220: the map is a fixed 448 pixel block and the results panel is an ordinary block below it.
- **What happens:** at 390 pixels, tapping St. Mark on the map zooms the map, and the heading "St. Mark" with its result starts 870 pixels down an 844 pixel screen. The person sees a closer map and no result. Going the other way, tapping a row in the list below the map changes the map above, out of sight.
- **Rule or reference:** lane spec, Components: "ResultsPanel (sidebar, or a bottom sheet on phones)"; Elevation: the bottom sheet is one of the named floating surfaces. No bottom sheet exists in the code. AllTrails and Klook in "Inspiration" both keep the chosen place's details in a sheet over the lower part of the map.
- **Why it matters:** this is the main journey (find my constituency, see who won and by how much), and on the device most visitors use the tap appears to do nothing useful.
- **Suggested fix:** on phones show the chosen constituency in a sheet over the bottom of the map (name, winner, party, margin, "See full result"), or at least scroll the panel into view and move focus to its heading after a choice. Size M. VISIBLE.

### Should fix

#### 3. A cookie question covers the first screen, and it describes cookies the site does not set

- **Where:** the shared consent dialog, `packages/ui/src/components/posthog-provider.tsx` lines 147 to 160, mounted in `apps/web/elections/src/app/layout.tsx`.
- **What happens:** every first visit opens a centred dialog over a dimmed page ("Do you accept our cookie policy?"). On a phone it hides the headline and dates; on a constituency page it hides the result. The text says "We use essential cookies to run this site", but after choosing "Essential cookies only" the browser holds no cookie at all, only a saved choice. Keyboard focus is not moved into the dialog when it opens (checked in the browser), although it is marked as a modal dialog.
- **Rule or reference:** app `AGENTS.md`: "no cookies, no per-user storage". fixing-accessibility, focus and dialogs: a modal dialog takes focus when it opens. emil-design-eng: do not interrupt the first task.
- **Why it matters:** a voter arriving from a search result must answer a question about cookies before seeing who won, and the wording claims something untrue for this site.
- **Suggested fix:** for this site show the question as a slim bar at the bottom that does not cover content, reword it to what is true ("We would like to count visits. No advertising."), and move focus into it only if it stays a modal. The component is shared by other apps, so this needs an owner decision. Size M. The focus fix is INVISIBLE; the bar and wording are VISIBLE.

#### 4. Nothing responds to a press

- **Where:** the whole app: there is not one pressed (`active:`) style in `apps/web/elections/src`, while `app-feel.css` switches the browser's own tap flash off.
- **Rule or reference:** `docs/agents/extended-rules.md`: "Because the tap highlight is off, every tappable control needs its own `:active` state." mobile-native and emil-design-eng: a press must answer at once.
- **Why it matters:** on a phone, tapping a constituency card, a menu row, a year in the atlas or "Make your own map" gives no sign the tap was received until the next page draws.
- **Suggested fix:** one pressed style per kind of control: rows and cards take the grey paper tint (`bg-el-paper-2`), the ink buttons dim slightly, map shapes dim as they do on hover. Size S to M. VISIBLE (only while pressing).

#### 5. Many controls are smaller than a fingertip

- **Where, measured at 390 pixels:**
  - the 15 seat squares on the front page are links 18 pixels wide and 24 tall, 3 pixels apart (`src/components/home/house-strip.tsx` lines 24 to 36);
  - the atlas mode buttons (Winner, Margin, Turnout, Map, Seats) are 32 pixels tall (`atlas.tsx` line 183), the polling-division rows about 36 (line 553), and "← All of Grenada" 32 (line 1124);
  - the seat buttons in Make your map are 23 by 32 (`src/components/make-your-map/prediction-tool.tsx` line 223) and "Copy link to your map" is 36 tall;
  - the table sort buttons on Candidates are 24 tall and "Show more" is 38 (`src/components/candidates/directory.tsx` lines 92 and 213);
  - every "What am I comparing?" style disclosure is 24 tall (`src/components/learn/page-learning.tsx`), and the button on the not-found page is 32.
- **Rule or reference:** app `AGENTS.md`, UI rules (design at 375 pixels first); mobile-native: 44 pixel targets. Issue #1688 tracked tap targets in general and fixed the footer link; these are the ones still small.
- **Suggested fix:** give each a 44 pixel minimum height (padding only, the look stays), and let the seat strip wrap into two rows of larger squares on phones or stop being links there (the list under "Which constituency is each letter?" already links every name). Size S. Padding changes are INVISIBLE; the seat strip change is VISIBLE.

#### 6. Constituencies are labelled with letters that voters do not know

- **Where:** the seat strip on the front page (`house-strip.tsx`), the results list in the atlas (`atlas.tsx` `NationalPanel`), the seat bar in Make your map, the forecast tiles, and the eyebrow of each constituency page ("Constituency C · leans NDC+3", `src/app/constituencies/[slug]/page.tsx` line 69).
- **Rule or reference:** app `AGENTS.md`, Wording: constituencies are addressed by name; the letters are Parliamentary Elections Office codes. refactoring-ui: label with the reader's words. "Leans NDC+3" uses the site's own index, explained only on another page.
- **Why it matters:** a voter looking for St. David sees "F". The key is hidden behind "Which constituency is each letter?".
- **Suggested fix:** keep the letters as a small secondary mark, and show short names wherever there is room (the list rows already do). On the constituency page say "St. Andrew South West · held by the National Democratic Congress", and give the lean a plain sentence ("Voted 3 points more NDC than the country"). Size M. VISIBLE.

#### 7. On a constituency page the answer comes second, and margins have no unit

- **Where:** `src/app/constituencies/[slug]/page.tsx`. The first section is "Reported 2026 selections" (lines 81 to 128), about one and a half phone screens including its source notes; "2022 result" follows. Margins in "Every result since 1972" are printed as "+11.1" (line 279), as are the atlas list ("+4.0") and polling-division rows ("NDC +13").
- **Rule or reference:** refactoring-ui, hierarchy: the fact the page exists for comes first. web-design-guidelines, Content: numbers carry their unit. The Apple Sports screen in "Inspiration" pins the score at the top and keeps it there while the detail scrolls.
- **Why it matters:** "who won and by how much" is the question. The deck does answer it in a sentence, but the eye has to read prose to find it, and "+11.1" could be votes, points or percent.
- **Suggested fix:** open the page with a small result strip: winner, party, share, and the margin in both votes and points ("won by 425 votes, 11.1 points"), then the candidate list. Write "pts" or "points" after every margin, as the front page's "Closest in 2022" list already does. Size M. VISIBLE.

#### 8. The polling-division map on a constituency page is too small to read and says nothing on touch

- **Where:** `src/components/map/flat-map.tsx` line 68: the drawing always shows the whole country (`viewBox="-15.5 -25.5 43 41.5"`), even when only one constituency's divisions are drawn. Division shapes carry their name only in a hover title (lines 22 to 30).
- **What happens:** on St. Andrew South West the 14 divisions are a patch a few millimetres across inside a grey island, and tapping one does nothing. The atlas already zooms to a chosen constituency (`bboxOf`, `atlas.tsx` line 1147).
- **Rule or reference:** lane spec, Principles: "Never colour alone. Party is also given in text: legend, label, tooltip or table." A hover title is not reachable by touch.
- **Suggested fix:** zoom the drawing to the constituency when one is given, print the division codes on the shapes at that zoom, and let a tap highlight the matching row in the list below. Size M. VISIBLE.

#### 9. Polling place names are cut off with no way to read them

- **Where:** `src/app/constituencies/[slug]/page.tsx` line 228 and `atlas.tsx` line 560 (`truncate`); also `src/components/forecast/forecast.tsx` line 505 and `src/components/how-close/swing-calculator.tsx` line 195.
- **What happens:** "Munich R.C. School (do…", "Mt. Carmel Medical Stat…", "Victoria Child Development C…" on both phone and desktop. A voter checking their own polling place cannot see its full name.
- **Rule or reference:** break-ui: long real names must wrap or be reachable. web-design-guidelines, Content: text containers handle long content.
- **Suggested fix:** let the name wrap onto a second line. Size S. VISIBLE.

#### 10. Wide tables scroll sideways on phones where the lane spec asks for cards

- **Where:** the Candidates directory (`src/components/candidates/directory.tsx` line 170, 640 pixels minimum), "Every race" on a candidate's page (`src/app/candidates/[slug]/page.tsx` line 191), Parties (`src/app/parties/page.tsx` line 38), a party's page (`src/app/parties/[code]/page.tsx` line 147) and the polling station table (`src/components/results/station-table.tsx` line 22).
- **Rule or reference:** lane spec, Layout: "Wide tables become one card per row on phones."
- **Why it matters:** on a phone the Candidates table shows the name and party, and the columns that answer the question (races, wins, best share) are off to the right with no hint that the table scrolls.
- **Suggested fix:** one card per row under 640 pixels for these five tables, keeping the sort control as a small "Sort by" menu. Size M. VISIBLE.

#### 11. The chart on a candidate's page has overlapping labels and colour with no key

- **Where:** `src/app/candidates/[slug]/page.tsx` lines 60 to 64 and 124 to 170.
- **What happens:** the time axis always runs from 1951 to 2022, so a career of 1951 to 1972 is squeezed into the left third and the year labels print on top of each other ("1957", "1961" and "1962" are unreadable on E.A. Mitchell's page); the first dot sits on the "25%" label. Dots are coloured by party with no legend, and the only caption is "Filled dots are wins."
- **Rule or reference:** lane spec, Principles: "Never colour alone"; Typography: "Chart SVGs retain at least their viewBox width … so labels do not shrink". General chart practice: fit the axis to the data and never let labels collide.
- **Suggested fix:** fit the axis to the candidate's own years (with a little padding), skip a year label when it would touch its neighbour, start the plot to the right of the percentage labels, and add a party key. The table below already holds every figure. Size S. VISIBLE.

#### 12. The year selector in the atlas uses colour alone

- **Where:** `atlas.tsx` lines 786 to 812. Each year has a small coloured bar for the party that won most seats; the button's accessible name is only the year.
- **Rule or reference:** lane spec, Principles: "Never colour alone."
- **Suggested fix:** add the winner to the accessible name ("2022, NDC won"), and a one-line key under the strip. Size S. The name is INVISIBLE; the key is VISIBLE.

#### 13. The atlas has no proper loading or failure state

- **Where:** `atlas.tsx` lines 1022 to 1032. While the data loads the page shows one line, "Loading the atlas…", and then the selector, summary and a 448 pixel map appear and push everything down. On failure it says "Reload the page to try again" with no button.
- **Rule or reference:** ui-polish-pass, states: loading keeps the layout; failure offers the next step. The site search (`src/components/learn/site-search.tsx`) already has a "Try again" button.
- **Suggested fix:** reserve the atlas's height with grey blocks while loading, and add a "Try again" button that fetches again. Size S. VISIBLE on slow connections only.

#### 14. The reason behind an evidence mark cannot be read on a phone

- **Where:** `src/components/flag.tsx` line 33: the reason for ✱, ✱✱ or † is in a hover title (and in screen-reader text). The same pattern holds the note on the 2026 page's figures (`src/app/2026/page.tsx` line 73).
- **Rule or reference:** lane spec, Principles: "Show the source … marked where it is shown, not only in a footnote." mobile-native: nothing may depend on hover.
- **Why it matters:** the specific reason ("Matched to this record by surname and first initial") is the point of the mark, and sighted phone users never see it; they only get the general key in the footer.
- **Suggested fix:** make the mark a small button that opens the reason in a popover or expands it below the line. Size M. VISIBLE.

### Nice to have

#### 15. Some pages are very long on a phone with no way to jump

- Trends is about 21,000 pixels tall at 390 pixels (25 screens), Sources 23,000, Forecast 18,000, How close was it? 11,000, the front page 9,000.
- Rule: web-design-guidelines, Navigation: long pages offer a way to move within them. The Apple Sports screen in "Inspiration" uses three tabs (Stats, Play-by-play, Rankings) under a fixed score.
- Suggested fix: an "On this page" row of links under the page head for these five pages. Size M. VISIBLE.

#### 16. The phone menu puts the voter's own task last

- `src/lib/nav.ts`: "Your constituency" is the fourth group, below the fold of the open menu, and Find your constituency is not in the menu at all (`src/components/mobile-menu.tsx`).
- Suggested fix: put the Find your constituency field at the top of the open menu, above Search. Size S. VISIBLE.

#### 17. Two "back" links in the atlas

- With a constituency chosen, "← All of Grenada" (toolbar, `atlas.tsx` line 1122) and "← All constituencies" (panel, line 609) do the same thing with different words. Keep one wording. Size S. VISIBLE.

#### 18. The not-found and loading pages do not match the rest of the site

- `src/app/not-found.tsx` is a narrow block with a small button and no way to search; `src/app/loading.tsx` uses a different page width (`max-w-6xl`) from the site's 1240 pixels. A mistyped constituency address is a likely way to land here.
- Suggested fix: use the page head, add Find your constituency and links to Constituencies and Results; match the width. Size S. VISIBLE.

#### 19. Shared links have no picture

- There is no share image (`src/app` has only `favicon.ico`; no Open Graph image). A constituency link sent on WhatsApp shows text only.
- Suggested fix: one site image first; later a generated image per constituency with the winner and margin. Size S for the first, M for the second. VISIBLE (in other apps, not on the site).

#### 20. Small accessibility tidy-ups

- Every chart sits in a region named "Scrollable chart" (`src/components/chart-viewport.tsx` line 13), so Trends has many regions with one name; name each after its chart. The hint above it is 14 pixels, where the lane spec asks for 16 for explanations (line 10).
- The whole atlas panel is a live region (`atlas.tsx` line 1178), so a screen reader hears all 15 rows after each choice; announce one sentence instead ("St. Mark: New National Party won by 19.1 points").
- The Candidates filters are not kept in the address, so a filtered list cannot be shared or returned to with Back (`directory.tsx`).
- Size S each. INVISIBLE.

#### 21. Motion: one place to add, the rest to leave alone

- Worth adding when results night is built: the seat count and bars should move to their new values (about 300 milliseconds, ease-out) when a result arrives, so the change is noticed. The lane spec says map changes are immediate; that is a recorded decision and is not challenged here.
- Rejected on purpose: page transitions, animated charts on load, hover effects on cards. The site is read, not played with, and the spec says motion explains a change.
- Size M, with results night. VISIBLE.

## Inspiration

Ideas only. Elections Grenada keeps its newspaper look; none of these colours, fonts or rounded cards should be copied. Mobbin holds no election products, so the nearest matches are sports scores, standings and map apps.

- **Results overview:** [X, league standings](https://mobbin.com/screens/ba1df8cf-204b-4380-83af-8d94022ec1c7). Borrow the compact grouped table that still fits a phone (short names, three or four number columns, groups with a heading), as a model for the "cards on phones" tables. Do not borrow the team logos or the pill tabs.
- **Results overview, ranked:** [WHOOP, weekly leaderboard](https://mobbin.com/screens/d17578a2-9ec1-415f-9ef2-b6c4bc9adc30). Borrow the row pattern (rank, name, the one figure that matters in a second colour, a line of detail) and the "Last updated" stamp at the top. Do not borrow the dark theme.
- **One constituency's result, and results night:** [Apple Sports, following a live game](https://mobbin.com/flows/7de273e0-64b1-4ea3-b264-72171ebba5e2). Borrow the fixed header with both sides and the score, the paired bars where each line compares the two sides with the figure at each end, and the three tabs under it. Do not borrow the betting odds row or team-colour backgrounds: party colour stays data only.
- **A finished result on the front page:** [Apple News, sports](https://mobbin.com/flows/3cddcbf0-73aa-480f-8abf-c6addefa99dd). The third screen shows a score card with a "Final" badge, the date and the two totals above the stories. Borrow that for the "after polling day" hero (seats per party, "Declared", date). Do not borrow the photo-led cards.
- **A live or election-night state:** [WHOOP, live activity](https://mobbin.com/screens/cac35c0a-44fe-4233-8f00-e3d173ee5831). Borrow the structure: one large figure, a small "Live" mark, and three supporting figures in a row (for us: seats declared, turnout so far, last update). Do not borrow the gauge or the gradient.
- **A results map:** [AllTrails, place details over a map](https://mobbin.com/screens/a9e0b843-a046-4699-9251-f541b41af44b) and [Klook, map with a details sheet](https://mobbin.com/screens/c1a25e86-2452-4237-96c5-164ef885a450). Borrow the sheet that rises over the lower map with the chosen place's name and a close button, so the map and the answer are on screen together (finding 2). Do not borrow the photo or the large rounded corners; the lane is square-edged.
- **A map with its table, and an empty state:** [Plausible Analytics, map and table](https://mobbin.com/screens/18f96ad6-55aa-4f64-af8d-a7372cef843d). Borrow the plain "No data yet" panel that keeps its place and size, as the model for "Results are being verified" (finding 1): the section stays, with one honest line. Do not borrow the card shadows.
- **A candidate or party page:** [WHOOP, profile with data highlights](https://mobbin.com/screens/060fb8cc-8ea0-4eb3-961e-32c4c70babbd). Borrow the idea of three headline figures at the top of a person's page (races, wins, best share) before the chart and table. Do not borrow the badges or rings.
- **Share bars:** [Canva, bar chart](https://mobbin.com/screens/bdd2409a-f23c-45bf-a679-e02acf57e067). Borrow the direct label at the end of each bar, which is what the candidate rows already do; apply the same to the polling-division bars, which today have no figure beside them.

## Documents that no longer match the app

Small drifts noticed while auditing. Nothing was edited.

- `docs/design/elections.md` (last updated 3 October 2026) lists "ResultsPanel (sidebar, or a bottom sheet on phones)" and "Wide tables become one card per row on phones"; neither is in the code (findings 2 and 10).
- `apps/web/elections/AGENTS.md` says "no cookies, no per-user storage", while the shared consent dialog asks about cookies and saves the choice in the browser (finding 3).
- `apps/web/elections/AGENTS.md` names the stages "awaiting date → campaign → polling day → counting"; there is no stage for a declared result (finding 1).

## What could not be checked

- **A staging copy.** There is none that loads (certificate error, issue #1688), so only production was seen. Production may be behind `dev`; the code was read on `origin/dev` at `e7d2b4f6b`, and each finding names the file it comes from.
- **Before polling day and polling day itself.** Both are in the past, and the browser's clock was not changed, so those two stages were read from code only. The "after" stage is what production shows today.
- **A real phone.** Touch feel, the on-screen keyboard and the browser bar were tested only in an emulated phone. mobile-native's rule is that these need a real device.
- **Screen readers.** Names, roles and live regions were read from the markup and the accessibility attributes, not listened to.
- **Enlarged text, JavaScript switched off and a slow connection.** The code is written for all three, but none was run.
- **Colour contrast by measurement.** The ratios in the lane spec were taken as given; no finding here depends on a measured ratio.
- **Charts against the data-visualisation skill.** It is not installed on this machine, so chart findings rest on the lane spec and general practice.
- **Every one of the roughly 490 addresses.** One example of each kind of page was opened (two constituencies, one candidate, one party, two elections, one guide, one update).
- **Motion.** There is almost none (a menu fade and one replay transition), so the animation skills had little to review.
