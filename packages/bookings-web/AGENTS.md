# @barrelsgd/bookings-web — agent context

The public booking flow (new booking form, slot picker, manage-a-booking page,
Turnstile widget) shared by `apps/web/babydoll` and a future `apps/web/bookings`.
Backed by Barrels Bookings (`apps/api/fastapi/src/bookings`, ADR-0024).

## Boundary: the host owns the server

- Components receive **data and action callbacks as props**. They never call
  the API, never import Server Actions, never read env, never use Next routing
  (`next/link`, `next/navigation`) and never carry a brand.
- The host app keeps `lib/booking-api.ts` (server-only, generated client) and
  its `"use server"` actions. It passes them in as `actions` (`BookingFlowActions`,
  `ManageBookingActions`). Action references serialise across the Server
  Component boundary; closures do not, so pass the token as an argument.
- Host-specific values are props too: `managePath`, `calendarHref`,
  `contact` (a `ContactChannel`: href and channel name), `studioName` (opt-in
  wording), `ManageLink` (defaults to a plain anchor), `turnstileSiteKey`.
  Nothing here names a studio or a channel.
- Failure classification lives here (`lib/booking-errors.ts`, `classifyFailure`,
  which takes the channel name as an argument). The host's `failureFrom` maps a
  generated-client `ResponseError` to it; that mapper stays in the app so this
  package does not depend on the client at runtime.

## Styling

- Class names only (`slots`, `btn`, `btn-solid`, `notice`, `summary`, `field`,
  `step`, ...). The host app supplies the CSS. No `--gm-*` tokens and no brand
  colours in this package.

## Import paths

- `@barrelsgd/bookings-web/components/<name>` (`booking-flow`, `manage-booking`,
  `slot-picker`, `turnstile`) and `@barrelsgd/bookings-web/lib/<name>`
  (`booking-form`, `booking-format`, `booking-errors`, `booking-types`). No barrel.

## Client components

- `components/*.tsx` carry `"use client"`; they are interactive. Keep pure
  helpers in `lib/` free of React so they stay unit-testable without a DOM.

## Tests

- `pnpm --filter @barrelsgd/bookings-web test` (Vitest, jsdom). Component tests
  pass mock actions as props; they do not mock modules.
- Types for API payloads (`BookingPublicDetail`, `BookingStorefront`) come from
  `@barrelsgd/api-client`. Never hand-write an API response type here.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `import { cancelBooking } from "@/lib/booking-api"` in a component | Take the action as a prop in `ManageBookingActions` |
| `process.env` or an env module in this package | Pass the value (e.g. `turnstileSiteKey`) from the host |
| `next/link` inside a component | Accept a `ManageLink` prop from the host |
| Brand hex colours or `--gm-*` classes | Use the host's class names |
| Re-exporting from the app's `@/lib/*` | Import the package path directly |
