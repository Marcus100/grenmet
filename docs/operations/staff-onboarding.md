# Staff onboarding without an email inbox

Owner: Barrels platform. Client acceptance: GAA/GMS.
**Status:** Active reference  
**Last updated:** 2026-10-08

## Create and activate an account

1. Sign in to GAA Admin as a superuser. Open **Users → New account without email**.
2. Enter the person's work identity. Use a separate work account rather than their personal account. The work email is a login identifier; its inbox need not work yet.
3. Set **CMS access** to Writer or Publisher if needed. Writers prepare their own drafts; publishers manage and publish content. A grant alone does not activate an account.
4. Confirm the person's identity through a trusted direct interaction. Tick the confirmation box and select **Create activation link**.
5. Copy the private link and deliver it directly to that person. Treat it like a temporary credential; do not put it in tickets, group chats or logs. It expires in 30 minutes.
6. They open the complete link, choose their own password, and sign in normally. They can then open CMS when its access status is ready.

For an existing account, open **Users → row menu → Manage roles & access**. Account setup explains missing steps. Superusers and established verified accounts use existing sign-in/recovery rather than activation. Existing active, approved staff exempt from email verification can already use their explicit CMS grant without an activation link.

Closing the panel hides the link. **Replace activation link** invalidates the old one; **Revoke activation link** cancels it. No emails are sent by this flow. Email remains unverified until an actual verification flow succeeds; that is shown to administrators but never blocks access or approval. Activation keeps any configured MFA and replaces the password, signs out sessions, and invalidates outstanding challenges.

## Set up sign-in for someone who cannot receive email codes

Use this when a person cannot get sign-in codes by email: their work mailbox is not live yet, or the address on their account is wrong or unverified. Sign-in is passwordless by default, so they need a password for this route.

1. Open **Users**, select **Manage** on the person's row, and expand **Set up sign-in for this person**. You need the `user.manage` permission over them (their department or organisation) and an authenticator on your account, verified at sign-in. Owners can be set up only by a superuser. You cannot set up your own account.
2. Confirm the person's identity in person or through a trusted direct channel, tick the box, enter a reason (3 to 500 characters, kept in the audit trail; required unless the person's email is unverified or their password setup is pending), and select **Create setup link**.
3. Copy the private link and send it to the person directly. Do not put it in tickets, group chats or logs. The link expires in 24 hours and works once. Creating another link replaces it; **Revoke link** cancels it.
4. The person opens the link, chooses their own password, and signs in normally with their email and password. You never see the password, and nothing in the record shows it.

The link does not verify their email address, does not grant roles, departments or app access, and does not change staff approval or CMS access. Those steps stay as described above. The email address on the account is still the sign-in identifier, so get it right first.

Issuance is limited to 20 links per administrator and 5 per person in an hour. Every issue, revoke and completion is written to the account's audit history with ids, the expiry and the reason. The address on the account receives a courtesy email when a link is issued and when the password is set; it never contains the link. Privileged accounts (anyone with a privileged permission, `user.manage` or a department-manager-or-above role) and anyone holding a permission you lack can be set up only by a superuser, and so can privileged accounts without an authenticator. Owners can be set up only by a superuser. Links are refused for ended employment and inactive accounts; if a person's employment has ended, reinstate or correct their employment record first. Completing the link signs out their existing sessions. For a person who should not have any access, disable the account rather than issuing a link.

## Staff workflows and current limits

CMS access does not require employment details. For HR workflows, department, employment, staff credentials, approval and relevant balances may still be needed. The access panel explains GAA Admin admission, not every workflow's readiness. HR Setup also offers **New account without email** and refreshes its staff list when the work identity is created. HR Setup brings account activation, staff approval and personnel details into each staff panel. Expand the person, use Account setup to issue an activation link, then refresh onboarding status after they complete it. Save the department and grade, and approve staff access when needed. Approval accepts verified email or completed, audited administrator-issued activation; it grants only the ordinary staff role.

Record **Work email inbox provisioned** only when the inbox actually works. This operational fact is independent of account activity, email verification, passwords, sessions and permissions. Existing records default to unconfirmed mailbox readiness; account activity is not evidence of an inbox. HR saves preserve account security. Use Users for enabling/disabling accounts, roles and CMS grants. Offboarding a staff account does not affect a separate personal account.

Activation and staff-baseline controls are superuser-only. Explicit department manager and assistant-manager appointments have equal live authority within their department; ordinary staff delegation is bounded by that appointment. See [department authority](../hr/department-authority.md). Privileged MFA uses a disabled-by-default rollout with dedicated encrypted storage; see [the operator guide](privileged-mfa.md) before provisioning keys or enabling enforcement. Existing role grants remain authoritative. No shared temporary passwords, fake mailbox verification, automatic manager privileges, or production SQL edits are needed for this new flow.

## Release acceptance

On staging, create a disposable work account without email, grant Writer, issue a link and activate it. Confirm password sign-in and CMS draft access; publishing must remain denied. Revoke or replace a second link and confirm it fails. Confirm an unrelated department's existing permissions remain unchanged and a public unverified account still cannot enter CMS. Delete only the disposable test account after evidence is recorded. Promote dev → staging → main through the release runbook after checks pass.

## Identify the employer in HR Setup

Choose the employer organisation before configuring departments and staff. With
multiple organisations, HR Setup requires a choice. A superuser can register an
organisation's permanent ID, unique code and display name, or rename its display
name. Registering an identity alone creates no staff membership or app access.

Use the selected organisation's department when saving a person's HR details.
Accounts awaiting employer assignment are shown separately. Saving their first
department establishes that HR context; an email address does not. Existing
employment cannot be transferred between organisations through this setup flow.
Shared shift definitions are explicitly labelled; they do not establish roster
access. Department-only roster authority can read these references but cannot
create, edit or deactivate shared shifts or public holidays. Shared catalogue
edits require a superuser or preserved unscoped legacy authority; organisation-wide
grants cannot change references shared by other employers. The UI fails closed
when the global-access projection is unavailable. Configure actual employer structures rather than copying GAA defaults
into every organisation.

This milestone supplies HR setup context. It does not create Events promoter
membership, a site registry, or a claim that every module is ready for unrestricted
multi-organisation production use. App-specific memberships stay separate from
employment. Validate each module's object and history boundaries before rollout.
