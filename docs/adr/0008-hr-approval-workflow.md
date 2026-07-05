# ADR-0008: Route HR Forms Through A Named-Approver Approval Workflow

## Status

Proposed

## Context

HR forms in admin-gms (leave, shift exchange, absentee, daily status, timesheet)
are print-only: the editor calls a create mutation and the record is final. Staff
have no way to save an in-progress form, and there is no approval before a
submission becomes official.

The desired operational flow is:

1. Staff prepare content and either **save** it (a draft, when unsure) or
   **submit** it (when sure).
2. When a submission needs sign-off from specific colleagues, **every named
   co-approver must approve** before it advances (parallel, order-independent).
3. It then goes to the **department supervisor** (`hr-supervisor`) for approval,
   and then up to **management** (a distinct tier above the supervisor) for review
   and approval.
4. On final approval it is delivered to **admin** (`hr-admin`).

A generic sequential approval engine already exists in FastAPI (`hr/workflow`):
`DRAFT → PENDING → APPROVED/REJECTED/RETURNED/CANCELLED`, ordered steps each
gated on a **role** + scope, one approver per step advancing `current_step_order`,
with an `approval_action_log` audit trail, wired into entity-create via
`start_workflow_for_entity` (the atomic create+workflow "commit-flag" pattern).
Roles are already seeded: `staff` → `hr-supervisor` → `hr-admin`.

Two requirements are not expressible in the engine today:

- Steps gate on a **role**, not a **named individual** — the preparer cannot pick
  specific colleagues per submission.
- A step advances on **one** approval — there is no "all of N must approve" gate.

Separately, GMS treats a **department supervisor** and **management** as distinct
tiers (management sits above the supervisor), so the seeded roles
(`staff`, `hr-supervisor`, `hr-admin`) are one short — a `management` role is
needed between supervisor and admin.

## Decision

Extend the existing engine rather than building a parallel one, and wire the five
HR forms to it. HR is the **first module of the GAA staff platform** (ADR-0009);
the approval engine it extends is one of that platform's shared-core capabilities.

**Actor ladder.** Four roles. Reuse the three seeded roles and add one:
preparer = `staff` (also the pool the named co-approvers are drawn from),
department approval = `hr-supervisor`, second-tier approval = `management`
(**new** — seeded in `auth/permissions.py`'s `DEFAULT_ROLES` with the
`workflow.instance.action` / `.view` and HR `*.action` permissions), final
recipient = `hr-admin`.

**Engine extension (named parallel co-approval).**

- Add `required_user_id` to `WorkflowStepInstance`: when set, the step is
  satisfied only by that named person; when null, fall back to the existing
  role + scope check.
- Allow **multiple required step instances at the same `step_order`**. An order is
  complete only when *every* required step at that order is approved; until then
  the instance waits at `current_step_order`. This is the "all of N" gate.
- Submit accepts `co_approver_user_ids[]` and builds a dynamic chain:
  `step_order 1` = one step per named co-approver (parallel, all required),
  `step_order 2` = department supervisor (`hr-supervisor`, role-based),
  `step_order 3` = management (`management`, role-based). When the co-approver
  list is empty, the peer order is skipped and it starts at the supervisor.

**Drafts are first-class.** "Save" creates the entity + a workflow instance left
at `DRAFT` (a non-submitting variant of `start_workflow_for_entity`); "Submit"
transitions the same record `DRAFT → PENDING` and attaches co-approvers. Drafts
are server-side, resumable, and listable per user — not browser-local.

**Delivery.** On transition to `APPROVED`, FastAPI sends a formatted summary email
to `hr-admin` via `src/email.py` (`BackgroundTasks`). A PDF attachment is
**deferred** — it requires runtime chromium (the "PDF sidecar" on the v1 roadmap)
and is out of scope for this ADR.

**Frontend.** A shared `<FormActionBar>` (Reset · Save · Submit · Download PDF)
replaces the current scattered toolbars on all five editors; "Download PDF" keeps
the existing client `window.print()` path. Submit surfaces a co-approver
people-picker and an approval-status panel. A new approvals inbox lets peers and
supervisors act on pending items. Email is automatic (no form button).

**Rollout.** Build order 1→5, proving the full chain on the Leave form first
(shared engine work, one form wired end-to-end) before fanning out to the other
four:

1. Engine extension: model + migration + state-machine rewrite + unit tests.
2. Draft + submit-with-co-approvers wiring per form; `openapi.json` regen →
   `pnpm generate:api-client` → `pnpm check:drift` → `docs/api/contracts.md`.
3. Shared `<FormActionBar>`, people-picker, status panel across the five editors.
4. Approvals inbox (peers + supervisors).
5. Auto email to `hr-admin` on `APPROVED`.

## Consequences

- HR submissions become operational records with an audit trail; they should not
  be casually deleted, and lifecycle transitions are permission-gated.
- A new `management` role is added to the seeded `DEFAULT_ROLES` (idempotent seed),
  and existing users who act as management must be assigned it before the second
  approval tier functions; the chain has two role-based tiers (supervisor, then
  management) rather than one.
- The engine gains a dynamic, per-submission dimension (named approvers) alongside
  its static template dimension; template-driven role steps keep working unchanged.
- "All of N" completion changes the advance logic in `apply_workflow_action`;
  the existing sequential single-approver behavior is a special case (one required
  step per order) and must stay green.
- A DB migration adds `required_user_id` and relaxes the one-step-per-order
  assumption — coordinated with the api-client regen + drift gate.
- Co-approvers are pinned to user IDs at submit time; downstream role or
  department changes do not re-route an in-flight instance.
- PDF delivery remains a future slice; v1 delivery is an HTML summary email only.
- Saving a draft persists a real entity in `DRAFT`, so each form's entity status
  must admit a draft state and list/read endpoints must scope drafts to their owner.
