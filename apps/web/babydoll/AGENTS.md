# Babydoll Beauty Bar

Port **3014**. Package: `@barrelsgd/web-babydoll`. Lane spec: `docs/design/babydoll.md`.
Hosted on Vercel at `babydoll.barrels.gd` (production only, no staging), like Elections.

## Client boundary

- Babydoll Beauty Bar is a **client** (a lash, brow and skin studio in St. George's,
  Grenada; owner Jeriann Marryshow-Fleming). It is not a Barrels product. The
  software is Barrels IP; the client owns its name, logo, photos and copy.
- Keep the "Website by Barrels Grenada" footer credit. Never add Barrels or GMS
  branding elsewhere, and never use `--gm-*` tokens: this site uses the client's
  own brand tokens in `src/app/globals.css` (plain CSS, no Tailwind).
- The client's later domain is `babydollbeautybar.com`; update `SITE_URL` in
  `src/data/site.ts` when it moves.

## Content rules

- All client-editable content (booking link, address, hours, services and prices,
  packages, reviews, socials, courses, portfolio slots) lives in `src/data/site.ts`.
  Pages render from it; do not hard-code prices or the address in components.
- Prices mirror the client's Acuity booking page (`babydollgnd.as.me`). Do not
  invent services, prices, course dates or credentials; training content is draft
  until the client confirms it.
- Booking is the Acuity link (`BOOKING_URL`) unless online booking is switched
  on (see "Online booking"). Contact and training interest go to Instagram DM.
  The marketing pages themselves make no API calls and use no analytics.
- Every Book call-to-action uses `siteBookingLink()` (Server Components) or a
  `CtaLink` prop (client components) from `src/lib/book-link.ts`. Never
  link `BOOKING_URL` directly. The only deliberate Acuity links left on the
  switched-on site are the `/book` redirects (switch off, or the studio page
  disabled) and the `/book` error fallback ("Book on our other page").
- Portfolio and portrait photos go in `public/portfolio/` only with the client's
  confirmation that the people shown consented; add `image` and `alt` to the slot.

## UI rules

- Server Components by default. Client components only for the mobile menu,
  service tabs, portfolio filter and the booking forms (the booking flow lives in
  `@barrelsgd/bookings-web`; this app wires it up in `app/book` and `app/booking`). Every service panel stays in the HTML
  (inactive panels are `hidden`), so prices are indexable.
- Phone first: the fixed `BookBar` shows under 820px; keep the page's bottom
  padding (`--bar-h`) when changing it.
- Tests: `pnpm vitest run` from this directory.

## Online booking (B4)

Barrels Bookings (`apps/api/fastapi/src/bookings`, ADR-0024) powers `/book` and
`/booking/[token]`. Everything else on the site is unchanged and still links to
Acuity.

- **Switch:** `BABYDOLL_ONLINE_BOOKING=on|off` in `src/env.ts` (the only place
  that reads `process.env`; hand-written, the app has no schema library). Off
  (the default): `/book` redirects to `BOOKING_URL` and calls nothing. It also
  redirects when the studio's booking page answers 404. This switch stands in
  for the PF7 flag `babydoll-online-booking`: `featureEvaluateForOrganisation`
  needs a signed-in member, and there is no public evaluate endpoint yet.
  `/booking/[token]` works whatever the switch says, so existing manage links
  never break.
- **Package:** the flow (form, slot picker, manage page, Turnstile) is
  `@barrelsgd/bookings-web` (`packages/bookings-web`). It takes the server
  actions as props; this app passes `app/book/actions.ts` and
  `app/booking/[token]/actions.ts` in, and gives it `BookingLink` (Next `Link`),
  `/booking` as the manage path, and the calendar href and Instagram contact link.
- **Calls:** server-side only, through the generated client
  (`src/lib/booking-api.ts`, `createClient({ baseURL })`; the API address never
  reaches the browser). The browser reaches it through Server Actions
  (`app/book/actions.ts`, `app/booking/[token]/actions.ts`); the calendar file is
  proxied by `app/booking/[token]/ics/route.ts`. No business logic here.
- **Errors:** API 4xx/409 become `Failure` results with customer wording
  (wording in `@barrelsgd/bookings-web/lib/booking-errors`; the app's
  `src/lib/booking-errors.ts` maps the generated client's `ResponseError`); a slot-taken 409 is told apart from the
  cancellation-cutoff 409 by the API's message text (the schema types the 409
  body as unknown). Network faults and 5xx are not swallowed by the actions:
  the form catches them to offer a safe retry. There is no Sentry in this app,
  so nothing is reported.
- **Idempotency:** the form keeps one `Idempotency-Key` per request (UUID,
  `crypto.randomUUID`); the same request retried reuses it, any changed field or
  slot starts a new one. A replay needs no second Turnstile token.
- **Spam:** hidden `website` honeypot (never filled by people, sent through
  untouched), Turnstile only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. The
  marketing checkbox starts unchecked.
- **Manage token:** shown once in the create answer; the confirmation links to
  `/booking/<token>`. The page is `noindex`, `referrer: no-referrer` and
  `force-dynamic`. Never log or store the token.
- **Tenant seed:** `python -m src.bookings.seed [--dry-run]` from
  `apps/api/fastapi` creates the `babydoll` organisation, the services and hours
  mirrored from `src/data/site.ts` and the `babydoll-beauty-bar` profile. Service
  durations are assumptions the client should confirm; keep prices in step with
  `SERVICE_MENU`.
- **Book links:** `src/lib/book-link.ts` decides where every Book CTA goes.
  Switch off: Acuity (`BOOKING_URL`, new tab, `rel="noopener"`). Switch on:
  `/book` (same tab). `siteBookingLink()` reads `env` and runs only in Server
  Components and the layout; client components (`SiteHeader`, `ServiceMenu`)
  take a `booking: CtaLink` prop and never read the switch, because
  `BABYDOLL_ONLINE_BOOKING` is not a `NEXT_PUBLIC_` variable and would be
  `undefined` in the browser.
- **Static pages:** most pages are prerendered at build, so the switch is read
  at build time. Changing `BABYDOLL_ONLINE_BOOKING` in Vercel needs a redeploy
  to take effect on those pages. `/book` and `/booking/[token]` are dynamic.
- **Per-service links:** every Book link goes to `/book` without a service
  id. `/book` cannot preselect a service yet: `BookingFlow`
  (`components/booking/`) has no initial-service prop and `/book` reads no
  search params. Adding `?service=<id>` is a follow-up that needs that prop.
- **Left on Acuity on purpose:** `/book`'s own redirects (`app/book/page.tsx`)
  and `app/book/error.tsx`'s "Book on our other page" fallback, so a failed
  on-site flow always has a working route to a booking.
