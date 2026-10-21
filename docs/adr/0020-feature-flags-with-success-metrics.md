# ADR-0020: Feature flags with success metrics

## Status

Accepted — 2026-10-20. Built in `apps/api/fastapi/src/feature_flags` (PF7):
audience rules cover organisations, users, stable percentage rollout and an
environment allowlist; the admin screen is built at `apps/web/admin/src/app/(console)/flags/page.tsx`. Percentage
rollouts, originally out of scope below, were added with the organisation and
user rules because the social-layer flags (PF10) need them.

Owner decision 2026-10-20: Babydoll's online-booking switch moves from the `BABYDOLL_ONLINE_BOOKING` environment variable to a flag before cutover.

## Context

Changes reach staging and production as whole releases (`dev → staging → main`).
The only way to undo a bad change is to revert and redeploy, which takes a
pipeline run, and the pipeline promotes every merged change together. As
agents and scheduled routines ship more small changes, three problems follow:

- A risky change cannot be merged switched off, so it either waits on a
  long-lived branch or goes live to everyone at once.
- "Did it work?" has no recorded answer. Agents and reviewers read Sentry and
  logs ad hoc after a deploy.
- Operational features used by GAA staff (rosters, CAP publishing, e-register)
  cannot be rolled back for one group without code changes.

The repo has no flag mechanism. Environment variables are fixed per deployment,
and the only runtime switches are consent-gated analytics settings in
`packages/ui`, which must not decide operational behaviour.

## Decision

Introduce a small flag service in the FastAPI backend, because backend logic is
Python and web route handlers may only validate, proxy or render:

- A `feature_flags` table in the main database holds `key`, `enabled`, an
  optional audience (all, a role or permission key, a department) and
  `success_metric`: a plain-text definition of success and failure, an
  observation window and a named owner.
- Reads are cached briefly in the API process. A read endpoint returns the
  evaluated flags for the signed-in user, and the generated client exposes it to
  the web apps. Server Components read flags there; client components receive them
  as props.
- Changing a flag requires a new permission key in `src/auth/permissions.py`,
  and every change is written to the existing audit trail.
- A flag is created in the same pull request as the change it guards, defaults
  to off, and must name the issue that removes it. Routine PRs for `risk:high`
  areas should ship behind a flag where practical.
- After enabling, the owner (human or deploy agent) checks the recorded metric
  against Sentry and operational metrics in the observation window and records
  the outcome on the flag: `kept`, `rolled back` or `inconclusive`.

Not chosen: a third-party flag service, because it adds a vendor data flow for
client-adjacent behaviour and a runtime dependency outside our deployment, and
environment-variable flags, because flipping one needs a redeploy.

## Consequences

- A risky change can merge off, be enabled for one group and be disabled in
  seconds without a release.
- Every flag is a branch in the code, so stale flags are a new kind of debt. The
  weekly cleanup routine lists flags older than their removal date.
- Needs: one Alembic revision, a permission key, an OpenAPI change with client
  regeneration, an admin screen (built in the admin app), and tests for audience rules.
- Out of scope here: percentage rollouts and experimentation. Add them only if a
  concrete need appears.
