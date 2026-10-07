# Staff onboarding without an email inbox

Owner: Barrels platform. Client acceptance: GAA/GMS.

## Create and activate an account

1. Sign in to GAA Admin as a superuser. Open **Users → New account without email**.
2. Enter the person's work identity. Use a separate work account rather than their personal account. The work email is a login identifier; its inbox need not work yet.
3. Set **CMS access** to Writer or Publisher if needed. Writers prepare their own drafts; publishers manage and publish content. A grant alone does not activate an account.
4. Confirm the person's identity through a trusted direct interaction. Tick the confirmation box and select **Create activation link**.
5. Copy the private link and deliver it directly to that person. Treat it like a temporary credential; do not put it in tickets, group chats or logs. It expires in 30 minutes.
6. They open the complete link, choose their own password, and sign in normally. They can then open CMS when its access status is ready.

For an existing account, open **Users → row menu → Manage roles & access**. Account setup explains missing steps. Superusers and established verified accounts use existing sign-in/recovery rather than activation. Existing active, approved staff exempt from email verification can already use their explicit CMS grant without an activation link.

Closing the panel hides the link. **Replace activation link** invalidates the old one; **Revoke activation link** cancels it. No emails are sent by this flow. Email remains unverified until an actual verification flow succeeds. Activation keeps any configured MFA and replaces the password, signs out sessions, and invalidates outstanding challenges.

## Staff workflows and current limits

CMS access does not require employment details. For HR workflows, department, employment, staff credentials, approval and relevant balances may still be needed. The access panel explains GAA Admin admission, not every workflow's readiness. Do not use the existing HR Setup mailbox checkbox as a substitute for activation: HR setup still couples it to account activation, pending the next milestone.

The new activation controls are superuser-only. Department manager delegation and mandatory privileged MFA are subsequent milestones in [ADR-0018](../adr/0018-modular-access-and-onboarding.md). Existing role grants remain authoritative. No shared temporary passwords, fake mailbox verification, automatic manager privileges, or production SQL edits are needed for this new flow.

## Release acceptance

On staging, create a disposable work account without email, grant Writer, issue a link and activate it. Confirm password sign-in and CMS draft access; publishing must remain denied. Revoke or replace a second link and confirm it fails. Confirm an unrelated department's existing permissions remain unchanged and a public unverified account still cannot enter CMS. Delete only the disposable test account after evidence is recorded. Promote dev → staging → main through the release runbook after checks pass.
