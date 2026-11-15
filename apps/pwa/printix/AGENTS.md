# Printix Scanner (`@barrelsgd/pwa-printix`)

Port **3064** (local dev only). Static export (`output: "export"`, written to
`out/`). Test address: `https://printix-scanner.pages.dev` (Cloudflare Pages
project `printix-scanner`, direct upload of `out/` with
`wrangler pages deploy out --project-name printix-scanner --branch main`;
create Pages projects through the Cloudflare API, since `wrangler pages
project create` now tries to convert the app to a Worker). Planned address
`scan.barrels.gd` (owner decision, 15 Nov 2026); see "Address and API origin"
below. Response headers live in `public/_headers`. Lane spec:
`docs/design/printix.md`. Decision record: `docs/adr/0060-printix-ticket-registry-and-pairing-auth.md`.

Printix is a **client's** product: security-printed event tickets with a
ticket scanning app for promoters. Barrels Grenada builds and runs the
software, but Printix appears as its own product: its own name, look and
address. Never add Barrels, GAA or GMS marks here. The icons in `public/icons/`
are placeholders until the client supplies artwork.

## What exists

- **Pairing** (`src/components/gate-app.tsx`, `src/lib/pairing.ts`,
  `src/lib/pairing-store.ts`): the pairing link `https://<origin>/#pair=<secret>`.
  The secret is read from the fragment once (a ref guards Strict Mode), kept in
  this origin's `localStorage` under one fixed key, and removed from the address
  bar. Never in a URL, a log, Sentry or an analytics event.
- **Scanning** (`gate-console.tsx`, `gate-scanner.tsx`): camera, torch, camera
  switch, the live count, typed numbers (always reachable), no-signal state.
- **Verdicts** (`src/lib/scan-outcome.ts`): every API outcome and HTTP status
  maps to one tone, title, detail and sound. Admitted is green and clears itself
  after about a second. Refused and unchecked wait for **Scan next**.
- **API** (`src/lib/scan-api.ts`): generated client from `@barrelsgd/api-client`
  only. The secret goes in `Authorization: Bearer` and nowhere else. Responses
  must pass the generated Zod schema, or the answer is a failure, never a yes.
- `src/lib/gate-feedback.ts`: sounds (started on the tap that starts the camera),
  vibration where the phone allows it, wake lock where supported.
- `src/lib/scan-gate.ts`: one ticket in view is submitted once.
- `src/lib/report-error.ts`: logs the area and error class only.

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
  `http://localhost` only works with `pnpm dev:pwa:printix`, which sends no
  `_headers` CSP.

## Not built yet

QR generation for administrators, offline scanning, ticket types, re-entry,
and the Barrels Events connection. Backend logic goes in FastAPI, never here.

## Rules

- Everything must stay static: no server actions, no route handlers that need
  a server, no `next/image` optimisation.
- `src/env.ts` is the only place that reads `process.env`. The API origin is
  `NEXT_PUBLIC_API_URL`: https, or plain http on localhost only. Unset means the
  scanner shows "not connected" and checks nothing.
- The camera needs a secure (https) address or `localhost`.
- Dark only (`docs/design/printix.md`). Controls at least 44 px tall. Inputs at
  16 px or more so iPhone does not zoom.
- Never let the pairing secret reach a log, `reportError` message or Sentry.
- Tests: `pnpm --filter @barrelsgd/pwa-printix test`. Dev:
  `pnpm dev:pwa:printix` (host only).
