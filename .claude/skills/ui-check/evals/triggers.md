# ui-check trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Make this component match the screenshot I pasted.
- Here's the Claude Design canvas for the alert card; implement it.
- Compare the roster header to this mock and fix the differences.

## Should not trigger

- Is this page well designed? (no reference, so design-critique fits better)

## Expected behaviour

Gathers the reference, file and viewport, maps intent onto tokens, lists discrepancies before editing, applies token-legal changes and runs pnpm design-system:check.
