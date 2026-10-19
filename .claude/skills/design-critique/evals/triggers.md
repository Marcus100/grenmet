# design-critique trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- /design-critique the GMS forecast page
- $design-critique (Codex) on the gaa-admin roster table
- /design-critique apps/web/mbia/src/app/page.tsx

## Should not trigger

- Make this button match the screenshot I pasted (this is ui-check, not a critique).

## Expected behaviour

Returns a ranked, token-legal fix list against the Refactoring UI ladder without needing a reference.
