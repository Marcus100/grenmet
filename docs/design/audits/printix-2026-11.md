# Design audit: Printix Scanner (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8)  
**Last updated:** 2026-11-23

## Scope and method

Surfaces audited, all in `apps/pwa/printix` and the shared phone-app kit `packages/pwa-kit`:

- the gate scanner at `/`: the unpaired welcome, a bad pairing link, the scanning screen (signal badge, ticket list line, live count, camera, torch and camera switch, "Type a number", unpair), the full-screen results (admitted, already admitted, void, not a ticket, event closed, too many scans, no signal, not checked), the typed-number sheet, the pairing-problem screen, the "new version" banner and the "not connected" screen;
- the organiser screens at `/organiser`: sign-in, choose an organisation, events, create an event, and the event page (counts, live dashboard, gate codes and the one-time QR code, tickets, import, close event).

The yardstick is the job, not another app: this scanner works a live gate on Saturday 26 December 2026, held in one hand, outdoors, at night, on cheap phones with poor signal, with a queue waiting. A defect is a gap against the lane spec ([`docs/design/printix.md`](../printix.md)), a rule from a design skill, or something that slows or misleads the person at the gate. The 26 December event uses printed tickets only.

Method:

1. Read the instructions (`AGENTS.md` at the root, in `apps/pwa/printix` and in `packages/pwa-kit`), the lane spec, the rehearsal checklist (`docs/operations/printix-rehearsal-checklist.md`) and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. The app's stylesheet (`apps/pwa/printix/src/styles/app.css`) imports Tailwind, then the shared touch layer `packages/ui/src/styles/app-feel.css`, then the kit's `packages/pwa-kit/src/styles/base.css`. Between them they already switch off the tap flash, set `touch-action: manipulation` on controls, stop a long press selecting a button's words, switch off pull-to-refresh and page bounce, cancel animation for people who ask for less motion, and fade a replaced screen in. Tailwind 4 already limits `hover:` styles to devices that can hover, so no hover style sticks after a tap. Nothing in this audit repeats a gap those files cover. Because the tap flash is off, each control needs its own pressed state; that one is reported (finding 15).
3. Read every screen and component listed above, then applied the rules of these skills: ui-polish-pass (the states table, touch, slow or no connection, token discipline), mobile-native, gestures, web-design-guidelines (pinned rules), fixing-accessibility, emil-design-eng, break-ui (worst-case data: a 55-character event name, a 40-character gate name, counts in the thousands) and review-animations.
4. Looked at the staging copy (`scan.staging.barrels.gd`) with a scripted browser, touch emulation and a fake camera, at 360 by 640 pixels (a small, cheap phone) and 390 by 844 pixels, plus one landscape pass. **Every call to the server was answered inside the test browser with made-up data and never left it**: the three addresses the scanner called (`/printix/public/summary`, `/printix/public/offline-tickets`, `/printix/public/admissions`) were all intercepted, any other outside call was blocked, and the pairing used was a made-up value. No ticket was admitted and nothing was submitted to the staging server. Each result screen was produced through "Type a number" against those made-up answers. The organiser sign-in screen was opened and its empty-field message seen; no code was requested. The 52 screenshots are kept outside the repository (`private/design-refs/audit-2026-11-23/printix/`, gitignored).
5. Measured the palette's contrast ratios and the position and size of every button at both widths.

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or gate need behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means gate staff and organisers would not see a difference in normal use (accessibility, focus, keyboard, hit areas, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.
- A fix in `packages/pwa-kit` reaches every phone app, so it needs the kit's tests and each phone app's tests, and care before 26 December.

## What is already strong

- **A "no" can never look like a "yes".** Every server answer maps to one result in one tested file (`src/lib/scan-outcome.ts`). An answer the app does not understand, a failed check and no signal are all "not checked", never green. Admitted clears itself after one second; everything else waits for "Scan next".
- **The result reads from arm's length.** The result fills the screen, the title is 48 pixels and bold, the detail 24 pixels and bold, and the result never animates (lane spec, Motion). Contrast holds: dark text on the green is 5.1 to 1, light text on the red 5.95 to 1, and grey helper text on the dark background 7.5 to 1.
- **No signal is designed, not an afterthought.** An Online or Offline badge with a count of admissions waiting to send, the saved ticket list's time, a clear notice when offline checking is not available ("use the paper list"), conflicts in plain sentences, and warnings before unpairing would lose unsent admissions. After one timed-out check the next scans skip the wait for 20 seconds.
- **The same ticket is checked once.** A ticket held in front of the camera after its result is not submitted again (`src/lib/scan-gate.ts`), and reads are ignored while a check is pending, a result is showing or the sheet is open.
- **Sound and vibration repeat the answer.** Two rising beeps for yes, one long low buzz for no, with different vibration patterns, started by the "Start scanning" tap so iPhone allows sound.
- **Touch targets are right.** Measured at 360 and 390 pixels: no control is under 44 pixels in either direction; "Start scanning", "Type a number" and "Check ticket" are 56 pixels tall and "Scan next" 64. No screen scrolls sideways at either width.
- **Phone details are handled.** `viewport-fit=cover` with top and bottom safe-area padding on every screen, `min-h-dvh` instead of the old full-height unit, 16 pixel or larger inputs so iPhone does not zoom, a numeric keypad for the printed number, the screen kept awake, a dark theme colour, an install hint, and a "new version" banner that never reloads by itself (a reload would stop the camera).
- **The typed-number sheet behaves like a phone's own.** It slides up, follows the finger, closes on a drag down, a tap outside or Cancel, puts focus in the field, starts empty each time and ties its error to the field.
- **The organiser side is careful.** Destructive steps (void, cancel a gate code, close the event) ask first in a sentence that says what happens, take focus and give it back; the gate code is shown once, hides after two minutes or when the page is hidden, and offers no copy or share; every part of the dashboard is always shown and says so in a sentence when it has nothing to count; the arrivals chart has a sentence and a table beside it; long names wrap instead of pushing the layout.
- **Printix look with Barrels shown.** One dark look, Printix palette only, no client marks, and "Sign in with your Barrels account" on the organiser sign-in.

## Findings

### Blocking

#### 1. The "yes" and the "no" screens differ mainly by colour: there is no icon, and both headlines end in the same word

- **Where:** `apps/pwa/printix/src/components/result-overlay.tsx` (the result, lines 43 to 60) and the titles in `src/lib/scan-outcome.ts` ("Admitted", line 52; "Already admitted", line 72).
- **What happens:** the green screen says "Admitted" and the red screen says "Already admitted", both in the same 48 pixel type at the top left. There is no tick, cross or other shape. The only other difference is the "Scan next" button on the red screen. The green and the red are close in brightness (1.7 to 1 against each other), so a person who does not tell red from green, or a screen washed out by a floodlight, is left with one word to tell "let them in" from "stop them".
- **Rule or reference:** the gate rule for this audit: colour plus icon plus word, never colour alone. The comment at the top of `result-overlay.tsx` says "Colour carries the meaning". Web-design-guidelines, Accessibility: do not rely on colour alone. The organiser dashboard already uses a different word for the same fact ("Already in").
- **Why it matters:** this is the screen the whole app exists for, read hundreds of times in a night, often at a glance while looking at the guest. The most common refusal at a gate is a ticket used twice, and it is the one whose headline most resembles a yes.
- **Suggested fix:** add a large shape above the title (a tick on green, a cross or a raised-hand stop sign on red, a question mark on the neutral "not checked" screen), drawn inline so it works with no signal; and lead the refusals with a stop word, for example "Stop: already in", "Stop: void ticket", "Stop: not a ticket", keeping the time and gate in the detail line. Size S. VISIBLE.

#### 2. An iPhone that has the scanner on its Home Screen cannot be paired, because the app has no way to take a pairing code itself

- **Where:** `src/components/pairing-screens.tsx` (`PairingWelcome`, lines 11 to 49): the screen is text only, with no button. Pairing happens only when a link with the code is opened (`src/components/gate-app.tsx`, lines 58 to 92).
- **What happens:** the gate code is a QR code that the phone's own camera opens in the browser. On iPhone the Home Screen app and Safari keep their data apart, so the code pairs Safari, not the installed app. The rehearsal checklist already warns about this and falls back to "use the scanner in a Safari tab". In a Safari tab the address bar takes screen space, the portrait lock does not apply (finding 11), and Safari deletes the saved ticket list and the app after about seven days without use.
- **Rule or reference:** `apps/pwa/printix/AGENTS.md`, Offline: "Gate phones must be installed to the Home Screen". Mobile-native: test as an installed app if that is a target. Ui-polish-pass, states: the unpaired state must offer the next step.
- **Why it matters:** on the night, some gate staff will bring iPhones. The app's own advice (install it) and its only way to pair (open a link) contradict each other on those phones, and the answer is discovered at the gate.
- **Suggested fix:** put a "Scan the gate code" button on the welcome screen that opens the kit's camera for a QR code and pairs in place; it reads the same link, so the organiser side does not change. Then the installed app can be paired on every phone, and the screen has an action instead of a paragraph. Decide at the 14 December rehearsal at the latest. Size M. VISIBLE.

### Should fix

#### 3. Nothing tells the person that a barcode was read, and the wait is one small line under the camera

- **Where:** `src/components/gate-console.tsx`, the "Checking ticket…" line (lines 234 to 242) and `check` (lines 125 to 165).
- **What happens:** when the camera reads a barcode there is no beep, no vibration and no change to the green frame. The only sign is the words "Checking ticket…" in 16 pixel type below the camera picture, which on a small phone is at the bottom edge of the screen. With good signal the result follows quickly. With poor signal the check waits up to five seconds before the saved list is used.
- **Rule or reference:** emil-design-eng, "Buttons must feel responsive" (feedback at the moment of the action); web-design-guidelines, Touch and interaction; ui-polish-pass, slow connection: "what the user sees while waiting".
- **Why it matters:** for those seconds the person does not know whether to keep holding the ticket, move it closer or try again, and the guest waits. Poor signal is the expected condition at this gate.
- **Suggested fix:** on a read, give a short tick of vibration, turn the frame solid and show "Checking…" in large type over the camera picture itself; if two seconds pass, add "Weak signal, still checking". Size S to M. VISIBLE.

#### 4. The scanning screen is taller than a small phone, and the camera comes third

- **Where:** `gate-console.tsx`, the order of the header, `OfflineStatus`, `CountBar`, the camera and the footer (lines 199 to 309); the camera's size in `packages/pwa-kit/src/components/barcode-camera.tsx` (line 245).
- **What happens:** measured at 360 by 640 pixels with the camera on, the page is 705 pixels tall, and 741 to 761 after the first scan, because the "Checking ticket…" and "Last check" lines appear and push everything below them down by 36 pixels or more. "Type a number" then ends at 669 pixels, below the screen edge, and "Unpair this phone" at 725. In a browser tab the address bar takes a further 56 pixels or so. The live count, a figure for the supervisor, has the largest type on the screen (30 pixels) and sits above the camera, which gets under a third of the screen. When the person scrolls down to reach "Type a number", the Online or Offline badge scrolls out of view.
- **Rule or reference:** lane spec: "Buttons are large ... and sit within thumb reach" and "Signal is always shown". Mobile-native: an app shell fits the visible area. Ui-polish-pass: layout must not jump when content arrives.
- **Why it matters:** the one-handed thumb has to scroll to reach the fallback button, the button moves after the first scan, and the signal badge is not in view while scanning.
- **Suggested fix:** make the screen exactly one screen tall: a single top row with the signal badge and a short count ("3,481 of 12,500 in"), the camera filling the middle, and "Type a number" pinned at the bottom. Keep the full count, "Not yet in", "By gate", the ticket list time and conflicts one tap away in the existing disclosure style (nothing is removed). Reserve the line for "Checking" and "Last check" so nothing shifts. Size M. VISIBLE.

#### 5. The camera stops whenever the phone leaves the app and never starts again by itself, and a phone that cannot keep its screen awake says nothing

- **Where:** `barcode-camera.tsx`, the `visibilitychange` handler (lines 223 to 235); `packages/pwa-kit/src/lib/wake-lock.ts`, the silent refusal (lines 33 to 35).
- **What happens:** a call, a notification pulled down, a glance at a message or the screen locking stops the camera, and on return the person sees a dark box and must tap "Start scanning" again. The wake lock is asked for silently; on a phone or browser that refuses it (battery saver on many cheap Android phones, older iPhones), the screen dims and locks after the phone's own timeout and the same thing happens, repeatedly, with no explanation.
- **Rule or reference:** the gate need "speed back to scanning" and "screen wake". Web-design-guidelines, Navigation and state: restore state on return.
- **Why it matters:** each interruption costs a tap and a moment of confusion with a guest waiting, and a phone without the wake lock will do this every minute or two all night.
- **Suggested fix:** when the page becomes visible again and the camera was on before, start it again without a tap (the camera permission is already granted; fall back to the button if the browser refuses). When the wake lock is refused, show one line once: "This phone may dim its screen. Set the screen timeout to the longest setting." Add both to the rehearsal checklist. Size S to M. The restart is INVISIBLE; the notice is VISIBLE.

#### 6. The camera controls are three text pills that do not fit a small phone, and "Torch off" can be read two ways

- **Where:** `barcode-camera.tsx`, the control row (lines 259 to 278) and the shared `CONTROL` style (lines 56 to 57).
- **What happens:** "Switch camera" measures 136 pixels wide and "Stop camera" 121. On a phone with a torch a third pill ("Torch off", about 98 pixels) joins them: about 371 pixels of buttons and gaps in a row that is 304 pixels wide at 360 pixels, so the labels wrap onto two lines or the pills squeeze (the fake camera in the test browser has no torch, so this is worked out from the measured widths). The pill reads "Torch off" when the torch is off, which also reads as "tap to turn the torch off"; it also sets `aria-pressed` while changing its label, so a screen reader hears the state twice. The pills sit over the lower third of the picture, just under the green frame, and have no pressed state.
- **Rule or reference:** the gate need for a torch at night. Fixing-accessibility, accessible names: a toggle keeps one name and reports its state. Break-ui: wrapped buttons at the narrowest width.
- **Why it matters:** the torch is the control most needed at a night gate and the one most likely to be mis-tapped or misread. "Stop camera" beside it is rarely needed and ends scanning.
- **Suggested fix:** make the torch a single clear toggle with an icon and the word "Torch", lit when on; make the camera switch an icon button with a spoken name; move "Stop camera" out of the picture (or drop it, since leaving the app already stops the camera). Kit change. Size S. VISIBLE.

#### 7. "Too many scans" is shown as a red refusal, although no ticket was refused

- **Where:** `src/lib/scan-outcome.ts`, the `rate-limited` case (lines 162 to 169), which uses the `refused` tone.
- **What happens:** when the server asks the phone to slow down, the screen is the same full red as "Void ticket", with "Too many scans. Wait 12 seconds, then scan again."
- **Rule or reference:** lane spec: "`stop` fills the screen ... for one that may not [enter]"; the file's own rule that an answer which is not an answer is "unchecked" and neutral, as "No signal" and "Could not check this ticket" already are.
- **Why it matters:** at arm's length red means "turn this person away". Here the guest's ticket was never checked.
- **Suggested fix:** use the neutral "not checked" look, and count the wait down on the "Scan next" button so the person knows when to try. Size S. VISIBLE.

#### 8. "Scan next" can be pressed by accident before the refusal is read

- **Where:** `result-overlay.tsx` (the button, lines 52 to 59) with `gate-console.tsx` (`dismiss`, lines 112 to 115).
- **What happens:** the refusal appears with its "Scan next" button already live, in the same thumb zone as the buttons that led to it. Measured at 390 pixels, "Scan next" covers 756 to 820 pixels down the screen and "Type a number" 716 to 772; at 360 pixels "Scan next" starts exactly where "Check ticket" in the sheet ended. A second tap, or a thumb already resting there, dismisses the red screen at once. Only a 14 pixel grey "Last check" line remains.
- **Rule or reference:** emil-design-eng and web-design-guidelines: guard an action that discards information; gestures, touch checklist.
- **Why it matters:** a refusal that vanishes unread at a busy gate looks like nothing happened, and the guest walks in.
- **Suggested fix:** ignore taps on "Scan next" for the first 400 milliseconds after a refusal appears, and show the last refusal as a clearly visible line on the scanning screen until the next scan. Size S. INVISIBLE.

#### 9. Sound and vibration cannot be tested before the queue arrives, and on an iPhone with the ring switch off there is neither

- **Where:** `packages/pwa-kit/src/lib/feedback.ts` (tones, lines 18 to 24; volume, line 32; `play`, lines 87 to 108) and `gate-console.tsx` (lines 103 to 107).
- **What happens:** sound starts with the "Start scanning" tap and is first heard on the first real ticket. iPhones do not vibrate from a web app, and the iPhone ring switch silences this kind of sound, so an iPhone on silent gives no signal other than the screen. Nothing on the scanning screen says whether sound is working. "Refused" and "not checked" play the same buzz. The tones are set to 40 percent of full volume.
- **Rule or reference:** the gate need for sound and vibration; lane spec and kit note: "sound and vibration only repeat" the screen, which is only true when they work.
- **Why it matters:** a gate person looking at the guest relies on the beep. Finding out at the first ticket that a phone is silent is too late.
- **Suggested fix:** play the "yes" beep once on "Start scanning" so the person hears it and can raise the volume, add a small "Test sound" control beside the count details, raise the volume toward full, and add "ring switch on, volume up" to the rehearsal checklist. Consider a double buzz for "not checked" so it differs from a refusal. Size S to M. The test control is VISIBLE; the rest is INVISIBLE.

#### 10. The phone does not say which gate it is paired to

- **Where:** `gate-console.tsx`, the header (lines 199 to 212): the small word "Paired" and the event name. `apps/pwa/printix/AGENTS.md` records that the server does not tell the scanner its gate.
- **What happens:** each gate code is made for a named gate, but once a phone is paired it shows only the event. A supervisor handing out phones, or a person moved from one gate to another, cannot check that the phone in their hand is the North gate phone.
- **Rule or reference:** web-design-guidelines, Navigation and state: show where you are. The organiser dashboard flags a quiet phone by gate, so the two screens cannot be matched up.
- **Why it matters:** the dashboard's per-gate counts and the "already admitted through North" message are only as good as the phones being where their codes say.
- **Suggested fix:** return the gate name with the pairing's summary and show it in place of "Paired" ("North gate"). Needs a small server change (FastAPI `printix` domain) and the generated client. Size M. VISIBLE.

#### 11. Turned sideways in a browser tab, the camera drops below the screen

- **Where:** `public/manifest.webmanifest` (line 9, `"orientation": "portrait"`), which applies only to the installed app; `gate-console.tsx` layout.
- **What happens:** measured at 640 by 360 pixels, "Start scanning" sits 390 pixels down a screen that is 360 pixels tall, so the whole camera is below the fold, and the left and right safe-area insets are not padded. Every phone that is not installed (and every iPhone that had to fall back to a Safari tab, finding 2) can rotate.
- **Rule or reference:** the gate need for a portrait lock; mobile-native, safe areas: "Test in landscape once".
- **Why it matters:** a phone tilted while reaching for a ticket flips the layout and the camera vanishes.
- **Suggested fix:** in landscape, put the camera beside the status column so it stays on screen, pad the side insets, and say "Turn the phone upright" where the height is under about 420 pixels. Size S. INVISIBLE in normal upright use.

#### 12. On event night the organiser's two urgent jobs are the hardest to reach: making a gate code and finding one ticket

- **Where:** `src/organiser/event-screen.tsx` (the live dashboard is placed before the gate codes, lines 135 to 150) and `src/organiser/tickets-section.tsx` (paging only, lines 260 to 305).
- **What happens:** on a phone the gate lead scrolls past the counts, the pace figures, the arrivals chart, the gates, the refusals, the recent scans and the report to reach "New gate code". To void a lost ticket the organiser must page through the list 50 at a time; 12,500 tickets is 250 pages. There is no search by printed number (the server's list takes a state filter only).
- **Rule or reference:** lane spec: organiser screens "also work on a phone at 375 px"; ui-polish-pass, states: many items. The rehearsal checklist tells the organiser to "find the printed number".
- **Why it matters:** both jobs happen at the gate, on a phone, with someone waiting.
- **Suggested fix:** put short jump links under the event title ("Gate codes", "Tickets", "Live", "Report") or move gate codes above the dashboard while the event is open; add a "Find a ticket by its printed number" field to Tickets, backed by a search on the server's list. Size M for the links, L for search (server change). VISIBLE.

#### 13. Organiser forms other than sign-in do not put focus back on the field that needs fixing

- **Where:** `src/organiser/gate-codes-section.tsx` (`GateCodeForm`, the "Give the gate a name" message) and `src/organiser/create-event.tsx`. Neither sets `aria-invalid`, ties the message to its field or moves focus; only `sign-in-screen.tsx` does.
- **Rule or reference:** lane spec, organiser screens: "Errors are one plain sentence in the alert colour, announced to screen readers, with focus put back on the field that needs fixing." Fixing-accessibility, forms and errors.
- **Why it matters:** on a phone the message appears below the fields, the keyboard has closed, and the person has to find and tap the field again; a screen reader user is not told which field is wrong.
- **Suggested fix:** follow the sign-in screen: mark the field invalid, link the message with `aria-describedby`, and focus the field. Size S. INVISIBLE.

#### 14. The organiser screens have no addresses, so the phone's Back button leaves the app and a reload loses the event

- **Where:** `src/organiser/organiser-app.tsx` (the current screen is kept in component state, lines 225 to 296).
- **What happens:** opening an event, "New event" and choosing an organisation do not change the address. The Android Back gesture or the browser's Back button leaves `/organiser` altogether; a reload, or the phone clearing the tab from memory, returns to the events list.
- **Rule or reference:** web-design-guidelines, Navigation and state: the address reflects the state and Back works.
- **Why it matters:** Back is the most used gesture on an Android phone. On event night it throws the organiser out of the event page they were watching.
- **Suggested fix:** keep the event in the address (for example `/organiser?event=<id>`) with history entries, so Back returns to the list and a reload reopens the event. No secret is involved. Size M. INVISIBLE.

#### 15. Many controls have no pressed state

- **Where:** the camera pills (`barcode-camera.tsx`, `CONTROL`), "Unpair this phone", "Keep pairing" and the red confirm (`gate-console.tsx`, lines 263 to 308), "Cancel" in the sheet (`typed-entry.tsx`), "Reload" (`update-banner.tsx`), "Install on this phone" (`install-hint.tsx`), "By gate" and "Conflicts" (`count-bar.tsx`, `offline-status.tsx`), and every organiser button that uses `BUTTON_SECONDARY` or `BUTTON_ROW` (`src/organiser/styles.ts`, lines 13 and 15), which covers the event rows, "Sign out", "Cancel code", "Keep it", "Previous" and "Next".
- **Rule or reference:** `docs/agents/extended-rules.md`: "Because the tap highlight is off, every tappable control needs its own `:active` state." Mobile-native, "Tap feels laggy". The main buttons already press in (`active:scale-[0.98]`).
- **Why it matters:** with gloves of sweat, glare and a cheap touch screen, a button that does not react looks like a tap that did not register, and gets tapped twice.
- **Suggested fix:** add the same press-in, or a lighter background while pressed, to these. Size S. INVISIBLE.

### Polish

#### 16. The welcome screen is a dead end

- **Where:** `pairing-screens.tsx`, `PairingWelcome`. It has two paragraphs, no button, no Barrels credit and no link to the organiser sign-in, and it says "your administrator" where the organiser screens and the checklist say "organiser or gate lead". The kit's "Install on this phone" button (`install-hint.tsx`, lines 72 to 80) is about 36 pixels tall.
- **Rule or reference:** lane spec: Barrels shown where it helps; controls at least 44 pixels.
- **Suggested fix:** with finding 2's "Scan the gate code" button as the main action, add "Organiser? Sign in" as a link to `/organiser`, a small "Run by Barrels Grenada" line, the same role words as elsewhere, and a 44 pixel install button. Size S. VISIBLE.

#### 17. A long event name is cut off at the end

- **Where:** `gate-console.tsx` (line 204, `truncate`). "Boxing Day Bash at the National Stadium Car Park 2026" showed as "Boxing Day Bash at the National …".
- **Rule or reference:** break-ui: wrap text the person needs in full to identify something; cut in the middle when items differ at the end. Two events on one night often differ only at the end ("… General", "… VIP").
- **Suggested fix:** allow two lines. Size S. VISIBLE.

#### 18. Times follow the phone's settings and show a leading zero

- **Where:** `scan-outcome.ts`, `formatTime` (lines 30 to 39). The screens read "Admitted at 07:14 PM" and "Ticket list from 04:35 PM". The organiser screens use Grenada time on purpose; the gate uses whatever the phone is set to.
- **Why it matters:** a phone set to another time zone shows a different admission time from the dashboard the supervisor is reading.
- **Suggested fix:** use Grenada time here too, and `hour: "numeric"` so it reads "7:14 PM". Size S. VISIBLE.

#### 19. The typed-number field is hard to see as a field, and its hint looks like a value

- **Where:** `typed-entry.tsx` (lines 77 to 95). The field's background against the sheet is 1.12 to 1 and its border 1.31 to 1; the same border is used on every organiser field (`styles.ts`, `FIELD`). The placeholder is "e.g. 042…" in the same typeface as a typed number.
- **Rule or reference:** the accessibility standard asks for 3 to 1 on the edge of a control; lane spec: "placeholders never replace" labels (the label is present, so this is polish). Mobile-native: `enterkeyhint`.
- **Suggested fix:** a lighter border (the `muted` colour gives 6.7 to 1), no example value or a clearly different one, and `enterKeyHint="go"` so the keyboard's key says what it does. Size S. VISIBLE.

#### 20. Small hardening

- A very long printed number or gate name with no spaces cannot wrap on the result screen (`result-overlay.tsx`, lines 48 to 49: add `overflow-wrap: anywhere`). INVISIBLE.
- The result screen covers the scanning screen but leaves its buttons reachable by keyboard and screen reader; mark the screen behind as inert while a result shows. INVISIBLE.
- The gate's "Unpair this phone?" confirm does not take focus or return it, although the organiser confirms do (`use-confirm-focus.ts`). INVISIBLE.
- The live-count bar animates its width (`count-bar.tsx`, line 49); review-animations asks for transform only. Use a horizontal scale. INVISIBLE.
- "Yes, cancel it" for a gate code is the bright green main button (`gate-codes-section.tsx`), the colour that means "go" everywhere else, while the gate's unpair confirm is red. Pick one treatment for a destructive confirm. VISIBLE.
- The "Allow typed numbers" switch is a 24 pixel box; make the whole row the target. INVISIBLE.
- Both sign-in code fields ask the phone for a one-time code (`autoComplete="one-time-code"`), so an iPhone may offer the emailed code for the authenticator field; "auth.barrels.gd/security" is text, not a link. INVISIBLE and VISIBLE in turn.
- Size S in total.

#### 21. Wording

- The events empty state says "No events yet. Events are set up by an organiser; creating events comes in the next step." while the "New event" button sits above it (`events-screen.tsx`, lines 111 to 116). Say "No events yet. Tap New event to set one up." for an organiser, and "Ask an organiser to create the event." for a gate lead.
- "Reading with the app's own barcode reader. Nothing is sent except the ticket value." takes two lines under the camera on every phone, all night (`barcode-camera.tsx`, lines 309 to 317). It is a note for engineers; move it into the details.
- "Not a ticket" (camera) and "Not on this event" (typed) are the same answer with different headlines; "Not on the ticket list" is the offline version. One headline with the reason in the detail is easier to learn.
- Size S. VISIBLE.

## Documents that no longer match the app

Small drifts noticed while auditing. Nothing was edited.

- `apps/pwa/printix/AGENTS.md` says the staging copy is "planned; no project, DNS record or deploy exists yet". `https://scan.staging.barrels.gd` answers, and its security header names `https://api.staging.barrels.gd`.
- `apps/pwa/printix/public/_headers` says the file is "copied to out/ by next build"; the app is built with Vite.
- `docs/operations/printix-rehearsal-checklist.md` says a typed number is "up to six digits"; the field allows 32 characters.
- `docs/design/printix.md` says `stop` "belongs to refusal results", yet it is also the alert colour for form errors, the bad-link notice, the pairing-problem panel and the unpair confirm. Either is workable; the spec should say which.

## What could not be checked

- **A real phone.** Everything here was read from code or seen in an emulated phone screen. Mobile-native's rule is that these need hardware: how fast the camera focuses on the printed barcode at night, the torch, glare on the green and red screens, the on-screen keyboard against the typed-number sheet, the notch and home-indicator padding, sticky hover and tap delay.
- **Sound and vibration.** The test browser has no speaker or motor. Whether the beeps are loud enough at a noisy gate, and what an iPhone on silent does, need the rehearsal.
- **Screen wake.** Whether the wake lock holds on the actual gate phones, including with battery saver on.
- **The torch control.** The fake camera has no torch, so the torch pill was never on screen; finding 6's overflow is worked out from measured widths.
- **A real barcode read.** The fake camera shows a test pattern, so every result came from "Type a number". The camera-read path (the same-ticket guard, the offline "Admitted, will be sent later" screen, "Not on the ticket list") was read from code and tests only.
- **The installed app.** Portrait lock, the status bar, the "new version" banner and the offline opening were read from code; the service worker was switched off in the test browser so the made-up answers could be used.
- **iPhone pairing (finding 2).** Taken from the rehearsal checklist's own warning and the code, not tried on an iPhone.
- **Signed-in organiser screens.** No sign-in was made (it would send an email and needs an authenticator), so the organisation picker, events, create event, the event page, the dashboard, gate codes and the QR code, tickets, import and close event were audited from code only. Only the sign-in screen and its empty-field message were seen.
- **Whether staging matches `dev`.** The staging copy is uploaded by hand; the audit did not confirm which commit it was built from. The code read is `origin/dev` at `29ab9d67d`.
- **Production** (`scan.barrels.gd`) was not opened.
- **Screen readers and a full keyboard pass:** reasoned from the markup, not run.
- **Reference flows.** No Mobbin comparison was made; the yardstick was the gate itself.
