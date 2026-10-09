# Agent tool usage

- When the user wants to inspect a file, return full contents — not a summary.
- Before investigating a CI or build failure, list the top hypotheses with the
  fastest falsification command for each; test cheapest first and report after each.
- For multi-file changes, trace impact across types, config, and related files first.
- When delegating to a sub-agent, include the Blast-Radius Gate and the relevant
  nested `AGENTS.md` paths in its brief — it starts cold.

## Switching between Codex and Claude Code

Before a handoff, append the current task, checkout path, branch, changed files,
checks and their results, outstanding decisions, and exact next action to the
main checkout's `SESSION_LOG.md`. Read the latest file before appending; preserve
other entries. Update durable knowledge in Bishop when it belongs there and the
workspace is accessible; keep private context out of this public repository.

The receiving agent reads that entry, applicable AGENTS files and the current
Git status/diff before continuing. Use the same checkout for sequential work;
use separate worktrees for simultaneous edits. Confirm which worktree contains
uncommitted changes before switching. Never infer completed work from a handoff
without checking the files. If the handoff is missing, reconstruct what can be
verified and ask only about unresolved intent.

The SessionStart hooks read recent log entries; they do not create the handoff
or share hidden chat history. Claude also reloads the log after compaction and
forking. Runtime hook trust and client permissions remain separate checks.
