# ADR-0022: Platform organisations and memberships

## Status

Accepted — 2026-10-18 by the project owner. Accepts the tenancy part of
[ADR-0014](0014-barrels-platform-core-direction.md) (decision 2). Workspaces and
the AI, Knowledge and Automate parts of ADR-0014 remain Proposed. Build plan:
[Barrels foundations plan](../exec-plans/barrels-foundations-plan.md).

## Context

The only organisation model today is HR's employer record, `hr.organisation`
(`apps/api/fastapi/src/hr/models.py`), with string keys such as `"gaa"`.
`auth.user_role_assignment` already has a foreign key to it. Events keeps a
separate, unlinked `organisers` table in its own database. Barrels Events,
the control plane, invoicing and the approved Barrels Human Resource product
all need one platform notion of "an organisation, and who acts for it",
independent of employment ([ADR-0018](0018-modular-access-and-onboarding.md)).

Moving or renaming `hr.organisation` would break six foreign keys and the auth
assignments, and would not be an additive change.

## Decision

1. **New `organisations` domain** in the FastAPI modular monolith with
   `org.organisation` (id, slug, name, kind `barrels | client | business`,
   status, `verified_at`), `org.membership` (organisation, user, role
   `owner | admin | member`, status) and `org.organisation_app` (organisation,
   app key, enabled).
2. **Bridge A: parallel table, same keyspace, dual-write.** `org.organisation.id`
   is `String(100)`, so existing HR keys (`"gaa"`) carry over unchanged. A
   migration backfills one platform row per `hr.organisation`. HR's create path
   writes the platform row in the same transaction. HR reads and existing
   foreign keys do not change.
3. **New organisations get immutable generated ids** (`org_<hex>`) and a
   separate editable `slug`.
4. **Organisation request context.** An `OrgContext` dependency resolves the
   active organisation from the `X-Barrels-Organisation` header, checks
   membership and role, and adds `organisation_id` to the log context. Data is
   called organisation-isolated only for routes behind `OrgContext` with
   cross-organisation denial tests.
5. **Events organisers are backed by platform organisations.** The Events
   database stores `organisers.organisation_id` (no cross-database foreign key);
   legacy `organiser_members` stays a compatibility read.
6. **Workspaces are deferred** until a product needs a scope below the
   organisation.

## Consequences

- Phase 2 (later, owner approval): add a foreign key from `hr.organisation.id` to
  `org.organisation.id` once a reconciliation test has passed on dev and staging.
- Phase 3 (later, separate ADR, part of Barrels Human Resource): HR resolves
  context through `OrgContext`.
- Dual-write drift is the main risk. It is covered by a reconciliation test.
- The GAA staff platform keeps working unchanged. The bridge is not evidence of
  tenant isolation for HR.

## Amended by ADR-0050 (2026-10-22, Proposed)

Decision 4 stays true for `OrgContext`: it resolves the organisation from
`X-Barrels-Organisation`, checks membership and role, and has no bypass. What
changes is the statement that a person acts on an organisation only through a
membership or the control plane. On Events org-zone routes only, Barrels staff
holding an `events.ops.*` role may also act, through the explicit dependency
`require_org_permission_or_staff`, with MFA, logging and an audit capacity of
"staff". See [ADR-0050](0050-barrels-staff-operations-access-to-organisations.md).
