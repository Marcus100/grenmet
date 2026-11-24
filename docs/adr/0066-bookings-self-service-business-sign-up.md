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

For the listing approval, the organisation's existing `verification_status` was
considered and not used. It means a checked business identity, which Events uses
before money moves, and a business can be listed long before it is verified.
Listing approval is narrower, so it gets its own field.

## Decision

Option C.

1. **Sign-up route.** A new route `POST /bookings/me/organisations` (zone `me`;
   the same path's `GET` already lists the caller's businesses) creates a business
   for the signed-in account. It needs:
   - an account with a verified email;
   - an `Idempotency-Key`;
   - a Turnstile token, required in staging and production whatever the global
     switch says, and checked inside the idempotent handler like public booking.

   The body holds the business name, the business type (`BookingBusinessType`,
   PR #1805), an optional town and an optional starter template key.

   In one transaction it creates:
   - the organisation (kind `business`, active, `created_by_user_id` set). Both
     the organisation `slug` and the bookings `public_slug` get the reserved-name
     suffix;
   - the caller's owner membership;
   - Bookings and Contacts access with `source = trial`;
   - the bookings profile, with online booking **closed**, `listed` off,
     `requires_confirmation` on and the time zone and currency of its country
     (Grenada: `America/Grenada`, `XCD`);
   - one provider named after the owner, with default weekday hours;
   - the starter services, if a template was chosen;
   - the trial, which starts now (see 5).
2. **Limits.**
   - **One business per account.** The account may have created at most one
     business itself, counted by `created_by_user_id` and checked while holding
     the account's row lock, so two requests with different keys cannot both pass.
     Being a member of a business someone else created does not count. Barrels
     staff can raise the limit for one account.
   - **Three sign-ups per hour** per visitor address.
   - **Names.** The sender-name guard decides the email sender as today. A name it
     rejects still creates the business, but staff are asked to review it in the
     admin console.
3. **Going live.** Studio opens on a setup checklist:
   - services (at least one active);
   - hours (at least one provider with hours);
   - contact details;
   - logo and colour (optional);
   - **Go live**, which opens online booking.

   The API refuses to open booking while a required item is missing, with a 409
   that names the missing items.
4. **Public listing needs approval.** A business that turns `listed` on appears
   on the Bookings homepage only after Barrels staff approve it in the admin
   console:
   - a new `listing_approved_at`, set under `bookings.listing.approve`;
   - the approval is audited, and staff can withdraw it;
   - its booking page works by direct link before that.

   Businesses created by Barrels before this record are treated as approved.
5. **Trial and subscription.**
   - **Trial.** A self-created business's trial starts at sign-up and ends at a
     stored `trial_ends_at`, 30 days later. A Checkout started during the trial
     passes only the days left to Stripe, never a fresh 30. This amends ADR-0065's
     trial, which counts from Checkout, for self-created businesses only. Babydoll's
     seeded grant is unchanged.
   - **Where access came from.** `org.organisation_app` gains a `source` column:
     - every existing row becomes `manual`;
     - self sign-up writes `trial`;
     - the first active subscription changes `trial` to `subscription`;
     - a staff member turning access on or off sets `manual`, which opts that
       business out of the switch;
     - the bundled Contacts row always carries the same source as Bookings and
       pauses with it.
6. **Paused is a state, not `enabled = false`.** Turning access off would hide the
   business and break customers' links to bookings they already made. So a
   business has a separate `paused_at`.
   - **The switch:** `BOOKINGS_ACCESS_FOLLOWS_SUBSCRIPTION`, off by default.
   - **When it is set:** while the switch is on, `paused_at` is set when a `trial`
     or `subscription` grant has no trial left, no subscription that is active or
     past due, and the 7-day grace (the owner's rule) has run out.
   - **When it clears:** on payment.
   - **Exempt:** `manual` grants never pause.

   | While paused | Behaviour |
   | --- | --- |
   | Storefront `GET /bookings/public/{slug}` | 200, with `accepting_bookings: false` and the business's contact details |
   | Availability, email code and public create | 409, "This business is not taking online bookings right now" |
   | Manage, cancel, reschedule and calendar file by token | Unchanged: customers keep their bookings |
   | Existing bookings | Kept. Reminders and cancellation mails still go out |
   | Public listing | Hidden |
   | `GET /bookings/me/organisations` and Studio reads | Allowed, with the business marked paused |
   | Studio writes | Refused (409), except Plan & billing, cancelling or declining bookings, and contact erasure |
   | Calendar feed for the business | Unchanged |
7. **Owner leaves.** When the last owner of a self-created business deletes their
   account:
   - online booking closes;
   - the business is unlisted;
   - the provider named after that owner is renamed "Staff";
   - the business is flagged for staff in the admin console.

   Existing bookings stay manageable by their customers. Nothing is deleted.
   Deletion remains an owner decision.
8. **Starter templates.** Fixed data in the bookings domain, keyed by template:
   hair salon, barber, nails, lashes and brows, massage and spa, fitness coach,
   tutor, tour operator, photographer, and blank. Each template lists services
   with a name, length and a suggested EC$ price, all editable in Studio. A
   template never sets deposits or policy.
9. **ADR-0059 rule 6** stays for every other app and for businesses Barrels sets
   up for a client. Bookings businesses may now also start themselves.

Not decided here:
- plan limits, such as one provider on Solo. These come in a pricing slice once
  the owner publishes prices;
- staff roles below admin (roadmap #1808).

## Consequences

- A business can try Bookings in minutes without Barrels staff, and the
  homepage's "Run a business?" leads somewhere.
- Barrels staff gain a small review queue: listing approvals, flagged names and
  businesses whose owner left.
- Anyone with a verified email can create one business and a booking page reachable
  by link. A misleading page is contained by the listing approval, the sender-name
  fallback and staff removal, not prevented up front.
- `org.organisation_app` gains a column and its rows gain a meaning, so every
  place that grants access must say why. Babydoll and other client grants stay
  `manual`.
- With the switch off, nothing about access changes. Turning it on is an owner
  decision taken when live billing is ready (ADR-0027 live gate).
- Slices:
  1. The access `source` column, `created_by_user_id`, the listing approval and
     the owner-leaves handling.
  2. The sign-up route with templates and the trial start.
  3. The go-live checks.
  4. The paused state and the subscription switch.

  The Studio setup screens are front-end work for the design session.
