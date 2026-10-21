# ADR-0039: GAA staff platform

## Status

Accepted (owner decision, 2026-10-20). Supersedes [ADR-0009](0009-gaa-staff-platform.md) together with [ADR-0040](0040-staff-attendance.md).

## Context

ADR-0009 set the direction for a staff platform for the whole Grenada Airports Authority (GAA), starting with HR forms for Meteorology. Later decisions overtook parts of it: app-scoped sessions and single sign-on handoff replaced "one central login", access and onboarding moved to their own ADR, and organisations became a platform concept. ADR-0009 also said `apps/web/gaa-admin` is "renamed to `apps/web/gaa-admin`", which names the same thing twice.

## Decision

1. **One staff platform for GAA, built as a modular monolith.** Staff modules (HR forms, roster, attendance, requests, janitorial, transport and later payroll) are modules in the FastAPI backend that share one core: approval workflow, employee and roster registry, notifications and audit. Modules depend on the core, not on each other's internals. This still holds from ADR-0009, including the rule that the staff helpdesk module is `requests`, never `tickets` (reserved for Barrels Events).
2. **Barrels Grenada owns the platform and its data**, as set out in [ADR-0033](0033-data-ownership.md). GAA is the client and Grenada Meteorological Service (GMS) is its meteorological department. Confidential client material still stays out of the public repository, in `/private/`.
3. **Meteorology is the pilot, then department by department.** HR work is built and exercised in Meteorology first (`apps/api/fastapi/src/hr/`), then rolled out with department-level configuration (approval chains, shift types, roles) held as data, not hard-coded. Responsible owners approve that configuration. Planning agreement is not proof of deployed behaviour or institutional acceptance.
4. **Everything is organisation-scoped.** Organisations and memberships follow [ADR-0022](0022-platform-organisations-and-memberships.md). No schema, scope or query may assume a single organisation. Department scoping is the default isolation, and cross-department roles (HR, Accounts) get wider scope explicitly.
5. **Sign-in is per app.** Staff apps keep app-scoped sessions and join through the `auth.barrels.gd` handoff ([ADR-0016](0016-app-scoped-accounts-and-sessions.md), [ADR-0017](0017-single-sign-on-handoff.md)). `src/auth/apps.py` registers two staff-scope apps. Staff access needs an approved staff account.
6. **Access and onboarding follow [ADR-0018](0018-modular-access-and-onboarding.md).** Personal and work accounts stay separate. Apps own admission, domains own resource restrictions and workflow rules.
7. **Names.** "GAA Admin" (`apps/web/gaa-admin`, package `@barrelsgd/web-gaa-admin`, app key `gaa-admin`) is the GAA staff portal and is the web face of this platform. It is not the Barrels control plane: that is "Barrels admin" (`apps/web/admin`, key `barrels-admin`, superusers only). There is no pending rename.
8. **Attendance** is decided in [ADR-0040](0040-staff-attendance.md). The approval workflow for HR is [ADR-0008](0008-hr-approval-workflow.md).

## What changed from ADR-0009

- Dropped: "one central login" with a shared cookie, and the planned `(user, organisation, application, role, scope)` assignment as an open target. Per-app access is now `app.<key>.access` permissions (ADR-0016), with organisations from ADR-0022.
- Dropped: app-only clock-in as the only source (ADR-0040).
- Not carried: the PWA strategy, roster UI redesign and per-brand token guidance. These live in the design docs and the apps' own `AGENTS.md`; tokens are `docs/design-system.md`.
- Payroll stays deferred: keep attendance and leave data payroll-ready.

## Consequences

- New staff features are mostly domain logic on the shared core; changes to the core have platform-wide blast radius.
- Reading ADR-0009 alone is now misleading; it carries a superseded notice and is history only.
- GAA joiner and leaver handling lives in this platform until GAA chooses an identity provider; auth must stay able to take one.
- Open: whether Barrels Human Resource becomes a separate product is a Barrels decision, not made here.
