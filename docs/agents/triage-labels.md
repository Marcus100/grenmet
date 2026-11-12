# Triage Labels

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-12

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
| `risk:low`, `risk:standard`, `risk:high` | PR risk tier from `scripts/guardrails/risk-tier.mjs`; high needs a human |
| `breaking-change`                        | PR intentionally breaks the API contract; lets `api-breaking-changes` pass |

A `friction` issue starts as `needs-triage`. `/triage` promotes it to
`ready-for-agent` when the fix is small and clear. Any `ready-for-agent` issue
with an allowed `area:` label is picked up by the nightly intake routine in
[routines.md](routines.md), friction issues first.
