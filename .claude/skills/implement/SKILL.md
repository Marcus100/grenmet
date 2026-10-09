---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, review the final diff against the requirements and Blast-Radius Gate. Use an available review skill if appropriate; do not assume a /review command is installed.

After required checks pass and the final diff is reviewed, agents may stage,
commit, push and open a PR for the authorized work without further confirmation.
Preserve unrelated changes, follow the repository branch/promotion workflow and
never bypass hooks or force-push. Merges and deployments still require explicit
user authorization under `AGENTS.md`.
