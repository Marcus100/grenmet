# Triage Labels

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

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

## Agent workflow labels

| Label                                    | Meaning                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `friction`                               | Something an agent worked around; filed by the `file-friction` skill     |
| `agent-claimed`                          | An agent is working on it now; others skip it (see `routines.md`)        |
| `risk:low`, `risk:standard`, `risk:high` | PR risk tier from `scripts/guardrails/risk-tier.mjs`; high needs a human |
| `breaking-change`                        | PR intentionally breaks the API contract; lets `api-breaking-changes` pass |

A `friction` issue starts as `needs-triage`. `/triage` promotes it to
`ready-for-agent` when the fix is small and clear, which makes it eligible for
the nightly friction fixer in [routines.md](routines.md).
