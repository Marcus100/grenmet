# HR organisation boundary

Status: implemented and regression-tested; deployment migration pending. Not a complete multi-tenant isolation guarantee.
Implements the direction in [ADR-0009](../adr/0009-gaa-staff-platform.md).

## Problem and decision

Departments, employment and employee documents currently lack organisation keys.
`RoleAssignmentScope.ALL` is global. The imported organisation unit tree describes
GAA's structure but does not provide an organisation isolation boundary.

Add an `hr.organisation` root with stable ID, code and display name. Keep GAA in
seed data, not application defaults. Add required organisation references to
departments, employment records, employee documents and scoped role assignments.
Use composite foreign keys to prevent employment referring to a department in a
different organisation. Documents retain the organisation in which they were
filed; do not silently move historical evidence when employment changes.

Authentication stays central. `SELF` refers to the subject inside the selected
organisation; `DEPARTMENT` refers to an explicitly granted unit/branch in that
organisation; `ALL` means all departments in the assignment's organisation.
Only the existing platform superuser remains global. A role name alone never
grants scope. Read, list, count, download, update and archive use the same boundary.
Organisation context must be resolved server-side from active assignments or
employment, and any supplied context validated against those grants.

## Approved migration sequence

1. Add the organisation table and nullable keys. Seed the GAA root explicitly.
2. Backfill existing GAA departments, employment and assignments. Report documents
   without an employment record and ambiguous assignments; do not guess ownership.
3. Resolve those exceptions before making keys required or exposing new features.
4. Add composite constraints, scoped indexes and organisation-aware uniqueness.
5. Update setup/import paths, auth scope evaluation, public schemas and generated
   clients together. Preserve old single-GAA requests only when context is unique;
   reject ambiguous requests. Audit every direct constructor and query of the
   affected models, including existing HR modules and their tests.
6. Validate two organisations, repeated department codes, out-of-scope IDs,
   cross-organisation joins, assignment expiry and historical document ownership.

Do not execute the migration against a deployed database as part of document UI
work. Use a disposable database for migration rehearsal after schema approval.
Deployment remains a separate action. Before enabling a second organisation,
audit all remaining HR tables and query paths; these initial keys alone do not
establish complete multi-tenancy.

## Tradeoffs and delivery boundary

Explicit keys add migration and query work now, but prevent later document,
history and payroll features from embedding global scope. This does not include
billing, tenant onboarding, cross-organisation employment transfer or commercial
productisation. Those remain separate designs.

Document UI and department-access fixes can be prepared against the existing GAA
schema. They must not be presented as organisation-isolated or released for
multiple organisations before this boundary and its tests are implemented.


## Implementation checks

Department IDs remain globally stable for existing routes and foreign keys. A
separate department code is unique within each organisation; employee numbers
and department names are likewise unique within the organisation.

Personnel/document creation has no GAA model default. Installation seeds declare
GAA explicitly; API requests derive ownership from a validated department or
require an unambiguous organisation. Cross-organisation employment transfers and
supervisor references are rejected. Historical documents retain their filing
organisation and remain readable by their subject or authorised organisation-wide
document managers. Historical document ownership does not confer directory access.

The migration preflight lists offending record IDs for documents without employment
and assignments without a resolvable department or employment. Rehearsal uses the
isolated test database and rolls back its schema/data transaction. No deployment
or migration of a deployed database is authorised by this implementation.

Roster directory exception: an active SELF `roster.view` grant permits viewing
the employee's own department roster, preserving staff access to their team
schedule. It does not confer document-management or employment-edit authority.
Historical document contexts do not confer directory permissions.


## Validation (2026-09-10)

- Full HR/auth/baseline run: 258 passed; four failures were followed up. The
  department-not-found exception contract and migration fixture isolation were
  corrected; the parking case had a transient database connection timeout.
- Final targeted run: 20 passed, covering all four failures plus organisation
  isolation, migration preflight/backfill, supervisor boundaries, notifications
  and department seeding.
- Web: 313 passed in the full gaa-admin suite; the final document upload and
  organisation-switching run passed all 11 tests.
- Python type check: 108 source files passed. Workspace TypeScript initially
  passed all 16 tasks. The final rerun encountered concurrent CMS content/media
  type errors and CAP composer-test query-option errors; none were in the HR
  changes. Generated API client drift check passed. Both code-review axes cleared.
- Workspace `pnpm fix` still reports two unrelated baseline-script errors in
  `baseline-state.mjs` and `baseline-state.test.mjs`; these were not changed here.

The personnel foundation has been verified with two organisations. This is not
approval to enable a second organisation in production: remaining HR modules and
central account-directory surfaces still need a full tenancy audit and rollout
plan. Real object-storage integration remains the next document verification task.
