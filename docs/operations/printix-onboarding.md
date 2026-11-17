# Printix onboarding: organisers and gate leads

For a Barrels administrator (superuser). Owner: Barrels Grenada. Use it to give Printix's
own staff access to the organiser screens at `scan.barrels.gd/organiser` (ADR-0060 organiser
amendment). Everything is done from `admin.barrels.gd`; no API calls.

| Role | What they can do |
| --- | --- |
| Organiser | Set up events, import tickets and make gate QR codes |
| Gate lead | Make and cancel gate QR codes on event night |

## Before you start

- Your own account has an authenticator (superuser actions need two-step verification).
- The person has a Barrels account. If they have none, ask them to create one first
  (account.barrels.gd). Adding an email with no account is refused with a clear message;
  nothing is created for them.

## Steps

1. **Organisation.** In admin.barrels.gd, open Organisations, then the Printix organisation
   (create it with kind Client if it does not exist).
2. **Turn Printix on.** Under App access, switch on Printix.
3. **Add the person.** On the same page, in "Printix access", use "Add person to Printix": their
   email, Organiser or Gate lead, and a reason. This adds them as a member, gives the access and
   gives them permission to sign in to the Printix app, in one step.
4. **Change or remove access later.** In the same table, pick a new level and a reason, then
   Save access. "No Printix access" removes the level; it also removes their Printix sign-in
   (and ends their Printix sessions) when they hold no other Printix access.
5. **The person adds an authenticator** in their Barrels account (every organiser screen needs
   one). Without it, sign-in at scan.barrels.gd is refused.
6. **The person signs in** at `scan.barrels.gd/organiser` with their email code.

## Notes

- Owners and admins of the organisation already hold every Printix permission. The table shows
  "Full access"; changing the level only gives them sign-in. To take their access away, change
  their role under Members.
- "Cannot sign in" next to a person means the account lacks the Printix sign-in role or is
  inactive. Setting any access fixes the role.
- **To end someone's access, set their Printix access to "No Printix access" first**, then remove
  them from the organisation under Members if needed. Removing a member (or suspending the
  organisation, or switching Printix off for it) ends their Printix permissions at once: the
  organisation keys are gone anyway. Only the Printix sign-in role stays, so the person can still
  sign in to the app but sees nothing. Setting access to none first also removes that role.
- A sign-in role given by hand to someone with no Printix access is left alone by "No Printix
  access"; it is removed only when this screen ends real access and none remains.
- A suspended organisation cannot be given new access.
- Every change appears under History on the organisation page, with your reason.
