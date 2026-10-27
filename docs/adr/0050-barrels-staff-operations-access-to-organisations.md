# ADR-0050: Barrels staff operations access to organisations

## Status

Proposed. Owner direction 2026-10-22 (design A below). Becomes Accepted when the
owner merges it. Owner-merge: this PR changes `AGENTS.md` files and a security
rule. Amends [ADR-0022](0022-platform-organisations-and-memberships.md) decision 4
and [ADR-0044](0044-organisation-scoped-permissions-via-membership-grants.md).
Nothing in this ADR is built; the build slices are listed in Consequences.

## Context

Barrels staff run organisers' events for them: the door, the outlet till and cash,
refunds, settlement, and listing help. They must reach every organiser's events
without being made a member of each organisation. Organisers keep managing their
own listings through their organisation, and an organiser must be able to see who
at Barrels did what.

Today there is no such path. `OrgContext` resolves the organisation from
`X-Barrels-Organisation` and answers 404 to anyone without an active membership,
with "no superuser bypass" as a deliberate rule (ADR-0022 decision 4, ADR-0044
consequences, `apps/api/fastapi/src/organisations/AGENTS.md`). The only ways for
staff to act today are to be added as a member (which shows up in the organiser's
team and makes every staff member a standing member of every client), or the control plane, which is superuser-only
and does not operate events.

Constraints: one permission vocabulary in `src/auth/permissions.py`; organisation
keys stay out of staff roles (ADR-0044 decision 1); ADR-0033 makes Barrels the
owner and responsible party for the data on its platforms, so staff access to
organiser and attendee data must be deliberate, logged and disclosed; the repo is
public, so no personal data in docs.

## Evidence

- **Facts**
  - `resolve_org_context` returns 404 for an unknown organisation and for a caller
    without an active membership, with the same message so existence is not revealed;
    `require_org_app` checks the entitlement only after membership is proven
    (`src/organisations/dependencies.py`). (high)
  - `require_org_permission(key, session_app="events")` builds on `require_org_app`
    and then asks `grants.has_org_permission` for the membership; no superuser
    shortcut (`src/organisations/dependencies.py`). (high)
  - The Events org zone (`src/events/org_router.py`) has five key families wired
    through `require_org_permission`: `events.settlement.view` (order list),
    `events.door.scan` (attendees), `events.tickets.sell` (manual payment),
    `events.refunds.issue` (refund), `events.listings.manage` (cancel event); order
    cancel is also on the org zone. Buyer account emails go only to admins and
    owners of the organisation (`_sees_email`). (high)
  - The global helpers `has_permission` and `has_effective_permission` return True
    for any non-organisation-bound key of a superuser
    (`src/auth/policy.py` `has_permission`, `src/auth/eligibility.py`). A new
    `binding="global"` key would therefore be implied for every superuser if checked
    that way. (high)
  - `has_permission` reads `current_user.roles` (role links) and never looks at
    expiry. `auth.effective_roles` (`src/auth/access.py`) honours
    `user_role_assignment.effective_from/effective_to` and includes a plain role
    link only where the user has never had an assignment for that role. (high)
  - `user_role_assignment.effective_to` exists (`src/auth/models.py`). Creating an
    assignment (`src/auth/assignments.py`) requires an `hr.organisation` row for
    `organisation_id` (a foreign key), requires an employment record of the target
    in that organisation when a user is acting, requires the caller's
    `user.manage` in that organisation, and a verified or admin-activated target.
    Only `gaa` is seeded as an `hr.organisation` (`src/baseline/organisation_root.py`);
    `barrels` exists only as a platform organisation id (`organisations.service.BARRELS_ORGANISATION_ID`).
    Expiry in the past is refused at creation and update. (high)
  - Privileged MFA is staged: `AUTH_PRIVILEGED_MFA_MODE` defaults to `disabled`
    (`src/auth/config.py`); `privileged_mfa.is_privileged` covers only a fixed key
    list. `privileged_mfa.require_mfa_session(..., app_key=...)` checks an enrolled
    authenticator and a session with `mfa_verified_at`, regardless of mode, and
    `get_current_mfa_superuser` already uses it that way. Events app sessions get
    `mfa_verified_at` at sign-in when the account has an authenticator
    (`src/auth/app_service.py`). (high)
  - The Events `activity` table is append-only and records `actor_id` but no
    capacity; there is no `actor_capacity` column (`src/events/models.py`
    `Activity`, `activity.py`). (high)
  - Per-key rate limiting has a precedent: `api_key_auth.py` calls the shared
    limiter with a per-key bucket. The default `limiter` keys on address. (high)
  - `events.moderate` is a global key already held by Barrels staff for Events
    moderation, so global Events staff keys are an existing pattern
    (`src/auth/permissions.py`, `src/events/moderation_router.py`). (high)
  - No `/events/admin/*` listing routes exist yet; moderation lives at
    `/admin/moderation`. No organiser terms or privacy draft for Events exists in
    `docs/` (searched `docs/` and `apps/web/events/src`). (medium: grep only)
- **Interpretation**
  - Staff access to an organisation's operations is a different relationship from
    membership: it is by job, not by team, so it belongs in global roles with an
    explicit audit capacity, not in `org.membership` (best practice, least
    privilege, medium).
  - The risk is not that staff can act but that the path is easy to widen. One named
    dependency, used only on Events org-zone routes, keeps it reviewable (heuristic,
    medium).
  - MFA exemption for the door is a usability judgement: a volunteer at a gate
    should not be blocked, and door admission moves no money and shows only the
    manifest (speculation, low; the owner chose it).
- **Uncertainty**
  - Whether helpers on event night have the employment records that role
    assignments need (see Decision 8). The mechanism for end dates is open.
  - Whether staff reads of the personal-data lists need more than a log line
    (for example an in-app notice to the organiser). Not decided.
  - Legal wording of the organiser terms (owner/legal item, Decision 11).

## Options considered

- **A. Global staff keys plus one explicit dependency on Events org-zone routes
  (chosen).** Five global `events.ops.*` keys, four staff roles, and
  `require_org_permission_or_staff`. Cost: a new dependency, a staff-key resolver
  that must not use the superuser shortcut, one additive activity column, and
  admin-zone listing reads. Staff never become members; organisers keep their own
  path unchanged.
- **B. Add staff as members of every organisation (automatically or on demand).**
  Reuses `OrgContext` and the grants table with no new dependency. Rejected: it makes
  staff appear in every organiser's team and member counts, mixes staff and client
  rosters (the last-owner and invitation rules assume clients), needs an invitation
  and a role grant per organisation (and the admin role, which needs a verified
  email, to see buyer emails), leaves no clean
  way to revoke "all organisations" at once, and it hides the staff capacity from
  audit because the actor looks like any member.
- **C. Superuser bypass inside `OrgContext`, or a staff impersonation session.**
  Smallest code. Rejected: it breaks the rule that no route is organisation-isolated
  if a role can skip the check, would affect every organisation route of every
  product at once (bookings, rewards, API keys, storage), gives all superusers
  every action without a named job, and impersonation rewrites the audit trail so
  the organiser sees the organiser's name for staff actions.

## Decision

Choose A.

1. **Five global staff keys** in `src/auth/permissions.py`, `binding="global"`:
   `events.ops.door`, `events.ops.till`, `events.ops.refunds`,
   `events.ops.settlement`, `events.ops.listings`. They are the staff counterparts of
   `events.door.scan`, `events.tickets.sell`, `events.refunds.issue`,
   `events.settlement.view`, `events.listings.manage`. There is no staff key for
   `events.team.manage`: staff cannot manage an organisation's team.
2. **Four staff roles** in `DEFAULT_ROLES` (seeded idempotently like the rest):
   `events-staff-door` (`events.ops.door`), `events-staff-till`
   (`events.ops.till`), `events-staff-refunds` (`events.ops.refunds`),
   `events-staff-manager` (door, till, settlement and listings; not refunds, not team
   management). The staff role editor keeps offering these keys (they are global).
   They are granted to no role by default beyond these four.
3. **One dependency**, `require_org_permission_or_staff(org_key, staff_key,
   session_app="events")`, in `src/organisations/dependencies.py`, used only on
   `src/events/org_router.py` (and later Events org-zone routes). It yields an
   `EventsActor` (organisation, user, `membership | None`, capacity `member |
   staff`). `OrgContext`, `require_org_permission`, `require_org_app` and every other
   product's routes are unchanged.
4. **Member path first.** Run the existing `require_org_permission(org_key,
   session_app=...)`. If it succeeds, the capacity is `member`. If it fails for any
   reason, try the staff path; if that also fails, return the member path's own
   answer (404 for a non-member, 403 for a member lacking the key), so staff keys
   never change what an organiser's member sees.
5. **Staff path requirements, all of them:**
   1. The caller is an active account holding `app.events.access` (the same
      `session_app` rule: an Events app token or an account token, nothing else).
   2. The caller holds `staff_key` **through a role**, resolved with
      `auth.effective_roles` and the role's permission keys. Superuser status implies
      nothing: a superuser without the role is refused. `has_permission` and
      `has_effective_permission` are not used for staff keys (they return True for
      superusers and `has_permission` ignores expiry).
   3. The organisation named by `X-Barrels-Organisation` exists, is `active`
      (suspended is 403, as for members) and holds the `events` entitlement.
      Existence is not revealed: an unknown organisation, an organisation the caller
      has no staff key for, and a missing header on the staff path all give the same
      404 as a non-member today. A present organisation that is switched off for
      Events gives the entitlement 403 only after the staff key is proven.
   4. MFA: the session must have an enrolled authenticator and a session that passed
      the factor check (`privileged_mfa.require_mfa_session(..., app_key="events")`),
      independent of `AUTH_PRIVILEGED_MFA_MODE`. Required for `events.ops.till`,
      `events.ops.refunds`, `events.ops.settlement` and `events.ops.listings`. Exempt
      only for `events.ops.door`, so volunteers are not blocked. MFA is checked after
      the key is proven, so it reveals nothing to a caller without the key.
6. **Audit capacity.** Events `activity` gains `actor_capacity` (`member` |
   `staff`, additive migration, default `member`; the table stays append-only).
   Every Events mutation made through the staff path writes it as `staff`. The
   organiser-facing history shows staff rows as "Barrels staff", not the person's
   name or email. Barrels-side reads keep the actor id.
7. **Logging and limits.** Every staff read of an attendee or order list or manifest
   (personal data) logs at INFO the actor id, organisation id and route family, ids
   only, no emails or names. Staff **can** see attendee account emails (owner
   decision, overriding the admin/owner-only `_sees_email` rule for the staff
   capacity); every such read is logged as above. Staff writes are rate-limited per
   user with the shared limiter in a per-user bucket (the `api_key_auth` pattern),
   not per address.
8. **End dates for helpers.** A staff role may carry an end date for event-night
   helpers by granting it through `user_role_assignment` with `effective_to`. The
   staff resolver (Decision 5.2) honours `effective_to` because `effective_roles`
   does. A plain role link has no expiry and `has_permission` ignores it. **Gap,
   to be resolved before the helper role is used:** assignment creation needs an
   `hr.organisation` row, the target's employment record in it and the caller's
   `user.manage` there, and only `gaa` is seeded as an HR organisation. Options for
   the slice that builds it: (a) seed an HR organisation `barrels` and employment
   records for helpers (heavy, mixes helpers into HR); (b) allow assignments for
   roles whose permissions are all `events.ops.*` without employment, with a
   required `effective_to` (narrow change to a staff-access invariant, owner
   approval). Until chosen, only permanent staff roles (plain role links) are
   supported and helpers must not be given the roles.
9. **Staff picking an organisation and event** uses two new admin-zone reads,
   `GET /events/admin/events` and `GET /events/admin/organisers`, gated by any
   `events.ops.*` key (held through a role, superuser not implied) plus MFA wherever
   the key requires it (the door-only caller needs none). They list organisers and
   events across organisations (ids, names, dates, status), no attendee data. After
   picking, the web app sends `X-Barrels-Organisation` and uses the same org-zone
   routes as an organiser.
10. **Every ported route gets its staff-key pair from day one**
    (`docs/exec-plans/events-legacy-manage-routes.md`, "Staff path on every ported
    route"). A route that takes only the member dependency has no staff path.
11. **Organiser terms disclosure (owner/legal item).** Organiser terms must say that
    Barrels staff may operate their events (door, till, refunds, settlement, listing
    help), may see attendee account emails for that purpose, and that such actions
    are shown to the organiser as "Barrels staff". The basis is ADR-0033 (Barrels owns
    the data and is the responsible party). No organiser terms exist in the repo; the
    owner records this where the terms will live.

## Consequences

- **ADR-0022 decision 4 changes.** "`OrgContext` resolves the active organisation
  ... checks membership and role" stays true for `OrgContext`. What changes is the
  statement that the only ways to act on an organisation are a membership or the
  control plane: on Events org-zone routes, Barrels staff holding an
  `events.ops.*` role may also act, through `require_org_permission_or_staff` only.
  `OrgContext` itself is unchanged and still has no bypass.
- **`organisations/AGENTS.md` rule changes** from "act through a membership or the
  control plane" to "act through a membership, the control plane, or, on Events
  org-zone routes only, the explicit staff-ops dependency (ADR-0050)". Other
  products and other organisation routes still have no staff path.
- **ADR-0044:** organisation keys remain membership-only and never held by a staff
  role; the new staff keys are global and are not organisation keys. The staff role
  editor continues to hide organisation keys. The ADR's "no superuser bypass"
  consequence still holds: superusers get nothing implicit on the staff path.
- Staff never appear in an organisation's members or team and cannot change it.
- Registry tests: every `events.ops.*` key exists with `binding="global"`; every
  org-zone Events route that takes an organisation key also names a staff key (or is
  listed as member-only on purpose); a superuser without the role is refused; a
  suspended, unentitled or unknown organisation answers as specified.
- **Build slices (not started):** B1 keys, roles, the dependency and its denial
  tests; B2 `actor_capacity` migration, activity display and read logging; B3 admin
  `GET /events/admin/events` and `/organisers`; B4 helper end dates (Decision 8, owner
  choice); B5 port the legacy routes with the pairs, as in the exec plan. Each
  changes OpenAPI and the generated client (never hand-edited).
- Risks: staff now touch cash and personal data across all organisers, so the roles
  are the control. Keep them few, review the staff list, and treat door-without-MFA as
  the accepted exposure (manifest names and tier, no money). An unreviewed
  `session_app` on another product would not gain a staff path; only this
  dependency does.
- Cost: none (no new service or dependency).
