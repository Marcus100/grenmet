# Design audit: Barrels account, the `account` app (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453, section 8)  
**Last updated:** 2026-11-15

## Scope and method

Surfaces audited, all in `apps/web/account`: the profile page (name, email, profile photo upload, replace and remove), My bookings (upcoming and past), the sign-in hand-off page, and the not-found and error pages.

The brief for this audit also named Security, Sessions and Organisations in the account app. They do not exist there yet: `/security`, `/sessions` and `/organisations` answer "Page not found" on staging, and `apps/web/account/AGENTS.md` lists them under "Not built yet". Those screens live in the `auth` app today and are audited in [auth-2026-11.md](auth-2026-11.md).

The rule for judging: a defect is a gap against this app's own lane spec ([`docs/design/account.md`](../account.md)) or a rule from a design skill, never a difference from another app.

Method:

1. Read the instructions (`AGENTS.md` at the root and in `apps/web/account`), the lane spec, the design system and design workflow notes and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`.
2. Checked where styles live before reporting anything. `src/app/globals.css` imports the shared touch layer `app-feel.css` (tap flash, `touch-action`, reduced motion are handled) and the shared token layer `@barrelsgd/ui/styles/globals` with no local tokens, as the spec says. Buttons come from the shared `Button`, fields from the shared `Input` and `Field`. Nothing in this audit repeats a gap those files already cover.
3. Read every page, component and the stylesheet, then applied the rules of these skills: web-design-guidelines (pinned rules), fixing-accessibility, refactoring-ui (through the lane spec), mobile-native, emil-design-eng and break-ui (long names and emails argued from the code). There is no motion in this app, so the animation skills had nothing to review.
4. Looked at the running staging app (`account.staging.barrels.gd`) with a scripted browser at 390 pixels (phone) and 1280 pixels (desktop), signed in with the staging test account: the hand-off prompt, the profile page, My bookings (the account has no bookings, so only the empty states), the not-found page, and 390 pixels with the browser asking for a dark scheme (to confirm the "light mode only" rule). To get past the hand-off prompt the test account pressed "Join Barrels account" once; that adds the account app to the test account's list of joined apps (it can be removed with "Leave" on the Apps tab of the sign-in app). Measurements were taken on the live pages. Screenshots were viewed during the audit and are not committed. No photo was uploaded, removed or replaced.
5. Compared with the saved reference flows where they apply, for ideas only: Railway's security and sessions overview ([two-factor setup](https://mobbin.com/flows/b9d19e77-5cb5-482e-9cec-2920a3f9ccd2)) is the pattern finding 2 points to; the Customer.io and Xero flows ([Customer.io](https://mobbin.com/flows/7fece37b-b393-4aa2-b261-fc6931c2a35e), [Xero](https://mobbin.com/flows/f6c97bc9-ef5d-49a7-a87c-65177ad11e85)) are about the Security screens that this app does not have yet.

How to read a finding:

- **Rule or reference** is the lane spec line, skill rule or reference behaviour behind it.
- **Size:** S is under half a day, M is about a day, L is several days or needs a decision first.
- **INVISIBLE** means people would not see a difference in normal use (accessibility, focus, keyboard, hidden hit areas, behaviour on failure). These can merge on green checks. **VISIBLE** means layout, colour or wording changes, so the owner reviews before and after screenshots first.

## What is already strong

- **It follows its spec.** One column up to `max-w-3xl`, a small "Barrels account" label, the person's name as the one first-level heading with the email beneath it, a secondary "Sign out of this app" button on the right (it wraps under the name on a phone), Inter, white paper and near-black ink, 32 pixel spacing between blocks. No Met Office colours or logo anywhere.
- **Light only holds.** With the browser asking for a dark scheme the page stays white, as the lane spec says.
- **It says what happened.** The photo rules are in words before the file is chosen ("JPEG, PNG or WebP, up to 5 MB. Your photo is cropped square and location details are removed."), a refused photo shows the API's own sentence, a saved photo says who can see it, and a failed read says "We could not check your current photo just now. Refresh the page to try again." without hiding the rest of the page.
- **Status lines use the right roles.** "Saving…" is a polite status, a refusal is an alert, the controls are disabled while a request runs, and the file picker is cleared so the same file can be chosen again.
- **My bookings is careful.** Upcoming and past are separate with their own pagers, each section fails on its own with an inline message, an unauthorised answer redirects once and cannot loop, times are labelled and shown in the viewer's zone after the page loads, and an empty section is still shown with a sentence rather than hidden.
- **Basics are right.** A skip link, a main landmark on both pages, page titles in the form "My bookings | Barrels account", a first-level heading on every page, no horizontal scroll at 390 pixels, and no console errors on any page visited.

## Findings

### Blocking

#### 1. A new person cannot reach their account without answering a confusing prompt (and on production not at all)

- **Where:** the first sign-in to the account app on staging lands on the sign-in app's "Join Barrels account?" screen (`apps/web/auth/src/app/continue/page.tsx`): "You'll use your Barrels account to sign in to Barrels account. You only need to do this once." with the Met Office logo above it. On production the sign-in secret is not set, so sign-in is off (`apps/web/account/AGENTS.md`). This is the known issue #1335.
- **Rule or reference:** lane spec, Principles ("Say what happened"); web-design-guidelines, Content & Copy. The account is the one app every person should have, so asking permission to use it is an extra step with no choice in it.
- **Why it matters:** the first screen of the account app is a question that cannot be answered sensibly, shown under another organisation's logo.
- **Suggested fix:** the account app should not ask (#1335, already tracked); until then, change the text to say what the button does and drop the circular sentence. Size M for the real fix, S for the text. VISIBLE.

### Should fix

#### 2. The account app is two pages and cannot reach the rest of the account

- **Where:** `src/components/account-nav.tsx` lists Profile and My bookings only. Security, Sessions, Apps and Organisations are on the sign-in host with a different look (Noto Sans, Met Office navy and a left panel, against Inter and Barrels navy here), and nothing in this app links to them. Nothing in the sign-in app links to the profile photo page either; its own Profile tab says "Edit in GAA Admin" and has no photo.
- **Rule or reference:** the owner's rule that the Barrels platform screens share one look and one set of patterns; lane spec, Principles ("One task per block"). Railway's account area shows Security, Sessions and Apps as sections of one account.
- **Why it matters:** a person who wants to change their sign-in settings or see where they are signed in has no way from the "Barrels account" page, and the photo upload is hard to find from the other side.
- **Suggested fix:** until the migration (ADR-0057, steps 2 and 3) is done, add "Security and sign-in" and "Sessions" links to the nav that open the sign-in host in the same tab, and a "Profile photo" link from the other side. Size S for the links; L for moving the screens. VISIBLE.

#### 3. Controls are smaller than the spec's 44 pixels

- **Where:** measured on staging at 390 pixels: "Sign out of this app" 152 by 32; the nav links "Profile" 43 by 20 and "My bookings" 86 by 20; the file input 342 by 32; the not-found button "Back to your account" 164 by 32. The spec says "targets are 44 px or more".
- **Rule or reference:** lane spec, Principles ("Phone first. 375 px is the reference width; targets are 44 px or more"); mobile-native.
- **Why it matters:** a 20 pixel nav link is easy to miss and the sign-out button sits next to the person's name.
- **Suggested fix:** give the nav links and the buttons a 44 pixel minimum height (padding only), keep the look. Size S. INVISIBLE for the links (hit area only), VISIBLE for the taller buttons.

#### 4. The photo has a low-contrast fallback, and the upload control is the browser's own

- **Where:** `src/components/profile-photo/profile-photo-panel.tsx`. The spec's avatar is the soft surface colour with ink text. The page uses the shared fallback: grey text (`#6b7280`) on a pale blue disc (`#e4eef7`), measured 4.11 to 1 at 18 pixels regular weight, below the 4.5 the standard asks for. The file chooser is the browser's native "Choose File / No file chosen" control and the upload starts the moment a file is picked, with no preview before it is saved.
- **Rule or reference:** lane spec, components (`avatar-initials`: surface background, ink text) and the Contrast section ("Small text uses ink, secondary or muted only"); fixing-accessibility, contrast.
- **Why it matters:** the initials are a person's identity on this page, and the picker looks unfinished next to everything else; a face photo uploaded by a mistaken tap is public to everyone who shares an organisation.
- **Suggested fix:** set the fallback text to ink, restyle the picker as a 44 pixel "Choose photo" button, and show the new picture with "Save" and "Cancel". Size S for the colour, M for the picker. VISIBLE.

#### 5. My bookings lists bookings that cannot be acted on

- **Where:** `src/components/my-bookings/booking-list.tsx`. A booking shows the business name (a link to that business's booking page), the service, the time and the status. There is no price, no way to change or cancel, no business contact and no "Add to calendar". `AGENTS.md` notes that the API does not return a manage link yet.
- **Rule or reference:** Fresha's customer appointments page ([booking an appointment](https://mobbin.com/flows/0ae100c9-f9bb-4a81-8837-772fd8ac330c)) pairs the list with "Manage appointment", the venue's details and the booking reference; the bookings audit makes the same point about reaching the business (finding 1 in [bookings-2026-11.md](bookings-2026-11.md)).
- **Why it matters:** a person looking at an upcoming booking in their own account has nothing to press if they cannot attend.
- **Suggested fix:** when the API returns a manage link, show "Change or cancel" on each upcoming row; until then, show the business contact. Size M (needs the API field). VISIBLE. This is not seen with real data (see below).

#### 6. "Sign out of this app" does not say what stays signed in

- **Where:** the header button on the profile page posts to `/auth/logout`, which ends only this app's session (`AGENTS.md`). The person remains signed in on the sign-in host and in every other app.
- **Rule or reference:** lane spec, Principles ("Say what happened").
- **Why it matters:** someone on a shared computer who presses "Sign out" believes they have signed out of their account.
- **Suggested fix:** after sign-out show one sentence ("You are signed out of the account page. You are still signed in to other Barrels apps.") with a link to "Sign out everywhere" on the sign-in host. Size S. VISIBLE.

### Nice to have

#### 7. The navigation looks like body text

- The two nav links sit above the page's identity block and differ from ordinary links only by an underline on the current one (`account-nav.tsx`); the underline also appears on hover for the other. A person does not read it as a set of tabs, and the label, name and email are pushed below it. Use a visible current state (weight or a bar) and, if the layout allows, keep the identity block first. Lane spec, Layout. Size S. VISIBLE.

#### 8. Wording

- Both empty sections say "Bookings you make while signed in appear here." Under Past the line should say what will be listed there ("Past bookings will be listed here."), and "while signed in" may confuse a person who booked as a guest (the lane spec's own rule is to say what is and is not shown). Size S. VISIBLE.

#### 9. The not-found and hand-off pages are not full pages

- The not-found page wraps its content in a `div` with the id `main-content` instead of a `main` landmark, so the skip link's target is not a landmark; the page also has no `Barrels account` label. Size S. INVISIBLE for the landmark.

## Documents that no longer match the app

These are small drifts noticed while auditing. Nothing was edited.

- `docs/design/account.md` describes the page header as the label, name, email and sign-out only; the app also has the Profile and My bookings nav at the top of the page.
- `apps/web/account/AGENTS.md` says that sign-in works on staging but stops at the "Join" prompt; that is still true on 15 November (finding 1).

## What could not be checked

- **A real phone.** Sticky hover, the on-screen keyboard and the file picker on a phone were argued from the code and tested only in an emulated viewport.
- **Uploading a photo.** No photo was uploaded, replaced or removed, so the saving, success and refusal states, and the "Remove photo" button, were read from code only.
- **My bookings with real data.** The test account has no bookings, so rows, the pagers, the business link, long business or service names and the time zone behaviour were audited from code only.
- **Security, Sessions and Organisations in this app.** They do not exist yet.
- **The error boundary.** Read from code only; the "Sign-in did not finish" page was loaded once and reads correctly.
- **Screen readers and the full keyboard route.** Reasoned from the markup, not run with a screen reader.
- **Production.** Only staging was visited; sign-in is off on production.
