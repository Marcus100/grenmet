# ADR-0044: Organisation-scoped permissions via membership grants

## Status

Proposed. Owner-approved direction 2026-10-21; slice S0 (the `binding` field and
the new keys) ships with this ADR. Becomes Accepted when the owner merges it.

## Context

Organisation products (Barrels Events, Barrels Bookings) need finer roles than
the three `MembershipRole` values (`owner`, `admin`, `member`, ADR-0022). A
venue wants a door person who only admits tickets, a till operator who only
sells, a manager who sees settlement but cannot issue refunds, and the same for
a salon's agenda and settings. Today an organisation admin can do everything in
a product, and the only finer-grained keys are API-key scopes (ADR-0029).

Constraints: one permission vocabulary (`src/auth/permissions.py` is
owner-reviewed, ADR-0031 keeps domain wiring separate), no superuser bypass
(`apps/api/fastapi/src/organisations/AGENTS.md` and `src/organisations/dependencies.py`), staff roles (ADR-0018, ADR-0039) must stay uncluttered, and the
staff role editor must not offer keys that mean nothing outside an organisation.

## Evidence

- **Facts**
  - `PERMISSIONS` is the single catalogue and `tests/auth/test_permission_registry.py`
    fails when a key used in code is missing from it. (high)
  - API-key scopes (`bookings.read`, `bookings.write`, ... `webhooks.write`) are
    permission keys in that catalogue (`src/organisations/api_key_scopes.py`,
    ADR-0029) yet were listed as grantable in the staff role editor
    (`GET /api/v1/auth/permissions`). (high)
  - Organisation access is `organisation_membership.role` (owner/admin/member)
    plus product entitlements (`src/organisations`, ADR-0022). (high)
  - HR roles use `user_role_assignment` with scope, employment and delegation
    rules; ADR-0022 Phase 2 has not landed. (high)
- **Interpretation**
  - Organisation roles are combinations of keys, so they need a table of
    grants, not a longer enum (best practice). (medium)
  - The key list should stay central so one reviewer sees the whole surface
    (heuristic). (medium)
- **Uncertainty:** whether Bookings door/till-style roles will need per-resource
  scoping (for example one location). Not needed now; revisit at S4.

## Options considered

- **A. Reuse HR `user_role_assignment`.** One mechanism, but it needs ADR-0022
  Phase 2 first and carries employment, department-scope and delegation rules
  that do not fit customers' staff. Rejected for now.
- **B. More `MembershipRole` enum values.** Simple to build. Roles do not
  combine (a door person who also sells needs a new value per combination), and
  every product edit touches a platform enum. Rejected.
- **C. Grants on the membership, bundles built from the one permission list
  (recommended).** Small table, roles combine, products own their bundles,
  keys stay central. Cost: a resolver and a grant lifecycle to build.

## Decision

Choose C.

1. `PermissionDef.binding` is `"global"` (default) or `"organisation"`. Staff
   platform keys and `events.moderate` stay global. Keys meaningful only inside an
   organisation are `organisation`. The staff role editor and its grantable list
   hide organisation keys and refuse to add them to a staff role.
2. Existing API-key scopes are marked `organisation` with no behaviour change.
3. New organisation keys: `events.listings.manage`, `events.door.scan`,
   `events.tickets.sell`, `events.refunds.issue`, `events.settlement.view`,
   `events.team.manage`, `bookings.agenda.read`, `bookings.bookings.manage`,
   `bookings.settings.manage`, `bookings.team.manage`. They are seeded into the
   permission table and granted to no staff role.
4. From S1, an organisation member gains extra roles through
   `org.membership_grant` (`id` `grant_<hex>`, `membership_id`, `organisation_id`,
   `role_key`, `granted_by`, `granted_at`, `expires_at`, `revoked_at`, partial
   unique index on `membership_id` + `role_key` where `revoked_at` is null).
   Product-owned role bundles map a `role_key` to organisation keys.

## Consequences

- `owner`, `admin` and `member` stay as implicit default bundles. Owner is admin
  plus owner-only actions; admin holds every organisation key of every entitled
  product; plain `member` holds nothing extra (so no Events permissions by default).
- Effective set = implicit bundle union granted bundles, intersected with the
  organisation's entitled products.
- Superusers get no bypass (the rule lives in `apps/api/fastapi/src/organisations/AGENTS.md` and `src/organisations/dependencies.py`).
- Organisation-bound keys are resolved only through `OrgContext` and the S1 resolver, never through `has_permission`, `require_permission`, `can_act_on_user` or `has_effective_permission` (the four forbidden paths; one shared helper, `is_organisation_bound` in `src/auth/policy.py`, denies them). These return True for every key of a superuser, which would be the bypass above, and a staff role that already holds a scope key would pass outside any organisation. S0 therefore makes all four deny organisation-bound keys (and log); a test covers a superuser without membership.
- API-key scopes are organisation keys and never wider than the creator.
  All ten API-key scope keys (`<product>.read` and `<product>.write` for bookings, rewards, contacts, payments and webhooks) stay as compatibility aliases for the fine-grained keys.
- A grantor must hold every key in the bundle and the product's `<product>.team.manage`.
  The last-owner guard is unchanged.
- HR keeps `user_role_assignment` until ADR-0022 Phase 3.
- Keys stay central and owner-reviewed; role bundles are product-owned. A
  registry test requires every bundle key to exist in `PERMISSIONS` with
  `binding="organisation"`.
- Door staff keep seeing the manifest as today; restriction comes later. Refunds
  are audit-only, with no separation of duties yet.
- Phases: S0 binding and keys (this change); S1 `membership_grant` table,
  bundles and resolver; S2 Events enforcement; S3 team-management routes and
  UI; S4 Bookings enforcement; S5 retire compatibility aliases and review.

## Amended by ADR-0050 (2026-10-22, Proposed)

Organisation keys stay membership-only and are never held by a staff role. Barrels
staff operating organisers' events use five separate global keys
(`events.ops.door`, `.till`, `.refunds`, `.settlement`, `.listings`) in four
`events-staff-*` roles, accepted only on Events org-zone routes through
`require_org_permission_or_staff`. There is no staff counterpart of
`events.team.manage`, and a superuser still gets nothing implicit. Slice S5 (porting
the legacy `/events/manage/*` routes) gives each ported route its staff-key pair.
See [ADR-0050](0050-barrels-staff-operations-access-to-organisations.md).
