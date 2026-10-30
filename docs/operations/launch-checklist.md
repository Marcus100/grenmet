# Launch checklist: legal, support and access status

**Status:** Active checklist; evidence from the repository on 2026-10-30  
**Owner:** Barrels Grenada engineering (decisions: repository owner)  
**Last updated:** 2026-10-30

Planned launch: about 10 November 2026. This table covers the non-monitoring
launch gaps. Monitoring inputs are in [launch monitoring inputs](launch-monitoring-inputs.md);
response is in the [incident runbook](incident-runbook.md). Engineering does not
draft legal text. Wherever a page is missing, the table lists what it must cover
and flags it for the owner and a lawyer.

## Status summary

| Item | Owner | State | What is missing |
| --- | --- | --- | --- |
| Privacy notice | Owner, with a lawyer; client sponsor for GAA and GMS sites | Partial: 4 of the public sites have a page; 3 are marked in code as drafts awaiting owner review and the gms page carries no marker | Review of all four pages (gms has never been marked for review); pages for the public apps without one (below) |
| Terms of service | Owner, with a lawyer | Missing for the platform; one informal "terms of use" section on the CAP hub | Decision on which apps need terms; a lawyer-reviewed text |
| Support route | Owner | Partial: some apps have a contact page or address, several have none | A single agreed support address or form per public app |
| Restore drill | Engineering, owner approves the run | Built, never run against real backups | First human-timed run and its recorded result |
| Authenticator enforcement | Owner | Code ready; not enforced in any environment | Key, variable, enrolment and staging acceptance |

## Privacy notice

Pages that exist (mbia, signal and events carry a code comment saying the wording,
contact route and retention periods need owner review; the gms page has no such
marker, so treat it as unreviewed too):

| App | Page | Notes |
| --- | --- | --- |
| mbia (airport site) | `apps/web/mbia/src/app/privacy` | Covers the contact form and a 24 month deletion period; the contact address and wording need the client's confirmation |
| signal | `apps/web/signal/src/app/privacy` | Points to the Barrels contact page for requests |
| events | `apps/web/events/src/app/(public)/privacy` | Points to the Barrels contact page for requests |
| gms (public weather site) | `apps/web/gms/src/app/(pages)/privacy` | Linked from its footer; points to its contact page |

Apps in the production catalogue that are public (or have public sign-up) and
have **no privacy notice page**:

| App | Why it needs one |
| --- | --- |
| auth (Barrels ID) | Collects accounts, email addresses and sessions; open registration |
| bookings | Collects customer names, contact details and booking history for businesses |
| babydoll (client site, Vercel) | Booking links and contact; analytics consent applies |
| cap (public alert hub) | Probably collects little; confirm whether any personal data or analytics are used |
| elections | Public site with a register page; confirm what, if anything, it collects |
| docs | Has a feedback route; confirm what it stores |
| barrels (company site) | Has a cookie and analytics choice control and a contact and newsletter form, but no notice page or link to one |

Staff-only apps (admin, gaa-admin, gmsdash, cms) do not need a public notice but
need an internal staff data notice from the owner.

A privacy notice must cover (owner and lawyer to confirm; not drafted here):

- who is responsible for the data, and the contact for requests;
- what is collected per form and per feature (accounts, bookings, contact
  messages, newsletter, analytics with consent, Sentry error data without personal
  data, logs);
- why each item is used and the lawful basis;
- who receives it (hosting, email, error monitoring, analytics, payment and
  bot-protection providers) and any transfer outside Grenada;
- retention period for each kind, and how deletion works;
- user rights and how to exercise them;
- cookies and consent, matching what the sites really do;
- how to complain and how breaches are handled.

## Terms of service

Nothing exists at platform level. The CAP hub (`apps/web/cap/src/app/about`) has a
short "Terms of use" list that says alerts are shown as issued; that is a
disclaimer, not a contract.

Needs, for the owner and a lawyer to decide and write:

- which apps need terms at all (at least auth, bookings and any paid or
  account-based service; public information sites may need only a disclaimer);
- acceptable use and account responsibilities;
- booking, payment, refund and cancellation terms where money is taken;
- service availability, warning and forecast disclaimers (agreed with the client);
- intellectual property and content ownership (Barrels, client, user);
- liability, governing law and how changes are announced;
- the link on sign-up and checkout, and a record of what the user accepted.

## Support route

| App | Route found in the repository | Gap |
| --- | --- | --- |
| barrels (company site) | Contact form (`/contact/`) posting to the API | None found; confirm someone reads it and by when they answer |
| gms (public weather site) | `/about/contact` and `/help` pages | Confirm who answers and the stated hours |
| mbia | Contact page and a client address, plus a contact form API | Client to confirm the address is monitored |
| signal | Refers visitors to the Barrels contact page | Depends on the Barrels contact route being staffed |
| events | Refers visitors to the Barrels contact page | Same |
| babydoll | Contact page with studio address and hours; no email or form | Add a direct contact method agreed with the client |
| bookings | Tells users to contact "the business directly" or Barrels | No Barrels address or form named for platform faults |
| auth | None found | Sign-in and account problems have no stated route |
| cap | None found | Add a route for corrections and feedback |
| elections | None found | Add a route for corrections and feedback |
| docs | Feedback route and a help link | Confirm where feedback goes and who reads it |

The owner must choose one monitored support address or form, a response target,
and a person or role behind it. List it in the incident runbook's contact sheet.

## Restore drill

Source: [restore drill](restore-drill.md). State: built, **not yet run against real
backups** (also noted in [infrastructure](../infrastructure.md#current-operational-gaps)).

Missing, in order: the read-only Spaces key stored as `DO_SPACES_READ_ACCESS_KEY_ID`
and `DO_SPACES_READ_SECRET_ACCESS_KEY` in the `production-backup` environment
(not present on 2026-10-30); a first human-timed run without the optional API
check; saving the row-count floors file after that run; then a second run with
`api_check`. Nothing opens an issue when the drill fails. Owner decision: when to
run it off-peak before 10 November.

## Authenticator enforcement

Source: [privileged MFA](privileged-mfa.md). State: implemented and ready for
staged acceptance; the deploy renderer defaults `AUTH_PRIVILEGED_MFA_MODE` to
`disabled`, and neither GitHub environment sets the variable on 2026-10-30, so
**nothing is enforced**. The secret `AUTH_TOTP_ENCRYPTION_KEYS` exists in staging
only.

Missing:

1. Generate the key and store `AUTH_TOTP_ENCRYPTION_KEYS` in the production
   environment, with a separate protected backup copy.
2. Run the rollout dry run, apply and readiness check for each environment.
3. Every privileged person enrols and saves recovery codes.
4. Staging acceptance with disposable accounts and recovery tested.
5. Set the variable `AUTH_PRIVILEGED_MFA_MODE=enforce` in staging, then
   production, and redeploy.

Owner decision: enforce before launch or launch with it disabled and a dated plan.
The related gap "MFA not enforced on all staff accounts" remains open in
[cybersecurity continuity](cybersecurity-continuity.md#10-gaps-requiring-closure).
Also tick the provider accounts in the [account 2FA checklist](account-2fa-checklist.md).

## Related

- [Launch monitoring inputs](launch-monitoring-inputs.md)
- [Incident runbook](incident-runbook.md)
- [Release runbook](release-runbook.md)
- [Post-launch review](post-launch-review.md)
- [Launch findings register](launch-findings.md)
