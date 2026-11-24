# ADR-0066: Bookings businesses sign themselves up

## Status

Accepted 24 November 2026 by the owner (Bookings review, decisions 1 and 5;
issue #1808). Not built. Amends ADR-0059 for Bookings businesses only and builds
the entitlement link that ADR-0065 left unbuilt.

## Context

Barrels Bookings is to become the first-choice booking app for small businesses
in Grenada, then the Caribbean. The realistic Grenada market is roughly 900 to
1,250 small appointment businesses, 400 to 500 of them in beauty. Today a business
reaches Bookings only when Barrels staff create it by hand:

1. The owner makes a Barrels account.
2. A Barrels admin creates the organisation, enables the Bookings app and adds the
   owner as a member.
3. The owner fills in the profile, services, people and hours in Studio.

The "Run a business?" link on the Bookings homepage opens Studio, which tells a
new owner to ask someone to invite them. That is a dead end, and it means every
client costs staff time before it can try the product. Competitors (Fresha,
Booksy, Square, Wix, Squarespace) all let a business start alone, free, with no
card.

## Evidence

- **Facts:**
  - ADR-0059 rule 6: "the first owner is invited from the Barrels admin app" (high).
  - `organisations.service.create_organisation` creates an organisation, with
    reserved slugs suffixed (high).
  - Entitlements are rows in `org.organisation_app` with only an `enabled` flag
    and no record of why access was given (high).
  - ADR-0065: "Entitlement link (not built) ... behind an off-by-default flag" (high).
  - `bookings.service.upsert_profile` creates the profile on the first Studio
    save (high).
  - The sender-name guard falls back to the default sender for reserved names
    (`src/email.py`, PR #1807) (high).
  - The public listing is opt-in per business (`listed`) (high).
- **Interpretation:**
  - Best practice: onboarding ends on a short checklist and an explicit "go live".
    A blank dashboard loses new businesses (Mobbin research, 24 Nov 2026: Wix,
    Bonsai, GoDaddy, Turo).
  - Heuristic: a starter list of services for the business type cuts setup from
    tens of minutes to a few.
- **Uncertainty:**
  - How much abuse a self-serve path attracts in a small market (medium).
  - Whether one business per account is too tight for people who run two
    (medium; raise later on request).

## Options considered

| Option | Correctness and safety | Effort | Growth |
| --- | --- | --- | --- |
| A. Keep invitation only (today) | Safest; staff see every business | None | Limited by staff time |
| B. Self sign-up, Barrels approves before the booking page goes live | Safe, but every business waits on staff | Medium | Slow first impression |
| C. Self sign-up, live when the owner chooses; Barrels approves only the public listing | Abuse is limited by the safeguards below; a bad page is reachable only by its link until approved | Medium | Fast |

## Decision

Option C.

1. **Sign-up route.** A new route `POST /bookings/me/businesses` (zone `me`) creates
   a business for the signed-in account. It needs:
   - an account with a verified email, and
   - a Turnstile token, under the same policy as public booking.

   The body holds the business name, the business type (`BookingBusinessType`,
   PR #1805), an optional town and an optional starter template key.
   In one transaction it creates:
   - the organisation (kind `business`, active; reserved slugs suffixed as today);
   - the caller's owner membership;
   - Bookings and Contacts access, recorded as `source = trial` (see 5);
   - the bookings profile, with online booking **closed**, `listed` off,
     `requires_confirmation` on and the business's time zone and currency from
     its country (Grenada: `America/Grenada`, `XCD`);
   - one provider named after the owner, with default weekday hours;
   - the starter services, if a template was chosen;
   - the first-month trial grant from ADR-0065.

   The route is idempotent on an `Idempotency-Key`.
2. **Limits.**
   - One self-created business per account until Barrels raises it for that account.
   - Three sign-ups per hour per visitor address.
   - Names pass through the platform reserved-name list for the slug.
   - The sender-name guard decides the email sender as today. A name it rejects
     still creates the business but is flagged for staff review in the admin
     console.
3. **Going live.** Studio opens on a setup checklist:
   - services (at least one active);
   - hours (at least one provider with hours);
   - contact details;
   - logo and colour (optional);
   - **Go live**, which opens online booking.

   The API refuses to open booking while a required item is missing (409 with
   the missing items named).
4. **Public listing needs approval.** A business that turns `listed` on appears on
   the Bookings homepage only after Barrels staff approve it in the admin console:
   - a new `listing_approved_at`, set by `bookings.listing.approve`;
   - the approval is audited, and staff can withdraw it;
   - its booking page works by direct link before that.

   Businesses created by Barrels before this record are treated as approved.
5. **A subscription unlocks access, behind a switch.**
   - **Grants:** `org.organisation_app` gains a `source` column. `manual` covers
     every existing row and staff grants; `trial` and `subscription` are new.
   - **The switch:** `BOOKINGS_ACCESS_FOLLOWS_SUBSCRIPTION`, off by default.
     While it is on, a `trial` or `subscription` grant stays enabled during the
     trial, while the subscription is active or past due, and for 7 days after it
     ends (the owner's one-week grace). After that, Bookings access is paused:
     - the booking page shows the business is not taking online bookings;
     - Studio becomes read-only, except Plan & billing;
     - no data is deleted.

     Paying reopens it.
   - **Exempt:** `manual` grants (Barrels clients such as Babydoll, and staff
     grants) never follow the switch.
6. **Starter templates.** Fixed data in the bookings domain, keyed by template:
   hair salon, barber, nails, lashes and brows, massage and spa, fitness coach,
   tutor, tour operator, photographer, and blank. Each template lists services
   with a name, length and a suggested EC$ price, all editable in Studio. A
   template never sets deposits or policy.
7. **ADR-0059 rule 6** stays for every other app and for businesses Barrels sets
   up for a client. Bookings businesses may now also start themselves.

Not decided here:
- plan limits, such as one provider on Solo. That goes in a pricing slice once
  the owner publishes prices;
- staff roles below admin (roadmap #1808);
- deleting abandoned businesses. Any deletion stays an owner decision.

## Consequences

- A business can try Bookings in minutes without Barrels staff, and the
  homepage's "Run a business?" leads somewhere.
- Barrels staff gain a small review queue: listing approvals and flagged names.
- Anyone with a verified email can create one business and a booking page reachable
  by link. A misleading page is contained by the listing approval, the sender-name
  fallback and staff removal, not prevented up front.
- `org.organisation_app` gains a column and its rows gain a meaning, so every place
  that grants access must say why. Babydoll and other client grants stay `manual`.
- With the switch off, nothing about access changes. Turning it on is an owner
  decision taken when live billing is ready (ADR-0027 live gate).
- Slices:
  1. The access `source` column and the listing approval.
  2. The sign-up route with templates.
  3. The go-live checks.
  4. The subscription switch.

  The Studio setup screens are front-end work for the design session.
