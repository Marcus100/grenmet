# ADR-0059: Sign-up paths by kind of user

## Status

Accepted — 2026-11-15. Owner direction (15 Nov 2026): customers get a very
simple sign-up and verify whatever they want afterwards; Barrels staff get a
stricter but still short path; follow best practice. The owner accepted the
record as written, including the three answers at the end. Build in slices,
each with its own tests and, for anything touching sign-in or permissions, a
security review with no open finding before merge. Rules 2 and 4 relax a
protection and ship last, behind their own review.

Build progress: rules 2 and 4 are implemented on branch
`feat/adr-0059-rules-2-4` (migration `authsessionemail20261115`, adds
`session.email_code_verified_at`; `src/auth/totp_enrolment.py`; tests in
`tests/auth/test_mailbox_proof_enrolment.py`). Merged into `dev` in PR #1515
(checked 21 Nov 2026); they are live in an environment once a release carrying
that merge reaches it.
Operations detail: `docs/operations/privileged-mfa.md`, "Mailbox proof during
set-up".

Amended 24 November 2026 by ADR-0066: Bookings businesses may also create
themselves; rule 6 stays for every other app and for businesses Barrels sets up.

## Context

One sign-up serves everyone today, and the strict parts are bolted on afterwards.
On 15 November 2026 it took seven steps and two hand-run server scripts to give
one Barrels administrator a working account on production:

1. Sign up with an emailed code.
2. A server script to set `is_superuser` (no supported path exists).
3. A second server script to clear `registration_pending`, because the only
   approval screen is HR's, which needs a GAA or GMS staff organisation
   (`src/baseline/service.py` `approve_registration`), and staff-scope apps
   refuse a pending account (`src/auth/eligibility.py` `is_staff_eligible`).
4. Set up an authenticator, which first needs a second emailed code
   (`src/auth/totp_enrolment.py`).
5. Set a password by emailed link, only because recovery codes need a password
   plus an authenticator code (`src/auth/account_security.py`
   `new_recovery_codes`).
6. Sign out and sign in again, because setup never upgrades the session
   (`docs/operations/privileged-mfa.md`).
7. Only then use the admin app.

The configured first superuser could not do any of this: its address does not
receive mail, so the emailed code in step 4 never arrives, and a privileged
account with no authenticator may not change its email.

Giving a client business its first owner needed a superuser with an
authenticator and the admin app (`POST /organisations/{id}/admin/members`),
because an invitation needs an existing owner.

Customers are already well served: one email, one code, no password
(`apps/web/auth/AGENTS.md`), and verification never gates access (owner
decision, 16 October 2026, ADR-0018).

## Evidence

- **Facts**
  - Microsoft made new consumer accounts passwordless by default from May 2025:
    sign-up no longer asks for a password, and sign-in picks the strongest
    method the person has. Source: Microsoft Security blog, 1 May 2025
    ("Pushing passkeys forward"). Confidence: high.
  - Google has offered passkeys as the default sign-in for personal accounts
    since October 2023, with "skip password when possible" on by default;
    passwords remain available. Source: Google blog ("Passwordless by default").
    Confidence: high for 2023; not re-checked for later changes.
  - Apple's 2025 platforms add an account creation interface that creates the
    account with a passkey in one system sheet, and automatic passkey upgrades
    that add a passkey during an ordinary sign-in. Source: Apple WWDC 2025
    session 279; details from secondary write-ups. Confidence: medium.
  - Microsoft's guidance for administrators: use the strongest credentials
    (security keys, passkeys), and start a new administrator with a short-lived,
    single-purpose pass issued by an existing administrator, used once to
    register the strong credential. Source: Microsoft Learn, "Deploy
    phishing-resistant passwordless authentication". Confidence: high.
  - NIST SP 800-63B-4 expects a phishing-resistant option to be offered at its
    second assurance level, no longer accepts security questions, and treats
    saved recovery codes as a recovery method (random, stored hashed, attempts
    limited). Source: secondary summaries of the final text; the exact normative
    wording was not read. Confidence: medium.
  - This platform already has: emailed-code sign-up, Google sign-in,
    authenticator apps with encrypted secrets, hashed single-use recovery codes,
    organisation invitations (`src/organisations/members.py`), HR onboarding
    with activation links, and a superuser gate that always requires an
    authenticator (`src/auth/superuser_mfa.py`). Confidence: high.
- **Interpretation**
  - Best practice: friction should match what the account can reach. Ordinary
    accounts start with almost nothing and add protection later; accounts with
    power over other people's data are invite-only and must hold a second
    factor before the power works.
  - Best practice: a new privileged person is brought in by an existing one,
    with a short-lived single-use link, and sets up the strong credential in
    the same visit.
  - Heuristic: every extra email round trip loses people and adds failure
    points (a bounce on 15 November blocked setup until the address was removed
    from the mail provider's suppression list).
- **Uncertainty**
  - Passkey support on the phones and browsers our customers and gate staff
    use in Grenada is unmeasured. This record plans for passkeys but does not
    depend on them.
  - Whether client organisations (GAA) want a stricter rule for their own
    staff than this record sets.

## Options considered

1. **Keep one sign-up, document the manual steps.** No build cost. Leaves
   server scripts as the only way to create an administrator, keeps seven
   steps, and keeps the first client owner dependent on a superuser. Rejected:
   the manual path is error-prone and unaudited by design.
2. **One sign-up, stricter for everyone** (password and authenticator at
   sign-up). Simple to reason about. Rejected: it breaks the owner's goal of
   getting as many people registered as possible and contradicts ADR-0018.
3. **Four paths, by kind of user, sharing one account and one sign-in page**
   (chosen). More flows to build and test, but each is short, and the strict
   rules sit only where the power is.

## Decision

One Barrels account per person stays (ADR-0058). What differs is how a person
gets in and what must be true before a kind of power works.

| Kind of user | How they join | Required before it works | Offered later |
| --- | --- | --- | --- |
| Customer (books, buys tickets, reads) | Self sign-up: email, then a 6-digit code. Google stays an option | Nothing else: no password, name or approval | Name, phone, password, authenticator, passkey |
| Business member (a client business's owner, admin or staff) | Invitation by email from the business's owner or admin; the first owner is invited from the Barrels admin app | Accepting the invitation with an emailed code. Owners and admins are prompted to add an authenticator; it becomes required for a business once it takes online payments | Passkey |
| Client staff (GAA, GMS) | The existing HR onboarding and approval by their organisation (ADR-0018) | As today; privileged roles need an authenticator | Passkey |
| Barrels staff and superusers | Invitation only, from a superuser whose session passed two-step sign-in. No self sign-up to this kind | In one visit: accept the link with an emailed code, set up an authenticator, save recovery codes. Then the admin app works | Passkey, then required for superusers once measured as usable |

Rules that make the short paths safe:

1. **Superuser invitation.** A new control-plane action, superuser-only and
   gated by `require_superuser_mfa`, takes an email and a reason and creates a
   single-use invitation that expires in 24 hours. Accepting it with the emailed
   code grants `is_superuser`, clears `registration_pending` and writes one
   audit row naming the inviter, the invitee and the reason. It refuses an
   address that already belongs to an inactive or anonymised account. The very
   first superuser of an empty system stays a reviewed command in `scripts/`,
   with a preview mode and an audit row.
2. **One mailbox proof per visit.** When a sign-in in the last 10 minutes was
   completed with an emailed code, authenticator setup on a privileged account
   does not ask for a second emailed code. A password-only or Google-only
   session still gets the emailed code (the stolen-password protection of
   issue #625 is unchanged).
3. **Setup ends with recovery codes.** The last screen of authenticator setup
   shows the eight recovery codes. Creating or replacing them needs the
   current authenticator code, plus the password only when the account has one.
4. **Setup can complete the two-step sign-in.** When rule 2 held and the
   authenticator code was just verified, the current session is marked as
   two-step verified, so the person is not asked to sign out and in again. In
   every other case the existing rule stays: setup never upgrades a session.
5. **Superusers skip the HR approval queue.** `registration_pending` no longer
   blocks a superuser from staff-scope Barrels apps; it keeps its meaning for
   GAA and GMS staff tools.
6. **First owner of a business.** The admin app's organisation page gains
   "Invite owner", which sends the ordinary organisation invitation. The
   existing "Add member" stays for accounts that already exist.
7. **Verify later, gently.** Customers see at most one optional prompt per
   visit (add a name, add a phone, protect your account), never a blocking
   screen, and never before finishing a booking or purchase.
8. **Customer sessions** last 30 days on the device they signed in on;
   sensitive actions (changing the email, deleting the account) ask for a
   fresh code.

Not decided here: passkeys (a separate record once device support is
measured), phone-number sign-in, and any change to GAA or GMS staff rules.

## Consequences

- Creating a Barrels administrator drops from seven steps and two server
  scripts to four screens with no server access, and is audited as one action.
- A client business can be given its first owner without a superuser editing
  membership by hand, and the owner brings in their own staff.
- Rules 2 and 4 relax two protections under a narrow condition. They need
  tests for every other path (password session, Google session, old code,
  replayed invitation) and a security review before merge.
- The placeholder first superuser can be retired once two invited superusers
  exist: deactivate it (start-up recreates it by email if it is deleted) and
  rotate its configured password.
- `docs/operations/privileged-mfa.md`, `docs/security.md`, the auth and
  organisations `AGENTS.md` files and the admin app change with the build.

## Owner answers

Accepted by the owner on 15 Nov 2026:

1. Business owners: prompt for an authenticator now, require it when the
   business takes online payments.
2. Passkeys: plan as the next step for Barrels staff, in a separate record.
3. Customer sessions: 30 days on the person's own device.
