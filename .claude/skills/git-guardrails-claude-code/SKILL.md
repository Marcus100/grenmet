---
name: git-guardrails-claude-code
description: Git guardrails are already installed in this repo. Use when the user asks to add git safety hooks, block dangerous git commands, or asks whether this protection exists — point them at the existing setup instead of reinstalling it.
---

# Git Guardrails — Already Installed

This repo already has this skill's original job done, for both Claude Code
and Codex, not just Claude Code:

- `.claude/hooks/block-dangerous-git.mjs` — blocks `git commit`, `git push`,
  `git reset --hard`, `git clean -f(d)`, `git branch -D`,
  `git checkout .`/`git restore .`, `gh pr merge`, quote-aware (won't false-positive
  on a `grep` for these phrases — see `scripts/guardrails/agent-hook-behavior.test.mjs`
  for the regression that made this necessary).
- Wired as a `PreToolUse` hook on `Bash` in `.claude/settings.json` (Claude
  Code) and `.codex/config.toml` (Codex) — same script, not a fork.
- Regression-tested: `scripts/guardrails/agent-hook-behavior.test.mjs`,
  picked up automatically by `pnpm test:guardrails` and CI.

**Do not re-run this skill's original bash+jq setup procedure** — it would
write a second, worse copy (this devcontainer has no `jq`; a jq-based script
fails *open*, silently allowing everything, which is why the current version
is plain Node) and could add a duplicate/conflicting `PreToolUse` entry.

## When the user asks to extend the blocked-pattern list

Edit `.claude/hooks/block-dangerous-git.mjs`'s `DANGEROUS_PATTERNS` array
directly (both tools share this one file). Add a test case to
`scripts/guardrails/agent-hook-behavior.test.mjs` covering the new pattern —
both a case that should block and, if the phrase is plausible inside a quoted
string (a commit message, a grep pattern, a code comment), a case that proves
it doesn't false-positive. Run `node --test scripts/guardrails/agent-hook-behavior.test.mjs`
before calling it done.

## When the user asks to set this up in a *different* repo

That's this skill's original job. Read git history on this file (or ask the
user) for the last version of the bash+jq setup procedure, adapt it: prefer
plain Node over bash+jq for the hook script itself (portability — don't
assume `jq` is installed), and wire it for whichever of Claude Code/Codex that
repo actually uses.
