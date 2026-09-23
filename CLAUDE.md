@AGENTS.md

## Claude Code specifics

- Nested `CLAUDE.md` files import their sibling `AGENTS.md`; edit the `AGENTS.md`.
- Invoke repo playbooks with the Skill tool or `/<name>` (`/api-change`, `/gaa-admin-change`, `/pre-merge`, `/ci-triage`, `/release`, `/commit`, `/ui-check`, `/design-critique`, `/tdd`, `/diagnosing-bugs`, `/stack-doctor`).
- Only spawn sub-agents when the user asks; when you do, pass the Blast-Radius Gate and the relevant nested `AGENTS.md` paths.
- Hooks for Claude live in `.claude/settings.json`; `format-changed-file.mjs` formats each edited file automatically.
