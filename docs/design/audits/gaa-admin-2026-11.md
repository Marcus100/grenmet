# Design audit: the staff portal, `gaa-admin` (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8)  
**Last updated:** 2026-11-23

## Scope and method

The app is `apps/web/gaa-admin`, the staff portal on the `gms.` host (77 pages). It is too large to read line by line in one pass, so it was covered in this order, and the last section says plainly what was not reached:

1. the shared shell: layout, sidebar, header, search, notifications, loading and error pages;
2. the home dashboard ("Operations");
3. the forecast desk and product editors (`/wxproducts`, shared `ProductDesk`), the TAF and METAR composer;
4. the observations register (`/wxproducts/hourly`, month workbook);
5. the duty roster and attendance;
6. HR forms and leave, the HR home page and the approvals inbox;
7. HR Setup;
8. the rest, looked at on staging and sampled in code only (calendar, staff, roles, profile, CAP, WxWatch, payroll, bus, janitor, stores).

The rule for judging: a defect is a gap against this app's own lane spec ([`docs/design/gaa-admin.md`](../gaa-admin.md)) or a rule from a design skill, never a difference from another app. The portal is dense on purpose, desktop first, and often used in a darkened operations room; rules for a customer page (large type, one task per screen) do not apply. Owner rules already recorded were respected: empty sections stay visible, HR has its own status colours and a Returned state, navy and sky buttons follow the design system, HR previews follow the weather desk layout, and the top of the paper register is the truth for the observations register.

Method:

1. Read the instructions (`AGENTS.md` at the root and in `apps/web/gaa-admin`), the `gaa-admin-change` skill for the module map, the lane spec, and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. The shared layer `packages/ui/src/styles/app-feel.css` is imported by the app's `src/app/globals.css` and already switches off the tap flash, sets `touch-action: manipulation` on controls, stops long-press selection on buttons, contains scrolling inside dialogs and menus, and cancels animation for people who ask for less motion. The shared `Button` has a pressed state, and keyboard focus rings come from the shared primitives. The page transition was removed on purpose (owner decision of 14 November 2026, recorded in `components/layout/page-transition.tsx`), so its absence is not a finding. Dark mode for this app is set in `globals.css`; the `--gm-*` tokens in `packages/gms/src/styles/foundation.css` only change in dark mode on the public site (`.gm-site.dark`), which matters for finding 1.
3. Read the shell, dashboard, document desk, product desk field controls, register table and workbook, duty roster, leave form, form action bar, approvals inbox, HR dashboard and HR Setup tabs, and searched the whole app for systemic patterns (raw colours, text under 12 pixels, date formats, state kept outside the address bar, unsaved-change guards, confirmation of final actions). Applied the rules of these skills: ui-polish-pass, web-design-guidelines (pinned rules), fixing-accessibility, refactoring-ui (through the lane spec), mobile-native, emil-design-eng, break-ui (worst-case data, argued from the code) and review-animations. There is almost no motion in the portal (colour changes and one chevron turn), so the motion review found nothing to report.
4. Looked at the running staging app (`gms.staging.barrels.gd`) signed in as the staging test account, with a scripted browser at 390 pixels with touch emulation (43 pages) and at 1280 pixels (43 pages), plus the sidebar and the notification panel opened on a phone, dark mode on seven pages, three pages at tablet width (768 pixels), the hover state of the desk cards, and the register's "New observation" view opened without typing. No page scrolled sideways at 390 pixels; wide tables scroll inside their own cards. Strictly read only: nothing was saved, submitted, sent, approved, issued or deleted. Screenshots were viewed during the audit and are kept outside the repository.
5. Collected reference flows from Mobbin for the four main journeys (see "Inspiration"), for ideas only.
6. Did not repeat items already tracked in issue #1688 (sidebar entries that lead nowhere, staff and roles tables on a phone, the thin roles page, plain-text loading placeholders, the month roster on a phone, the "Pay period hours" and "Not recorded" cards on the HR home page, the "GAA Admin" sign-in title, dashboard cards with no explanation, and the 404 resource logged on every page).

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means staff would not see a difference in normal use (accessibility, focus, keyboard, hidden hit areas, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.

## What is already strong

- **The observations register is faithful to the paper.** Sections 0, 1 and 3 are separate tables with the paper's column names, codes and column numbers, a plain reading above each coded entry, grey fixed indicator digits, and coded data in a monospace face. Each cell names itself for screen readers ("Wind Direction (ddd)"), errors and warnings are tied to their cell, and a problem cell is marked as invalid. On a phone each table scrolls sideways inside its own card and the page itself never scrolls sideways.
- **The forecast desk protects the forecaster.** One desk serves forecasts, bulletins and the outlook; nothing renders while typing; the preview says when it is out of date; Publish stays locked until a current preview has passed validation; revision and publication state are always shown as words ("New draft", "Not published", "Unsaved changes"); leaving with unsaved changes asks first.
- **One shell for every module.** A skip link, a sidebar that collapses to icons, a command search, a notification bell that names its unread count, and one page header component. The error page keeps the menu usable, says what happened, gives a reference and uses the real retry.
- **Status is a word, not only a colour.** HR request badges (Draft, Submitted, Approved, Returned, Rejected, Cancelled) are keyed to the server's list so a new status cannot be missed, and Returned and Rejected never look alike.
- **Empty states speak.** The dashboard, approvals, signed copies and roster all say what is missing and usually what fills it ("No roster period exists for November 2026" with a "Create period" button).
- **HR forms prefill honestly.** Fixed facts are read only with "From your staff profile", and provisional policy is labelled as provisional.
- **Colour discipline is far better than the lane spec says.** The search found 28 raw palette classes outside printable documents, against the "about 95" the spec still quotes, no `transition-all`, no browser `confirm()` or `alert()`, and no clickable `div`.
- **The duty roster works on a phone.** A week strip with a day selector replaces the month grid, and every cell names its person, date and duty for screen readers.

## Inspiration

References from Mobbin for the four main journeys. They are ideas to borrow, not looks to copy: the portal keeps its own tokens, density and the paper register layout.

**Writing and issuing a forecast**

- [Hashnode, publishing a page](https://mobbin.com/flows/56fdb1ac-f353-4522-a533-be8bd1db6526). Borrow: the save state ("Saved"), Preview and the single solid Publish button sit together in one fixed bar at the top, and publishing ends with a small confirmation that offers "Open" and "Copy link". Do not borrow the free-form editor: forecasts are structured fields.
- [Craft, publishing to the web](https://mobbin.com/flows/c2cdb49e-57a3-49b7-a126-a6a0565d058c). Borrow: a clear "Published" state with "Visit site" next to it, so the forecaster can open the public page that just changed. Do not borrow the sharing options; a forecast has one audience.

**Entering an hourly observation**

- [Clay, adding a row to a table](https://mobbin.com/flows/6e0cdfca-f33d-47c0-ad8d-812c28d1d79d). Borrow: frozen first columns, a visible count of rows and columns, and column headers that stay readable at full strength. Do not borrow the generic column types or the reordering: the register's columns are fixed by the paper form.
- [AirOps, adding a row](https://mobbin.com/flows/fd9539de-2635-45e8-8b6d-8b63b4557fa5). Borrow: a strong outline on the active cell and Undo and Redo in the toolbar, which would suit an observer who mistypes a group. Do not borrow the blank-grid start; the register should always open on the current hour.

**The duty roster**

- [Deputy, adding a shift](https://mobbin.com/flows/857e1417-10e1-4a5b-9b4b-8a4a8a6fa6a5). Borrow: a status line under the grid that counts unpublished, published, warnings and approved leave, a "Publish 4 shifts" button that says how many changes will go out, "Repeat for rest of the week", and time off shown as its own quiet row. Do not borrow cost and wage totals; payroll is frozen until HR acceptance.
- [Square, adding shifts](https://mobbin.com/flows/76bf2e3d-6cbd-4499-81be-c4aad9e42df1). Borrow: a week view with hours per person at the start of each row and totals per day along the bottom, which answers "is every day covered" at a glance. Do not borrow the large coloured shift cards: the portal's one-letter cells are denser and match the printed roster.

**A leave request**

- [Deel, requesting time off](https://mobbin.com/flows/c17759fc-bb9d-48cf-9e8b-56e30b6cc6b8). Borrow: the request opens as a short side panel with type, a from and to range and a running "Your request: 2 days" total; afterwards the request shows on the person's page as "2 days, Paid leave, Waiting for approval". Do not borrow the removal of the printed form: the signed paper copy is a GAA requirement, so the preview stays.
- [Deel, time off overview](https://mobbin.com/flows/edcd69be-5998-4670-9fd7-35a307cb5702). Borrow: balance, requests and public holidays beside a month calendar, so a person sees their balance and the holidays before choosing dates. Do not borrow it as a replacement for the HR home page; it suits the top of the leave form.

## Findings

### Blocking

#### 1. In dark mode the duty roster's shift letters disappear, and its colours do not follow the owner's roster decision

- **Where:** `src/components/hr/roster/duty-roster.tsx` lines 76 to 85 (`CODE_STYLE`) and lines 674 to 681 (the cell).
- **What happens:** the night shift letter is `text-gm-navy` (`#0b132b`). The portal's dark page is `#0b1020`, and the `--gm-*` tokens do not change in dark mode for this app (`packages/gms/src/styles/foundation.css` scopes its dark values to the public site), so a night shift is navy on near-navy, a contrast of about 1.0 to 1. Vacation, leave and study leave use `text-gm-text-primary` (`#111827`), dark ink on a dark cell with a faint tint, also unreadable. Morning, day and evening letters fall to roughly 3.3 to 3.6 to 1 at 11 pixels. Measured on staging with dark mode switched on: night 1.03 to 1, vacation, leave and study leave 1.07 to 1, off duty 1.11 to 1, day, evening and morning between 3.6 and 3.7 to 1. In the legend the night letter and the vacation chip cannot be seen at all.
- **Second problem, in both themes:** vacation, leave and study leave are tinted with the weather hazard colours (`gm-risk-green`, `gm-risk-yellow`, `gm-risk-amber`), and an approved absence turns the letter red with an asterisk. The owner's decision of 23 October 2026 was that HR gets its own status colours, hazard colours stay for weather, and roster absences are one grey with a letter so that shifts stand out. Sunday headings are also red, the colour the lane spec keeps for errors.
- **Rule or reference:** lane spec, Overview ("often in a darkened ops room", "Hardcode a colour and it breaks") and Principles ("Semantic tokens only ... never `gm-*` hues ... in UI chrome"); the standard needs 4.5 to 1 for small text. The same token problem affects `src/app/(admin)/cap/alerts/[identifier]/page.tsx` (`text-gm-text-primary`, `text-gm-text-muted`).
- **Why it matters:** the roster says who is on the night shift. On a dark screen that letter cannot be read, and in a light one a study day looks like an amber weather warning.
- **Suggested fix:** move shift letters to semantic text colours that have dark values (night = `text-foreground` in bold), show every absence as one grey cell with its letter as the owner decided, and drop red for Sundays and approved absences (keep the asterisk and the screen reader text). Any new token is named in the pull request. Size M. VISIBLE.

#### 2. An approver decides without seeing the request, and Reject is final on one click

- **Where:** `src/components/hr/approvals-inbox.tsx` lines 200 to 290.
- **What happens:** a row shows the form type, who asked, the date submitted and the approver's role. For a leave request, absentee report, parking application or daily status there are no dates, no number of days, no reason and no link to open the form or its signed copy (only shift swaps and attendance show extra detail). "Reject" then calls the action at once: no confirmation, no reason, no undo, although the status list itself notes that "Rejected is final". "Return" already asks for a reason in a dialog, so the gentler action is the better guarded one.
- **Rule or reference:** lane spec, Components: "confirm destructive actions with `AlertDialog` naming the object ... or offer Undo"; Principles: "State is always visible ... who changed what". Web-design-guidelines, Navigation and State: destructive actions are never immediate.
- **Why it matters:** a manager can approve leave without knowing which days it covers, and a slip of the mouse on a 28 pixel button ends a colleague's request for good with no explanation sent back.
- **Suggested fix:** show the request's key facts in the row (for leave: type, dates, days) with "View form" opening the same preview the author saw; make Reject open a dialog that names the request and asks for a reason, as Return does. Size M (the detail needs the inbox item to carry or fetch a summary). VISIBLE.
- **Not checked live:** the staging inbox was empty, so this is from code.

### Should fix

#### 3. Forecast fields have no visible label once they are filled

- **Where:** `src/components/wxproducts/product-field-control.tsx` lines 156 to 252. The label is `sr-only` (line 249); what the forecaster sees is a placeholder ("Max temp", "Min", "Max", "Gusts", "Swell", "Period", "Term") that vanishes on the first keystroke.
- **Rule or reference:** lane spec, Components, Form fields: "visible label, helper text below"; Accessibility: "always label inputs visibly" (because the dark input outline is weak). Web-design-guidelines, Forms.
- **Why it matters:** a filled Wind row reads "E", "ESE", "10", "20", "30" with nothing to say which is the minimum, the maximum or the gust. The person checking a colleague's draft before publishing has to click into fields or trust the preview. At 390 pixels the wave captions are also cut ("Min wav", "Max wav").
- **Suggested fix:** keep the compact rows but show a small caption above each control (12 pixel label style), or a prefix inside the box ("Min 10 mph") that stays when filled. The same change applies to bulletins and the outlook, which share the desk. Size M; it changes the desk's height, so agree the look first. VISIBLE.

#### 4. HR forms report one problem at a time, away from the field

- **Where:** `src/components/hr/leave/leave-application-editor.tsx` lines 472 to 490 and 587 to 591; the same pattern in the absentee, shift exchange, timesheet and daily status editors (none sets `aria-invalid` or moves focus).
- **What happens:** pressing "Sign & submit" checks the form, shows the first problem as a toast and as one red line under the buttons at the top of the card, and stops. The field at fault is not marked, focus does not move, and the next problem appears only after the first is fixed. "Sign & submit" is also disabled when no signature is saved, with the reason in a separate line above rather than on the button.
- **Rule or reference:** lane spec, Components: "error below in `text-destructive`", "submit stays enabled until pressed", toasts are "never the only record of an error"; Agent prompt guide: "focus first error on submit". The register and the product desk already do this (problem summary, marked cells).
- **Why it matters:** on a phone the buttons are four screens above the last field, so the message appears out of sight; staff fix a form by trial and error.
- **Suggested fix:** validate all fields at once, put each message under its field, mark the field invalid, list the problems in a summary that takes focus (reuse the product desk's summary), and keep the toast as an extra. Size M per shared helper, then S per form. VISIBLE (error state only).

#### 5. Typed work can be lost without a warning

- **Where:** HR editors have no guard on leaving (the product desk does: `src/components/wxproducts/product-desk.tsx` line 1269). "Reset" clears a filled form at once (`leave-application-editor.tsx` line 432, `src/components/hr/form-action-bar.tsx`). The roster's "Discard" drops every pending cell at once and leaving the page with unsaved cells is silent (`duty-roster.tsx` line 106). The register's "New observation" entries live only in page state (`src/components/wxproducts/eregister.tsx` line 143), so the menu, the Back button or a refresh loses a half-entered hour.
- **Rule or reference:** lane spec, Components: "Warn before leaving with unsaved changes"; web-design-guidelines, Forms and Navigation and State.
- **Why it matters:** an observation is 65 columns typed against the clock; a roster edit can be thirty cells. Losing either to a stray click costs minutes at the worst time.
- **Suggested fix:** one shared "unsaved changes" guard (the product desk's) for HR editors, the roster and the register entry view; Reset and Discard ask first or offer Undo in the toast. Size M. INVISIBLE in normal use (a prompt appears only when work would be lost).

#### 6. Dates and times appear in five formats and three kinds of picker

- **Where, seen on staging:** "Monday, 23 November" (HR home), "November 23rd, 2026" and "Pick a date" (leave form, popover picker, `leave-application-editor.tsx`), "mm/dd/yyyy" native boxes on the same leave form for travel dates (lines 848 and 868), "11/23/2026" then "Sunday 2026-11-22 to Saturday 2026-11-28" (timesheet, `src/components/hr/timesheet/attendance-timesheet.tsx`), "2026-11-23 07:00" (forecast desk and register) and "1 Nov" (month workbook). In code, 34 files use the browser's native date or time boxes and 5 use the shared date picker; formatting is split between `date-fns` patterns, `toLocaleDateString("en-GB")` and `toLocaleDateString(undefined)`.
- **Aviation is the sharpest case:** the TAF and METAR composer asks for four UTC times in the browser's own date and time box (`src/components/wxproducts/aviation-draft.tsx` line 414), which on a United States locale shows "mm/dd/yyyy, --:-- --" with AM and PM, while the form says UTC and aviation uses the 24 hour clock.
- **Rule or reference:** lane spec, Principles: "Density with rhythm. Tight is fine; inconsistent is not." Web-design-guidelines, Locale: one formatter. Refactoring-ui: one way to show one kind of fact.
- **Why it matters:** 11/12/2026 is 12 November to one browser and 11 December to a Grenadian reader. Mixed formats on legal HR forms and UTC times in a 12 hour box invite wrong dates.
- **Suggested fix:** one date helper for display (day, short month, year for people; ISO with a 24 hour time for operational data), one picker component for every date field, and a 24 hour UTC time entry for aviation. Size M to L (many files, mechanical). VISIBLE.

#### 7. Where you are is not in the address bar

- **Where:** HR Setup organisation and tab (`src/components/hr/setup/hr-setup-tabs.tsx` line 43), roster month and department (`duty-roster.tsx` lines 99 to 105), register view "Observation archive" or "New observation" (`eregister.tsx` line 143), product type on the desk (`product-desk.tsx` line 1383), staff table sorting, filters and page (`src/components/users/users-manager.tsx` lines 94 to 103). All are held in component state.
- **Rule or reference:** lane spec, Layout: "URL is state: filters, tabs, pagination and selected record live in search params so a view can be shared and survives refresh." Several newer pages already do this (month workbook, clock, payroll, janitor).
- **Why it matters:** a refresh on "Roster rules" returns to the first tab; a supervisor cannot send a link to "December roster" or "the Evening forecast"; the Back button leaves the page instead of the tab.
- **Suggested fix:** move these to search parameters, one screen at a time. Size M in total. INVISIBLE (the screens look the same).

#### 8. Grey text on tinted cells in the register is under the contrast limit, and the code rows are 10 pixels

- **Where:** `src/components/wxproducts/eregister-ui.tsx` lines 184 and 196 (codes and paper column numbers, `text-[10px] text-muted-foreground` on `bg-muted/40`), the fixed indicator cells in the lower layer (`bg-muted text-muted-foreground`), and calculated cells in `eregister-workbook.tsx` line 316. The staging page had 121 pieces of text under 12 pixels.
- **Rule or reference:** lane spec, Do's and Don'ts: "Put muted text on tinted fills (`text-muted-foreground` on `bg-muted` fails AA)" is a don't; `#6b7280` on `#e4eef7` is about 4.1 to 1. Typography: the smallest step is 12 pixels.
- **Why it matters:** the code row is how an observer matches a cell to the handbook, and indicator digits are part of the message that is sent. This does not ask for any change to the paper layout.
- **Suggested fix:** use `text-foreground-secondary` (or the body ink) for text on the tinted cells and raise the code and number rows to 11 or 12 pixels, widening nothing. Size S. VISIBLE (slightly darker, slightly larger).

#### 9. On a phone, most controls are smaller than a fingertip

- **Where:** the shared `Button` is 32 pixels tall, `sm` is 28, icon buttons are 32 (`packages/ui/src/components/ui/button.tsx`); sidebar rows are 32. Measured on staging at 390 pixels with touch: 1,260 of 1,336 controls across 43 pages are under 44 pixels in one direction, and 35 of 46 in the open sidebar. The header's three icons (bell, layout, theme), the roster's week buttons, the form action bars and the dashboard's "Open desk" links (16 pixels tall, `src/app/(admin)/_components/panel.tsx` line 35) are the ones staff will hit most.
- **Rule or reference:** mobile-native, baseline: 44 pixel targets on touch. The lane spec's own floor is 24 pixels (desktop), which the 16 pixel panel links also miss.
- **Why it matters:** the portal is desktop first, but the roster, clock in, approvals and notifications are phone tasks.
- **Suggested fix:** do not enlarge the desktop controls. Add an invisible hit area on touch devices (`@media (pointer: coarse)`, a pseudo-element or `min-height`) to the shared button, sidebar row and tab, and give the panel links padding. Size S to M. INVISIBLE on desktop; on phones the controls look the same and are easier to hit.

#### 10. The desk cards on "Weather products" turn sky blue with grey text on hover

- **Where:** `src/app/(admin)/wxproducts/page.tsx` line 52: `hover:bg-accent` on a card whose description is `text-muted-foreground`. In this app `--accent` is the kit sky (`#37a3ef`); grey `#6b7280` on it is about 1.8 to 1. Confirmed on staging: the hovered card is `rgb(55, 163, 239)` and its description stays `rgb(107, 114, 128)`.
- **Rule or reference:** lane spec, Colors: muted text only on page or card; web-design-guidelines: hover must increase contrast, not lower it.
- **Suggested fix:** hover with `bg-muted` or a border colour change, as the dashboard tiles do. The sixth card (hourly register) should be the same kind of card as the other five. Size S. VISIBLE (hover only).

#### 11. The product desk shows two solid navy buttons

- **Where:** `product-desk.tsx` lines 1204 to 1232: "Save draft" and "Publish to GMS" are both the default (solid) variant, with "Validate and preview" outlined between them.
- **Rule or reference:** lane spec and design system: one primary action; refactoring-ui, hierarchy. The order of work is validate, then publish, and the most used button during writing is Save draft.
- **Suggested fix:** Save draft becomes outline (or secondary), Validate and preview is the solid button until a preview is current, then Publish to GMS becomes the solid one. Size S. VISIBLE.

#### 12. The "Updated 12s ago" line on the dashboard is announced every second

- **Where:** `src/app/(admin)/_components/live-refresh.tsx` line 76: `aria-live="polite"` on text that changes every second.
- **Rule or reference:** fixing-accessibility, announcements: live regions are for changes the person needs to hear.
- **Suggested fix:** remove the live region from the ticking text; announce only "Dashboard updated" after a refresh, or nothing. Size S. INVISIBLE.

#### 13. Words that belong to the build, not to staff

- "View weekly Python PDF" (`src/components/hr/timesheet/attendance-timesheet.tsx` line 376).
- "Organisation ID: gaa" and the "Short ID" column with values like "meteorological_department" (`src/components/hr/setup/organisation-identity.tsx` line 180, `departments-manager.tsx` lines 151 and 213).
- The sidebar spells the products three ways: "wxRegister", "WxWatch", "TAF/Metar Composer" (the page says "TAF / METAR Composer"); the register is "Weather Electronic Register", "Hourly register (wxRegister)" and "eRegister month workbook" in three places; the sidebar says "Team approvals", "Staff" and "Roles" where the pages say "Approvals", "Users" and "Roles & Permissions".
- "hover or read the Problems column" on a page also used by touch (`src/components/wxproducts/eregister-month-view.tsx` line 478).
- The search button shows the Mac shortcut sign to everyone, including Windows and phones (`src/components/layout/search-dialog.tsx` line 175).
- **Rule or reference:** web-design-guidelines, Content and Copy; refactoring-ui: one name per thing.
- **Suggested fix:** "Download weekly timesheet (PDF)"; hide identifiers behind a "Details" disclosure or drop them; pick one name per product and use it in the menu, the title and the browser tab; show "Ctrl K" off Mac and nothing on touch. Size S. VISIBLE.

### Polish

#### 14. Links that look like plain text

- `text-primary` is navy, almost the same as the body ink, so "View roster", "Review hours" (`src/components/hr/dashboard/hr-dashboard.tsx` line 124) and the dashboard's "Open desk" (`panel.tsx` line 35) are told apart only by weight or an arrow. The lane spec gives links `text-info`. Size S. VISIBLE.

#### 15. Notification rows

- Unread and hovered rows put `text-muted-foreground` on a tint (`src/components/notifications/notification-list.tsx` lines 78 to 79), the failure message has no "Try again" (lines 150 to 155), and the unread count badge is 10 pixels (`notification-bell.tsx` line 40). Size S. The contrast and retry are INVISIBLE; the badge size is VISIBLE.

#### 16. Page titles are not all built the same way

- The calendar's first-level heading is set at 18 pixels inside the card (`src/components/calendar/event-calendar.tsx` line 163) instead of the 24 pixel page title every other page has; the composer and the HR home page build their own header instead of `PageHeader`; the timesheet page has two first-level headings (the page title and the printable paper's); "Weather products" adds its own padding inside the shell's padding (`wxproducts/page.tsx` line 42), so it sits further in than every other page. Size S. Mostly VISIBLE.

#### 17. Leftover raw colours and small text

- Staff avatars and status dots (`src/components/users/users-columns.tsx` lines 37 to 84), the profile's error and verified boxes (`src/components/user-profile/UserProfileContent.tsx` line 62, `UserMetaCard.tsx` line 64), the "new" badge in the menu (`src/components/layout/nav-main.tsx` line 344), a system role badge (`src/components/roles/roles-columns.tsx` line 12) and the METAR notes (`eregister-workbook.tsx` line 649) use raw Tailwind colours, so presets do not re-skin them. Text of 10 or 11 pixels also appears in the roster legend and cells, the roles table and the dashboard's initials. Size S. Replacing colours with the semantic pairs is close to INVISIBLE in the default theme.

#### 18. Small copy and state details

- "Saving..." and "Loading profile..." use three dots where the rest of the portal uses the ellipsis character (`src/components/user-profile/UserInfoCard.tsx` line 394, `UserAddressCard.tsx` line 224, `UserProfileContent.tsx` line 55).
- The HR form buttons sit above the form (`leave-application-editor.tsx` lines 571 to 586), so on a phone the action comes before the questions; repeat them at the end or pin them.
- Read-only prefilled fields look exactly like editable ones apart from the hint below.
- HR Setup's tab row is cut at the right edge on a phone with no fade or arrow to show there is more, and its table is cut mid-word.
- The month workbook draws all 720 hours at once (web-design-guidelines, Performance: lists over 50 rows); `content-visibility: auto` on the rows would keep it quick on the office PCs.
- On the dashboard at desktop width, empty panels stretch to the height of their neighbours, leaving large blank boxes; align them to the top instead (this keeps every section visible).
- 113 inputs across the 43 phone pages have text under 16 pixels (20 on the forecast desk, 16 on Alerts, 34 in the CAP composer, and all 66 cells of a new observation at 14 pixels), so an iPhone zooms the page when one is focused (mobile-native, fix 4); set 16 pixels on touch devices only.
- Size S each. The copy and layout items are VISIBLE; the performance and zoom items are INVISIBLE.

## Documents that no longer match the app

Small drifts noticed while auditing. Nothing was edited.

- `docs/design/gaa-admin.md` says about 95 raw palette classes remain; the count is now 28 outside printable documents. Its "Last updated" is 24 September 2026.
- The lane spec's hit target floor (24 pixels) says nothing about touch, although the roster, clock in and approvals are now phone tasks.
- The lane spec does not record the owner's roster and HR colour decisions of 23 October 2026; adding them would have prevented finding 1.
- `apps/web/gaa-admin/AGENTS.md` says the sidebar's home link is named "GAA Admin home" while the product is shown to staff as the Grenada Meteorological Service portal.

## What could not be checked

- **A real phone or tablet.** Touch behaviour, the on-screen keyboard and zoom on focus were argued from the stylesheets and an emulated 390 pixel viewport. Mobile-native's rule is that these need a real device.
- **Anything that writes.** Nothing was saved, submitted, published, approved, rejected or sent, so success and failure messages, the publish confirmation, the sign and submit step, the Return dialog, toasts and the register's send and acceptance steps were read from code only.
- **Screens with data.** Staging had no roster period for November, an empty approvals inbox, no leave balance and no imagery, so the roster with shifts and absences, an approvals row and the HR home page with real numbers were judged from code. Finding 2 in particular needs a look with a real request in the inbox.
- **Other roles.** Only the staging test account was used. Screens that differ for an observer, a forecaster without publish rights, a department HR administrator or a member with read-only access were not seen.
- **Dark mode and presets as a user sets them.** Dark mode was forced by adding the `dark` class in the browser (the test account's saved preference was left alone); the brutalist, soft-pop and tangerine presets and the alternative fonts were not tried.
- **Screen readers and the full keyboard route.** Reasoned from the markup and the first tab stops, not run with a screen reader.
- **Not reached in code, seen only as one staging page each or not at all:** CAP composer and administration (11 pages), WxWatch (3), payroll (7), clock in, terminal punches, documents, training and reports, the calendar's event dialog, staff and roles beyond what issue #1688 covers, profile and notification preferences, bus (4), janitor (7), stores (8), IT tickets and resources. The NHC, climate bulletin and alerts editors were covered only through the shared product desk.
- **Printed and PDF output.** The printable papers follow print rules and were out of scope.
- **Production.** Only staging was visited, and staging can run older code than `dev`; each finding was confirmed in the `dev` code at the lines given.
- **Motion.** There is next to no motion, so the animation skills had little to review.
