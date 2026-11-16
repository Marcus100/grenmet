# Printix Scanner (`@barrelsgd/pwa-printix`)

Port **3064** (local dev only). A React app built with Vite (app-first, no
Next.js: owner decision, 16 Nov 2026), written to `out/` as files only.
Entry page `index.html`, start file `src/main.tsx`, install manifest
`public/manifest.webmanifest`, Inter shipped in `public/fonts/` (SIL Open Font
License). Test address: `https://printix-scanner.pages.dev` (Cloudflare Pages
project `printix-scanner`, direct upload of `out/`. Build with the API
address, then upload: `VITE_API_URL=https://api.barrels.gd pnpm --filter
@barrelsgd/pwa-printix build`, then from `apps/pwa/printix`
`wrangler pages deploy out --project-name printix-scanner --branch main`. A
build without `VITE_API_URL` shows "not connected" and checks nothing;
create Pages projects through the Cloudflare API, since `wrangler pages
project create` now tries to convert the app to a Worker). Planned address
`scan.barrels.gd` (owner decision, 15 Nov 2026); see "Address and API origin"
below. Response headers live in `public/_headers`. Lane spec:
`docs/design/printix.md`. Decision record: `docs/adr/0060-printix-ticket-registry-and-pairing-auth.md`.

Printix is a collaboration and Barrels Grenada's main ticket app (owner, 16
Nov 2026; ADR-0060 organiser amendment): security-printed event tickets and the
gate scanner. Barrels Grenada builds and runs the software. Printix keeps its own
name and look, **with Barrels shown** where it helps (for example "Sign in with
your Barrels account"). Never add GAA or GMS marks or `--gm-*` tokens. Barrels
Events keeps selling online tickets; this app does all gate scanning. The icons
in `public/icons/` are placeholders until Printix supplies artwork.

## What exists

- **Pairing** (`src/components/gate-app.tsx`, `src/lib/pairing.ts`,
  `src/lib/pairing-store.ts`): the pairing link `https://<origin>/#pair=<secret>`.
  The secret is read from the fragment once (a ref guards Strict Mode), kept in
  this origin's `localStorage` under one fixed key, and removed from the address
  bar. Never in a URL, a log, Sentry or an analytics event.
- **Scanning** (`gate-console.tsx`): the shared barcode camera (camera, torch,
  camera switch) with the scanner's own words, the live count, typed numbers
  (always reachable, in the shared sheet), no-signal state.
- **Verdicts** (`src/lib/scan-outcome.ts`): every API outcome and HTTP status
  maps to one tone, title, detail and sound. Admitted is green and clears itself
  after about a second. Refused and unchecked wait for **Scan next**.
- **API** (`src/lib/scan-api.ts`): generated client from `@barrelsgd/api-client`
  only. The secret goes in `Authorization: Bearer` and nowhere else. Responses
  must pass the generated Zod schema, or the answer is a failure, never a yes.
- Shared phone-app parts come from `packages/pwa-kit` (read its `AGENTS.md`):
  the barcode camera and reader, sounds (started on the tap that starts the
  camera; admitted plays the kit's success signal, refused its failure
  signal), vibration where the phone allows it, wake lock, the install guide
  and the bottom sheet. The kit's colours (`--color-pwa-*`) are mapped to the
  Printix palette in `src/styles/app.css`. A change to a kit part changes
  every phone app: run the kit's tests as well as this app's.
- `src/lib/scan-gate.ts`: one ticket in view is submitted once.
- `src/lib/report-error.ts`: re-exports the kit's reporter (a `pwa:error`
  window event with the area and error class only).

## What the API does not tell the scanner

- The **gate** of the pairing. The summary names the event; a gate appears only
  on an admission. The pairing screen therefore shows "Paired" and the event.
- Whether the pairing allows **typed numbers**. Typed entry is always shown, and
  `unknown` for a typed number may mean "typed numbers are off".

## Pairing secrets: what unpairing and sharing do

- **Unpairing does not revoke on the server.** "Unpair this phone" only deletes
  the secret from this phone's `localStorage`. The server still accepts that
  secret until an administrator revokes the pairing. A lost or stolen phone
  stays able to check tickets until someone revokes it.
- **A pairing link stays valid until it expires or is revoked.** A link shared
  by chat, email or a photo works on any phone that opens it, not only the one
  it was meant for. Treat a pairing link like a password: share it once, then
  revoke it if it leaks.

## Address and API origin

- The planned scanner address is `https://scan.barrels.gd`. It is listed in
  `BACKEND_CORS_ORIGINS` in `infra/docker/production.env`, so the production API
  accepts calls from it.
- `public/_headers` enforces the CSP with `connect-src 'self' https://api.barrels.gd`.
  Calls to any other API origin are blocked by the browser. A local API on
  `http://localhost` only works with `pnpm dev:pwa:printix` (or `vite preview`), which send no
  `_headers` CSP.

## Offline (ADR-0060, offline amendment)

- **Opening with no signal:** `vite-plugin-pwa` builds `sw.js`, which keeps
  every built file on the phone (precache: page, scripts, styles, Inter, the
  barcode reader's WebAssembly, icons, manifest). API calls are never cached.
  A new version shows a "Reload" banner (`src/components/service-worker.tsx`)
  and never reloads by itself, since a reload stops the camera. `_headers`
  marks `/sw.js` no-cache.
- **Ticket list** (`src/lib/use-offline.ts`, `offline-sync.ts`): downloaded
  on start, every 5 minutes while online and on reconnect (at most one every
  30 seconds; the server allows 4 a minute). Saved in the phone's database
  (Dexie, `src/lib/offline-store.ts`) as keyed hashes, never barcodes.
  Everything saved belongs to one pairing (a SHA-256 fingerprint of the
  secret, never the secret); data for another pairing is deleted on load,
  and unpairing deletes it all (the confirm step warns if admissions are
  still waiting).
- **Checking with no signal:** a live check that fails for lack of signal, or
  takes over 5 seconds (`LIVE_CHECK_TIMEOUT_MS`), is checked against the saved
  list (`src/lib/offline-check.ts`). After such a failure, scans skip the live
  check for 20 seconds (or until the next live count arrives from the server),
  so guests do not each wait out a timeout. List downloads and sends give up
  after 30 seconds, so one request that never answers cannot hold up the rest. The phone hashes the cleaned value with
  Web Crypto exactly as the server does (`src/lib/offline-hash.ts`). A valid
  ticket is admitted in green and queued with a random `client_ref`, the
  scanned value and the phone's time, in one database step that re-checks the
  ticket is still valid; void, already admitted (here or elsewhere), not on
  the list, and event closed (by the organiser, or at or after `closes_at`)
  are refused. Every live yes ("admitted" or "already admitted") also marks
  the ticket on the saved list, so a copy scanned moments later with no
  signal is refused. A fresh list never un-marks a ticket this phone saw
  admitted after the server made that list. Typed numbers are
  never checked offline. With no saved list, or for an event the server
  refuses (409 `offline_not_available`), the plain no-signal answer stands.
- **Sending:** queued admissions go to the server oldest first, up to 100 at
  a time, every 15 seconds while online and on reconnect, never closer than 6
  seconds (the server allows 12 a minute), and never before a wait the server
  asked for. List downloads and sends run one at a time. Scan times are kept
  inside what the server accepts (a wrong phone clock is sent as "now"). If
  the server refuses a whole batch, the phone sends one at a time; an entry
  refused on its own becomes a conflict, so it cannot block the queue. The first
  admission the server records wins; every other answer is kept as a
  conflict and listed in words ("Ticket 123: also admitted at North at
  20:14"). Deferred admissions stay queued until `retry_after_seconds`.
- **On screen** (`src/components/offline-status.tsx`): an Online/Offline
  badge with the number waiting to send, the saved list's download time, the
  "not available for this event" notice, and the conflicts list (cleared with
  "Supervisor told: clear the list"). A live timeout whose request did reach
  the server shows as an "also admitted" conflict for the same ticket: the
  hint under the list says to compare the times.
- **Unsent admissions are never hidden:** the unpair confirm and the
  pairing-problem screen say how many would be lost, every unpair path
  deletes the saved data, and admissions left by an earlier pairing (removed
  when a new pairing loads) are shown as "never sent".
- **iPhone:** Safari deletes a site's stored data and cached app after about
  7 days without use, unless the app was added to the Home Screen. Gate
  phones must be installed to the Home Screen and opened online once in the
  week before an event, so the list and app are fresh.
- Tests use `fake-indexeddb`. The whole flow was tried in headless Chromium:
  paired, list downloaded, network cut, reload: the app opened from the
  phone, still paired, showing Offline and the list's age.

## Organiser (ADR-0060 amendment, slice 3: sign-in and read-only screens)

Printix's own staff (organisers and gate leads) use the same app at
`/organiser`. The gate scanner stays at `/`. `src/app-root.tsx` (`ScannerRoot`)
picks the app by address (`src/organiser/routing.ts`), so only one mounts per
page load. The two share the API client, and each sets it up before a call:
the gate with its pairing secret (`scan-api.ts`), the organiser with its session
(`session.ts`, `prepare` and `configureFor`).

- **Routes** (`apps/api/fastapi/src/printix/AGENTS.md`, "Organiser access"):
  `POST /auth/apps/printix/email-code/start` and `/verify` (sign-in, `sign-in.ts`),
  `POST /auth/sessions/refresh` and `/logout`, `GET /printix/me/organisations`,
  `GET /printix/org/events` and `GET /printix/org/events/{id}/summary` with
  `X-Barrels-Organisation` sent per call (`organiser-api.ts`). Read-only: no
  writes until slice 4.
- **Sign-in** (ADR-0061): an email step, then one step with the emailed code and
  the authenticator code together (`sign-in-screen.tsx`). Errors map to plain
  words in `errors.ts` (`problemOf`, `problemMessage`): wrong authenticator code
  (400 "Two-factor"), wrong or expired emailed code, not set up for Printix (403),
  no authenticator (403 with a structured `code` of `authenticator_required` or
  `mfa_enrolment_required`, or text ending with one of those codes; a structured
  code is preferred over text, and the code is never shown), rate limit (429,
  "Try again in N seconds"), no signal, and unknown answers as a generic failure
  that is reported with `reportError`.
- **Session rules** (`session.ts`, `OrganiserSession`):
  - The access token is in memory only. It is renewed when it is within a minute
    of `access_token_expires_at`, and once on a 401 (then the call is retried once).
  - The session token is in `sessionStorage` under `printix-organiser.session`.
    Sign-in writes nothing else there. Each refresh replaces it.
  - Refreshes are serialised: concurrent callers share one request, and a caller
    holding an already replaced token does not refresh again.
  - A refresh the server refuses (401) clears the tab and returns to sign-in with
    "Your session has ended". A refresh that fails for no signal keeps the session.
  - **A lost refresh response signs the person out.** The server revokes the old
    session token before it issues the new one, with no grace window. If the
    refresh answer is lost (a timeout or a dropped connection), the phone cannot
    recover: the next call's refresh is refused and the person signs in again.
    The screen then says "You were signed out because the connection dropped.
    Sign in again." (`EndReason` "dropped"). This cannot be fixed on the client.
  - A second 401 after a successful refresh also ends the session (back to
    sign-in), rather than leaving a screen with only "Try again".
  - **Duplicated tabs share the session.** Browsers copy sessionStorage when a
    tab is duplicated, so both copies hold the same session token. Refreshing one
    makes the other's token stale, so its next refresh is refused and that copy
    signs out. Nothing coordinates the tabs; use one tab per person.
  - Sign-out revokes the session on the server, then clears memory and
    `sessionStorage` even if that call fails (the failure is reported).
  - Nothing goes in `localStorage`, IndexedDB, the service worker cache or a URL.
    `localStorage` is untouched by sign-in (a test checks this).
  - The chosen organisation id is kept in `sessionStorage` under
    `printix-organiser.organisation`, per tab.
- **Screens** (`organiser-app.tsx`): choose an organisation (none: "no Printix role
  yet"; one: opened straight away; several: a picker, with "Switch organisation"
  afterwards), events (paged 50, with the person's role; empty state), one event
  (`CountBar` from the scanner, plus void, refused duplicates and offline
  conflicts). The counts refresh every 10 seconds while the tab is visible
  (`use-event-summary.ts`, which never overlaps reads). A rate limit sets a
  `notBefore` time from Retry-After, which both the timer and the visibility
  handler honour, so flipping tabs cannot exceed the limit. The event's status
  and close time come from the polled summary, so a closing event updates.
  Rate-limit messages state the wait in seconds from the server.
- **Not connected:** with an empty `VITE_API_URL` the organiser shows "not
  connected" and calls nothing.
- **Offline:** the page itself opens from the phone's cache, but every organiser
  screen needs a connection, and says so when the network fails.
- **Files:** `src/app-root.tsx`, `src/organiser/` (`organiser-app.tsx`,
  `sign-in-screen.tsx`, `choose-organisation.tsx`, `events-screen.tsx`,
  `event-screen.tsx`, `header.tsx`, `use-event-summary.ts`, `session.ts`,
  `sign-in.ts`, `organiser-api.ts`, `errors.ts`, `format.ts`, `routing.ts`,
  `styles.ts`). Tests: `src/organiser/*.test.*`, `src/app-root.test.tsx`, and
  `src/test/organiser-fetch.ts` (a fake `fetch` by "METHOD /path").
- **Hosting:** `out/` must not contain a `404.html`, or Cloudflare Pages will not
  serve `index.html` for `/organiser`. The build creates none. The CSP is
  unchanged: `connect-src` names the API origin only, and there are no inline
  scripts.

### Setup screens and gate codes (ADR-0060 amendment, slices 4 and 5)

Organisers set up their events here, and make the gate QR codes on event night.
Every call goes through `write-api.ts` (the organisation header on each call; the
answer must match the generated schema), and the server is the only judge of a rule.

- **Create event** (`create-event.tsx`, organisers only; a gate lead gets no button and
  the screen refuses to open for them too). Name, event date and closing time. Times
  are Grenada time (UTC-4 all year), sent as `2026-12-27T00:00:00-04:00`
  (`grenadaLocalToIso`). The screen mirrors the two server rules before sending: the
  event date is at most 365 days ahead (UTC date, as the server counts it) and the
  closing date is at most 7 days after the event date and not before it. A server 422
  shows its sentences in words, without pydantic's "Value error, " prefix.
- **Event page** (`event-screen.tsx` adds the sections below after the counts).
  Setup sections use the polled `summary.event` status, so a closed event shows as
  closed without a reload, and `reload` (from `use-event-summary.ts`) refreshes the
  counts after each change.
  - **Gate codes** (both roles, `gate-codes-section.tsx`): list (gate, works until,
    typed numbers on or off, active, expired or cancelled; never a secret). "New gate
    code": gate name, optional "works until" (blank is the server's default of six hours
    after close, at most a day after), and the "Allow typed numbers" switch, shown to
    organisers only. A gate lead's 403 is still handled. Cancelling is a button plus a
    confirm, for both roles. The 20-active-codes 409 says to cancel one first.
  - **The QR code, shown once** (`gate-code-panel.tsx`, `qr.ts`): the link is
    `<this origin>/#pair=<secret>`, drawn as an inline SVG (the events app's module-path
    approach, so no image is loaded and the CSP needs no change). Full width, with the gate
    name and "Scan this with the gate phone's camera now. It will not be shown again." Focus
    moves to its heading when it appears. It shows "This code hides in N seconds." and is
    dropped on Done, after two minutes, or as soon as the page is hidden (`visibilitychange`).
    The secret lives only in the component's state, which the page owns; leaving the event
    page drops it. Making a code that gets no answer adds "A code may have been made. Check
    the list and cancel any you did not expect." No copy, download, print or share control
    exists. Nothing reaches storage, a URL, a log or `reportError`. `pairingLink` round-trips
    through `readPairingFragment` (tested).
  - **Tickets** (organisers, `tickets-section.tsx`): printed number and state, paged 50,
    never a barcode. Void and restore each take a confirm step. An admitted ticket
    offers no void. Closed events refuse every change, and the screen says so.
  - **Import tickets** (organisers, `import-section.tsx`): a trial first (`dry_run=true`,
    writes nothing), then "Import N tickets" (`dry_run=false`). The trial keeps the exact
    `File` it checked, and the import uploads that file, never whatever the picker shows
    later. The picker is disabled while a check or import runs, and an answer for a file
    that was replaced meanwhile is ignored. The trial is clean only when it has no
    problems, nothing truncated, rows to add, and no warnings. The server's only warnings
    are blank-barcode ones, and a real import refuses those (`service.import_tickets`), so
    they block: "Every ticket needs its barcode. Ask the printer for the full list." Weak
    barcodes never block (the real import accepts them): "Across this event, N barcodes are
    shorter than 12 characters. Offline checking will be off for this event." A real import
    that still writes nothing shows its problems under "The import was not written. Nothing
    was added." The trial report does not list blank rows by line (the server gives only the
    count and the first line); a per-line list needs a server change. The tickets list
    remounts after a successful import, and the offline warning stays on the done step. The
    file is held in component state only and dropped after a successful import; over 2 MB is
    refused before any call; 413 and 409 have their own sentences.
  - **Close event** (organisers, `close-event-section.tsx`): a confirm that says it
    cannot be undone and that gate codes stop admitting people.
- **Closed means closed (`event-state.ts`):** the organiser closed it, or its closing time
  has passed. A closed event offers no void, restore, import, new gate code or close action,
  and its unended gate codes read "Ended (event closed)" with no Cancel button.
- **Focus and results:** a confirm step (void, restore, cancel a code, close) takes focus
  when it opens and returns it to its opening control when it closes (`use-confirm-focus.ts`).
  Results (imported, void, restored, cancelled, the code made, closed) are announced in one
  polite live region on the event page.
- **Events list:** "New event" for organisers only (`can_manage_events`).
- **New error kinds** (`errors.ts`): `invalid` (422 sentences), `event-closed`,
  `gate-codes-full`, `already-admitted`, `conflict` (any other 409), `too-large` (413),
  `typed-numbers-refused` (403). A 429 always states its wait in seconds.
- **Tests:** `setup.test.tsx` (role gating, create, tickets, the trial-then-import
  sequence, the weak-barcode warning, the QR shown once and gone after Done, the secret
  kept out of storage, the URL and reported errors, cancel, each error sentence) and
  `setup-helpers.test.ts` (the date rules, Grenada time, the warning words, the code and
  ticket rules, the QR link and matrix).

## Not built yet

QR generation for administrators, ticket types, re-entry, and the Barrels
Events connection. Backend logic goes in FastAPI, never here.

## Rules

- Everything stays in the browser: no server code. Backend logic goes in
  FastAPI.
- `src/env.ts` is the only place that reads `import.meta.env`. The API origin
  is `VITE_API_URL`, written into the bundle at build time (set it when
  building for the test site): https, or plain http on localhost only. Unset
  means the scanner shows "not connected" and checks nothing.
- Server errors are recognised by the error's name (`ResponseError`), not
  `instanceof`: the API client's index exports the class twice, and Vite's
  bundler drops that ambiguous export.
- The camera needs a secure (https) address or `localhost`.
- Dark only (`docs/design/printix.md`). Controls at least 44 px tall. Inputs at
  16 px or more so iPhone does not zoom.
- Never let the pairing secret reach a log, `reportError` message or Sentry.
- Tests: `pnpm --filter @barrelsgd/pwa-printix test`. Dev:
  `pnpm dev:pwa:printix` (host only).
