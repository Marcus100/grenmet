# ADR-0018: Modular access and staff onboarding

## Status

Accepted direction, incremental implementation — 2026-10-07.

## Context

Account security, staff approval, employment readiness, app admission and workflow authorisation are separate concerns with inconsistent presentation. Staff mailboxes are not yet operational. GAA is the client organisation; GMS is its meteorological department. Barrels owns the platform software.

## Decision

Keep a shared identity/security foundation and shared account activation, permission catalogue and audit mechanisms. Apps own admission requirements; domains own resource restrictions and workflow rules. Do not replace scoped roles, Janitor building grants or weather-product grade rules with a global role bypass.

Personal and staff identities remain separate accounts. Do not link them by name or transfer work permissions to personal accounts. Offboarding a work account must not touch a separate personal account. Supporting mixed identities or multiple employments requires an explicit future design.

Superusers retain platform authority. Managers and assistant managers should have equal authority within their assigned department. Only superusers appoint managers or grant platform authority. Managers should grant only ordinary responsibilities within their scope; specialised duties are independent assignments. Job titles alone confer no authority. Workflow self-approval and distinct-approver safeguards remain domain-owned; any exceptional override must be explicit and audited.

Use administrator-mediated activation when email is unavailable. Confirm identity, issue an expiring link, let the person choose a password, preserve actual email-verification state, and explain each remaining access blocker. Require MFA for privileged access through a separately tested enrolment and recovery rollout, rather than silently enabling a lockout gate for existing administrators.

## Delivery sequence and current limits

1. Implemented in this change: superuser-created accounts without shared passwords; one-use activation links; GAA Admin/CMS readiness explanations; narrow CMS compatibility for approved staff exempt from email verification; lifecycle audit; generated API contracts and UI tests.
2. Next weekly outcome: department-scoped management and assistant-management templates, safe delegated role grants, scoped user listing/mutations, and cross-department denial tests. Existing delegation is not expanded by milestone 1.
3. Implemented locally: mailbox readiness recorded independently; HR setup reuses activation controls and distinguishes account activity, staff approval and employment readiness. Approval accepts completed, audited activation without claiming email verification. Wider workflow readiness remains module-owned.
4. Next: privileged MFA enrolment, recovery and enforced access checks with a tested break-glass process; protect TOTP secrets at rest.
5. Extend module-owned readiness to Transport, Janitor, eRegister and weather workflows; model SURFACE and wis2box as explicit external provisioning/offboarding steps until integrations exist.

The first delivery does not claim the wider permission migration is complete. Public-account email requirements, domain resource scope and workflow approval rules remain enforced. No production settings or data are changed by this code delivery.

## Consequences

The first flow reuses existing challenge and audit storage, avoiding a parallel invitation/session system. Each subsequent module needs evidence that its resource scope is enforced on the server before departmental delegation is enabled. The UI describes admission separately from permission to perform an operation.

## Organisation identity and the current HR milestone

HR Setup reuses the existing employer organisation root and requires explicit
context when more than one organisation is available. Identity registration,
department structure, employment, app admission and workflow responsibilities
remain separate actions. No email domain, subdomain or job title grants access.
Each employer can define its own departments and grades. GMS reference data is an
explicit template choice, not a default for every sector.

This work stops before Transport and Janitor. Events promoter membership remains
app-owned and does not require an HR employment record. The current employment
model still permits one employer per work account; concurrent employments and
structured site registries remain future decisions. Department delegation, MFA
and HR workflow hardening are being developed in isolated worktrees; they are not
complete until combined local checks and authenticated staging acceptance pass.
