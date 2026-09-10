# GAA organisation, access and workflow launch

Target: GMS first on Monday 14 September 2026. Other departments receive organisational structure only until verified personnel and access decisions are available.

## Source and preservation

The seed catalogue is `apps/api/fastapi/src/baseline/gaa-organisation.json`, transcribed from the 18-slide **GAA Organisational Structure 6.5.26 (without names).pptx**. It contains 16 units, 102 position types, authorised posts, reported vacancies, slide references, primary reporting relationships and qualified secondary connections. Unknown counts remain null, not zero. Positions represent establishment categories, not individually numbered posts. Job titles and reporting lines never grant permissions.

The import adds missing departments, units and positions. Existing GMS identities, employee records, grades, roster, passwords, role grants and submitted workflows are preserved. Conflicts stop the import instead of overwriting live decisions. There is no database reset and no wxwatch operation.

The source has two unresolved counts: SEC_SUPERVISOR shows “(05), Vacant (01)” and ATS_AIS_CADET shows “Cadet(1) (02)-Vacant”. Their authorised totals remain unknown pending confirmation. QAC has a dashed connection to the General Manager; Lauriston AIS/ATC/radio positions have a qualified ANSC connection. Notes preserve ambiguities instead of turning every connection into approval authority. Grade mappings inherited from earlier seed profiles remain subject to personnel verification.

## GMS reconciliation

The current seed contains 21 people; the chart has 22 authorised posts and one cadet vacancy.

| Position | Existing staff | Authorised posts | Reported vacancies |
| --- | ---: | ---: | ---: |
| Manager | 1 | 1 | Not specified |
| Assistant manager | 1 | 1 | Not specified |
| Senior technician | 7 | 7 | Not specified |
| Mid-level technician | 4 | 4 | Not specified |
| Entry-level technician | 6 | 6 | Not specified |
| Cadet | 2 | 3 | 1 |

Confirm the current preview before applying: these figures describe the inspected seed, not a permanently live report. No employee names are fabricated for other departments.

## Launch sequence

1. Apply normal migrations through the existing release process. Revision `e5f7a9b1c3d4` adds organisation/access-review tables and workflow configuration fields. It preserves older workflow scope behaviour until an administrator explicitly saves a new configuration.
2. Run the existing `scripts/initial_data.py` bootstrap through the normal environment-specific process to register missing default roles, including `hr-recorder`. It preserves existing role bundles and does not assign the recorder role to anybody.
3. Sign in as an active superuser. Open gaa-admin **Roles & Permissions → Organisation**, inspect GMS differences and source notes, and use **Import missing structure** only when conflicts are resolved.
4. In **Permission sets**, verify each role’s explicit permission bundle. In user management, choose each grant’s scope and optional expiry. New staff onboarding defaults to `staff` with SELF scope. Selecting a senior title does not grant management, HR or CAP access.
5. Use **Access reviews** to retain or revoke every relevant grant with a reason. Scoped grants and legacy unscoped grants are included. Reviews record the reviewer, subject, decision and permission snapshot. An administrator cannot review their own grant; another administrator must do so. Review superuser flags separately because they grant unrestricted access independently of roles.
6. In **Workflows**, configure each GMS request type. Verify supervisor approval → manager review → nonblocking HR recording, distinct approvers and no self-approval. Existing templates are preserved by imports; save their desired configuration explicitly. New baseline templates include these three stages. HR can be assigned later without blocking final approval.
7. Verify an ordinary staff account, a supervisor, a manager and an HR recorder through submission, review and recording. Confirm CAP author/approver/publisher access separately. The inspected GMS seed already grants those CAP roles to manager, assistant manager and seven senior technicians; the organisation import neither broadens nor revokes them.

CLI alternative, from `apps/api/fastapi` with the target environment already configured:

```bash
uv run --frozen --package fast-back python scripts/seed_gaa_organisation.py --environment staging --actor ewhint
uv run --frozen --package fast-back python scripts/seed_gaa_organisation.py --environment staging --actor ewhint --apply
```

The first command previews only. Choose `local`, `staging` or `production` to match the configured environment; a mismatch fails. Use an existing active administrator as actor. This CLI imports organisation structure only, not people or role assignments.

## Customisation and enforcement

Administrators can edit role permission bundles and individual grants, and independently configure each department/request template’s name, ordered stages, role or named assignee, scope, purpose, blocking behaviour and self/distinct-approver policy. A stage must select exactly one role or person. At least one blocking approval/review stage is required.

Stage scope intersects with the actor’s access: SELF means the requester (and still requires self-approval to be allowed); DEPARTMENT requires the actor’s current employment department to match the request; ALL permits cross-department participation but does not supply a missing role grant. For central HR, use an ALL stage with a recorder grant scoped to the departments HR serves. The fresh seed uses ALL for the recording stage and assigns nobody to it.

Recording is a nonblocking completion after required approvals. It does not change the HR decision, repeat leave accounting or send another final-approval notification. Recording uses an APPROVE action with the immutable stage purpose RECORDING in the snapshot. Changes to templates affect future workflows; submitted instances retain their copied stages and approval policy, including after return and resubmission.

Authenticated staff can inspect their effective role and permission summary on the auth security page. The backend evaluates current scoped and time-limited grants on requests. A legacy link is a fallback only when that user/role pair has no scoped assignment; expiry or revocation cannot resurrect an old link. The summary is informational and does not replace resource-specific server checks.

Organisation source counts and reporting lines are versioned catalogue data, displayed for review. The current UI imports that catalogue; correcting its source values requires a reviewed catalogue change rather than editing them through the workflow editor.
