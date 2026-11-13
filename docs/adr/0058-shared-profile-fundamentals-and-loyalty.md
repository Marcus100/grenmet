# ADR-0058: Shared profile fundamentals and loyalty for every Barrels app

## Status

Proposed — 2026-11-13 (issue #1373). Nothing is built until the owner
approves. The open questions at the end each carry a recommended answer.

## Context

Every Barrels app should share one well-designed set of profile basics: a
personal ID, rewards, points, loyalty and gamification. The account app
(`account.barrels.gd`, ADR-0057) is the person's home; `auth.barrels.gd` is for
signing in only. Businesses are Barrels' clients and their customers are the
people. The first user of this is the bookings product; Events comes next.

## Evidence

**Facts**

- **Account:** `auth.models.User` holds the email, names, `phone_e164` and the
  sign-in data. Other modules extend it by `user_id`. There is no public ID.
- **Customers:** each organisation keeps its own record of each person in
  `org.contact` (ADR-0028). Matching uses an exact email hash within that
  organisation only. The table has an optional `user_id` link, append-only
  consent, an audited merge and erase-in-place (`src/contacts/AGENTS.md`).
- **Bookings:** `bookings.customer` has a required `contact_id`. Guests book
  without an account. A completed booking sends a `bookings.completed` reward
  event only if the contact is linked to an account.
- **Events:** orders and tickets key on the account's user ID. Events has its
  own social profiles with a visibility setting.
- **Rewards today** (`src/rewards/`): the ledger (`entry`) can only be added
  to and balances are always calculated. It is keyed by `account_id` and the
  organisation. The only programme kind is `stamp_card`. Stamps are credited
  from real actions through `record_qualifying_action` and the outbox, and
  crediting the same action twice adds nothing. Refunds and cancellations
  reverse the credit. One-time redemption codes, a check on too many earns in a
  short time, signed venue QR codes, check-ins, streaks, trails and
  achievements exist. Leaderboards, challenges and gifting are behind feature
  flags.
- **Expiry:** ADR-0030 decided points expire after 12 months with no activity,
  with a reminder 30 days before. That is not built.
- **Photos:** visible to the owner, superusers and people who share an active
  membership or employer (`profile_images/service.py`). A business's customers
  are contacts, not members, so business staff do not see customer photos.
- **Account deletion:** `DELETE /auth/users/me` hard-deletes the user
  (`auth.service.delete_user`).

**Interpretation**

- **Likely break (not yet tested):** deleting an account that has ledger rows
  probably fails, because `rewards.entry.account_id` references `user.id` with
  no on-delete rule and the ledger refuses deletes.
- Loyalty schemes are best run by each business. Pooling points across
  unrelated businesses makes them look like stored value and creates
  cost-sharing disputes.

**Uncertainty**

- How common phone-only customers are. If most are phone-only, emailed claims
  are not enough.

## Options considered

**The person model**

1. **Global account only.** Guests earn nothing. Simplest, but it ignores how
   walk-in businesses work.
2. **Ledger keyed by contact.** Guests earn straight away. This rewrites an
   add-only ledger and lets anyone typing an email earn points.
3. **Account plus each business's contact, with late credit on claim
   (recommended).** The account stays the one identity and the contact stays
   the business's record. Rewards adds a membership table (`rewards.member`:
   organisation and a required `contact_id`). Linking a contact to an account
   credits that contact's past qualifying actions; crediting twice adds
   nothing, so late credit is safe.
4. **A global person record shared across businesses.** Already rejected in
   ADR-0028.

**The member ID**

- **A. One global number shown everywhere.** Lets businesses track a person
  across each other.
- **B. A member number per business, plus a short-lived QR code
  (recommended).**
- **C. QR code only.** Fails when there is no phone or no signal.

## Decision (proposed)

1. **The person.** Adopt option 3. Only an account can redeem. Points credited
   from a guest booking wait until the person claims them. Claiming happens in
   the account app, which shows the businesses that hold the person's verified
   email. A walk-in can be linked at the counter when staff scan the person's
   account QR code. Contacts are never linked or merged on name or phone.

2. **Profile fields and who sees them.** `auth` keeps sign-in data and names.
   A new `profiles` module, keyed by `user_id`, holds preferred name, birthday
   (day and month only), language, units and notification preferences. The
   photo module joins it later.

   | Viewer | Sees |
   | --- | --- |
   | The person | Everything, with editing and export |
   | The same business | Its own contact record, member number and programme history; the photo and birthday only if the person turns sharing on for that business (off by default) |
   | Other businesses | Nothing, not even whether the person exists |
   | Barrels staff | Admin-zone support views, written to the audit record |

   Marketing consent stays on the contact.

3. **The member ID.** Each account gets a random `public_id`, seen only by the
   person and Barrels support and never put in a QR code. Each
   `rewards.member` gets a random 8-character member number (no I, L, O or U,
   with a check character), unique within the business and shown at the
   counter. The account app shows a QR code holding a random one-time token
   that lasts 2 minutes (`POST /rewards/me/pass-tokens`); staff resolve it with
   `POST /rewards/org/members/scan`, which returns only that business's member
   record. A leaked member number is replaced by the person or staff.

4. **Points and loyalty.**
   - **Scope:** each business runs its own programme. A platform-wide tier may
     come later and would count activity, never pooled points.
   - **Ledger:** stays add-only. New entry kinds: `expire`, `forfeit`, `debt`.
   - **New programme kind `points`,** with earning rules stored as data
     (`earn_rule`): the event that counts, a fixed amount or points per
     currency unit, and daily and per-event limits.
   - **Redemption:** a rewards list (`reward`: cost and description) using the
     existing one-time code flow.
   - **Expiry:** as ADR-0030 decided; a daily background job writes the
     `expire` entries and sends the reminder.
   - **Refunds:** a refund or cancellation reverses the points; a partial
     refund reverses the matching share. If the points were already spent, the
     balance becomes a debt that future earnings repay. A reward already given
     is never taken back.
   - **Fraud limits:** the existing burst check, a daily cap, and a flag when a
     business's own staff earn on their own bookings. Earned points stay
     pending until the refund window closes.
   - **What the business owes:** `GET /rewards/org/reports/liability` shows
     points outstanding, and points issued, redeemed, expired and reversed each
     month, with a money value if the business sets one per point. An
     accountant signs off the wording.

5. **Gamification.** Badges, streaks, tiers and achievements stay in `rewards`,
   worked out on each read from the ledger and activity records. Tier
   thresholds are set per programme over the last 12 months. The current bans
   stay: no buying or cashing out points, no random prizes, no rewards for
   opening the app, no public boards ranked by spending.

6. **Who owns what.**

   | Module | Owns |
   | --- | --- |
   | `auth` | The account and `public_id` |
   | `profiles` | Profile fields and per-business sharing |
   | `contacts` | The business's record of the person, consent and claims |
   | `rewards` | Members, the ledger, programmes, rules, the rewards list, gamification and QR codes |
   | `bookings`, `events` | Send `rewards.qualifying_action` through the outbox |

   The outbox payload gains optional `contact_id`, `amount_minor` and
   `currency`. No module reads another module's tables. Routes follow the four
   zones in ADR-0025.

7. **Privacy.**
   - **Export:** `GET /profiles/me/export` returns the account, profile, linked
     contacts, ledger per business, check-ins and achievements as JSON.
   - **Account deletion becomes anonymisation:** deactivate the account and
     blank its personal fields, delete the photo and profile, unlink contacts,
     revoke member numbers and write `forfeit` entries for unspent points.
     Ledger rows are kept under the anonymous ID for the business's accounts,
     then cut down to totals once the retention period ends.
   - **When a business leaves:** its programmes pause, members get 30 days to
     redeem, then everything left expires. The business gets an export of its
     contacts and ledger.
   - **Retention:** the ledger is kept 6 years (provisional; an accountant
     confirms) and added to the retention table in `docs/security.md`.

8. **Migration and slices.** Every schema change is additive.
   - **Slice 1 (bookings), no ledger changes:** a stamp card on the existing
     `bookings.completed` event; the booking site forwards the signed-in
     session so new bookings link to the account; the claim flow with late
     credit for the last 90 days; the rewards page moves to the account app;
     staff confirm redemption codes; the account-deletion fix.
   - **Slice 2:** `rewards.member`, member numbers, QR codes, counter linking.
   - **Slice 3:** points programmes, earning rules, expiry, liability report.
   - **Slice 4:** tiers, then Events.

## Consequences

- People see one home across apps, and businesses see only their own
  customers.
- Guest bookings earn points once claimed, with no rewrite of the ledger.
- Points become something businesses owe their customers, so they need the
  report and an accountant's review.
- There is one more module (`profiles`), and the outbox payload gains optional
  fields.

## Open questions for the owner

1. Should guests earn points that are held until they claim them?
   **Recommended:** yes, back to 90 days.
2. Can business staff see a customer's photo? **Recommended:** only if the
   person turns it on for that business.
3. Should the global personal ID be hidden from businesses? **Recommended:**
   yes; businesses see only their own member number.
4. What happens to unspent points when an account is deleted?
   **Recommended:** they are forfeited, with a warning first.
5. How long do members get to redeem when a business leaves?
   **Recommended:** 30 days.
6. Should a platform-wide tier come later? **Recommended:** yes, based on
   activity only and opt-in, after Events.
