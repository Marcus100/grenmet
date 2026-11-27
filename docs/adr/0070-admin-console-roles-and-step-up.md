# ADR-0070: Admin console roles and step-up

## Status

Accepted 22 Nov 2026 (owner decisions, issue #1655); not built. Amends ADR-0039
decision 7 ("Barrels admin ... superusers only") and ADR-0059 (who can reach the
admin app; the superuser invitation now needs a recent step-up). The open
questions at the end are the owner's to settle before the matching build step.

## Context

`admin.barrels.gd` (`apps/web/admin`) is superuser-only. The `barrels-admin` entry in
`src/auth/apps.py` sets `superuser_only=True` and `apps/web/admin/src/lib/staff-gate.ts`
requires `user.is_superuser`. So every Barrels person who needs one tool (feature
flags, moderation, invoices) must be a superuser, which also gives them payouts,
secrets and roles. The owner decided (22 Nov 2026) that admin is the one workplace for
Barrels developers, staff, admins and superusers, split by role. The roles screen moves
there from the GMS portal (`apps/web/gaa-admin/src/app/(admin)/roles`).

Constraints:

- **Data ownership.** GAA and GMS own their staff data and Barrels processes it (owner
  direction 21 Nov 2026, amending ADR-0033). Barrels staff reading GMS people therefore
  need a purpose and a log.
- **Auth.** Staff-scope tokens are not app-scoped, so existing superuser routes keep
  working. Every check is repeated in FastAPI.
- **Clients.** The GMS portal loses its roles screen. The delegated `user.manage` API
  stays.
- **Operations.** There are few superusers today. A second-approver rule cannot work
  with one.

## Evidence

- **Facts (high confidence).**
  - `AppDefinition.allows()` is synchronous and only reads `is_superuser`. Callers:
    handoff, session exchange and refresh, account "Join" and the account app list
    (`src/auth/AGENTS.md`).
  - `require_mfa_session` only checks that `mfa_verified_at` is set. It does not check
    how recent it is.
  - A superuser holds every global key through `has_permission`. Superuser-only actions
    are enforced in routes, not by keys (auth invariant).
  - The only audit read route is `GET /audit/{entity_type}/{entity_id}`, and
    `audit_entry.action` is `varchar(20)`.
  - The admin content security policy is report-only (`apps/web/admin/next.config.ts`).
  - Payouts are superuser-only manual ledger entries (`src/payments/AGENTS.md`).
  - `user_role_assignment` needs an HR organisation. Plain `user_role` links have no
    expiry.
- **Interpretation.** Best practice is least privilege by role, re-authentication before
  high-impact actions and dual control for moving money. A step-up window of minutes, not
  hours, limits what a stolen open session can do (heuristic).
- **Uncertainty.** Whether Barrels has an HR organisation for role assignments with end
  dates (not checked). Whether at least two superusers can enrol an authenticator today.
  The Cloudflare Access plan limits are the vendor's published terms and were not
  checked. Which routes the GMS portal roles screen calls was not checked.

## Options considered

1. **Keep admin superuser-only and make more superusers.** No build cost. Rejected: it
   hands money, secrets and roles to everyone in the app.
2. **One app per role (developer console, staff console).** Strong isolation, but
   several deploys, SSO secrets and duplicated navigation. Rejected: too much operating
   cost for a team this size.
3. **One app, permission-key gate, step-up and second approver (chosen).** Reuses the
   permission catalogue, the role bundles and the ADR-0050 pattern. Admission and each
   action are separate checks.

For step-up: (a) sign in again with the authenticator (no build cost, loses page state);
(b) a step-up endpoint that verifies the authenticator code and stamps the session
(chosen); (c) an authenticator code in every sensitive request body (rejected: spreads
secret handling into every route).

## Decision

### 1. Roles and keys

Roles are seeded in `DEFAULT_ROLES` and granted to nobody. A superuser grants them as
plain `user_role` links; no employment record is needed. Role names avoid the app key
`barrels-admin`.

| Role | New keys (`binding="global"`) | Existing keys |
| --- | --- | --- |
| `console-developer` | `app.barrels-admin.access`, `platform.health.read`, `platform.logs.read`, `organisations.api_keys.read` | `feature_flags.manage` |
| `console-staff` | `app.barrels-admin.access`, `moderation.organisers.read`, `moderation.organisers.decide`, `user.read.all`, `user.support.manage`, `billing.invoice.read` | none |
| `console-admin` | `app.barrels-admin.access`, `organisations.platform.manage`, `organisations.api_keys.read`, `organisations.api_keys.revoke`, `audit.entries.read` | `billing.manage` |
| Superuser (`is_superuser`) | none: enforced in routes, as today | all of the above |

Superuser-only actions stay route checks with `require_superuser_mfa` plus step-up:
payouts, the Connect platform fee cap, WiPay live approval, role assignment and role
definitions, organisation secrets (the Turnstile secret and other
`ORG_SECRET_ENCRYPTION_KEYS`-backed fields), superuser invitations and Printix
(`printix.manage`, unchanged).

Notes: `user.support.manage` covers resending invitations and issuing sign-in setup
links within the existing privilege ceiling. It never covers impersonation. No
impersonation route exists and none may be added. `billing.invoice.read` is used instead
of `billing.read` because `<product>.read` is the API-key scope pattern with
`binding="organisation"`. Every new key says "needs two-step sign-in" in its description
where step-up applies.

### 2. Staff gate

- `AppDefinition` gains `access_key: str | None`. When set, admission is "an active
  superuser, or a holder of `access_key` through `effective_roles`".
- `allows()` becomes an async `admits(session, user)` and every caller listed above moves
  to it.
- `barrels-admin` sets `access_key="app.barrels-admin.access"`,
  `require_authenticator=True` and `privileged_members=True`. Every console role is
  privileged and must have an authenticator.
- `superuser_only` stays in the code as the flag-off path, so the change can be undone.
  The refusal text "Barrels staff only" is unchanged.
- ADR-0059 rule 5 (skip `registration_pending`) extends to people invited as Barrels
  staff.
- The admin app's `staff-gate.ts` reads a new field on `GET /auth/staff/me` listing held
  console keys and hides navigation per key. FastAPI still re-checks every call.

### 3. Step-up

- **Endpoint.** `POST /api/v1/auth/sessions/me/step-up`. Body: an authenticator code;
  recovery codes are not accepted.
- **Rules.** Rate-limited with the sign-in lockout. Accepted only on a `barrels-admin`
  session that already has `mfa_verified_at`. On success it sets the new column
  `session.step_up_verified_at`.
- **Dependency.** `require_step_up(session, user, token, app_key="barrels-admin")`
  refuses when that timestamp is older than `AUTH_STEP_UP_MAX_AGE_MINUTES` (default 10).
  It returns 403 with body `code="step_up_required"`, the same pattern as
  `AUTHENTICATOR_REQUIRED_CODE`.
- **Admin app.** Shows a code form and returns to the same page. It never retries the
  action automatically.
- **Required on:** feature flag create, change and delete; superuser invite and revoke;
  API-key revoke; role grants and revokes; secret writes; payouts, fee cap and live
  approval (each approver steps up separately).

### 4. Second approver

- **Table.** New `auth.privileged_approval`: `id`, `kind` (`payout`, `fee_cap`,
  `live_approval`), `payload` (JSON), `payload_sha256`, `requested_by`, `requested_at`,
  `decided_by`, `decided_at`, `status`, `expires_at` (24 hours), `reason`.
- **States.** `pending -> approved | rejected | expired | cancelled`, moved only through
  `src/auth/transitions.py`. The status column is listed in
  `tests/test_state_machine_inventory.py`.
- **Rules.** The approver is a different active superuser with a recent step-up.
  Approval executes the action in the same transaction, re-validating the payload hash
  and the current balance. It is idempotent through the ADR-0026 `Idempotency-Key`. A
  requester cannot approve, cancel-and-recreate does not reset anything and an expired
  request is never executed.
- **Routes.** `/api/v1/auth/admin/privileged-approvals` (list, create, approve, reject,
  cancel).
- **Payouts.** `payments.create_payout` is reached only from an approved request once the
  flag is on.

### 5. Audit

- **What is written.** Every console write, every step-up, every approval transition and
  every staff read of `user.read.all` details writes an `audit_entry`. Each entry carries
  the actor, the console role used, the target ids and the action. Values hold no secrets
  and no personal data.
- **Action names** fit `varchar(20)`: `step_up`, `approval_req`, `approval_ok`,
  `approval_no`, `role_grant`, `role_revoke`, `people_read`.
- **Global audit screen.** `GET /api/v1/audit/admin/entries` takes filters for actor,
  action, entity type and date range, uses keyset pagination and sorts and filters in
  SQL. Sensitive values are masked unless the reader holds `audit.view_sensitive`. It
  needs `audit.entries.read`. It is read-only; no export in this ADR.
- **Index.** Add `audit_entry (created_at, id)` if the query plan needs it (additive
  migration).

### 6. Roles screen and people

- The admin app gets `/roles` (superuser, step-up) and `/people`, which lists all people
  (`user.read.all`).
- The GMS portal keeps `/users`, scoped server-side to accounts with GMS employment or
  membership.
- The GMS portal `/roles` page is removed only at the last step. The API route for
  delegated `user.manage` role assignment is kept, so restoring client self-service is a
  UI change only.

### 7. Edge and browser

- **Cloudflare Access** (one-time PIN to Barrels email addresses) goes in front of
  `admin.barrels.gd`. Bypass `/api/health` with a service token or bypass rule so Compose
  and Better Stack monitoring keep working.
- The admin app's `src/proxy.ts` validates `Cf-Access-Jwt-Assertion` (validation only).
  Access is defence in depth and never replaces the FastAPI checks.
- **Content security policy** is enforced on admin first, after a clean report-only
  window of at least 7 days (heuristic). Other apps follow.

### 8. Rollout (additive, behind flag `admin.console_roles`, default off)

1. Keys and roles seeded with no holders. Superuser-only route checks become
   `require_permission(key)` for the role-owned actions. Superusers still pass, so no
   behaviour changes.
2. `session.step_up_verified_at` column, the step-up endpoint and dependency, and step-up
   on superuser actions. This step is not behind the flag; it only tightens.
3. The `privileged_approval` table and routes. Payouts route through approval when the
   flag is on.
4. The audit list endpoint and the admin `/audit` screen.
5. `access_key` admission and the "invite as Barrels staff with role" flow, live when the
   flag is on. Turning the flag off returns admin to superuser-only.
6. Admin `/roles` and `/people`, the scoped GMS `/users`, then removal of GMS `/roles`
   after one release with a notice.
7. Cloudflare Access (an owner-run Cloudflare change), then CSP enforcement on admin.

Every step regenerates `openapi.json` and the client and ships with tests. Step 5 needs a
security review before merge.

## Consequences

- People get the least power that does their job, and money needs two people.
- `admits()` becomes async and touches every staff-app sign-in path: a large change
  surface that needs a security review.
- Payouts, fee cap and live approval stop if fewer than two superusers have enrolled
  authenticators. There is no break-glass path in this ADR.
- **Clients lose self-service role changes.** GMS and GAA HR admins can no longer assign
  roles in their portal and must ask Barrels. Support load rises and turnaround depends on
  Barrels. The API path stays so the screen can return.
- Barrels staff can read GMS people, so `people_read` audit rows are required to account
  to the data owner.
- Plain role links have no end date (the same gap as ADR-0050 decision 8). Removing
  someone means revoking their role by hand.
- `PermissionDef` has no hidden flag, so console keys appear in the GMS role editor and
  must be filtered out of it.

## Alternatives rejected

- Separate apps per role (operating cost).
- Superusers only (no least privilege).
- Step-up by forced re-sign-in (loses context; people learn to sign in constantly).
- Reusing the HR approval workflow for the second approval (tied to HR organisations; does
  not fit money).
- Cloudflare Access as the only gate (an edge-only control is lost if the origin is
  bypassed or misconfigured).

## Open questions for the owner

1. Who may revoke API keys: Admin as proposed, Developer, or superuser only?
2. Who reads the global audit log: Admin and Superuser as proposed, or Developer too?
3. Break-glass when only one superuser is reachable: none (payouts wait), or a
   time-delayed single approval with an alert?
4. Should GMS HR admins keep role assignment for GMS-only roles in their portal, or does
   all role assignment move to Barrels?
5. Should console roles carry end dates? That needs a Barrels HR organisation or a new
   expiry on plain links.
6. Step-up window: 10 minutes for everything, or shorter for money?
7. Cloudflare Access: any monthly cost beyond the free tier, and who is invited (Barrels
   emails only)?
