# ADR-0055: Department grades suggest roles

## Status

Proposed — 2026-11-03. Partly supersedes ADR-0018 (the sentences quoted below)
and the matching lines in three operations and HR documents. Owner direction of
3 November 2026. Nothing here is built; the sentences below stay in force until
the owner accepts this record.

## Context

The owner wants roles and permissions to follow a person's grade in their
department (Manager, Assistant Manager, Senior Technician and so on). Today
every role beyond self-service `staff` is granted by hand, one at a time
(`src/auth/assignments.py` `create_user_role_assignment`, line 52).

These recorded sentences forbid it:

- `docs/adr/0018-modular-access-and-onboarding.md:17` "Job titles alone confer no authority."
- `docs/adr/0018-modular-access-and-onboarding.md:40` "No email domain, subdomain or job title grants access."
- `docs/hr/department-authority.md:7` "Job titles, email domains, websites and app admission never appoint a manager."
- `docs/operations/gaa-governance-launch.md:11` "Job titles and reporting lines never grant permissions."
- `docs/operations/gaa-governance-launch.md:37` "Selecting a senior title does not grant management, HR or CAP access."
- `docs/api/contracts.md:1640` "It does not infer management privileges from a grade."

Owner decisions that still bind this design:

- Ended employment ends all roles. Roles stay ended after reinstatement.
- A department HR administrator only pauses organisation-wide roles.
- Managers and assistant managers have equal authority in their department.
- Only superusers appoint managers or grant platform authority.
- Managers grant only ordinary responsibilities in their scope.
- Self-approval and distinct-approver rules stay owned by each domain.
- Forecasts and alerts need one forecaster. A CAP author may self-approve.
- Two-step sign-in for administrators after enrolment.
- Widening access is an ask-first item, so a person stays in the loop.

## Evidence

- **Fact (high):** a grade is department data: `hr.grade` (`department_id`,
  `code`, `label`, `rank`). `employment_record.grade_id` is nullable. GMS has
  six grades (`src/baseline/gms-grades.json`).
- **Fact (high):** only superusers write `grade_id`
  (`baseline.service.save_staff`, `require_admin` = `is_superuser`). The HR
  employment route cannot change the grade. It can change the free-text
  `position`, which department managers may edit.
- **Fact (high):** one employment record per account
  (`employment_record.user_id` is unique).
- **Fact (high):** weather products already follow the grade directly
  (`src/baseline/product_access.py`). The policy lists grades for each product
  kind; the default is Manager, Assistant Manager and Senior Technician. Only a
  superuser edits it, through `/api/v1/hr/setup/product-access/{kind}`. There is
  no admin screen. ADR-0018 line 13 keeps this rule.
- **Fact (high):** non-superusers may delegate only `staff` for the person's own
  access (`assignments.delegation_authority`, `delegation.py`).
- **Fact (high):** ending employment or a transfer through the HR route ends
  every role except `staff` (#789, #797). Reinstatement restores none.
- **Fact (high):** `baseline.organisation_position` (102 posts) is linked to
  nothing.
- **Fact (medium):** the GMS seed already gives warning (CAP) author, approver
  and publisher to the manager, the assistant manager and seven senior
  technicians (`gaa-governance-launch.md:40`). Today's hand grants already
  follow grade.
- **Best practice:** role-based access with role templates, plus a person who
  approves each grant, is standard for joiner, mover and leaver processes.
- **Heuristic:** a grant derived from data that someone can edit becomes a
  privilege-escalation path through that data.
- **Uncertainty:** the right roles for grades outside GMS; whether HR
  administrators who are not superusers may confirm.

## Options considered

| | A. Automatic grant from grade | B. Suggested, then confirmed | C. Manual, multi-select dialog | D. Drift report only |
| --- | --- | --- | --- | --- |
| Meets owner direction | Fully | Yes | No | Partly |
| Person in the loop | No | Yes | Yes | Yes |
| Escalation risk | Grade edit = grant | Confirmer's own limits apply | Lowest | Lowest |
| Complexity | Low | Medium | Low | Low to medium |
| Demotion | Immediate | Proposed, until confirmed | Manual, easy to forget | Visible |
| Reversibility | Hard (grants spread) | Easy (provenance kept) | Easy | Easy |

A breaks the ask-first rule and turns every grade write into a grant. C leaves
grade and roles drifting apart unseen. D is part of B.

## Decision

Choose B. Suggestions are worked out when they are read, not stored.

1. **Template.** A superuser keeps, for each grade, a list of roles, each with
   a scope. The scope is the person's own access or the grade's own
   department; it is never organisation-wide. Manager and assistant-manager
   roles must use department scope (existing rule).
2. **Suggestions.**
   - *Add:* template roles the person does not hold.
   - *Remove:* roles that came from a template and are not in the current
     grade's template.
   - *Review:* hand grants that are not in the template. These are shown and
     never proposed.

   There are no suggestions for superusers, people with no live employment, or
   people with no grade or an inactive grade.
3. **Nothing changes on save.** Saving a grade never adds or removes a role.
   After HR Setup > Staff saves a grade, the role dialog opens with the
   suggestions already ticked.
4. **Confirmation.** One all-or-nothing request. Each addition goes through
   `create_user_role_assignment` as the confirming person, so every existing
   check applies: employer placement, department match, the delegation ceiling,
   and a verified or administrator-activated email. Each removal sets
   `effective_to`. Both are audited. New rules:
   - The confirming person may not be the subject, even if a superuser.
   - A session verified with two-step sign-in is required.
   - The request carries the grade the screen showed. If the grade has changed
     since, the request is refused (409).
   - The subject's employment row is locked and checked live.
5. **Who confirms.** Whoever may grant that role today. For anything beyond
   `staff`, that is a superuser until the owner decides otherwise.
6. **Products.** Product issue policies keep following the grade directly. A
   "Who may issue" screen shows, for each product, its grades and the people
   those grades let in.
7. **Never read the job-title text.** Only `grade_id`. The free-text `position`
   and the organisation chart's positions never drive access.

### Data model

- `hr.grade_role_template`: `id` uuid; `organisation_id`, `department_id`,
  `grade_id` (foreign key to the grade, which must be in that department);
  `role_id` (foreign key to `role`); `scope` (`SELF` or `DEPARTMENT`);
  `created_by`, `created_at`; `retired_by`, `retired_at`. One live row per
  grade and role (partial unique index). Rows are retired and replaced, never
  edited, so history stays readable.
- `user_role_assignment.grade_template_id` (uuid, nullable, foreign key, never
  deleted): records that a grant came from a template. This is an additive
  migration.
- Audit: template changes and confirmations write through
  `audit.record_change`, giving the grade and the template row.
  `audit_assignment` snapshots include `grade_template_id`.

### Lifecycle

- **Ended employment:** the existing gate ends everything. The suggestion list
  is empty because employment is not live.
- **Reinstatement:** nothing is restored. Suggestions for the current grade
  reappear and need a fresh confirmation.
- **Promotion or demotion:** additions and removals are proposed, never
  applied silently. Pending removals show a warning in the user dialog, HR
  Setup and Access reviews until someone handles them. Product authoring
  follows the new grade at once.
- **Department move:** both the HR route and HR Setup end every role except
  `staff` (HR Setup is fixed here). The new department's template then
  suggests additions.
- **Multiple employments:** not supported today. If added, suggestions come
  per employment record, inside its own organisation and department.
- **Superuser-only grants:** templates may list manager appointments and
  special duties. Only a superuser can confirm them. The template never grants
  the superuser flag, CMS access or organisation-wide scope.

### Security

- Grade writers (superusers only) steer suggestions. If grade editing ever
  opens to others, the confirmer's own limits still apply. Test both.
- Template editors pre-approve bundles: superuser only, in the route, with
  two-step sign-in and an audit record. Same model as editing role definitions.
- A role's permission bundle can change after a template is saved. The
  confirmation audit stores the role's permission keys at that moment.
- Stale access after a demotion is visible, and the owner may choose a
  deadline (open question 2).
- No new permission key is needed in slices 1 to 4. If HR administrators may
  confirm, add a key to `src/auth/permissions.py` and get a separate review.
- Required tests:
  - Saving a grade changes no assignment.
  - Changing the free-text position changes no suggestion.
  - No suggestions for ended, superuser or ungraded accounts.
  - A non-superuser cannot confirm a special role (403).
  - Nobody confirms their own roles (403, superuser included).
  - Confirming without two-step sign-in is refused.
  - A stale grade is refused (409).
  - The batch rolls back entirely when one item fails.
  - An organisation-wide template row is refused.
  - A template for a grade in another department is refused.
  - A non-superuser cannot edit templates.
  - A demotion proposes removals and ends nothing until confirmed.
  - A move through HR Setup ends roles.
  - Reinstatement restores nothing.
  - Product access respects the end date.
  - Audit rows are written for template edits and confirmations.

### Rollout in thin slices

1. **"Who may issue" screen** in HR Setup for product issue policies. It uses
   the existing superuser endpoints and the unused client hooks, with no
   migration. Fix product access to respect the end date. This lets the owner
   set who issues the Marine Forecast and Climate Bulletin now.
2. **Templates:** the table, the superuser editor on each grade, and a
   read-only "Suggested by grade" panel in the user dialog. Also fix the HR
   Setup department move.
3. **Confirm:** the multi-select role dialog (#979) with the batch confirm
   route and provenance. It opens with suggestions ticked after a grade is
   saved.
4. **Removals:** grade-change removals, Access reviews showing differences
   from the template, and a count of pending items.
5. **Only if the owner agrees:** HR administrators who are not superusers may
   confirm.

### Documents to change if accepted

- ADR-0018 lines 17 and 40. Replacement text: "A job title or grade never
  grants access by itself. A grade may suggest roles from an approved
  template; access starts only when an authorised person confirms it. Weather
  products follow the grade directly (product access policy)."
- `docs/hr/department-authority.md:7`, `docs/operations/gaa-governance-launch.md:11`
  and `:37`, `docs/api/contracts.md:1640` (plus a new section),
  `docs/operations/staff-onboarding.md`, `docs/operations/gms-products.md`.
- A pointer at `docs/operations/production-baseline.md:43`, which stays true:
  "Grade edits do not silently change role assignments."
- The ADR index, and the `AGENTS.md` files for auth, baseline and hr. The
  docstring in `src/auth/delegation.py:1` ("never derive from titles") changes
  to "never derive automatically from grades".

## Consequences

- Easier: onboarding and promotions in one step; drift between grade and roles
  is visible; every grant shows where it came from.
- Harder: two places explain access (templates and product policies); the
  dialog must clearly show what each role allows.
- Forbidden: granting from a grade without confirmation; organisation-wide
  scope in templates; anyone confirming their own roles; reading free-text
  titles for access.

## Open questions for the owner

1. Who may confirm the suggested roles? Today only superusers can grant
   anything beyond basic staff access. Should HR administrators confirm too?
   If yes, ordinary roles only, or manager-level ones as well?
2. When someone is moved to a lower grade, should their extra roles stay until
   a person confirms the removal (the proposed default, with a warning), or
   end at once? Or end automatically after a set number of days?
3. After someone is reinstated, should the screen suggest the roles for their
   grade again? They would still need confirming. The proposed default is yes.
4. Which roles should each GMS grade suggest? Starting point to correct:
   - Manager and Assistant Manager: department manager authority, plus
     warning author, approver and publisher.
   - Senior Technician: warning author, approver and publisher.
   - Mid-level, Entry-level and Cadet: basic staff only.

   Should any grade also get eRegister observer or checking roles?
5. Should product issuing (forecasts, Marine Forecast, Climate Bulletin) keep
   following the grade directly, as now, or also wait for a person to confirm
   each staff member?
6. May the person who changes a grade also confirm the roles, or must a second
   person confirm?
7. Templates for GMS only at first, or for other GAA departments too?
8. Should a specific post on the organisation chart ever matter (for example,
   only the climate post issues the Climate Bulletin), or is the grade enough?
