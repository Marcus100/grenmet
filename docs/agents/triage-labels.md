# Triage Labels

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-21

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

All five exist in this repo's GitHub labels. These state labels sit alongside the existing classification labels (`bug`, `enhancement`, `question`) and area labels (`frontend`, `backend`, `web/<app>`, etc.) — they do not replace them.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table. Edit the right-hand column to match whatever vocabulary you actually use.

## External pull requests

`/triage` covers external pull requests as well as issues. A pull request is
external when its author has no write access to `Marcus100/grenmet`:
`gh api repos/Marcus100/grenmet/collaborators/<login>/permission --jq .permission`
returns anything below `write` (`none`, `read` or `triage`). Bot pull requests (Dependabot) are not triage work.

## Agent workflow labels

| Label                                    | Meaning                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `friction`                               | Something an agent worked around; filed by the `file-friction` skill     |
| `agent-claimed`                          | An agent is working on it now; others skip it (see `routines.md`)        |
| `risk:low`, `risk:standard`, `risk:high` | PR risk tier from `scripts/guardrails/risk-tier.mjs`; high needs a clean `security-reviewer` pass, an agent-rules PR a Codex review too, and an enforcement-file PR goes to the owner |
| `breaking-change`                        | PR intentionally breaks the API contract; lets `api-breaking-changes` pass |

## Who may apply `ready-for-agent`

- The owner, on any issue.
- An agent, only on an issue it created itself from a trusted source: a
  failure (red CI on `dev`, the staging smoke test), an alert (Sentry,
  security), the roadmap, or friction it hit during its own task. It applies
  the label when it files the issue, with one `area:` label, and builds the
  issue from structured fields only (workflow, job and test names; Sentry
  issue id and title; links), never raw error text.
- Nobody else. An issue opened by an outsider waits as `needs-triage` until the
  owner labels it; an agent never promotes it, whatever a skill's wording says
  (this overrides the vendored `to-prd`, `to-issues` and `triage` skills).

An agent files `needs-triage` instead when the fix is unclear or needs an Ask
First decision. Any `ready-for-agent` issue with an allowed `area:` label is
picked up by the nightly intake routine in [routines.md](routines.md), which
also checks who applied the label: failures first, then the roadmap.
