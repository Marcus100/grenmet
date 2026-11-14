# Printix Scanner (`@barrelsgd/pwa-printix`)

Port **3064** (local dev only). Static export (`output: "export"`, written to
`out/`); not deployed yet (target `scan.printixevent.com`, which needs a
trusted certificate). Response headers live in `public/_headers`. Lane spec:
`docs/design/printix.md`.

Printix is a **client's** product: security-printed event tickets with a
ticket scanning app for promoters. Barrels Grenada builds and runs the
software, but Printix appears as its own product: its own name, look and
address. Never add Barrels, GAA or GMS marks here. The Printix name and artwork
are the client's; the icons in `public/icons/` are placeholders until the
client supplies artwork.

This is a progressive web app (PWA): a website a phone installs from a link
and runs like an app. It lives under `apps/pwa/`, the folder for installable
phone apps.

## What exists (week one of the Boxing Day 2026 plan)

- `src/app/manifest.ts`: the web app manifest that makes the app installable.
  `manifest.test.ts` checks the icon sizes and that every icon file exists.
- `src/components/scanner.tsx`: starts the camera, reads a barcode and shows
  its value, barcode type and length. **Nothing is sent anywhere.** Its purpose
  is to learn what a printed Printix barcode holds.
- `src/lib/barcode-reader.ts`: uses the browser's built-in `BarcodeDetector`
  only when it reads every format in `TICKET_FORMATS`; otherwise the bundled
  `barcode-detector` library (zxing, WebAssembly). iPhone Safari has no
  built-in decoder, so iPhones always take the library path.
- `scripts/copy-wasm.mjs` (run before `dev` and `build`) copies
  `zxing_reader.wasm` into `public/zxing/` (gitignored). The app serves that
  file itself; never let it load from the library's default CDN, which would
  break offline use.
- `src/components/install-hint.tsx`: install steps per phone, hidden once the
  app runs from the home screen.

## Not built yet

Ticket registry and sign-in (FastAPI), admitting a ticket, the result screen,
the service worker and offline scanning, the promoter's live count, and the
Barrels Events connection. Backend logic goes in FastAPI, never here.

## Rules

- Everything must stay static: no server actions, no route handlers that need
  a server, no `next/image` optimisation.
- `src/env.ts` is the only place that reads `process.env` (`PRINTIX_SITE_URL`).
- The camera needs a secure (https) address or `localhost`. To test on a phone,
  serve the build over https; a plain LAN address will not get the camera.
- Barcodes of lines need good light and a steady hand: keep the typed-number
  fallback in every later version.
- Tests: `pnpm --filter @barrelsgd/pwa-printix test`. Dev:
  `pnpm dev:pwa:printix` (host only).
