# @barrelsgd/pwa-kit — agent context

The shared base for every phone app in `apps/pwa/*` (owner decision, November
2026: all mobile apps are installable React web apps, not native or React
Native apps, and no app-store listing for now). The first user is the Printix
scanner; planned apps include GMS Weather, Janitor, Bus, Parking, Taxi and
Traveler, mostly for GAA and later for other companies.

## What is here

- `src/lib/`
  - `feedback.ts`: success and failure sounds (Web Audio, unlocked by a tap)
    and vibration where the phone allows it (not iPhone).
  - `wake-lock.ts`: keeps the screen on while the app is in use.
  - `install.ts`: which install advice a phone gets.
  - `barcode-reader.ts`, `zxing-library.ts`: the phone's own barcode reader
    where it reads every wanted format (Android), otherwise the bundled
    WebAssembly reader (iPhone).
  - `camera-problem.ts`, `scan-value.ts`: camera errors in plain words, and a
    read value with invisible characters removed.
  - `report-error.ts`: a `pwa:error` window event with the area and the
    error's class name only. Apps re-export it from their own
    `src/lib/report-error.ts`.
- `src/components/`
  - `install-hint.tsx`: Chrome's Install button, or the steps on iPhone and
    other browsers; nothing once installed.
  - `sheet.tsx`: the draggable bottom sheet (Vaul). Contents are created
    afresh on each opening.
  - `barcode-camera.tsx`: viewfinder, torch, camera switch and the decode
    loop. It reports cleaned reads and never decides what they mean. Words
    come from the app (`text`), with neutral defaults.
- `src/styles/base.css`: the colour names below, body defaults and the
  `.pwa-screen` fade for a screen that replaces another.
- `scripts/copy-zxing-wasm.mjs` (bin `pwa-kit-copy-zxing`): copies the barcode
  reader's WebAssembly file into the calling app's `public/zxing/`. An app that
  scans runs it before `next dev` and `next build`.

## Colours

Shared parts style themselves only with these Tailwind colours, which each app
sets in its own `@theme`: `pwa-background`, `pwa-surface`, `pwa-rule`,
`pwa-text`, `pwa-muted`, `pwa-accent`, `pwa-on-accent`, `pwa-bad`,
`pwa-on-bad`. Add a name only when a shared part needs it, give it a default in
`base.css`, and set it in every app. Never use `--gm-*` tokens or a brand
colour here. An app's stylesheet imports, in order: `tailwindcss`,
`@barrelsgd/ui/styles/app-feel` (touch behaviour), then
`@barrelsgd/pwa-kit/styles/base`.

## Rules

- Brand-neutral: no Barrels, GAA, GMS or client names, marks or words. Words a
  user reads come from the app, with neutral defaults.
- Static-export friendly: browser code only, no server actions, no
  `process.env`, no API client. Backend logic belongs in FastAPI.
- Every change reaches every phone app. Run this package's tests and the tests
  of each app in `apps/pwa` (`pnpm exec turbo run test --filter="./apps/pwa/*"`).
  The Printix scanner works a live gate on 26 December 2026: keep its
  behaviour unchanged unless that is the task.
- New dependencies follow the root rules (catalog only). Owner-approved for
  the offline work, not yet added: Serwist (service worker) and Dexie (phone
  storage).
- Never send a secret, a scanned value or an error message to `reportError`.
- Tests: `pnpm --filter @barrelsgd/pwa-kit test` (Vitest, jsdom per file).

## New apps

`pnpm new:pwa <name> --port <port> --title "<App name>"` (options in
`scripts/pwa/new-app.mjs`: `--short`, `--accent`, `--site`, `--scanner`,
`--public`) creates `apps/pwa/<name>` on this kit and registers it in the root
dev scripts, every web Dockerfile, the dev container volumes, `docs/ports.md`
and the root `AGENTS.md` map (name only: that file is at the Codex byte
budget, and it makes the pull request owner-merged). Pick a port from the 3060–3089 client range in
`docs/ports.md`; a Reserved row on that port is taken over. Then run
`pnpm install` and `pnpm dev:pwa:<name>`.
