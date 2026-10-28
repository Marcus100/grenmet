# GAA next wave: mbia, gaa.gd, Janitor, Bus, Parking, Flyer rewards

**Status:** Working plan (planning only; each slice starts after its blocking decisions)  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-28

The owner said on 2026-10-27 that GMS/GAA operational work is mostly
finished. Five things restart or start now, in parallel with Events and
Bookings:

1. Improving the public airport site.
2. A GAA corporate site.
3. The janitor and bus PWAs.
4. A parking app.
5. A rewards app for passengers ("flyer app").

This document records a first slice for each, what already exists, and the
decisions that block each start. It follows the
[GAA implementation guide](gaa-modular-monolith-implementation.md) and the
[delivery map](../portfolio/repository-delivery-map.md).

**Hosting rule** (ADR-0036 and its 2026-10-27 amendment): anything with
sign-in, credentialed API calls or stored data runs on the DigitalOcean
droplets. Plain static public sites go to Cloudflare Pages.

## 1. mbia: public airport site (`apps/web/mbia`, port 3005)

**What exists**
- MDX content in six sections, a sample flight board and Barrels sign-in.
- The live flight path is OpenSky (`GET /api/v1/flights/board`), switched off
  by the `FLIGHTS_OPENSKY_ENABLED` flag. It only gives previous-day movements,
  under a research-only licence.
- The contact form still calls the deprecated `POST /api/v1/contact/messages`
  (`src/app/api/contact/route.ts`). Its replacement is
  `POST /api/v1/contact/public/{site_key}/messages`.
- The corporate, development, business and news sections are really GAA
  corporate content.

**First slice (blocked by nothing)**
- Move the contact form to the per-site route with Turnstile.
- Correct the stale Turnstile note in `apps/web/mbia/AGENTS.md`.
- Tests in the existing route and form tests.

**Then, in order**
1. Fix input contrast below 3:1 (`docs/design/mbia.md`).
2. Passenger services: assistance, feedback, tour evaluation.
3. Move corporate content to gaa.gd with redirects.
4. A real flight feed once a licensed source exists.

**Hosting:** droplets (sign-in, API proxy). No new port or host.

**Open questions**
1. Flight data source and licence. *Default:* keep the labelled sample.
2. Who at GAA approves content changes?

## 2. gaa.gd: GAA corporate site (port 3060, `@barrelsgd/web-gaa`)

**What exists:** the port and the `gaa` reserved name. Source content is in
`apps/web/mbia/content/{corporate,development,news,business}/`; GAA owns its
marks (ADR-0033).

**First slice:** a static Next.js export with MDX via Content Collections,
the same pattern as `apps/web/commit`.
- Pages: about, leadership, and a news index built from the existing MDX.
- `robots.ts` and `sitemap.ts`; the site stays indexed.
- Served at `gaa.barrels.gd` on Cloudflare Pages.

**Non-goals:** sign-in, stored forms or a CMS in the first release (any of
these would move it to the droplets).

**Open questions**
1. Who is GAA's content owner and approver? *Default:* nothing publishes until
   named.
2. Does GAA point `gaa.gd` at us? *Default:* `gaa.barrels.gd` only, until GAA
   asks in writing (client custom domains are deferred by ADR-0043).
3. Should corporate content leave mbia entirely? *Default:* yes, with 301
   redirects. Business fees stay on mbia.
4. Contact or careers form? *Default:* no; link to email.

## 3. Janitor PWA (port 3061)

**What exists**
- API domain `src/janitorial`: shifts, zones, assignments, shift patterns.
- Portal pages in `apps/web/gaa-admin/src/app/(admin)/janitor/*`.
- Decisions of 2026-09-25 in `docs/products/janitorial-and-transport-data-model.md`.
- Missing: no "my assignments" endpoint, and visits are phase 3, which needs
  approval.

**First slice (read-only)**
- `GET /janitorial/me/shift-assignments`, scoped to the signed-in caller.
- Regenerate OpenAPI and the client.
- New app `apps/web/janitor`: a "Today" screen, a manifest, and a hand-written
  service worker caching only the last loaded day, like `apps/web/gms/public/sw.js`.

**Hosting:** droplets.

**Open questions**
1. Host. *Default:* `janitor.barrels.gd`.
2. How contractor cleaners get access (`app.janitor.access`). This widens
   access, so it needs approval. *Default:* granted automatically with
   janitorial staff membership.
3. No-phone fallback. *Default:* the supervisor records work for them.
4. Approve the phase-3 visits migration after the pilot.

## 4. Bus PWA (port 3062)

**What exists**
- API domain `src/transport`: versioned timetables and
  `GET /transport/timetable/current`.
- Portal pages in `apps/web/gaa-admin/src/app/(admin)/bus/*`.
- Some route data still awaits GAA HR (`transport/AGENTS.md`).

**First slice (no API change):** a signed-in rider picks a route and stop and
sees the next departures, in Grenada time and across midnight. Unconfirmed
trips are flagged, and the timetable is cached offline.

**Hosting:** droplets.

**Open questions**
1. Check-in only or seat booking? The 2026-09-25 decision says check-in only;
   an older exec plan says booking. *Default:* check-in only.
2. Host. `bus.barrels.gd` is reserved for the Barrels sector product.
   *Default:* `gaa-bus.barrels.gd`.
3. Rider access: all staff, or Transport approval? *Default:* all staff can
   view; riding needs approval.

## 5. Parking: staff and customers

**What exists**
- Staff permits and decals: `src/hr/parking`, under `/hr/parking-permits`.
  GAA-04 says "no space booking".
- Public rates exist only as mbia content
  (`content/travel/parking-at-mbia.mdx`).
- Payments are in test mode only (ADR-0027).
- `park.barrels.gd` (3039) is a reserved Barrels sector product.

**First slice (no new app)**
- Staff: renew a permit from a phone, plus an expiry reminder 30 days before.
- Public: a structured rates and directions page on mbia.

**Open questions**
1. What does "parking app" mean to GAA: staff permits, public pay-and-display,
   pre-booking, or enforcement? *Default:* permits plus public information.
2. Does GAA lift "no space booking"? This is business policy.
3. If public payment is wanted: who operates the car park, what equipment is
   installed, and does money flow through Barrels?
4. Shape. *Default:* the `park` sector product with GAA as the first tenant,
   not a GAA-only app.

## 6. Flyer rewards (research first)

**What exists**
- The `rewards` domain (ADR-0030):
  - append-only ledger;
  - organisation-funded stamp cards;
  - staff-confirmed one-time redemption codes;
  - signed venue QR check-ins, one per venue per day;
  - velocity flags and 12-month expiry.
  - Buying points, cash-out and transfers are banned.
- `flights` cannot verify that a person flew: it holds no passenger data.
- `docs/strategy/loyalty-reference-study.md`: loyalty is a feature of the
  transaction, merchant-funded first.

**Research (general industry practice)**
- **Earning:** airport programmes mostly reward spend (shops, food, parking,
  lounges), not flying, because airlines already reward flying.
- **Verifying a flight:** boarding-pass barcode scan (cheap, forgeable),
  airline data feeds (need a deal with each airline), or a staff scan at a
  controlled point.
- **Fraud risks:** shared passes, staff collusion and multiple accounts.
  Typical controls: one earn per booking reference and flight, staff-confirmed
  redemption, velocity limits, and excluding staff.
- **Privacy:** boarding passes hold the passenger's name and booking
  reference. Keep a hash only, ask separate marketing consent, and never send
  either to Sentry (ADR-0037).

**Fit for a small Caribbean airport:** stamp cards and single rewards beat
point balances, because many visitors fly once. The staff-shown venue QR is
already built and resists fraud.

**Recommendation:** a "Flyer rewards" module inside mbia (it already has
sign-in) on the existing `rewards` APIs, not a separate app.

**First slice:**
- Seed GAA as an organisation with one GAA-funded stamp card on one service.
- Put one venue QR at that service's desk.
- An mbia `/rewards` page: earn by check-in, redeem by code.

**Open questions**
1. Goal: concession revenue, paid-service uptake or passenger satisfaction?
2. Who funds rewards? *Default:* each organisation funds its own; Barrels
   funds nothing.
3. Is flying an earn event? *Default:* not in version 1.
4. Are staff excluded? *Default:* yes.
5. Will concessionaires take part? Pilot one GAA service plus one concession.
6. Does GAA's contract name Barrels as data controller (ADR-0033) before
   passenger data is collected?

## Build order (about five parallel lanes)

| Lane | Start | Blocked by |
| --- | --- | --- |
| 1 | mbia contact route with Turnstile | Nothing |
| 2 | Janitor `me/shift-assignments` endpoint, then the PWA shell | Host and access grant before deploy |
| 3 | Bus next-departure slice | Host |
| 4 | Events and Bookings restart (open PRs #538, #550, #551, #552; #542 is an owner merge) | Nothing |
| 5 | gaa.gd static scaffold on Cloudflare Pages | GAA content owner before publishing |
| after | Flyer rewards module in mbia | Goal, funding, merchant participation |
| after | Parking permit renewal reminder | Parking scope |

**Then widen in this order**
1. Janitor visits (phase 3).
2. Bus check-in.
3. mbia corporate content moves to gaa.gd.
4. Flyer pilot.
5. Parking product decision.

Any new npm package for the PWAs (such as a service-worker library) needs
approval first; the default is a hand-written service worker.
