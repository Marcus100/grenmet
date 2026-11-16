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
